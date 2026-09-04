import { expect, it } from 'vitest';
import { bootstrapPluginRuntime, inspect, type InstalledPluginRecord } from '../src';

const record: InstalledPluginRecord = {
  manifest: { id: 'external', version: '1', entry: '/plugins/external/1/', hostApi: 'host.console@1', requires: ['host.cluster@1'], provides: [], permissions: ['cluster.read'], surfaces: [{ id: 'page' }], contributions: { routes: [{ id: 'page', path: '/external', surfaceId: 'page', initialParameters: { token: 'private initial data' } }], extensions: [{ id: 'unused', kind: 'surface', point: { ownerPluginId: 'host', id: 'missing', contractMajor: 1 }, surfaceId: 'page' }] } },
  config: { id: 'external', version: '1', enabled: true, grantedPermissions: [] },
};

it('projects ownership and inactive surfaces without exposing providers, render functions or parameters', async () => {
  const runtime = await bootstrapPluginRuntime({
    builtins: [{ id: 'cluster', version: '1', requires: [], provides: ['host.cluster@1'], activate(context) { context.capabilities.register('host.cluster@1', { token: 'private capability' }); } }],
    coreRootIds: ['cluster'], installed: [record], supportedHostApis: ['host.console@1'],
    bridgeContracts: [{ id: 'host.cluster@1', actions: { read: { kind: 'request', requiredPermissions: ['cluster.read'], requestSchema: { parse: () => null }, resultSchema: { parse: () => null }, invoke: () => null } } }],
  });
  const snapshot = inspect(runtime);
  expect(snapshot.ready).toBe(true);
  expect(snapshot.coreClosure).toEqual(['cluster']);
  expect(snapshot.plugins).toContainEqual(expect.objectContaining({ id: 'cluster', kind: 'builtin', core: true, executionMode: 'direct', securityPosture: 'full-trust' }));
  expect(snapshot.plugins).toContainEqual(expect.objectContaining({ id: 'external', kind: 'restricted', state: 'ACTIVE', core: false, executionMode: 'wujie', securityPosture: 'cooperative-isolation', requestedPermissions: ['cluster.read'], grantedPermissions: [], surfaces: [{ id: 'page', instances: [] }] }));
  expect(() => Object.assign(runtime.resolution.dependencies[0], { provider: 'forged' })).toThrow();
  expect(snapshot.dependencies).toEqual([{ consumer: 'external', capability: 'host.cluster@1', provider: 'cluster' }]);
  expect(snapshot.capabilities).toEqual([{ id: 'host.cluster@1', providerPluginId: 'cluster' }]);
  expect(snapshot.contributions.extensions).toContainEqual(expect.objectContaining({ id: 'unused', point: { ownerPluginId: 'host', id: 'missing', contractMajor: 1 }, ownerPluginId: 'external' }));
  expect(JSON.stringify(snapshot)).not.toContain('private');
  expect(inspect(runtime)).toEqual(snapshot);
  expect(() => (snapshot.plugins as unknown[]).pop()).toThrow();
  expect(() => Object.assign(snapshot.plugins[0], { state: 'FAILED' })).toThrow();
});

it('sanitizes bootstrap and plugin failures while retaining dependency skip reasons', async () => {
  const cause = new Error('Bearer secret-token and private provider data');
  const broken = { id: 'broken', version: '1', requires: [], provides: [], activate() { throw cause; } };
  const failed = await bootstrapPluginRuntime({ builtins: [broken], coreRootIds: ['broken'] })
    .then(() => { throw Error('Expected bootstrap failure'); }, error => inspect({ ready: false, error }));
  expect(failed).toMatchObject({ ready: false, bootstrapError: { code: 'PLUGIN_ACTIVATION_FAILED', message: 'Plugin activation failed.' } });
  const runtime = await bootstrapPluginRuntime({ builtins: [broken, {
    id: 'skipped', version: '1', requires: ['missing.api@1'], provides: [], activate() {},
  }], coreRootIds: [] });
  const snapshot = inspect(runtime);
  expect(snapshot.plugins).toContainEqual(expect.objectContaining({ id: 'broken', state: 'FAILED', error: { code: 'PLUGIN_ACTIVATION_FAILED', message: 'Plugin activation failed.' } }));
  expect(snapshot.plugins).toContainEqual(expect.objectContaining({ id: 'skipped', state: 'SKIPPED', error: expect.objectContaining({ code: 'MISSING_CAPABILITY' }) }));
  expect(JSON.stringify([failed, snapshot])).not.toMatch(/secret-token|Bearer|stack|private provider/);
});

it('keeps safe plugin, stage and dependency attribution when Core bootstrap fails', async () => {
  const snapshot = await bootstrapPluginRuntime({
    builtins: [{ id: 'core-shell', version: '1', requires: ['missing.api@1'], provides: [], activate() {} }],
    coreRootIds: ['core-shell'],
  }).then(() => { throw Error('Expected bootstrap failure'); }, error => inspect({ ready: false, error }));
  expect(snapshot.bootstrapError).toMatchObject({
    code: 'MISSING_CAPABILITY', pluginId: 'core-shell', validationStage: 'resolve',
    capability: 'missing.api@1', path: ['core-shell', 'missing.api@1'],
  });
  const activation = await bootstrapPluginRuntime({
    builtins: [{ id: 'core-shell', version: '1', requires: [], provides: [], activate() { throw Error('Bearer secret-token'); } }],
    coreRootIds: ['core-shell'],
  }).then(() => { throw Error('Expected bootstrap failure'); }, error => inspect({ ready: false, error }));
  expect(activation.bootstrapError).toMatchObject({ code: 'PLUGIN_ACTIVATION_FAILED', pluginId: 'core-shell', stage: 'activate' });
  expect(JSON.stringify(activation)).not.toMatch(/Bearer|secret-token|stack|cause/);
});
