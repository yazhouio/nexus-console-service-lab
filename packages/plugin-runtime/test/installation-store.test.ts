import { expect, it } from 'vitest';
import {
  bootstrapPluginRuntime,
  createInstallationStore,
  type InstalledPluginRecord,
} from '../src';

function record(version = '1.0.0'): InstalledPluginRecord {
  return {
    manifest: {
      id: 'example',
      version,
      entry: `/plugins/example/${version}/`,
      hostApi: 'host.console@1',
      requires: [],
      provides: [],
      permissions: [],
      surfaces: [{ id: 'page' }],
      contributions: { routes: [{ id: 'example-page', path: '/example', surfaceId: 'page' }] },
    },
    config: { id: 'example', version, enabled: true, grantedPermissions: [] },
  };
}

it('applies install, version changes, disable, enable and uninstall only to the next bootstrap', async () => {
  let saved: unknown;
  const options = {
    isEntryAllowed: (entry: string) => entry.startsWith('/plugins/'),
    supportedHostApis: ['host.console@1' as const],
    bridgeContracts: [],
    storage: {
      read: () => saved,
      write: (state: unknown) => {
        saved = JSON.parse(JSON.stringify(state));
      },
    },
  };
  const store = createInstallationStore(options);
  const reload = () =>
    bootstrapPluginRuntime({
      builtins: [],
      coreRootIds: [],
      installed: store.list(),
      supportedHostApis: options.supportedHostApis,
    });
  const empty = await reload();
  expect(store.install(record())).toEqual({ reloadRequired: true });
  expect(empty.plugins.has('example')).toBe(false);
  expect(empty.contributions.listRoutes()).toEqual([]);
  const v1 = await reload();
  expect(v1.restrictedPlugins.get('example')?.manifest.version).toBe('1.0.0');
  store.install(record('2.0.0'));
  expect(v1.restrictedPlugins.get('example')?.manifest.version).toBe('1.0.0');
  expect((await reload()).restrictedPlugins.get('example')?.manifest.version).toBe('2.0.0');
  expect(store.selectVersion('example', '1.0.0')).toEqual({ reloadRequired: true });
  expect((await reload()).restrictedPlugins.get('example')?.manifest.version).toBe('1.0.0');
  store.setEnabled('example', false);
  expect(v1.plugins.get('example')?.state).toBe('ACTIVE');
  expect((await reload()).plugins.has('example')).toBe(false);
  store.setEnabled('example', true);
  expect((await reload()).plugins.get('example')?.state).toBe('ACTIVE');
  const restored = createInstallationStore(options);
  expect(restored.list()).toEqual(store.list());
  expect(restored.listVersions('example').map((record) => record.manifest.version)).toEqual([
    '1.0.0',
    '2.0.0',
  ]);
  store.uninstall('example');
  expect((await reload()).plugins.has('example')).toBe(false);
  expect(store.listVersions('example')).toEqual([]);
});

it('rejects changed artifacts at an existing version, mismatched selection configs, and failed persistence atomically', () => {
  let failWrite = false;
  const store = createInstallationStore({
    records: [record()],
    isEntryAllowed: () => true,
    supportedHostApis: ['host.console@1'],
    bridgeContracts: [],
    storage: {
      read: () => undefined,
      write() {
        if (failWrite) throw Error('disk full');
      },
    },
  });
  expect(() =>
    store.install({ ...record(), manifest: { ...record().manifest, entry: '/changed/' } }),
  ).toThrow('IMMUTABLE_PLUGIN_VERSION');
  expect(() =>
    store.selectVersion('example', '1.0.0', { ...record().config, version: '2.0.0' }),
  ).toThrow();
  failWrite = true;
  expect(() => store.setEnabled('example', false)).toThrow('disk full');
  expect(store.list()[0].config.enabled).toBe(true);
});

it('freezes Ready catalogs and contribution metadata against caller mutations', async () => {
  const source = record();
  const runtime = await bootstrapPluginRuntime({
    builtins: [],
    coreRootIds: [],
    installed: [source],
    supportedHostApis: ['host.console@1'],
  });
  expect(() => (runtime.restrictedPlugins as Map<string, InstalledPluginRecord>).clear()).toThrow();
  expect(() => (runtime.plugins as Map<string, unknown>).clear()).toThrow();
  expect(() => (runtime.resolution.coreClosure as Set<string>).add('example')).toThrow();
  (source.manifest as { version: string }).version = 'forged';
  (source.config as { enabled: boolean }).enabled = false;
  expect(runtime.restrictedPlugins.get('example')?.manifest.version).toBe('1.0.0');
  expect(runtime.restrictedPlugins.get('example')?.config.enabled).toBe(true);
  const target = runtime.contributions.listRoutes()[0].contribution.target;
  expect(() => Object.assign(target, { surfaceId: 'forged' })).toThrow();
});

it('revalidates persisted installations against the next Host instead of failing the store load', async () => {
  const persisted = { records: [record()], activeVersions: [{ id: 'example', version: '1.0.0' }] };
  const store = createInstallationStore({
    isEntryAllowed: () => true,
    supportedHostApis: ['host.console@2'],
    bridgeContracts: [],
    storage: { read: () => persisted, write() {} },
  });
  const runtime = await bootstrapPluginRuntime({
    builtins: [],
    coreRootIds: [],
    installed: store.list(),
    supportedHostApis: ['host.console@2'],
  });
  expect(runtime.plugins.get('example')).toMatchObject({
    state: 'SKIPPED',
    reason: 'HOST_API_INCOMPATIBLE',
  });
});

it('keeps contract v2 readable while routing is disabled and requires removing newer declarations before an old-validator rollback', () => {
  const options = {
    isEntryAllowed: () => true,
    supportedHostApis: ['host.console@1' as const],
    bridgeContracts: [],
  };
  const next = {
    ...record('2.0.0'),
    manifest: {
      ...record('2.0.0').manifest,
      contributions: {
        routes: [{ id: 'child', parentRouteId: 'node', path: 'child', surfaceId: 'page' }],
      },
    },
  };
  const store = createInstallationStore({
    ...options,
    contributionContractVersion: 2,
    records: [record()],
  });
  store.install(next);
  // Routing enablement is deliberately not an input to the readable installation contract.
  expect(
    createInstallationStore({
      ...options,
      storage: { read: () => store.snapshot(), write() {} },
    }).list()[0].manifest.version,
  ).toBe('2.0.0');
  const oldValidator = () =>
    createInstallationStore({
      ...options,
      contributionContractVersion: 1,
      storage: { read: () => store.snapshot(), write() {} },
    });
  expect(oldValidator).toThrow('CONTRIBUTION_CONTRACT_UNSUPPORTED');
  store.selectVersion('example', '1.0.0');
  expect(oldValidator).toThrow('CONTRIBUTION_CONTRACT_UNSUPPORTED');
  // Retained, inactive versions also need migration before replacing the validator.
  store.uninstall('example');
  store.install(record());
  expect(oldValidator().list()[0].manifest.version).toBe('1.0.0');
});

it('freezes an owner point schema across package versions and requires a new contractMajor', () => {
  const version = (
    packageVersion: string,
    contractMajor: number,
    contextSchema: Record<string, unknown>,
  ) => ({
    ...record(packageVersion),
    manifest: {
      ...record(packageVersion).manifest,
      extensionPoints: [{ id: 'details', kind: 'surface', contractMajor, contextSchema }],
    },
  });
  const schema = { type: 'object', properties: { node: { type: 'string' } } };
  const store = createInstallationStore({
    isEntryAllowed: () => true,
    supportedHostApis: ['host.console@1'],
    bridgeContracts: [],
  });
  store.install(version('1.0.0', 1, schema));
  store.install(version('1.1.0', 1, { properties: schema.properties, type: 'object' }));
  const changed = { ...schema, properties: { ...schema.properties, optional: { type: 'string' } } };
  expect(() => store.install(version('1.2.0', 1, changed))).toThrow('CONTEXT_MAJOR_FROZEN');
  expect(store.list()[0].manifest.version).toBe('1.1.0');
  store.install(version('1.2.0', 2, changed));
  expect(store.list()[0].manifest.extensionPoints?.[0].contractMajor).toBe(2);
});
