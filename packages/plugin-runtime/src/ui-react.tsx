import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { UiClient, SlotInput, SlotObservation, ContextSnapshot } from './ui-client';
const ClientContext = createContext<UiClient | undefined>(undefined);
export function UiProvider({ client, children }: { client: UiClient; children: ReactNode }) { return <ClientContext value={client}>{children}</ClientContext>; }
export function useUiClient(): UiClient { const client = useContext(ClientContext); if (!client) throw Error('A Host-bound UiProvider is required.'); return client; }
export function useSurfaceContext(): ContextSnapshot | null {
  const client = useUiClient(); const [context, setContext] = useState<ContextSnapshot | null>(null);
  useEffect(() => client.watchContext(setContext), [client]); return context;
}
export function useUiObservation() { const client = useUiClient(); return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot); }
export interface SlotProps extends SlotInput {
  readonly feedback?: (state: SlotObservation | undefined, retry: (target: string) => Promise<void>, error?: string) => ReactNode;
}
export function Slot({ feedback, ...input }: SlotProps) {
  const client = useUiClient(); const observation = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [occurrenceId, setOccurrenceId] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const current = useRef(input); current.current = input;
  const serialized = JSON.stringify(input);
  const latest = useRef<Promise<string | undefined> | undefined>(undefined);
  const teardown = useRef<Promise<void>>(Promise.resolve());
  useLayoutEffect(() => {
    const element = anchorRef.current; if (!element) return;
    let active = true;
    // Serialize reuse of the physical anchor, including React StrictMode effect replay.
    const mounting = teardown.current.then(() => {
      if (!active) return undefined;
      const token = crypto.randomUUID(); element.setAttribute('data-nexus-slot-anchor', token);
      return client.mountSlot(token, current.current);
    });
    latest.current = mounting;
    void mounting.then(id => {
      if (!active || !id) return;
      setOccurrenceId(id); setFailure(undefined);
    }).catch(error => { if (active) setFailure(error.message); });
    return () => {
      active = false; latest.current = undefined;
      teardown.current = mounting.then(id => id ? client.unmountSlot(id) : undefined).catch(() => undefined);
    };
  }, [client, input.id]);
  useEffect(() => {
    let active = true;
    const value = JSON.parse(serialized) as SlotInput;
    void latest.current?.then(id => { if (active && id) return client.updateSlot(id, value); }).catch(error => { if (active) setFailure(error.message); });
    return () => { active = false; };
  }, [client, serialized]);
  const state = observation?.occurrences.find(o => o.occurrenceId === occurrenceId);
  const retry = async (target: string) => { if (occurrenceId) await client.retry(occurrenceId, target); };
  return <section data-nexus-slot={input.id} hidden={input.hidden}>
    {feedback ? feedback(state, retry, failure) : <>
      {failure && <p role="alert">{failure}</p>}
      {state?.input.acceptance === 'rejected' && <p role="alert">Context rejected</p>}
      {state?.runtimeError && <p role="alert">{state.runtimeError}</p>}
      {state?.contributions.map(c => c.execution?.phase === 'failed' && <p key={`${c.ref.ownerPluginId}/${c.ref.id}`} role="alert">Unable to display {c.ref.id}. {c.execution.retryTarget && <button onClick={() => { void retry(c.execution!.retryTarget!).catch(error => setFailure(error.message)); }}>Retry {c.ref.id}</button>}</p>)}
    </>}
    <div ref={anchorRef} />
  </section>;
}
