import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapPluginRuntime,
  type BridgeUnaryActionContract,
  type PluginRuntime,
} from '../src';
import {
  createPluginBridgeSession,
  type BridgeResponse,
  type BridgeSessionIdentity,
  type PluginBridgeSession,
} from '../src/browser/plugin-bridge';

const identity: BridgeSessionIdentity = {
  pluginId: 'kubeeye', pluginVersion: '1.0.0', surfaceId: 'overview',
  surfaceInstanceId: 'surface-1', mountPointId: 'route:kubeeye-overview-route',
  protocolVersion: 1, requires: ['kubesphere.cluster@2'],
  grantedPermissions: ['cluster.read'],
};
const request = {
  type: 'request', requestId: 'request-1', capability: 'kubesphere.cluster@2',
  action: 'getCurrentCluster', payload: null,
};
const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); });

async function fixture(
  actionOverrides: Partial<BridgeUnaryActionContract> = {},
  identityOverrides: Partial<BridgeSessionIdentity> = {},
  transformRuntime: (runtime: PluginRuntime) => PluginRuntime = runtime => runtime,
) {
  const capabilityValue = { getCurrentCluster: () => 'demo', secret: 'host-only' };
  const invoke = vi.fn((value: unknown) => (value as typeof capabilityValue).getCurrentCluster());
  const action: BridgeUnaryActionContract = {
    kind: 'request',
    requiredPermissions: ['cluster.read'],
    requestSchema: { parse(value) { if (value !== null) throw Error('Expected null'); return null; } },
    resultSchema: { parse(value) { if (typeof value !== 'string') throw Error('Expected string'); return value; } },
    invoke,
    ...actionOverrides,
  };
  const runtime = transformRuntime(await bootstrapPluginRuntime({
    builtins: [{
      id: 'cluster', version: '1.0.0', requires: [], provides: ['kubesphere.cluster@2'],
      activate(context) { context.capabilities.register('kubesphere.cluster@2', capabilityValue); },
    }],
    coreRootIds: ['cluster'],
    bridgeContracts: [{ id: 'kubesphere.cluster@2', actions: { getCurrentCluster: action } }],
  }));
  const channel = new MessageChannel();
  const session = createPluginBridgeSession({
    runtime, identity: { ...identity, ...identityOverrides }, port: channel.port1,
  });
  cleanup.push(() => { session.dispose(); channel.port2.close(); });
  return { channel, session, invoke, runtime, capabilityValue };
}

function send(channel: MessageChannel, message: unknown = request): Promise<BridgeResponse> {
  return new Promise(resolve => {
    channel.port2.addEventListener('message', event => resolve(event.data as BridgeResponse), { once: true });
    channel.port2.start();
    channel.port2.postMessage(message);
  });
}

describe('MessagePort-bound Unary Bridge', () => {
  it('invokes only the Host contract with bound identity and returns JSON data', async () => {
    const { channel, invoke, capabilityValue } = await fixture();
    expect(await send(channel)).toEqual({
      type: 'response', requestId: 'request-1', ok: true, result: 'demo',
    });
    expect(invoke).toHaveBeenCalledWith(capabilityValue, null, {
      pluginId: 'kubeeye', surfaceId: 'overview', surfaceInstanceId: 'surface-1',
      mountPointId: 'route:kubeeye-overview-route', signal: expect.any(AbortSignal),
    });
  });

  it.each(['pluginId', 'permissions', 'nonce', 'protocolVersion', 'requires'])(
    'rejects forged %s fields without calling the provider', async field => {
      const { channel, invoke } = await fixture();
      expect(await send(channel, { ...request, [field]: 'forged' })).toMatchObject({
        ok: false, error: { code: 'INVALID_REQUEST' },
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
    expect(await send(channel, { ...request, ...override as object })).toMatchObject({ ok: false, error: { code } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('checks permissions on every invocation against copied Host grants', async () => {
    const grantedPermissions: string[] = [];
    const { channel, session, invoke } = await fixture({}, { grantedPermissions });
    grantedPermissions.push('cluster.read');
    for (const requestId of ['one', 'two']) {
      expect(await send(channel, { ...request, requestId })).toMatchObject({
        ok: false, error: { code: 'PERMISSION_DENIED' },
      });
    }
    expect(session.identity.grantedPermissions).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['contract', 'provider', 'state'])('rejects an unavailable %s', async missing => {
    const { channel, invoke } = await fixture({}, {}, runtime => ({
      ...runtime,
      ...(missing === 'contract' ? { bridgeContracts: new Map() } : {}),
      ...(missing === 'provider' ? {
        capabilities: { ...runtime.capabilities, list: () => [] },
      } : {}),
      ...(missing === 'state' ? { plugins: new Map([['cluster', { state: 'SKIPPED' as const, stage: 'resolve' as const, reason: 'test' }]]) } : {}),
    }));
    expect(await send(channel)).toMatchObject({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE' } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('records invalid Host results with full attribution, not raw result data on the wire', async () => {
    const { channel, session } = await fixture({ invoke: () => ({ privateField: 'secret' }) });
    const response = await send(channel);
    expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_RESULT' } });
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(session.hostErrors).toContainEqual(expect.objectContaining({
      code: 'INVALID_RESULT', stage: 'bridge', pluginId: 'kubeeye',
      surfaceInstanceId: 'surface-1', surfaceId: 'overview',
      mountPointId: 'route:kubeeye-overview-route', capability: request.capability,
      action: request.action, requestId: 'request-1',
    }));
  });

  it('rejects a non-JSON result even if a Host schema incorrectly accepts it', async () => {
    const { channel } = await fixture({
      resultSchema: { parse: () => new Date() as never },
    });
    expect(await send(channel)).toMatchObject({ ok: false, error: { code: 'INVALID_RESULT' } });
  });

  it('sanitizes provider exceptions and preserves Host diagnostics', async () => {
    const cause = new Error('private token: never expose');
    const { channel, session } = await fixture({ invoke() { throw cause; } });
    const response = await send(channel);
    expect(response).toMatchObject({ ok: false, error: { code: 'ACTION_FAILED' } });
    expect(JSON.stringify(response)).not.toContain('private token');
    expect(session.hostErrors[0]?.cause).toBe(cause);
  });

  it('aborts in-flight calls and never sends a result after dispose', async () => {
    let resolveResult: (value: string) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const { channel, session } = await fixture({ invoke(_capability, _payload, context) {
      signal = context.signal;
      return new Promise<string>(resolve => { resolveResult = resolve; });
    } });
    const responses = vi.fn();
    channel.port2.addEventListener('message', responses);
    channel.port2.start();
    channel.port2.postMessage(request);
    await vi.waitFor(() => expect(signal).toBeDefined());
    session.dispose();
    expect(session.state).toBe('DISPOSED');
    expect(signal?.aborted).toBe(true);
    resolveResult('too late');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(responses).not.toHaveBeenCalled();
    session.dispose();
  });

  it('keeps grants and identity independent between two sessions', async () => {
    const allowed = await fixture();
    const denied = await fixture({}, { surfaceInstanceId: 'surface-2', grantedPermissions: [] });
    expect((await send(allowed.channel)).ok).toBe(true);
    expect(await send(denied.channel)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  });

  it('drains requests queued before the dispatcher takes ownership of the port', async () => {
    const { runtime } = await fixture();
    const channel = new MessageChannel();
    const response = send(channel);
    let session: PluginBridgeSession | undefined;
    cleanup.push(() => { session?.dispose(); channel.port2.close(); });
    session = createPluginBridgeSession({ runtime, identity, port: channel.port1 });
    expect((await response).ok).toBe(true);
  });
});
