import { expect, it } from 'vitest';
import { bootstrapPluginRuntime, createPlatformPlugin, platformBridgeContracts, createRouteModel, createInstallationStore } from '../src/index';
import { createPluginBridgeSession } from '../src/browser/plugin-bridge';

it('uses the same versioned schemas and explicit permissions for Builtin and Restricted Route ID navigation', async () => {
  const platform = createPlatformPlugin();
  const runtime = await bootstrapPluginRuntime({ builtins: [platform.plugin, { id: 'core', version: '1.0.0', requires: ['routes.query@1','routes.navigate@1'], provides: [], activate({ contributions }) {
    contributions.registerExtensionPoint({ id: 'routes', kind: 'route', contractMajor: 1, contextSchema: { type: 'object' } });
    contributions.registerRoute({ id: 'item', point: { ownerPluginId: 'core', id: 'routes', contractMajor: 1 }, path: '/items/:id', target: { kind: 'builtin', render: () => null } });
  } }], coreRootIds: ['core'], bridgeContracts: platformBridgeContracts });
  const navigations: string[] = [], audit: unknown[] = [];
  const model = createRouteModel({ routes: runtime.contributions.listRoutes(), navigation: [], points: runtime.contributions.listExtensionPoints(), rootRoutePoint: { ownerPluginId: 'core', id: 'routes', contractMajor: 1 } });
  const store = createInstallationStore({ records: [], supportedHostApis: [], bridgeContracts: platformBridgeContracts, isEntryAllowed: () => false });
  platform.bind({ runtime, model, store, location: () => '/items/current', navigate: href => { navigations.push(href); }, audit: () => [], recordAudit: value => audit.push(value) });
  for (const grantedPermissions of [[], ['routes.query','routes.navigate']]) {
    const ports = new MessageChannel();
    const session = createPluginBridgeSession({ runtime, port: ports.port1, identity: { pluginId: 'core', pluginVersion: '1.0.0', surfaceId: 'page', surfaceInstanceId: crypto.randomUUID(), mountPointId: 'page', protocolVersion: 1, requires: ['routes.query@1','routes.navigate@1'], grantedPermissions } });
    const response = await session.dispatch({ type: 'request', requestId: '1', capability: 'routes.navigate@1', action: 'navigate', payload: { routeId: 'item', params: { id: 'a b' } } });
    expect(response.ok).toBe(grantedPermissions.length > 0);
    if (grantedPermissions.length) {
      expect(navigations).toEqual(['/items/a%20b']);
      const invalid = await session.dispatch({ type: 'request', requestId: '2', capability: 'routes.navigate@1', action: 'navigate', payload: { url: 'https://example.com' } });
      expect(invalid.ok).toBe(false);
      const query = await session.dispatch({ type: 'request', requestId: '3', capability: 'routes.query@1', action: 'list', payload: null });
      expect(JSON.stringify(query)).not.toContain('/items/');
      expect(query).toMatchObject({ ok: true, result: [{ routeId: 'item', ownerPluginId: 'core', ancestry: ['item'] }] });
    }
    session.dispose(); ports.port2.close(); await session.settled();
  }
  expect(audit).toHaveLength(1);
});

it('cannot bypass platform grants with a forged Builtin invocation context and keeps Builtin/Core management read-only', async () => {
  const platform = createPlatformPlugin();
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['core'], builtins: [platform.plugin, {
    id: 'core', version: '1.0.0', requires: ['plugins.manage@1'], provides: [], roles: ['provider','feature'], provenance: 'first-party', activate() {},
  }, { id: 'builtin-feature', version: '1.0.0', requires: [], provides: [], provenance: 'third-party', activate() {} }], bridgeContracts: platformBridgeContracts });
  const store = createInstallationStore({ records: [], supportedHostApis: [], bridgeContracts: platformBridgeContracts, isEntryAllowed: () => false });
  platform.bind({ runtime, model: createRouteModel({ routes: [], navigation: [] }), store, location: () => '/', navigate() {}, audit: () => [], recordAudit() {} });
  const capability = runtime.capabilities.require('plugins.manage@1') as { invoke(action: string, payload: unknown, context: unknown): unknown };
  expect(() => capability.invoke('uninstall', { id: 'core' }, { pluginId: 'core', signal: new AbortController().signal })).toThrow('PLATFORM_INVOCATION_UNBOUND');
  const ports = new MessageChannel();
  const session = createPluginBridgeSession({ runtime, port: ports.port1, identity: { pluginId: 'core', pluginVersion: '1.0.0', surfaceId: 'page', surfaceInstanceId: 'attempt', mountPointId: 'page', protocolVersion: 1, requires: ['plugins.manage@1'], grantedPermissions: ['plugins.manage'] } });
  let sequence = 0;
  for (const id of ['core', 'builtin-feature']) for (const [action, payload] of [
    ['uninstall', { id }], ['setEnabled', { id, enabled: false }], ['selectVersion', { id, version: '2.0.0' }], ['install', { id, version: '2.0.0' }],
  ] as const) expect(await session.dispatch({ type: 'request', requestId: String(++sequence), capability: 'plugins.manage@1', action, payload })).toMatchObject({ ok: false, error: { code: 'ACTION_FAILED' } });
  expect(store.list()).toEqual([]);
  session.dispose(); ports.port2.close(); await session.settled();
});
