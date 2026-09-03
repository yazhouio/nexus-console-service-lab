import { describe, expect, it, vi } from 'vitest';

import {
  bootstrapPluginRuntime,
  validateRestrictedInstallRecord,
  type BridgeCapabilityContract,
} from '../src';
import {
  createWujiePluginAdapter,
  type BridgeHandshakeAttempt,
  type BridgeHandshakeCoordinator,
  type WujieDriver,
  type WujieStartOptions,
} from '../src/browser';

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function runtime() {
  const contract: BridgeCapabilityContract = {
    id: 'kubesphere.cluster@2',
    actions: {
      read: {
        kind: 'request',
        requestSchema: { parse: () => null },
        resultSchema: { parse: () => null },
        requiredPermissions: ['cluster.read'],
        invoke: () => null,
      },
    },
  };
  const installed = validateRestrictedInstallRecord(
    {
      manifest: {
        id: 'kubeeye',
        version: '1.0.0',
        entry: '/plugins/kubeeye/1.0.0/',
        hostApi: 'kubesphere.console@1',
        requires: ['kubesphere.cluster@2'],
        provides: [],
        permissions: ['cluster.read'],
        surfaces: [{ id: 'overview' }],
        contributions: {},
      },
      config: {
        id: 'kubeeye',
        version: '1.0.0',
        enabled: true,
        grantedPermissions: ['cluster.read'],
      },
    },
    { isEntryAllowed: entry => entry.startsWith('/plugins/') },
  );

  return bootstrapPluginRuntime({
    builtins: [
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
        activate(context) {
          context.capabilities.register('kubesphere.cluster@2', {});
        },
      },
    ],
    coreRootIds: ['console-shell'],
    installed: [installed],
    supportedHostApis: ['kubesphere.console@1'],
    bridgeContracts: [contract],
  });
}

function hostWindow(): Window {
  return {
    location: {
      href: 'http://localhost:3000/',
      origin: 'http://localhost:3000',
    },
  } as unknown as Window;
}

function fakePort(onClose?: () => void): MessagePort {
  return {
    close: vi.fn(onClose),
  } as unknown as MessagePort;
}

function successfulHandshake(
  ports: MessagePort[] = [],
): BridgeHandshakeCoordinator {
  return {
    begin(): BridgeHandshakeAttempt {
      const port = ports.shift() ?? fakePort();
      return {
        result: Promise.resolve(port),
        cancel: vi.fn(() => port.close()),
      };
    },
  };
}

const container = {} as HTMLElement;

describe('WujiePluginAdapter', () => {
  it('does not load Wujie or allocate a handshake before mount', async () => {
    const loadDriver = vi.fn(async (): Promise<WujieDriver> => ({
      startApp: vi.fn(),
      destroyApp: vi.fn(),
    }));
    const handshake: BridgeHandshakeCoordinator = {
      begin: vi.fn(),
    };

    const adapter = createWujiePluginAdapter({
      runtime: await runtime(),
      driver: loadDriver,
      handshake,
      hostWindow: hostWindow(),
    });

    expect(adapter.listInstances()).toEqual([]);
    expect(loadDriver).not.toHaveBeenCalled();
    expect(handshake.begin).not.toHaveBeenCalled();
  });

  it('creates MOUNTING before startApp and binds one ACTIVE session', async () => {
    const started = deferred<Function | void>();
    const handshakeResult = deferred<MessagePort>();
    const startApp = vi.fn((_options: WujieStartOptions) => started.promise);
    const driver: WujieDriver = {
      startApp,
      destroyApp: vi.fn(async () => undefined),
    };
    const handshake: BridgeHandshakeCoordinator = {
      begin: vi.fn(() => ({
        result: handshakeResult.promise,
        cancel: vi.fn(),
      })),
    };
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(),
      driver,
      handshake,
      hostWindow: hostWindow(),
      createSurfaceInstanceId: () => 'surface-1',
      createNonce: () => 'nonce-1',
    });

    const mounting = adapter.mount({
      pluginId: 'kubeeye',
      surfaceId: 'overview',
      mountPointId: 'route:kubeeye-overview',
      container,
      layout: { width: 'full' },
      initialParameters: { cluster: 'demo' },
    });
    await vi.waitFor(() => expect(startApp).toHaveBeenCalledOnce());

    expect(adapter.getInstance('surface-1')).toMatchObject({
      identity: {
        pluginId: 'kubeeye',
        pluginVersion: '1.0.0',
        surfaceId: 'overview',
        surfaceInstanceId: 'surface-1',
        mountPointId: 'route:kubeeye-overview',
      },
      wujieName: 'nexus-surface-surface-1',
      state: { state: 'MOUNTING' },
    });
    const wujieOptions = startApp.mock.calls[0]?.[0];
    expect(wujieOptions).toMatchObject({
      name: 'nexus-surface-surface-1',
      url: 'http://localhost:3000/plugins/kubeeye/1.0.0/',
      el: container,
      sync: false,
      alive: false,
      fiber: true,
      degrade: false,
      props: {
        plugin: { id: 'kubeeye', version: '1.0.0' },
        surface: {
          id: 'overview',
          layout: { width: 'full' },
          initialParameters: { cluster: 'demo' },
        },
        bridge: {
          protocolVersion: 1,
          surfaceInstanceId: 'surface-1',
          nonce: 'nonce-1',
        },
      },
    });
    expect(Object.keys(wujieOptions?.props?.bridge ?? {})).toEqual([
      'protocolVersion',
      'surfaceInstanceId',
      'nonce',
    ]);

    started.resolve(undefined);
    handshakeResult.resolve(fakePort());
    await expect(mounting).resolves.toMatchObject({
      identity: { surfaceInstanceId: 'surface-1' },
    });
    expect(adapter.getInstance('surface-1')?.state).toEqual({
      state: 'MOUNTED',
      bridgeSessionState: 'ACTIVE',
    });
  });

  it('keeps simultaneous mounts isolated with unique identities and names', async () => {
    let sequence = 0;
    const driver: WujieDriver = {
      startApp: vi.fn(async () => undefined),
      destroyApp: vi.fn(async () => undefined),
    };
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(),
      driver,
      handshake: successfulHandshake(),
      hostWindow: hostWindow(),
      createSurfaceInstanceId: () => `surface-${++sequence}`,
      createNonce: () => `nonce-${sequence}`,
    });

    await Promise.all([
      adapter.mount({
        pluginId: 'kubeeye',
        surfaceId: 'overview',
        mountPointId: 'route:kubeeye-overview',
        container,
      }),
      adapter.mount({
        pluginId: 'kubeeye',
        surfaceId: 'overview',
        mountPointId: 'extension:workload.tabs/kubeeye',
        container,
      }),
    ]);

    const instances = adapter.listInstances();
    expect(new Set(instances.map(item => item.wujieName)).size).toBe(2);
    expect(new Set(instances.map(item => item.identity.surfaceInstanceId)).size).toBe(2);
    expect(instances.map(item => item.identity.mountPointId)).toEqual([
      'route:kubeeye-overview',
      'extension:workload.tabs/kubeeye',
    ]);
  });

  it.each([
    ['wujie-bootstrap', false],
    ['render', true],
  ] as const)('contains a %s failure to the Surface Instance', async (stage, render) => {
    const driver: WujieDriver = {
      startApp: vi.fn(async options => {
        if (render) {
          options.beforeMount?.({} as Window);
        }
        throw new Error('mount failed');
      }),
      destroyApp: vi.fn(async () => undefined),
    };
    const pluginRuntime = await runtime();
    const adapter = createWujiePluginAdapter({
      runtime: pluginRuntime,
      driver,
      handshake: successfulHandshake(),
      hostWindow: hostWindow(),
      createSurfaceInstanceId: () => 'failed-surface',
      createNonce: () => 'failed-nonce',
    });

    await expect(
      adapter.mount({
        pluginId: 'kubeeye',
        surfaceId: 'overview',
        mountPointId: 'route:kubeeye-overview',
        container,
      }),
    ).rejects.toMatchObject({
      issue: { stage },
    });
    expect(adapter.getInstance('failed-surface')?.state).toMatchObject({
      state: 'FAILED',
      stage,
    });
    expect(pluginRuntime.plugins.get('kubeeye')).toEqual({ state: 'ACTIVE' });
    expect(pluginRuntime.ready).toBe(true);
  });

  it('disposes the session before destroying Wujie and removes the record', async () => {
    const cleanupOrder: string[] = [];
    const port = fakePort(() => cleanupOrder.push('session'));
    const driver: WujieDriver = {
      startApp: vi.fn(async () => () => {
        cleanupOrder.push('wujie');
      }),
      destroyApp: vi.fn(async () => undefined),
    };
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(),
      driver,
      handshake: successfulHandshake([port]),
      hostWindow: hostWindow(),
      createSurfaceInstanceId: () => 'surface-cleanup',
      createNonce: () => 'nonce-cleanup',
    });
    const mounted = await adapter.mount({
      pluginId: 'kubeeye',
      surfaceId: 'overview',
      mountPointId: 'route:kubeeye-overview',
      container,
    });

    await mounted.unmount();

    expect(cleanupOrder).toEqual(['session', 'wujie']);
    expect(adapter.getInstance('surface-cleanup')).toBeUndefined();
  });
});
