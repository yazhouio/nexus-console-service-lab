import { expect, it } from 'vitest';
import { createUiClient, type UiPort } from '../src/ui-client';
import type { UiObservation } from '../src/ui/runtime';
it('ignores transport reordering, connects the full snapshot progress point, and preserves the retry baseline', async () => {
  let receive: (event: MessageEvent) => void = () => undefined;
  const sent: any[] = [];
  const port: UiPort = { postMessage(value) { sent.push(value); }, addEventListener(_type, listener) { receive = listener; }, removeEventListener() {}, start() {} };
  const client = createUiClient(port);
  const emit = (value: unknown) => receive({ data: value } as MessageEvent);
  const state = (progress: number): UiObservation => ({ streamId: 'attempt-2', progress, initialContext: { contextKey: 'A', revision: 2, value: 2 }, context: { contextKey: 'A', revision: 3, value: 3 }, overlayInput: null, occurrences: [] });
  const refresh = client.refresh();
  emit({ type: 'ui:snapshot', snapshot: state(8) });
  emit({ type: 'ui:response', requestId: sent[0].requestId, ok: true, result: state(6) }); await refresh;
  emit({ type: 'ui:snapshot', snapshot: state(7) });
  emit({ type: 'ui:snapshot', snapshot: { ...state(99), streamId: 'attempt-1' } });
  expect(client.getSnapshot()?.progress).toBe(8);
  const values: unknown[] = []; const stop = client.watchContext(value => values.push(value?.value));
  expect(values).toEqual([2, 3]); stop(); client.dispose();
});

it('preserves the highest Host Overlay progress while events race the subscription response', async () => {
  let receive: (event: MessageEvent) => void = () => undefined;
  const sent: any[] = [];
  const port: UiPort = { postMessage(value) { sent.push(value); }, addEventListener(_type, listener) { receive = listener; }, removeEventListener() {}, start() {} };
  const client = createUiClient(port);
  const emit = (value: unknown) => receive({ data: value } as MessageEvent);
  const snapshot = (progress: number) => ({ streamId: 'scope-1', progress, overlays: [] });
  const seen: number[] = [];
  const opening = client.overlay.observe(value => seen.push(value.progress));
  emit({ type: 'event', subscriptionId: 'one', payload: snapshot(10) });
  emit({ type: 'event', subscriptionId: 'one', payload: snapshot(9) });
  emit({ type: 'response', requestId: sent[0].requestId, ok: true, result: { subscriptionId: 'one', snapshot: snapshot(8) } });
  const stop = await opening;
  emit({ type: 'event', subscriptionId: 'one', payload: snapshot(7) });
  emit({ type: 'event', subscriptionId: 'one', payload: snapshot(11) });
  expect(seen).toEqual([8, 10, 11]);
  stop(); client.dispose();
});
