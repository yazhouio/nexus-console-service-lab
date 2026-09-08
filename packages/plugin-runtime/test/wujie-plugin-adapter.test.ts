import { describe, expect, it, vi } from 'vitest';

import {
  bootstrapPluginRuntime,
  inspect,
  validateRestrictedInstallRecord,
  type BridgeCapabilityContract,
} from '../src';
import {
  createWujiePluginAdapter,
  BridgeHandshakeError,
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

async function runtime(actionOnly = false) {
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
        surfaces: actionOnly ? [] : [{ id: 'overview' }],
        actions: [{ id: 'check' }],
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
        id: 'console-core',
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
    coreRootIds: ['console-core'],
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
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    start: vi.fn(),
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
  it('injects a JSON route snapshot independently from static Surface configuration', async () => {
    let props: unknown;
    const adapter = createWujiePluginAdapter({ runtime: await runtime(), hostWindow: hostWindow(), handshake: successfulHandshake(), driver: {
      async startApp(options) { props = options.props; }, async destroyApp() {},
    } });
    const routeContext = { routeId: 'alerts', pathname: '/nodes/n1/alerts', params: { node: 'n1' }, search: '?severity=high' };
    const mounted = await adapter.mount({ pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:alerts', container, routeContext, initialParameters: { view: 'route' } });
    routeContext.params.node = 'mutated';
    expect(props).toMatchObject({ routeContext: { params: { node: 'n1' }, search: '?severity=high' }, surface: { initialParameters: { view: 'route' } } });
    await mounted.unmount();
  });

  it('cancels an in-flight start, disposes first, and destroys its late result once', async () => {
    const start = deferred<Function | void>();
    const order: string[] = [];
    const port = fakePort(() => order.push('session'));
    const destroy = vi.fn(() => { order.push('wujie'); });
    const driver: WujieDriver = {
      startApp: vi.fn(() => start.promise), destroyApp: vi.fn(async () => undefined),
    };
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(), driver, handshake: successfulHandshake([port]),
      hostWindow: hostWindow(), createSurfaceInstanceId: () => 'cancelled',
    });
    const abort = new AbortController();
    const mounting = adapter.mount({
      pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:cancelled',
      container, signal: abort.signal,
    });
    const rejection = expect(mounting).rejects.toMatchObject({ issue: { code: 'SURFACE_MOUNT_CANCELLED' } });
    await vi.waitFor(() => expect(driver.startApp).toHaveBeenCalledOnce());
    abort.abort();
    expect(order).toEqual(['session']);
    start.resolve(destroy);
    await rejection;
    await vi.waitFor(() => expect(adapter.listInstances()).toEqual([]));
    expect(order).toEqual(['session', 'wujie']);
    await adapter.unmount('cancelled');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('does not start Wujie when cancelled while its lazy import is resolving', async () => {
    const loading = deferred<WujieDriver>();
    const driver: WujieDriver = {
      startApp: vi.fn(async () => undefined), destroyApp: vi.fn(async () => undefined),
    };
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(), driver: () => loading.promise,
      handshake: successfulHandshake(), hostWindow: hostWindow(),
      createSurfaceInstanceId: () => 'cancel-before-start',
    });
    const mounting = adapter.mount({ pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:cancel', container });
    const rejection = expect(mounting).rejects.toMatchObject({ issue: { code: 'SURFACE_MOUNT_CANCELLED' } });
    const unmounting = adapter.unmount('cancel-before-start');
    loading.resolve(driver);
    await Promise.all([rejection, unmounting]);
    expect(driver.startApp).not.toHaveBeenCalled();
    expect(adapter.listInstances()).toEqual([]);
  });

  it('contains a render error after mount and cleans iframe listeners', async () => {
    const iframe = new EventTarget();
    const port = fakePort();
    const destroy = vi.fn();
    const onSurfaceError = vi.fn();
    const pluginRuntime = await runtime();
    const adapter = createWujiePluginAdapter({
      runtime: pluginRuntime,
      driver: {
        async startApp(options) {
          options.plugins?.[0]?.jsBeforeLoaders?.[0]?.callback?.(iframe as Window);
          return destroy;
        },
        destroyApp: vi.fn(async () => undefined),
      },
      handshake: successfulHandshake([port]), hostWindow: hostWindow(),
      createSurfaceInstanceId: () => 'render-failure', onSurfaceError,
    });
    const mounted = await adapter.mount({ pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:render', container });
    iframe.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
    expect(port.close).toHaveBeenCalledOnce();
    expect(adapter.getInstance('render-failure')?.state).toMatchObject({ state: 'FAILED', stage: 'render' });
    expect(pluginRuntime.plugins.get('kubeeye')).toEqual({ state: 'ACTIVE' });
    iframe.dispatchEvent(new Event('error'));
    expect(onSurfaceError).toHaveBeenCalledOnce();
    await mounted.unmount();
    expect(adapter.listInstances()).toEqual([]);
  });

  it('retains attributable artifact and handshake failures until unmount', async () => {
    for (const stage of ['artifact', 'handshake'] as const) {
      const pluginRuntime = await runtime();
      const adapter = createWujiePluginAdapter({
        runtime: pluginRuntime,
        driver: {
          async startApp(options) {
            if (stage === 'artifact') options.loadError?.('asset.js', new Error('not found'));
          },
          destroyApp: vi.fn(async () => undefined),
        },
        handshake: stage === 'artifact' ? successfulHandshake() : {
          begin: () => ({ result: Promise.reject(new BridgeHandshakeError('BRIDGE_NONCE_INVALID', 'invalid nonce')), cancel() {} }),
        },
        hostWindow: hostWindow(), createSurfaceInstanceId: () => `${stage}-failure`,
      });
      await expect(adapter.mount({ pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: `route:${stage}`, container })).rejects.toMatchObject({
        issue: { stage, pluginId: 'kubeeye', surfaceId: 'overview', surfaceInstanceId: `${stage}-failure`, mountPointId: `route:${stage}` },
      });
      expect(adapter.listInstances()[0]?.state).toMatchObject({ state: 'FAILED', stage });
      expect(pluginRuntime.plugins.get('kubeeye')).toEqual({ state: 'ACTIVE' });
      await adapter.unmount(`${stage}-failure`);
      expect(adapter.listInstances()).toEqual([]);
    }
  });

  it('does not reuse an instance id after unmount', async () => {
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(), driver: { async startApp() {}, async destroyApp() {} },
      handshake: successfulHandshake(), hostWindow: hostWindow(), createSurfaceInstanceId: () => 'fixed',
    });
    const input = { pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:id', container };
    await (await adapter.mount(input)).unmount();
    await expect(adapter.mount(input)).rejects.toThrow('already used');
  });

  it('rejects Host objects in metadata and clones allowed JSON before Wujie injection', async () => {
    const startApp = vi.fn(async (_options: WujieStartOptions) => undefined);
    const adapter = createWujiePluginAdapter({
      runtime: await runtime(), driver: { startApp, async destroyApp() {} },
      handshake: successfulHandshake(), hostWindow: hostWindow(),
    });
    const input = { pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:props', container };
    await expect(adapter.mount({ ...input, initialParameters: { client: () => 'host' } as never })).rejects.toThrow('JSON');
    expect(startApp).not.toHaveBeenCalled();
    const parameters = { cluster: { name: 'original' } };
    const mounted = await adapter.mount({ ...input, initialParameters: parameters });
    parameters.cluster.name = 'changed';
    expect(startApp.mock.calls[0]?.[0].props?.surface.initialParameters).toEqual({ cluster: { name: 'original' } });
    await mounted.unmount();
  });

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
      wujieName: expect.stringMatching(/^nexus-surface-surface-1-/),
      state: { state: 'MOUNTING' },
    });
    const wujieOptions = startApp.mock.calls[0]?.[0];
    expect(wujieOptions).toMatchObject({
      name: adapter.getInstance('surface-1')?.wujieName,
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


it('projects session failure only on the owning instance and preserves earlier snapshots', async () => {
  const first = new MessageChannel();
  const second = new MessageChannel();
  const pluginRuntime = await runtime();
  let sequence = 0;
  const adapter = createWujiePluginAdapter({
    runtime: pluginRuntime, hostWindow: hostWindow(),
    driver: { async startApp() {}, async destroyApp() {} },
    handshake: successfulHandshake([first.port1, second.port1]),
    createSurfaceInstanceId: () => `instance-${++sequence}`,
    bridgeLimits: { maxProtocolViolations: 2 },
  });
  try {
    await adapter.mount({ pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'route:overview', container });
    await adapter.mount({ pluginId: 'kubeeye', surfaceId: 'overview', mountPointId: 'extension:cards/overview', container });
    const before = inspect(pluginRuntime, adapter);
    first.port2.postMessage({ type: 'request', pluginId: 'forged', requestId: 'bad-1' });
    first.port2.postMessage({ type: 'request', pluginId: 'forged', requestId: 'bad-2' });
    await vi.waitFor(() => expect(adapter.getInstance('instance-1')?.state).toMatchObject({ state: 'FAILED', stage: 'bridge' }));
    const after = inspect(pluginRuntime, adapter);
    const plugin = after.plugins.find(plugin => plugin.id === 'kubeeye');
    expect(plugin?.state).toBe('ACTIVE');
    expect(plugin?.surfaces?.[0].instances).toMatchObject([
      { surfaceInstanceId: 'instance-1', state: 'FAILED', bridgeSession: { state: 'DISPOSED', subscriptionCount: 0 } },
      { surfaceInstanceId: 'instance-2', state: 'MOUNTED', bridgeSession: { state: 'ACTIVE', subscriptionCount: 0 } },
    ]);
    expect(before.plugins.find(plugin => plugin.id === 'kubeeye')?.surfaces?.[0].instances.every(instance => instance.state === 'MOUNTED')).toBe(true);
    const response = new Promise(resolve => { second.port2.onmessage = event => resolve(event.data); });
    second.port2.postMessage({ type: 'request', requestId: 'bad-1', capability: 'kubesphere.cluster@2', action: 'read', payload: null });
    expect(await response).toMatchObject({ ok: true, result: null });
    expect(inspect(pluginRuntime, adapter)).toEqual(after);
  } finally {
    await Promise.all(adapter.listInstances().map(instance => adapter.unmount(instance.identity.surfaceInstanceId)));
    first.port2.close(); second.port2.close();
  }
});


it('loads an Action-only owner without a Surface and closes its per-invocation bridge', async () => {
  const ports = new MessageChannel();
  let props: any;
  const destroyed = vi.fn();
  const adapter = createWujiePluginAdapter({ runtime: await runtime(true), hostWindow: hostWindow(), handshake: successfulHandshake([ports.port1]), driver: {
    async startApp(options) { props = options.props; ports.port2.postMessage({ type: 'ui:request', requestId: 1, action: 'action.ready', payload: null }); }, async destroyApp() { destroyed(); },
  } });
  ports.port2.addEventListener('message', event => {
    if (event.data.type === 'action:execute') ports.port2.postMessage({ type: 'ui:request', requestId: 2, action: 'action.complete', payload: { ok: true, result: { checked: true } } });
  });
  ports.port2.start();
  const session = await adapter.connectAction({ ownerPluginId: 'kubeeye', actionId: 'check', invocationId: 'invocation-1', context: { itemRef: 'a' }, payload: null, signal: new AbortController().signal }, container);
  expect(props.surface).toBeUndefined();
  expect(props.action).toMatchObject({ actionId: 'check', invocationId: 'invocation-1', context: { itemRef: 'a' } });
  expect(await session.invoke()).toEqual({ checked: true });
  await session.dispose();
  expect(adapter.listInstances()).toEqual([]);
  expect(destroyed).toHaveBeenCalledOnce();
  ports.port2.close();
});
