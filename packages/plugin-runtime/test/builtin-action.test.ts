import { expect, it } from 'vitest';
import { bootstrapPluginRuntime, createActionRuntime } from '../src';
import { createBrowserActionDriver } from '../src/browser/action-driver';
import { createWujiePluginAdapter } from '../src/browser';

it('executes Builtin Actions through the same capability permission checks without allocating a Surface', async () => {
  const runtime = await bootstrapPluginRuntime({
    coreRootIds: ['owner'],
    builtins: [
      {
        id: 'owner',
        version: '1.0.0',
        requires: ['data.read@1'],
        provides: [],
        activate({ contributions, actions }) {
          contributions.registerExtensionPoint({
            id: 'commands',
            kind: 'action',
            contractMajor: 1,
            contextSchema: { type: 'null' },
          });
          actions.register('read', ({ capabilities }) =>
            capabilities.invoke('data.read@1', 'read', null),
          );
          contributions.registerExtension({
            kind: 'action',
            id: 'read',
            actionId: 'read',
            label: 'Read',
            point: { ownerPluginId: 'owner', id: 'commands', contractMajor: 1 },
          });
        },
      },
      {
        id: 'data',
        version: '1.0.0',
        requires: [],
        provides: ['data.read@1'],
        activate({ capabilities }) {
          capabilities.register('data.read@1', {});
        },
      },
    ],
    bridgeContracts: [
      {
        id: 'data.read@1',
        actions: {
          read: {
            kind: 'request',
            requestSchema: { parse: () => null },
            resultSchema: { parse: (value) => value as import('../src').JsonValue },
            requiredPermissions: ['data.read'],
            invoke: () => ({ value: 42 }),
          },
        },
      },
    ],
  });
  const adapter = createWujiePluginAdapter({
    runtime,
    hostWindow: {} as Window,
    handshake: {
      begin() {
        throw Error('Builtin must not connect to Wujie');
      },
    },
  });
  for (const granted of [false, true]) {
    const actions = createActionRuntime({
      registry: runtime.contributions,
      policy: () => false,
      driver: createBrowserActionDriver({
        runtime,
        restrictedAdapter: adapter,
        builtinPermissions: { owner: granted ? ['data.read'] : [] },
      }),
    });
    const invocation = actions.invoke(
      'owner',
      { ownerPluginId: 'owner', id: 'commands', contractMajor: 1 },
      { ownerPluginId: 'owner', id: 'read' },
      null,
    );
    expect(await invocation.result).toMatchObject(
      granted ? { state: 'succeeded', result: { value: 42 } } : { state: 'failed' },
    );
    await actions.dispose();
  }
  expect(runtime.contributions.listUiSurfaces()).toEqual([]);
});
