import { expect, it } from 'vitest';
import { bootstrapPluginRuntime, createActionRuntime } from '../src/index';

async function setup() {
  return bootstrapPluginRuntime({
    coreRootIds: ['owner'],
    builtins: [
      {
        id: 'owner',
        version: '1.0.0',
        requires: [],
        provides: [],
        activate({ contributions, actions }) {
          contributions.registerExtensionPoint({
            id: 'actions',
            kind: 'action',
            contractMajor: 1,
            contextSchema: {
              type: 'object',
              properties: { itemRef: { type: 'string' } },
              required: ['itemRef'],
              additionalProperties: false,
            },
          });
          actions.register('save', async ({ context }) => context);
          contributions.registerExtension({
            id: 'save',
            kind: 'action',
            actionId: 'save',
            label: 'Save',
            point: { ownerPluginId: 'owner', id: 'actions', contractMajor: 1 },
          });
        },
      },
    ],
  });
}

it('invokes a declared Action without any Surface, with an immutable Context and a single terminal result', async () => {
  const runtime = await setup();
  expect(runtime.contributions.listUiSurfaces()).toHaveLength(0);
  const calls: string[] = [],
    disposed: string[] = [];
  const actions = createActionRuntime({
    registry: runtime.contributions,
    policy: () => false,
    driver: {
      async connect(input) {
        calls.push(input.invocationId);
        return {
          async invoke() {
            expect(Object.isFrozen(input.context)).toBe(true);
            return input.context;
          },
          dispose() {
            disposed.push(input.invocationId);
          },
        };
      },
    },
  });
  const context = { itemRef: 'a' };
  const invocation = actions.invoke(
    'owner',
    { ownerPluginId: 'owner', id: 'actions', contractMajor: 1 },
    { ownerPluginId: 'owner', id: 'save' },
    context,
  );
  context.itemRef = 'changed';
  expect(await invocation.result).toEqual({
    state: 'succeeded',
    invocationId: invocation.invocationId,
    result: { itemRef: 'a' },
  });
  invocation.cancel();
  await actions.settled();
  expect(calls).toEqual([invocation.invocationId]);
  expect(disposed).toEqual([invocation.invocationId]);
  expect(actions.inspect().active).toEqual([]);
});

it('cancels and times out without retrying side effects, even if the owner completes later', async () => {
  const { vi } = await import('vitest');
  vi.useFakeTimers();
  try {
    const runtime = await setup();
    let complete!: (value: null) => void;
    let calls = 0,
      cancels = 0,
      disposals = 0;
    const actions = createActionRuntime({
      registry: runtime.contributions,
      policy: () => true,
      timeoutMs: 20,
      driver: {
        async connect() {
          return {
            invoke() {
              calls++;
              return new Promise<null>((r) => {
                complete = r;
              });
            },
            cancel() {
              cancels++;
            },
            dispose() {
              disposals++;
            },
          };
        },
      },
    });
    for (const state of ['timed-out', 'cancelled'] as const) {
      const invocation = actions.invoke(
        'owner',
        { ownerPluginId: 'owner', id: 'actions', contractMajor: 1 },
        { ownerPluginId: 'owner', id: 'save' },
        { itemRef: 'a' },
      );
      await vi.advanceTimersByTimeAsync(1);
      if (state === 'cancelled') invocation.cancel();
      else await vi.advanceTimersByTimeAsync(20);
      expect(await invocation.result).toMatchObject({ state });
      await actions.settled();
      complete(null);
      await vi.advanceTimersByTimeAsync(100);
      expect(actions.inspect().outcomes.at(-1)?.state).toBe(state);
    }
    expect([calls, cancels, disposals]).toEqual([2, 2, 2]);
    expect(actions.inspect().active).toHaveLength(0);
    expect(actions.inspect().outcomes).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});

it('evaluates only published traits and capability conditions at each invocation, independently of frozen admission', async () => {
  let capability = false,
    granted = true,
    policyCalls = 0;
  const runtime = await bootstrapPluginRuntime({
    coreRootIds: ['page'],
    profiles: [
      {
        id: 'detail.actions@1',
        kind: 'action',
        refParameters: ['itemRefContract'],
        allowedPolicyDimensions: ['capability', 'predicate', 'trait'],
        contextSchema: {
          type: 'object',
          properties: { itemRef: { $refContract: 'itemRefContract' } },
          required: ['itemRef'],
        },
      },
    ],
    refContracts: [
      {
        id: 'domain.resource@1',
        schema: { type: 'object', properties: { uid: { type: 'string' } } },
        traits: { uid: { field: 'uid' } },
        predicates: { hasIdentity: { trait: 'uid', op: 'present' } },
      },
    ],
    builtins: [
      {
        id: 'page',
        version: '1.0.0',
        requires: [],
        provides: [],
        activate({ contributions }) {
          contributions.registerExtensionPoint({
            id: 'actions',
            kind: 'action',
            contractMajor: 1,
            profile: 'detail.actions@1',
            bindings: { itemRefContract: 'domain.resource@1' },
          });
        },
      },
      {
        id: 'feature',
        version: '1.0.0',
        requires: [],
        provides: [],
        activate({ actions, contributions }) {
          actions.register('remove', () => null);
          contributions.registerExtension({
            id: 'remove',
            kind: 'action',
            actionId: 'remove',
            label: 'Remove',
            point: { ownerPluginId: 'page', id: 'actions', contractMajor: 1 },
            visibleWhen: [{ source: 'capability', id: 'domain.delete@1', available: true }],
            disabledWhen: [
              { source: 'predicate', name: 'hasIdentity', value: false, match: 'any' },
            ],
          });
        },
      },
    ],
  });
  const actions = createActionRuntime({
    registry: runtime.contributions,
    policy: () => {
      policyCalls++;
      return granted;
    },
    canUseCapability: () => capability,
    driver: {
      async connect() {
        return { invoke: () => null, dispose() {} };
      },
    },
  });
  const point = { ownerPluginId: 'page', id: 'actions', contractMajor: 1 },
    ref = { ownerPluginId: 'feature', id: 'remove' };
  expect(actions.query('page', point, { itemRef: { uid: '1' } })[0].visible).toBe(false);
  capability = true;
  granted = false;
  expect(actions.query('page', point, { itemRef: {} })[0].disabled).toBe(true);
  expect(() => actions.invoke('page', point, ref, { itemRef: {} })).toThrow('ACTION_DISABLED');
  expect(await actions.invoke('page', point, ref, { itemRef: { uid: '1' } }).result).toMatchObject({
    state: 'succeeded',
  });
  expect(policyCalls).toBe(1);
  await actions.dispose();
});
