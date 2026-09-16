import type { ActionRuntime, ActionOutcome } from './action-runtime';
import type { ExtensionPointRef, ContributionRef } from './ui/definitions';
import type { JsonValue } from './contribution';
import { assertUiJson } from './ui/schema.js';
import type { ContextSnapshot, OverlaySnapshot, SlotInput, UiObservation } from './ui/runtime';
export type { ContextSnapshot, OverlaySnapshot, SlotInput, SlotObservation, UiObservation, UiSizing } from './ui/runtime';
export interface UiPort { postMessage(value: unknown): void; addEventListener(type: 'message', listener: (event: MessageEvent) => void): void; removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void; start(): void }
export interface UiClient {
  invoke<T = JsonValue>(capability: `${string}@${number}`, action: string, payload: JsonValue): Promise<T>;
  observe<T = JsonValue>(capability: `${string}@${number}`, action: string, payload: JsonValue, listener: (snapshot: T) => void): Promise<() => void>;
  actions: {
    query(point: ExtensionPointRef, context: JsonValue): Promise<ReturnType<ActionRuntime['query']>>;
    start(point: ExtensionPointRef, ref: ContributionRef, context: JsonValue, options?: { payload?: JsonValue; timeoutMs?: number }): Promise<{ invocationId: string; result: Promise<ActionOutcome>; cancel(): Promise<void> }>;
  };
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
  const subscriptions = new Map<string, (snapshot: any) => void>();
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
        if (!previous || typeof previous.streamId !== 'string' || m.payload?.streamId === previous.streamId && m.payload.progress > previous.progress) earlyEvents.set(m.subscriptionId, m.payload);
      }
      return;
    }
    if (m.type !== 'ui:response' && m.type !== 'response') return;
    const request = pending.get(m.requestId); if (!request) return;
    pending.delete(m.requestId); clearTimeout(request.timer);
    if (m.ok) request.resolve(m.result); else request.reject(new Error(m.error?.code ?? 'UI_REQUEST_FAILED'));
  }
  port.addEventListener('message', onMessage); port.start();
  const send = (message: Record<string, unknown>, rpc = false, timeoutMs = 10_000): Promise<unknown> => {
    if (stopped) return Promise.reject(new Error('UI_CLIENT_CLOSED'));
    const requestId = rpc ? `ui-rpc-${++nextRequest}` : ++nextRequest;
    const envelope = { ...message, requestId };
    try { assertUiJson(envelope); } catch { return Promise.reject(new Error('INVALID_UI_JSON')); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('UI_TIMEOUT')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try { port.postMessage(envelope); } catch (error) { pending.delete(requestId); clearTimeout(timer); reject(error); }
    });
  };
  const slotInput = (input: SlotInput) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const control = (action: string, payload: unknown) => send({ type: 'ui:request', action, payload });
  const rpc = (action: string, payload: JsonValue) => send({ type: 'request', capability: 'nexus.ui-overlay@1', action, payload }, true);
  const api: UiClient = {
    async invoke<T>(capability: `${string}@${number}`, action: string, payload: JsonValue) { return await send({ type: 'request', capability, action, payload }, true) as T; },
    async observe<T>(capability: `${string}@${number}`, action: string, payload: JsonValue, listener: (snapshot: T) => void) {
      const result = await send({ type: 'request', capability, action, payload }, true) as { subscriptionId: string; snapshot: T };
      if (stopped) { void send({ type: 'unsubscribe', subscriptionId: result.subscriptionId }, true).catch(() => undefined); return () => undefined; }
      subscriptions.set(result.subscriptionId, listener); listener(result.snapshot);
      if (earlyEvents.has(result.subscriptionId)) listener(earlyEvents.get(result.subscriptionId) as T);
      earlyEvents.delete(result.subscriptionId);
      let active = true;
      return () => { if (!active) return; active = false; subscriptions.delete(result.subscriptionId); void send({ type: 'unsubscribe', subscriptionId: result.subscriptionId }, true).catch(() => undefined); };
    },
    actions: {
      async query(point, context) { return await control('action.query', { point, context }) as ReturnType<ActionRuntime['query']>; },
      async start(point, ref, context, options = {}) {
        const invocationId = await control('action.start', { point, ref, context, ...options }) as string;
        const result = send({ type: 'ui:request', action: 'action.wait', payload: { invocationId } }, false, 310_000) as Promise<ActionOutcome>;
        void result.catch(() => undefined);
        return { invocationId, result, async cancel() { await control('action.cancel', { invocationId }); } };
      },
    },
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
async function connectExecutionPort(hostWindow: Window): Promise<MessagePort> {
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
  return port;
}

export async function connectUiHost(hostWindow: Window = window): Promise<UiClient> {
  const port = await connectExecutionPort(hostWindow);
  const client = createUiClient(port); await client.refresh();
  hostWindow.addEventListener('pagehide', () => { client.dispose(); port.close(); }, { once: true }); return client;
}


/** Action-only entry point. It connects once and never creates a Surface or UI Scope. */
export async function connectActionHost(handler: import('./action-runtime').ActionHandler, hostWindow: Window = window): Promise<() => void> {
  const props = (hostWindow as Window & { $wujie?: { props?: { action?: { actionId: string; invocationId: string; context: JsonValue; payload: JsonValue }; plugin?: { id: string } } } }).$wujie?.props;
  const action = props?.action;
  if (!action || typeof action.actionId !== 'string' || typeof action.invocationId !== 'string' || !props?.plugin?.id) throw Error('INVALID_ACTION_BOOTSTRAP');
  const snapshot = JSON.parse(JSON.stringify(action)) as typeof action;
  assertUiJson(snapshot);
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(snapshot);
  const port = await connectExecutionPort(hostWindow), client = createUiClient(port), controller = new AbortController();
  let started = false, closed = false;
  const dispose = () => { if (closed) return; closed = true; controller.abort(); client.dispose(); port.removeEventListener('message', receive); port.close(); hostWindow.removeEventListener('pagehide', dispose); };
  const receive = (event: MessageEvent) => {
    if (event.data?.type === 'action:cancel') { dispose(); return; }
    if (closed || started || event.data?.type !== 'action:execute') return;
    started = true;
    void Promise.resolve().then(() => handler({ ...snapshot, ownerPluginId: props.plugin!.id, signal: controller.signal, capabilities: client })).then(result => {
      assertUiJson(result);
      if (!closed) port.postMessage({ type: 'ui:request', requestId: 2, action: 'action.complete', payload: { ok: true, result } });
    }).catch(() => { if (!closed) port.postMessage({ type: 'ui:request', requestId: 2, action: 'action.complete', payload: { ok: false } }); });
  };
  port.addEventListener('message', receive); hostWindow.addEventListener('pagehide', dispose, { once: true });
  port.postMessage({ type: 'ui:request', requestId: 1, action: 'action.ready', payload: null });
  return dispose;
}
