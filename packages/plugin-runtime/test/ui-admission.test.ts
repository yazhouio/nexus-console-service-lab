import { expect, it, vi } from 'vitest';
import { bootstrapPluginRuntime, validateRestrictedInstallRecord } from '../src';
import { createContributionRegistry } from '../src/contribution';
import { createUiRuntime, type UiDriver } from '../src/ui/runtime';

it('surface query preserves ownership, version, missing lookup and readonly data', async () => {
  const installed = ['one', 'two'].map((id) =>
    validateRestrictedInstallRecord(
      {
        manifest: {
          id,
          version: '2.0.0',
          entry: `/plugins/${id}/`,
          hostApi: 'console@1',
          requires: [],
          provides: [],
          permissions: [],
          surfaces: [{ id: 'shared' }],
          contributions: {},
        },
        config: { id, version: '2.0.0', enabled: true, grantedPermissions: [] },
      },
      { isEntryAllowed: () => true },
    ),
  );
  const runtime = await bootstrapPluginRuntime({
    builtins: [],
    coreRootIds: [],
    installed,
    supportedHostApis: ['console@1'],
  });
  expect(runtime.surfaces.list()).toHaveLength(2);
  expect(runtime.surfaces.get('one', 'shared')).toEqual({
    pluginId: 'one',
    pluginVersion: '2.0.0',
    definition: { id: 'shared' },
  });
  expect(runtime.surfaces.get('two', 'shared')?.pluginId).toBe('two');
  expect(runtime.surfaces.get('absent', 'shared')).toBeUndefined();
  expect(runtime.surfaces.get('one', 'absent')).toBeUndefined();
  expect(Object.isFrozen(runtime.surfaces.list())).toBe(true);
  expect(Object.isFrozen(runtime.surfaces.get('one', 'shared')!.definition)).toBe(true);
  expect(runtime.contributions.listUiSurfaces().map((s) => s.ownerPluginId)).toEqual([
    'one',
    'two',
  ]);
});

it('static admission remains denied through selection, updates and independent occurrences', async () => {
  const registry = createContributionRegistry();
  const owner = registry.beginActivation('owner');
  owner.context.registerExtensionPoint({
    id: 'point',
    kind: 'surface',
    contractMajor: 1,
    contextSchema: { type: 'object' },
  });
  owner.commit();
  for (const id of ['allowed', 'denied']) {
    const a = registry.beginActivation(id);
    a.context.registerSurface({ id: 'view', target: { kind: 'builtin', render: () => null } });
    a.context.registerExtension({
      id: 'entry',
      kind: 'surface',
      surfaceId: 'view',
      point: { ownerPluginId: 'owner', id: 'point', contractMajor: 1 },
    });
    a.commit();
  }
  const mounts: string[] = [];
  const driver: UiDriver = {
    async mount(input) {
      mounts.push(input.ownerPluginId);
      return { dispose() {} };
    },
    allocate() {
      return { placement: {}, dispose() {} };
    },
    visibility() {},
    layout() {},
    overlay() {
      return { placement: {}, dispose() {}, error() {} };
    },
  };
  const policy = vi.fn((request) => request.contributorId === 'allowed');
  const core = createUiRuntime({ registry: registry.registry, driver, policy });
  const root = core.attachOwner('owner', {});
  const input = { id: 'point', contextKey: 'a', context: {} };
  const first = core.mountSlot(root.attemptId, {}, input);
  core.mountSlot(root.attemptId, {}, input);
  for (let i = 0; i < 10; i++) core.updateSlot(root.attemptId, first, { ...input, context: { i } });
  await vi.waitFor(() => expect(mounts).toEqual(['allowed', 'allowed']));
  core.updateSlot(root.attemptId, first, {
    ...input,
    selected: [{ ownerPluginId: 'denied', id: 'entry' }],
  });
  expect(core.inspect().scopes.filter((s) => s.owner === 'denied')).toHaveLength(0);
  expect(core.inspect().relations.find((r) => r.ref.ownerPluginId === 'denied')?.reason).toBe(
    'POLICY_DENIED',
  );
  expect(
    core
      .snapshot(root.attemptId)
      .occurrences.every((o) => o.contributions.every((c) => c.ref.ownerPluginId === 'allowed')),
  ).toBe(true);
  expect(policy).toHaveBeenCalledTimes(2);
  await core.dispose();
});

it('freezes declaration and admission facts, and isolates policy evaluation errors', async () => {
  const registry = createContributionRegistry();
  const a = registry.beginActivation('page');
  a.context.registerExtensionPoint({
    id: 'cards',
    kind: 'surface',
    contractMajor: 1,
    contextSchema: { type: 'object' },
  });
  a.commit();
  const contribute = (owner: string) => {
    const activation = registry.beginActivation(owner);
    activation.context.registerSurface({
      id: 'view',
      target: { kind: 'builtin', render: () => null },
    });
    activation.context.registerExtension({
      id: 'card',
      kind: 'surface',
      surfaceId: 'view',
      point: { ownerPluginId: 'page', id: 'cards', contractMajor: 1 },
    });
    activation.commit();
  };
  contribute('healthy');
  contribute('broken');
  let granted = true;
  const policy = vi.fn((request) => {
    if (request.contributorId === 'broken') throw Error('private policy detail');
    return granted;
  });
  const mounted: string[] = [];
  const driver: UiDriver = {
    async mount(input) {
      mounted.push(input.ownerPluginId);
      return { dispose() {} };
    },
    allocate() {
      return { placement: {}, dispose() {} };
    },
    visibility() {},
    layout() {},
    overlay() {
      return { placement: {}, dispose() {}, error() {} };
    },
  };
  const core = createUiRuntime({ registry: registry.registry, driver, policy });
  granted = false;
  contribute('late');
  const latePoint = registry.beginActivation('page');
  latePoint.context.registerExtensionPoint({
    id: 'late-point',
    kind: 'surface',
    contractMajor: 1,
    contextSchema: { type: 'object' },
  });
  latePoint.commit();
  const root = core.attachOwner('page', {});
  const input = { id: 'cards', contextKey: 'a', context: {} };
  core.mountSlot(root.attemptId, {}, input);
  await vi.waitFor(() => expect(mounted).toEqual(['healthy']));
  expect(policy).toHaveBeenCalledTimes(2);
  expect(core.inspect().relations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ref: { ownerPluginId: 'broken', id: 'card' },
        availability: 'unavailable',
        reason: 'POLICY_ERROR',
      }),
    ]),
  );
  expect(core.inspect().relations.some((r) => r.ref.ownerPluginId === 'late')).toBe(false);
  expect(JSON.stringify(core.inspect())).not.toContain('private policy detail');
  expect(() => core.mountSlot(root.attemptId, {}, { ...input, id: 'late-point' })).toThrow(
    'POINT_NOT_OWNED',
  );
  await core.dispose();
  const replacement = createUiRuntime({ registry: registry.registry, driver, policy });
  expect(
    replacement.inspect().relations.find((r) => r.ref.ownerPluginId === 'healthy')?.reason,
  ).toBe('POLICY_DENIED');
  expect(replacement.inspect().relations.some((r) => r.ref.ownerPluginId === 'late')).toBe(true);
  await replacement.dispose();
});
