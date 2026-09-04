import { afterEach, expect, it, vi } from 'vitest';
import { bootstrapPluginRuntime, type BridgeSubscriptionActionContract, type JsonValue } from '../src';
import { createPluginBridgeSession, type BridgeLimits, type BridgeResponse } from '../src/browser/plugin-bridge';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const request = { type: 'request', requestId: 'open', capability: 'host.cluster@1', action: 'watch', payload: null };
const stringSchema = { parse(value: unknown) { if (typeof value !== 'string') throw Error('Expected string'); return value; } };

async function fixture(overrides: Partial<BridgeSubscriptionActionContract> = {}, limits: Partial<BridgeLimits> = {}) {
  let emit: (event: JsonValue) => void = () => undefined;
  const dispose = vi.fn();
  const runtime = await bootstrapPluginRuntime({
    builtins: [{ id: 'cluster', version: '1', requires: [], provides: ['host.cluster@1'], activate(context) { context.capabilities.register('host.cluster@1', {}); } }],
    coreRootIds: ['cluster'],
    bridgeContracts: [{ id: 'host.cluster@1', actions: { watch: {
      kind: 'subscription', requiredPermissions: ['cluster.read'],
      requestSchema: { parse(value) { if (value !== null) throw Error('Expected null'); return null; } },
      snapshotSchema: stringSchema, eventSchema: stringSchema,
      open(_capability, _payload, _context, send) { emit = send; send('changed-during-open'); return { snapshot: 'initial', dispose }; },
      ...overrides,
    } } }],
  });
  const channel = new MessageChannel();
  const session = createPluginBridgeSession({ runtime, port: channel.port1, limits, identity: {
    pluginId: 'plugin', pluginVersion: '1', surfaceId: 'overview', surfaceInstanceId: crypto.randomUUID(),
    mountPointId: 'route:overview', protocolVersion: 1, requires: ['host.cluster@1'], grantedPermissions: ['cluster.read'],
  } });
  const received: (BridgeResponse | { type: 'event'; subscriptionId: string; payload: JsonValue })[] = [];
  channel.port2.onmessage = event => received.push(event.data);
  channel.port2.start();
  cleanups.push(() => { session.dispose(); channel.port2.close(); });
  const send = async (value: unknown = request): Promise<BridgeResponse> => {
    const before = received.length;
    channel.port2.postMessage(value);
    await vi.waitFor(() => expect(received.slice(before).some(message => message.type === 'response')).toBe(true));
    return received.slice(before).find(message => message.type === 'response') as BridgeResponse;
  };
  return { session, received, send, dispose, emit: (value: JsonValue) => emit(value) };
}

it('returns a snapshot before buffered changes and stops delivery before unsubscribe succeeds', async () => {
  const { send, received, emit, session, dispose } = await fixture();
  const response = await send();
  expect(response).toMatchObject({ ok: true, result: { snapshot: 'initial', subscriptionId: expect.any(String) } });
  const subscriptionId = (response.ok ? response.result as { subscriptionId: string } : { subscriptionId: '' }).subscriptionId;
  expect(received).toEqual([response, { type: 'event', subscriptionId, payload: 'changed-during-open' }]);
  expect(session.subscriptionCount).toBe(1);
  expect(await send({ type: 'unsubscribe', requestId: 'stop', subscriptionId })).toMatchObject({ ok: true, result: null });
  emit('too late');
  expect(await send({ type: 'unsubscribe', requestId: 'stop-again', subscriptionId })).toMatchObject({ ok: true, result: null });
  session.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(session.subscriptionCount).toBe(0);
  expect(received.filter(message => message.type === 'event')).toHaveLength(1);
  expect(session.audit.map(entry => [entry.type, entry.subscriptionId, entry.resultCode])).toEqual([
    ['subscription', subscriptionId, 'OK'], ['unsubscribe', subscriptionId, 'OK'], ['unsubscribe', subscriptionId, 'OK'],
  ]);
});


it('closes only the subscription whose pre-snapshot event buffer overflows', async () => {
  const dispose = vi.fn();
  const { send, received, session } = await fixture({ open(_capability, _payload, _context, emit) {
    emit('one'); emit('two');
    return { snapshot: 'initial', dispose };
  } }, { maxBufferedEvents: 1 });
  expect(await send()).toMatchObject({ ok: false, error: { code: 'INVALID_EVENT' } });
  expect(received).toHaveLength(1);
  expect(session.subscriptionCount).toBe(0);
  expect(session.state).toBe('ACTIVE');
  expect(dispose).toHaveBeenCalledTimes(1);
});

it.each([
  [{ invalid: true }, {}, 'INVALID_EVENT'],
  ['x'.repeat(300), { maxMessageBytes: 256 }, 'MESSAGE_TOO_LARGE'],
  ['second-change', { eventsPerSecond: 1 }, 'RATE_LIMITED'],
] as const)('rejects invalid, oversized or excess events and audits the local failure', async (event, limits, code) => {
  const { send, emit, received, session, dispose } = await fixture({}, limits);
  expect(await send()).toMatchObject({ ok: true });
  emit(event);
  await vi.waitFor(() => expect(session.subscriptionCount).toBe(0));
  expect(received.filter(message => message.type === 'event')).toHaveLength(1);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(session.state).toBe('ACTIVE');
  expect(session.hostErrors.at(-1)).toMatchObject({ code });
  expect(session.audit.at(-1)).toMatchObject({ type: 'event', resultCode: code, subscriptionId: expect.any(String) });
});

it.each(['snapshot', 'reject', 'timeout'] as const)('never exposes an ID when open fails at %s, including late cleanup', async failure => {
  const dispose = vi.fn();
  let emit: (value: JsonValue) => void = () => undefined;
  let complete: (() => void) | undefined;
  const { send, received, session } = await fixture({
    async open(_capability, _payload, _context, sendEvent) {
      emit = sendEvent;
      emit('buffered');
      if (failure === 'reject') throw Error('secret provider error');
      if (failure === 'timeout') await new Promise<void>(resolve => { complete = resolve; });
      return { snapshot: failure === 'snapshot' ? null : 'initial', dispose };
    },
  }, { requestTimeoutMs: 15 });
  expect(await send()).toMatchObject({ ok: false, error: { code: { snapshot: 'INVALID_RESULT', reject: 'ACTION_FAILED', timeout: 'TIMEOUT' }[failure] } });
  complete?.();
  emit('late');
  if (failure !== 'reject') await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  expect(session.subscriptionCount).toBe(0);
  expect(JSON.stringify(received)).not.toContain('subscriptionId');
  expect(received.filter(message => message.type === 'event')).toHaveLength(0);
});

it('limits subscription capacity and still cleans every provider if one disposer fails', async () => {
  const disposed: string[] = [];
  const signals: AbortSignal[] = [];
  const { send, session } = await fixture({ open(_capability, _payload, context) {
    const name = signals.length === 0 ? 'first' : 'second';
    signals.push(context.signal);
    return { snapshot: name, dispose() { disposed.push(name); throw Error('private cleanup failure'); } };
  } }, { maxSubscriptions: 2 });
  expect(await send()).toMatchObject({ ok: true });
  expect(await send({ ...request, requestId: 'second' })).toMatchObject({ ok: true });
  expect(await send({ ...request, requestId: 'third' })).toMatchObject({ ok: false, error: { code: 'SUBSCRIPTION_LIMITED' } });
  session.dispose(); session.dispose();
  expect(disposed).toEqual(['first', 'second']);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(session.subscriptionCount).toBe(0);
});

it('unknown unsubscribe never affects another session and buffered event schemas are applied once', async () => {
  const first = await fixture();
  const second = await fixture({ eventSchema: { parse(value) { return `${value}!`; } } });
  const opened = await first.send();
  const subscriptionId = opened.ok ? (opened.result as { subscriptionId: string }).subscriptionId : '';
  expect(await second.send({ type: 'unsubscribe', requestId: 'other-session', subscriptionId })).toMatchObject({ ok: true, result: null });
  expect(first.session.subscriptionCount).toBe(1);
  expect(first.dispose).not.toHaveBeenCalled();
  await second.send();
  expect(second.received.filter(message => message.type === 'event')).toEqual([
    { type: 'event', subscriptionId: expect.any(String), payload: 'changed-during-open!' },
  ]);
});

it('allows unsubscribe to release resources even when the action request rate is exhausted', async () => {
  const { send, session, dispose } = await fixture({}, { requestsPerSecond: 1 });
  const response = await send();
  const subscriptionId = response.ok ? (response.result as { subscriptionId: string }).subscriptionId : '';
  expect(await send({ type: 'unsubscribe', requestId: 'stop', subscriptionId })).toMatchObject({ ok: true, result: null });
  expect(session.subscriptionCount).toBe(0);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(await send({ type: 'unsubscribe', requestId: 'stop-again', subscriptionId })).toMatchObject({ ok: true, result: null });
});
