import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapPluginRuntime, type BridgeUnaryActionContract, type PluginRuntime } from '../src';
import {
  createPluginBridgeSession,
  type BridgeResponse,
  type CreatePluginBridgeSessionOptions,
  type BridgeSessionIdentity,
  type PluginBridgeSession,
} from '../src/browser/plugin-bridge';

const identity: BridgeSessionIdentity = {
  pluginId: 'kubeeye',
  pluginVersion: '1.0.0',
  surfaceId: 'overview',
  surfaceInstanceId: 'surface-1',
  mountPointId: 'route:kubeeye-overview-route',
  protocolVersion: 1,
  requires: ['kubesphere.cluster@2'],
  grantedPermissions: ['cluster.read'],
};
const request = {
  type: 'request',
  requestId: 'request-1',
  capability: 'kubesphere.cluster@2',
  action: 'getCurrentCluster',
  payload: null,
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});

async function fixture(
  actionOverrides: Partial<BridgeUnaryActionContract> = {},
  identityOverrides: Partial<BridgeSessionIdentity> = {},
  transformRuntime: (runtime: PluginRuntime) => PluginRuntime = (runtime) => runtime,
  options: Partial<CreatePluginBridgeSessionOptions> = {},
) {
  const capabilityValue = { getCurrentCluster: () => 'demo', secret: 'host-only' };
  const invoke = vi.fn((value: unknown) => (value as typeof capabilityValue).getCurrentCluster());
  const action: BridgeUnaryActionContract = {
    kind: 'request',
    requiredPermissions: ['cluster.read'],
    requestSchema: {
      parse(value) {
        if (value !== null) throw Error('Expected null');
        return null;
      },
    },
    resultSchema: {
      parse(value) {
        if (typeof value !== 'string') throw Error('Expected string');
        return value;
      },
    },
    invoke,
    ...actionOverrides,
  };
  const runtime = transformRuntime(
    await bootstrapPluginRuntime({
      builtins: [
        {
          id: 'cluster',
          version: '1.0.0',
          requires: [],
          provides: ['kubesphere.cluster@2'],
          activate(context) {
            context.capabilities.register('kubesphere.cluster@2', capabilityValue);
          },
        },
      ],
      coreRootIds: ['cluster'],
      bridgeContracts: [{ id: 'kubesphere.cluster@2', actions: { getCurrentCluster: action } }],
    }),
  );
  const channel = new MessageChannel();
  const session = createPluginBridgeSession({
    ...options,
    runtime,
    identity: { ...identity, ...identityOverrides },
    port: channel.port1,
  });
  cleanup.push(() => {
    session.dispose();
    channel.port2.close();
  });
  return { channel, session, invoke, runtime, capabilityValue };
}

function send(channel: MessageChannel, message: unknown = request): Promise<BridgeResponse> {
  return new Promise((resolve) => {
    channel.port2.addEventListener('message', (event) => resolve(event.data as BridgeResponse), {
      once: true,
    });
    channel.port2.start();
    channel.port2.postMessage(message);
  });
}

describe('MessagePort-bound Unary Bridge', () => {
  it('invokes only the Host contract with bound identity and returns JSON data', async () => {
    const { channel, invoke, capabilityValue } = await fixture();
    expect(await send(channel)).toEqual({
      type: 'response',
      requestId: 'request-1',
      ok: true,
      result: 'demo',
    });
    expect(invoke).toHaveBeenCalledWith(capabilityValue, null, {
      pluginId: 'kubeeye',
      surfaceId: 'overview',
      surfaceInstanceId: 'surface-1',
      mountPointId: 'route:kubeeye-overview-route',
      signal: expect.any(AbortSignal),
    });
  });

  it.each(['pluginId', 'permissions', 'nonce', 'protocolVersion', 'requires'])(
    'rejects forged %s fields without calling the provider',
    async (field) => {
      const { channel, invoke } = await fixture();
      expect(await send(channel, { ...request, [field]: 'forged' })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_REQUEST' },
      });
      expect(invoke).not.toHaveBeenCalled();
      expect((await send(channel, { ...request, requestId: 'legitimate' })).ok).toBe(true);
    },
  );

  it.each([
    [{ capability: 'kubesphere.secret@1' }, 'UNDECLARED_CAPABILITY_REQUIRE'],
    [{ action: 'registerRoute' }, 'UNKNOWN_ACTION'],
    [{ action: 'toString' }, 'UNKNOWN_ACTION'],
    [{ action: '__proto__' }, 'UNKNOWN_ACTION'],
    [{ payload: { unexpected: true } }, 'INVALID_REQUEST'],
    [{ type: 'event' }, 'INVALID_REQUEST'],
  ])('rejects %j with %s', async (override, code) => {
    const { channel, invoke } = await fixture();
    expect(await send(channel, { ...request, ...(override as object) })).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('checks permissions on every invocation against copied Host grants', async () => {
    const grantedPermissions: string[] = [];
    const { channel, session, invoke } = await fixture({}, { grantedPermissions });
    grantedPermissions.push('cluster.read');
    for (const requestId of ['one', 'two']) {
      expect(await send(channel, { ...request, requestId })).toMatchObject({
        ok: false,
        error: { code: 'PERMISSION_DENIED' },
      });
    }
    expect(session.identity.grantedPermissions).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['contract', 'provider', 'state'])('rejects an unavailable %s', async (missing) => {
    const { channel, invoke } = await fixture({}, {}, (runtime) => ({
      ...runtime,
      ...(missing === 'contract' ? { bridgeContracts: new Map() } : {}),
      ...(missing === 'provider'
        ? {
            capabilities: { ...runtime.capabilities, list: () => [] },
          }
        : {}),
      ...(missing === 'state'
        ? {
            plugins: new Map([
              ['cluster', { state: 'SKIPPED' as const, stage: 'resolve' as const, reason: 'test' }],
            ]),
          }
        : {}),
    }));
    expect(await send(channel)).toMatchObject({
      ok: false,
      error: { code: 'CAPABILITY_UNAVAILABLE' },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('records invalid Host results with full attribution, not raw result data on the wire', async () => {
    const { channel, session } = await fixture({ invoke: () => ({ privateField: 'secret' }) });
    const response = await send(channel);
    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_RESULT' } });
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(session.hostErrors).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_RESULT',
        stage: 'bridge',
        pluginId: 'kubeeye',
        surfaceInstanceId: 'surface-1',
        surfaceId: 'overview',
        mountPointId: 'route:kubeeye-overview-route',
        capability: request.capability,
        action: request.action,
        requestId: 'request-1',
      }),
    );
  });

  it('rejects a non-JSON result even if a Host schema incorrectly accepts it', async () => {
    const { channel } = await fixture({
      resultSchema: { parse: () => new Date() as never },
    });
    expect(await send(channel)).toMatchObject({ ok: false, error: { code: 'INVALID_RESULT' } });
  });

  it('sanitizes provider exceptions and preserves Host diagnostics', async () => {
    const cause = new Error('private token: never expose');
    const { channel, session } = await fixture({
      invoke() {
        throw cause;
      },
    });
    const response = await send(channel);
    expect(response).toMatchObject({ ok: false, error: { code: 'ACTION_FAILED' } });
    expect(JSON.stringify(response)).not.toContain('private token');
    expect(session.hostErrors[0]?.cause).toBe(cause);
  });

  it('aborts in-flight calls and never sends a result after dispose', async () => {
    let resolveResult: (value: string) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const { channel, session } = await fixture({
      invoke(_capability, _payload, context) {
        signal = context.signal;
        return new Promise<string>((resolve) => {
          resolveResult = resolve;
        });
      },
    });
    const responses = vi.fn();
    channel.port2.addEventListener('message', responses);
    channel.port2.start();
    channel.port2.postMessage(request);
    await vi.waitFor(() => expect(signal).toBeDefined());
    session.dispose();
    expect(session.state).toBe('DISPOSED');
    expect(signal?.aborted).toBe(true);
    resolveResult('too late');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(responses).not.toHaveBeenCalled();
    session.dispose();
  });

  it('keeps grants and identity independent between two sessions', async () => {
    const allowed = await fixture();
    const denied = await fixture({}, { surfaceInstanceId: 'surface-2', grantedPermissions: [] });
    expect((await send(allowed.channel)).ok).toBe(true);
    expect(await send(denied.channel)).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    });
  });

  it('drains requests queued before the dispatcher takes ownership of the port', async () => {
    const { runtime } = await fixture();
    const channel = new MessageChannel();
    const response = send(channel);
    let session: PluginBridgeSession | undefined;
    cleanup.push(() => {
      session?.dispose();
      channel.port2.close();
    });
    session = createPluginBridgeSession({ runtime, identity, port: channel.port1 });
    expect((await response).ok).toBe(true);
  });

  it('rejects a reused request ID before invoking the provider, independently per session', async () => {
    const first = await fixture();
    const second = await fixture({}, { surfaceInstanceId: 'surface-2' });
    expect((await send(first.channel)).ok).toBe(true);
    expect(await send(first.channel)).toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_REQUEST' },
    });
    expect(first.invoke).toHaveBeenCalledTimes(1);
    expect((await send(second.channel)).ok).toBe(true);
  });
});

describe('Bridge request containment', () => {
  it('times out and aborts the provider, releases capacity and audits every exit without data', async () => {
    let signal: AbortSignal | undefined;
    const { channel, session } = await fixture(
      {
        invoke(_value, _payload, context) {
          signal = context.signal;
          return new Promise(() => undefined);
        },
      },
      {},
      (runtime) => runtime,
      { limits: { requestTimeoutMs: 15, maxConcurrentRequests: 1 } },
    );
    expect(await send(channel)).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(signal?.aborted).toBe(true);
    expect(await send(channel, { ...request, requestId: 'next' })).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    expect(
      await send(channel, { ...request, requestId: 'bad-action', action: 'unknown' }),
    ).toMatchObject({ ok: false, error: { code: 'UNKNOWN_ACTION' } });
    expect(session.audit.map((entry) => entry.resultCode)).toEqual([
      'TIMEOUT',
      'TIMEOUT',
      'UNKNOWN_ACTION',
    ]);
    expect(session.audit[0]).toMatchObject({
      pluginId: 'kubeeye',
      surfaceId: 'overview',
      surfaceInstanceId: 'surface-1',
      mountPointId: identity.mountPointId,
      capability: request.capability,
      action: request.action,
      duration: expect.any(Number),
      timestamp: expect.any(Number),
    });
    expect(JSON.stringify(session.audit)).not.toContain('payload');
  });

  it('limits concurrent requests without blocking another session', async () => {
    let resolve: (value: string) => void = () => undefined;
    const first = await fixture(
      {
        invoke() {
          return new Promise<string>((done) => {
            resolve = done;
          });
        },
      },
      {},
      (runtime) => runtime,
      { limits: { maxConcurrentRequests: 1 } },
    );
    const second = await fixture();
    first.channel.port2.postMessage(request);
    await vi.waitFor(() => expect(first.session.pendingRequestCount).toBe(1));
    expect(await send(first.channel, { ...request, requestId: 'parallel' })).toMatchObject({
      ok: false,
      error: { code: 'CONCURRENCY_LIMITED' },
    });
    expect((await send(second.channel)).ok).toBe(true);
    resolve('done');
    await vi.waitFor(() => expect(first.session.pendingRequestCount).toBe(0));
  });

  it('bounds messages and request rate within each session', async () => {
    const { channel, session } = await fixture({}, {}, (runtime) => runtime, {
      limits: { maxMessageBytes: 256, requestsPerSecond: 1 },
    });
    expect(await send(channel, { ...request, payload: 'x'.repeat(300) })).toMatchObject({
      ok: false,
      error: { code: 'MESSAGE_TOO_LARGE' },
    });
    expect((await send(channel, { ...request, requestId: 'valid' })).ok).toBe(true);
    expect(await send(channel, { ...request, requestId: 'limited' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(session.state).toBe('ACTIVE');
    expect(session.audit.map((entry) => entry.resultCode)).toEqual([
      'MESSAGE_TOO_LARGE',
      'OK',
      'RATE_LIMITED',
    ]);
  });

  it('disposes before reporting persistent protocol failure and keeps an inactive ingress closed', async () => {
    let stateAtFailure: string | undefined;
    const { channel, session } = await fixture({}, {}, (runtime) => runtime, {
      limits: { maxProtocolViolations: 2 },
      onSessionFailure() {
        stateAtFailure = session.state;
      },
    });
    expect(await send(channel, { ...request, pluginId: 'forged' })).toMatchObject({ ok: false });
    await send(channel, { ...request, requestId: 'forged-2', pluginId: 'forged' });
    await vi.waitFor(() => expect(stateAtFailure).toBe('DISPOSED'));
    expect(await session.dispatch(request)).toMatchObject({
      ok: false,
      error: { code: 'BRIDGE_SESSION_INACTIVE' },
    });
    expect(session.identity.surfaceInstanceId).toBe('surface-1');
  });
});

it('does not echo oversized correlation data back in a rejection', async () => {
  const { channel } = await fixture({}, {}, (runtime) => runtime, {
    limits: { maxMessageBytes: 256 },
  });
  const response = await send(channel, { ...request, requestId: 'x'.repeat(10_000) });
  expect(response).toMatchObject({ ok: false, error: { code: 'MESSAGE_TOO_LARGE' } });
  expect(new TextEncoder().encode(JSON.stringify(response)).length).toBeLessThanOrEqual(256);
});

it('attributes rejected oversized requests to the declared action without auditing their payload', async () => {
  const { channel, session } = await fixture({}, {}, (runtime) => runtime, {
    limits: { maxMessageBytes: 256 },
  });
  await send(channel, { ...request, payload: 'private-payload'.repeat(100) });
  expect(session.audit.at(-1)).toMatchObject({
    capability: 'kubesphere.cluster@2',
    action: 'getCurrentCluster',
    resultCode: 'MESSAGE_TOO_LARGE',
  });
  expect(JSON.stringify(session.audit)).not.toContain('private-payload');
});

it('bounds capability metadata even for oversized and inactive requests', async () => {
  const { session } = await fixture({}, {}, (runtime) => runtime, {
    limits: { maxMessageBytes: 256 },
  });
  const oversized = { ...request, capability: `host.${'x'.repeat(4096)}@1` };
  expect(await session.dispatch(oversized)).toMatchObject({
    ok: false,
    error: { code: 'MESSAGE_TOO_LARGE' },
  });
  session.dispose();
  expect(await session.dispatch(oversized)).toMatchObject({
    ok: false,
    error: { code: 'BRIDGE_SESSION_INACTIVE' },
  });
  for (const entry of session.audit) expect(entry.capability?.length ?? 0).toBeLessThanOrEqual(256);
});
