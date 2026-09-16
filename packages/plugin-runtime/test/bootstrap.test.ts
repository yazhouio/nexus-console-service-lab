import { describe, expect, it, vi } from 'vitest';

import { bootstrapPluginRuntime, type PluginDefinition } from '../src';

describe('bootstrapPluginRuntime', () => {
  it('activates the Core Closure serially in provider order', async () => {
    const activationOrder: string[] = [];
    const cluster: PluginDefinition = {
      id: 'cluster',
      version: '1.0.0',
      requires: [],
      provides: ['kubesphere.cluster@2'],
      activate(context) {
        activationOrder.push('cluster');
        context.capabilities.register('kubesphere.cluster@2', {
          current: 'demo',
        });
      },
    };
    const shell: PluginDefinition = {
      id: 'console-core',
      version: '1.0.0',
      requires: ['kubesphere.cluster@2'],
      provides: ['kubesphere.shell@1'],
      activate(context) {
        activationOrder.push('console-core');
        expect(context.capabilities.require<{ current: string }>('kubesphere.cluster@2')).toEqual({
          current: 'demo',
        });
        context.capabilities.register('kubesphere.shell@1', { ready: true });
      },
    };

    const runtime = await bootstrapPluginRuntime({
      builtins: [shell, cluster],
      coreRootIds: ['console-core'],
    });

    expect(activationOrder).toEqual(['cluster', 'console-core']);
    expect(runtime.ready).toBe(true);
    expect(runtime.plugins.get('cluster')).toEqual({ state: 'ACTIVE' });
    expect(runtime.plugins.get('console-core')).toEqual({ state: 'ACTIVE' });
    expect(runtime.capabilities.list()).toEqual([
      { id: 'kubesphere.cluster@2', providerPluginId: 'cluster' },
      { id: 'kubesphere.shell@1', providerPluginId: 'console-core' },
    ]);
  });

  it('fails fast when a Core Builtin throws', async () => {
    const activate = vi.fn(() => {
      throw new Error('broken core');
    });

    await expect(
      bootstrapPluginRuntime({
        builtins: [
          {
            id: 'console-core',
            version: '1.0.0',
            requires: [],
            provides: [],
            activate,
          },
        ],
        coreRootIds: ['console-core'],
      }),
    ).rejects.toMatchObject({
      issue: expect.objectContaining({
        code: 'PLUGIN_ACTIVATION_FAILED',
        stage: 'activate',
        pluginId: 'console-core',
      }),
    });
    expect(activate).toHaveBeenCalledOnce();
  });

  it('fails fast and discards records when Core misses a declared provide', async () => {
    await expect(
      bootstrapPluginRuntime({
        builtins: [
          {
            id: 'console-core',
            version: '1.0.0',
            requires: [],
            provides: ['kubesphere.shell@1'],
            activate() {},
          },
        ],
        coreRootIds: ['console-core'],
      }),
    ).rejects.toMatchObject({
      issue: expect.objectContaining({
        code: 'DECLARED_CAPABILITY_MISSING',
        stage: 'assertion',
        pluginId: 'console-core',
      }),
    });
  });

  it('atomically commits Capability and Contribution records', async () => {
    const runtime = await bootstrapPluginRuntime({
      builtins: [
        {
          id: 'console-core',
          version: '1.0.0',
          requires: [],
          provides: [],
          activate() {},
        },
        {
          id: 'broken-non-core',
          version: '1.0.0',
          requires: [],
          provides: ['broken.value@1'],
          activate(context) {
            context.capabilities.register('broken.value@1', { value: true });
            context.contributions.registerRoute({
              id: 'duplicate-route',
              path: '/first',
              target: { kind: 'builtin', render: () => null },
            });
            context.contributions.registerRoute({
              id: 'duplicate-route',
              path: '/second',
              target: { kind: 'builtin', render: () => null },
            });
          },
        },
      ],
      coreRootIds: ['console-core'],
    });

    expect(runtime.ready).toBe(true);
    expect(runtime.plugins.get('broken-non-core')).toMatchObject({
      state: 'FAILED',
      stage: 'assertion',
    });
    expect(runtime.capabilities.get('broken.value@1')).toBeUndefined();
    expect(runtime.contributions.listRoutes()).toEqual([]);
  });

  it('fails soft and skips later consumers when a Non-core Builtin throws', async () => {
    const consumerActivate = vi.fn();
    const runtime = await bootstrapPluginRuntime({
      builtins: [
        {
          id: 'console-core',
          version: '1.0.0',
          requires: [],
          provides: [],
          activate() {},
        },
        {
          id: 'provider',
          version: '1.0.0',
          requires: [],
          provides: ['shared.value@1'],
          activate() {
            throw new Error('provider failed');
          },
        },
        {
          id: 'consumer',
          version: '1.0.0',
          requires: ['shared.value@1'],
          provides: [],
          activate: consumerActivate,
        },
      ],
      coreRootIds: ['console-core'],
    });

    expect(runtime.ready).toBe(true);
    expect(runtime.plugins.get('provider')).toMatchObject({
      state: 'FAILED',
      stage: 'activate',
    });
    expect(runtime.plugins.get('consumer')).toEqual({
      state: 'SKIPPED',
      stage: 'resolve',
      reason: 'CAPABILITY_UNAVAILABLE',
    });
    expect(consumerActivate).not.toHaveBeenCalled();
  });
});
