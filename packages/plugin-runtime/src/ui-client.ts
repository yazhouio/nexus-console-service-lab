import type { JsonValue } from './contribution';
import { assertUiJson } from './ui/schema.js';
import type { ContextSnapshot, OverlaySnapshot, SlotInput, SlotObservation, UiObservation } from './ui/runtime';
export type { ContextSnapshot, OverlaySnapshot, SlotInput, SlotObservation, UiObservation, UiSizing } from './ui/runtime';
export interface UiPort { postMessage(value: unknown): void; addEventListener(type: 'message', listener: (event: MessageEvent) => void): void; removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void; start(): void }
export interface UiClient {
  getSnapshot(): UiObservation | undefined;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  mountSlot(anchor: string, input: SlotInput): Promise<string>;
  updateSlot(occurrenceId: string, input: SlotInput): Promise<void>;
  unmountSlot(occurrenceId: string): Promise<void>;
  retry(occurrenceId: string, retryTarget: string): Promise<void>;
  watchContext(listener: (value: ContextSnapshot | null) => void): () => void;
  overlay: { open(surfaceId: string, input: JsonValue, presentation?: 'modal' | 'drawer'): Promise<string>; complete(result: JsonValue): Promise<void>; cancel(handle: string): Promise<void>; observe(listener: (snapshot: OverlaySnapshot) => void, handle?: string): Promise<() => void> };
  dispose(): void;
}
/** One Host-ordered snapshot stream per bound Attempt, independent of RPC responses. */
export function createUiClient(port: UiPort): UiClient {
  let nextRequest = 0, stopped = false;
  let snapshot: UiObservation | undefined;
  const listeners = new Set<() => void>();
  const pending = new Map<string | number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const subscriptions = new Map<string, (snapshot: OverlaySnapshot) => void>();
  const earlyEvents = new Map<string, unknown>();
  const accept = (value: UiObservation) => {
    if (stopped || !value || typeof value.streamId !== 'string' || !Number.isSafeInteger(value.progress) || snapshot && (snapshot.streamId !== value.streamId || snapshot.progress >= value.progress)) return;
    const first = !snapshot;
    snapshot = value; for (const listener of [...listeners]) listener();
    if (first) void control('ready', null).catch(() => undefined);
  };
  function onMessage(event: MessageEvent) {
    const m = event.data; if (!m || stopped) return;
    if (m.type === 'ui:snapshot') { accept(m.snapshot); return; }
    if (m.type === 'event') {
      const subscriber = subscriptions.get(m.subscriptionId);
      if (subscriber) subscriber(m.payload);
      else if (earlyEvents.size < 64) {
        const previous = earlyEvents.get(m.subscriptionId) as OverlaySnapshot | undefined;
        if (!previous || m.payload?.streamId === previous.streamId && m.payload.progress > previous.progress) earlyEvents.set(m.subscriptionId, m.payload);
      }
      return;
    }
    if (m.type !== 'ui:response' && m.type !== 'response') return;
    const request = pending.get(m.requestId); if (!request) return;
    pending.delete(m.requestId); clearTimeout(request.timer);
    if (m.ok) request.resolve(m.result); else request.reject(new Error(m.error?.code ?? 'UI_REQUEST_FAILED'));
  }
  port.addEventListener('message', onMessage); port.start();
  const send = (message: Record<string, unknown>, rpc = false): Promise<unknown> => {
    if (stopped) return Promise.reject(new Error('UI_CLIENT_CLOSED'));
    const requestId = rpc ? `ui-rpc-${++nextRequest}` : ++nextRequest;
    const envelope = { ...message, requestId };
    try { assertUiJson(envelope); } catch { return Promise.reject(new Error('INVALID_UI_JSON')); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('UI_TIMEOUT')); }, 10_000);
      pending.set(requestId, { resolve, reject, timer });
      try { port.postMessage(envelope); } catch (error) { pending.delete(requestId); clearTimeout(timer); reject(error); }
    });
  };
  const slotInput = (input: SlotInput) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const control = (action: string, payload: unknown) => send({ type: 'ui:request', action, payload });
  const rpc = (action: string, payload: JsonValue) => send({ type: 'request', capability: 'nexus.ui-overlay@1', action, payload }, true);
  const api: UiClient = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refresh() { accept(await control('snapshot', null) as UiObservation); },
    async mountSlot(anchor, input) { return await control('slot.mount', { anchor, input: slotInput(input) }) as string; },
    async updateSlot(occurrenceId, input) { await control('slot.update', { occurrenceId, input: slotInput(input) }); },
    async unmountSlot(occurrenceId) { await control('slot.unmount', { occurrenceId }); },
    async retry(occurrenceId, retryTarget) { await control('slot.retry', { occurrenceId, retryTarget }); },
    watchContext(listener) {
      let initialized = false, previous = -1;
      const notify = () => {
        const s = snapshot; if (!s) return;
        if (!initialized) { initialized = true; previous = s.initialContext?.revision ?? -1; listener(s.initialContext); }
        if (s.context && s.context.revision > previous) { previous = s.context.revision; listener(s.context); }
      };
      const stop = api.subscribe(notify); notify(); return stop;
    },
    overlay: {
      async open(surfaceId, input, presentation = 'modal') { return await rpc('open', { surfaceId, input, presentation }) as string; },
      async complete(result) { await rpc('complete', result); },
      async cancel(handle) { await rpc('cancel', { handle }); },
      async observe(listener, handle) {
        const result = await rpc('observe', handle ? { handle } : null) as { subscriptionId: string; snapshot: OverlaySnapshot };
        let previous = -1; const streamId = result.snapshot.streamId;
        const deliver = (value: OverlaySnapshot) => { if (value.streamId === streamId && value.progress > previous) { previous = value.progress; listener(value); } };
        subscriptions.set(result.subscriptionId, deliver); deliver(result.snapshot);
        const buffered = earlyEvents.get(result.subscriptionId) as OverlaySnapshot | undefined;
        earlyEvents.delete(result.subscriptionId); if (buffered) deliver(buffered);
        return () => { subscriptions.delete(result.subscriptionId); void send({ type: 'unsubscribe', subscriptionId: result.subscriptionId }, true).catch(() => undefined); };
      },
    },
    dispose() {
      if (stopped) return;
      for (const subscriptionId of subscriptions.keys()) void send({ type: 'unsubscribe', subscriptionId }, true).catch(() => undefined);
      stopped = true; port.removeEventListener('message', onMessage); listeners.clear(); subscriptions.clear(); earlyEvents.clear();
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('UI_CLIENT_CLOSED')); } pending.clear();
    },
  };
  return api;
}

/** Connect the current Restricted Surface to the Host's dedicated MessagePort. */
export async function connectUiHost(hostWindow: Window = window): Promise<UiClient> {
  const props = (hostWindow as Window & { $wujie?: { props?: { bridge?: { protocolVersion: number; surfaceInstanceId: string; nonce: string } } } }).$wujie?.props;
  const descriptor = props?.bridge;
  if (!descriptor || !Number.isSafeInteger(descriptor.protocolVersion) || typeof descriptor.surfaceInstanceId !== 'string' || typeof descriptor.nonce !== 'string') throw Error('No valid Host bootstrap descriptor.');
  const port = await new Promise<MessagePort>((resolve, reject) => {
    const timeout = setTimeout(() => { hostWindow.removeEventListener('message', receive); reject(Error('UI_HANDSHAKE_TIMEOUT')); }, 10_000);
    const receive = (event: MessageEvent) => {
      const value = event.data;
      if (event.source !== hostWindow.parent || event.origin !== hostWindow.location.origin || value?.type !== 'nexus:bridge:connected' || value.surfaceInstanceId !== descriptor.surfaceInstanceId || value.protocolVersion !== descriptor.protocolVersion || event.ports.length !== 1) return;
      clearTimeout(timeout); hostWindow.removeEventListener('message', receive); resolve(event.ports[0]);
    };
    hostWindow.addEventListener('message', receive);
    hostWindow.parent.postMessage({ type: 'nexus:bridge:connect', ...descriptor }, hostWindow.location.origin);
  });
  const client = createUiClient(port); await client.refresh();
  hostWindow.addEventListener('pagehide', () => { client.dispose(); port.close(); }, { once: true }); return client;
}
