import { describe, expect, it } from 'vitest';

import {
  bootstrapPluginRuntime,
  validateRestrictedInstallRecord,
  type BridgeCapabilityContract,
  type InstalledPluginRecord,
  type PluginDefinition,
} from '../src';

const nullSchema = {
  parse(value: unknown): null {
    if (value !== null) {
      throw new Error('Expected null.');
    }
    return null;
  },
};

function bridgeContract(
  id: `${string}@${number}` = 'kubesphere.cluster@2',
): BridgeCapabilityContract {
  return {
    id,
    actions: {
      read: {
        kind: 'request',
        requestSchema: nullSchema,
        resultSchema: nullSchema,
        requiredPermissions: ['cluster.read'],
        invoke: () => null,
      },
    },
  };
}

function installed(
  id: string,
  overrides: {
    readonly requires?: readonly `${string}@${number}`[];
    readonly permissions?: readonly string[];
    readonly contributions?: Record<string, unknown>;
    readonly surfaces?: readonly { readonly id: string }[];
    readonly hostApi?: string;
  } = {},
): InstalledPluginRecord {
  return validateRestrictedInstallRecord(
    {
      manifest: {
        id,
        version: '1.0.0',
        entry: `/plugins/${id}/1.0.0/`,
        hostApi: overrides.hostApi ?? 'kubesphere.console@1',
        requires: overrides.requires ?? ['kubesphere.cluster@2'],
        provides: [],
        permissions: overrides.permissions ?? ['cluster.read'],
        surfaces: overrides.surfaces ?? [{ id: 'overview' }],
        contributions: overrides.contributions ?? {
          routes: [
            {
              id: `${id}-route`,
              path: `/${id}`,
              surfaceId: 'overview',
            },
          ],
          navigation: [
            {
              id: `${id}-navigation`,
              label: id,
              routeId: `${id}-route`,
            },
          ],
        },
      },
      config: {
        id,
        version: '1.0.0',
        enabled: true,
        grantedPermissions: overrides.permissions ?? ['cluster.read'],
      },
    },
    { isEntryAllowed: entry => entry.startsWith('/plugins/') },
  );
}

function coreAndCluster(
  clusterActivate?: PluginDefinition['activate'],
): readonly PluginDefinition[] {
  return [
    {
      id: 'console-shell',
      version: '1.0.0',
      requires: [],
      provides: [],
      activate() {},
    },
    {
      id: 'cluster',
      version: '1.0.0',
      requires: [],
      provides: ['kubesphere.cluster@2'],
      activate:
        clusterActivate ??
        (context => {
          context.capabilities.register('kubesphere.cluster@2', {
            current: 'demo',
          });
        }),
    },
  ];
}

describe('Restricted Manifest-first bootstrap', () => {
  it('publishes ACTIVE declarations without loading plugin code', async () => {
    const runtime = await bootstrapPluginRuntime({
      builtins: coreAndCluster(),
      coreRootIds: ['console-shell'],
      installed: [installed('kubeeye')],
      supportedHostApis: ['kubesphere.console@1'],
      bridgeContracts: [bridgeContract()],
    });

    expect(runtime.plugins.get('kubeeye')).toEqual({ state: 'ACTIVE' });
    expect(runtime.restrictedPlugins.get('kubeeye')?.manifest.entry).toBe(
      '/plugins/kubeeye/1.0.0/',
    );
    expect(runtime.surfaces.list('kubeeye')).toEqual([
      {
        pluginId: 'kubeeye',
        pluginVersion: '1.0.0',
        definition: { id: 'overview' },
      },
    ]);
    expect(
      runtime.contributions
        .listRoutes()
        .find(route => route.ownerPluginId === 'kubeeye'),
    ).toMatchObject({
      contribution: {
        target: { kind: 'sandbox-surface', surfaceId: 'overview' },
      },
    });
  });

  it('skips a capability that is not Bridge-exposed at Manifest stage', async () => {
    const runtime = await bootstrapPluginRuntime({
      builtins: coreAndCluster(),
      coreRootIds: ['console-shell'],
      installed: [installed('kubeeye')],
      supportedHostApis: ['kubesphere.console@1'],
      bridgeContracts: [],
    });

    expect(runtime.plugins.get('kubeeye')).toEqual({
      state: 'SKIPPED',
      stage: 'manifest',
      reason: 'CAPABILITY_NOT_BRIDGE_EXPOSED',
    });
    expect(runtime.validationIssues).toContainEqual(
      expect.objectContaining({
        code: 'CAPABILITY_NOT_BRIDGE_EXPOSED',
        validationStage: 'manifest',
        pluginId: 'kubeeye',
        capability: 'kubesphere.cluster@2',
      }),
    );
    expect(runtime.surfaces.list('kubeeye')).toEqual([]);
  });

  it('skips unsupported Host API majors', async () => {
    const runtime = await bootstrapPluginRuntime({
      builtins: coreAndCluster(),
      coreRootIds: ['console-shell'],
      installed: [installed('kubeeye')],
      supportedHostApis: ['kubesphere.console@2'],
      bridgeContracts: [bridgeContract()],
    });

    expect(runtime.plugins.get('kubeeye')).toMatchObject({
      state: 'SKIPPED',
      stage: 'manifest',
      reason: 'HOST_API_INCOMPATIBLE',
    });
  });

  it('skips permissions unknown to required Bridge Contracts', async () => {
    const runtime = await bootstrapPluginRuntime({
      builtins: coreAndCluster(),
      coreRootIds: ['console-shell'],
      installed: [installed('kubeeye', { permissions: ['workload.read'] })],
      supportedHostApis: ['kubesphere.console@1'],
      bridgeContracts: [bridgeContract()],
    });

    expect(runtime.plugins.get('kubeeye')).toMatchObject({
      state: 'SKIPPED',
      reason: 'INVALID_RESTRICTED_MANIFEST',
    });
  });

  it('skips Restricted declarations when a Builtin Provider fails', async () => {
    const runtime = await bootstrapPluginRuntime({
      builtins: coreAndCluster(() => {
        throw new Error('cluster activation failed');
      }),
      coreRootIds: ['console-shell'],
      installed: [installed('kubeeye')],
      supportedHostApis: ['kubesphere.console@1'],
      bridgeContracts: [bridgeContract()],
    });

    expect(runtime.plugins.get('cluster')).toMatchObject({ state: 'FAILED' });
    expect(runtime.plugins.get('kubeeye')).toEqual({
      state: 'SKIPPED',
      stage: 'resolve',
      reason: 'CAPABILITY_UNAVAILABLE',
    });
    expect(runtime.contributions.listRoutes()).toEqual([]);
  });

  it('drops the whole Restricted declaration group on a global collision', async () => {
    const shell: PluginDefinition = {
      id: 'console-shell',
      version: '1.0.0',
      requires: [],
      provides: [],
      activate(context) {
        context.contributions.registerRoute({
          id: 'kubeeye-route',
          path: '/builtin',
          target: { kind: 'builtin', render: () => null },
        });
      },
    };
    const runtime = await bootstrapPluginRuntime({
      builtins: [shell, coreAndCluster()[1]],
      coreRootIds: ['console-shell'],
      installed: [installed('kubeeye')],
      supportedHostApis: ['kubesphere.console@1'],
      bridgeContracts: [bridgeContract()],
    });

    expect(runtime.plugins.get('kubeeye')).toMatchObject({
      state: 'SKIPPED',
      reason: 'INVALID_CONTRIBUTION',
    });
    expect(runtime.surfaces.list('kubeeye')).toEqual([]);
    expect(
      runtime.contributions
        .listNavigation()
        .some(item => item.ownerPluginId === 'kubeeye'),
    ).toBe(false);
  });

  it('validates cross-plugin Navigation against the final eligible set', async () => {
    const alpha = installed('alpha', {
      requires: [],
      permissions: [],
      contributions: {
        navigation: [
          {
            id: 'alpha-navigation',
            label: 'Alpha',
            routeId: 'zeta-route',
          },
        ],
      },
    });
    const zeta = installed('zeta', {
      requires: [],
      permissions: [],
      contributions: {
        routes: [
          {
            id: 'zeta-route',
            path: '/zeta',
            surfaceId: 'overview',
          },
        ],
      },
    });

    const runtime = await bootstrapPluginRuntime({
      builtins: [coreAndCluster()[0]],
      coreRootIds: ['console-shell'],
      installed: [alpha, zeta],
      supportedHostApis: ['kubesphere.console@1'],
    });

    expect(runtime.plugins.get('alpha')).toEqual({ state: 'ACTIVE' });
    expect(runtime.plugins.get('zeta')).toEqual({ state: 'ACTIVE' });
    expect(runtime.contributions.listNavigation()).toMatchObject([
      { ownerPluginId: 'alpha', contribution: { routeId: 'zeta-route' } },
    ]);
  });
});
