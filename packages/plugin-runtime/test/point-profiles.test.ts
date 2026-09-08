import { expect, it } from 'vitest';
import { bootstrapPluginRuntime } from '../src/index';

const profile = {
  id: 'list.actions@1', kind: 'action', refParameters: ['itemRefContract'],
  contextSchema: { type: 'object', properties: { selectedRefs: { type: 'array', maxItems: 100, items: { $refContract: 'itemRefContract' } }, filtered: { type: 'boolean' } }, required: ['selectedRefs', 'filtered'], additionalProperties: false },
  allowedPolicyDimensions: ['selectionCount', 'capability', 'trait', 'predicate'],
} as const;
const ref = { id: 'example.plugin-ref@1', schema: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'], additionalProperties: false } } as const;

it('compiles a Point binding inside its owner activation and freezes the resolved Context schema', async () => {
  const runtime = await bootstrapPluginRuntime({ profiles: [profile], refContracts: [ref], coreRootIds: ['core'], builtins: [{
    id: 'core', version: '1.0.0', requires: [], provides: [], activate({ contributions }) {
      contributions.registerExtensionPoint({ id: 'plugin.actions', kind: 'action', contractMajor: 1, profile: 'list.actions@1', bindings: { itemRefContract: ref.id } });
    },
  }] });
  const point = runtime.contributions.listExtensionPoints()[0].contribution;
  expect(point).toMatchObject({ profile: 'list.actions@1', bindings: { itemRefContract: 'example.plugin-ref@1' }, contextSchema: { properties: { selectedRefs: { items: ref.schema, maxItems: 100 } } } });
  expect(Object.isFrozen(point.contextSchema)).toBe(true);
  expect(Object.isFrozen(point.contextSchema.properties)).toBe(true);
});

it('rejects conflicting identities, schema overrides, missing bindings, and widening within an activation transaction', async () => {
  const builtins = [{ id: 'optional', version: '1.0.0', requires: [], provides: [], activate({ contributions }: import('../src/index').PluginContext) {
    contributions.registerSurface({ id: 'must-rollback', target: { kind: 'builtin' as const, render: () => null } });
    contributions.registerExtensionPoint({ id: 'bad', kind: 'action', contractMajor: 1, profile: 'list.actions@1', bindings: { itemRefContract: ref.id }, constraints: { groups: ['unknown'] } });
  } }];
  const runtime = await bootstrapPluginRuntime({ coreRootIds: [], builtins, profiles: [{ ...profile, allowedConstraints: { groups: ['primary', 'secondary'], order: { min: 0, max: 10 } } }], refContracts: [ref] });
  expect(runtime.plugins.get('optional')?.state).toBe('FAILED');
  expect(runtime.contributions.listUiSurfaces()).toEqual([]);
  expect(runtime.contributions.listExtensionPoints()).toEqual([]);
  await expect(bootstrapPluginRuntime({ coreRootIds: [], builtins: [], profiles: [profile], refContracts: [ref, { ...ref, schema: { type: 'string' } }] })).rejects.toThrow('CONTRACT_ID_CONFLICT');
});

it('accepts only constraints narrowed from the Profile and retains their frozen order', async () => {
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['core'], profiles: [{ ...profile, allowedConstraints: { groups: ['primary', 'secondary'], order: { min: -10, max: 10 }, cardinality: { min: 0, max: 5 } } }], refContracts: [ref], builtins: [{
    id: 'core', version: '1.0.0', requires: [], provides: [], activate({ contributions }) {
      contributions.registerExtensionPoint({ id: 'actions', kind: 'action', contractMajor: 1, profile: profile.id, bindings: { itemRefContract: ref.id }, constraints: { groups: ['primary'], order: { min: 0, max: 2 }, cardinality: { min: 0, max: 1 } } });
    },
  }] });
  expect(runtime.contributions.listExtensionPoints()[0].contribution.constraints).toEqual({ groups: ['primary'], order: { min: 0, max: 2 }, cardinality: { min: 0, max: 1 } });
});

it('checks every execution input against the compiled binding and rejects more than 100 refs', async () => {
  const { createUiRuntime } = await import('../src/index');
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['core'], profiles: [{ ...profile, kind: 'surface', contextSchema: { ...profile.contextSchema, properties: { ...profile.contextSchema.properties, selectedRefs: { type: 'array', items: { $refContract: 'itemRefContract' } } } } }], refContracts: [ref], builtins: [{
    id: 'core', version: '1.0.0', requires: [], provides: [], activate({ contributions }) {
      contributions.registerExtensionPoint({ id: 'cards', kind: 'surface', contractMajor: 1, profile: profile.id, bindings: { itemRefContract: ref.id } });
    },
  }] });
  const ui = createUiRuntime({ registry: runtime.contributions, policy: () => true, driver: { async mount() { return { dispose() {} }; }, allocate() { return { placement: {}, dispose() {} }; }, visibility() {}, layout() {}, overlay() { throw Error('unused'); } } });
  const root = ui.attachOwner('core', {});
  const slot = ui.mountSlot(root.attemptId, {}, { id: 'cards', contextKey: 'one', context: { selectedRefs: [{ id: 'a' }], filtered: true } });
  expect(ui.snapshot(root.attemptId).occurrences[0].input.acceptance).toBe('accepted');
  ui.updateSlot(root.attemptId, slot, { id: 'cards', contextKey: 'invalid', context: { selectedRefs: [{ wrong: 'a' }], filtered: false } });
  expect(ui.snapshot(root.attemptId).occurrences[0].input.acceptance).toBe('rejected');
  ui.updateSlot(root.attemptId, slot, { id: 'cards', contextKey: 'too-many', context: { selectedRefs: Array.from({ length: 101 }, () => ({ id: 'a' })), filtered: false } });
  expect(ui.snapshot(root.attemptId).occurrences[0].input).toMatchObject({ acceptance: 'rejected', effective: null });
  await ui.dispose();
});

it('treats the Profile and Ref bindings as part of a Point Major across installed versions', async () => {
  const { createInstallationStore } = await import('../src/index');
  const manifest = { id: 'page', version: '1.0.0', requires: [], provides: [], hostApi: 'example.host@1', entry: '/plugins/page/', permissions: [], surfaces: [], contributions: {}, extensionPoints: [{ id: 'actions', kind: 'action', contractMajor: 1, profile: profile.id, bindings: { itemRefContract: ref.id } }] };
  const record = { manifest, config: { id: 'page', version: '1.0.0', enabled: true, grantedPermissions: [] } };
  const store = createInstallationStore({ records: [record as never], supportedHostApis: ['example.host@1'], bridgeContracts: [], isEntryAllowed: () => true });
  expect(() => store.install({ ...record, manifest: { ...manifest, version: '2.0.0', extensionPoints: [{ ...manifest.extensionPoints[0], bindings: { itemRefContract: 'example.other-ref@1' } }] }, config: { ...record.config, version: '2.0.0' } })).toThrow('CONTEXT_MAJOR_FROZEN');
  expect(store.list()[0].manifest.version).toBe('1.0.0');
});

it('does not use compatibility assertions to choose another Point and bounds every JSON input', async () => {
  const { createActionRuntime } = await import('../src');
  const other = { ...ref, id: 'example.other-ref@1' as const };
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['page'], profiles: [profile], refContracts: [ref, other], builtins: [
    { id: 'page', version: '1.0.0', requires: [], provides: [], activate({ contributions }) {
      for (const [id, contract] of [['requested', ref.id], ['other', other.id]] as const) contributions.registerExtensionPoint({ id, kind: 'action', contractMajor: 1, profile: profile.id, bindings: { itemRefContract: contract } });
    } },
    { id: 'feature', version: '1.0.0', requires: [], provides: [], activate({ contributions, actions }) {
      actions.register('check', () => null);
      contributions.registerExtension({ kind: 'action', id: 'check', label: 'Check', actionId: 'check', point: { ownerPluginId: 'page', id: 'requested', contractMajor: 1 }, expectedRefContract: other.id });
    } },
  ] });
  let connects = 0;
  const actions = createActionRuntime({ registry: runtime.contributions, policy: () => true, driver: { async connect() { connects++; return { invoke: () => null, dispose() {} }; } } });
  const point = { ownerPluginId: 'page', id: 'requested', contractMajor: 1 }, context = { selectedRefs: [{ id: 'a' }], filtered: false };
  expect(actions.query('page', point, context)[0].reason).toBe('REF_CONTRACT_ASSERTION_FAILED');
  expect(actions.query('page', { ...point, id: 'other' }, context)).toEqual([]);
  expect(() => actions.invoke('page', point, { ownerPluginId: 'feature', id: 'check' }, context)).toThrow('REF_CONTRACT_ASSERTION_FAILED');
  expect(() => actions.query('page', point, { ...context, selectedRefs: Array.from({ length: 101 }, () => ({ id: 'a' })) })).toThrow('CONTEXT_INVALID');
  expect(() => actions.query('page', point, { ...context, selectedRefs: [{ id: 'x'.repeat(70_000) }] })).toThrow('bounded JSON');
  let nested: import('../src').JsonValue = {};
  for (let i = 0; i < 40; i++) nested = { child: nested };
  expect(() => actions.query('page', point, nested)).toThrow('JSON resource limit');
  expect(connects).toBe(0);
  await actions.dispose();
});

it('rolls back Action handlers and definitions together when owner declaration admission fails', async () => {
  const runtime = await bootstrapPluginRuntime({ coreRootIds: [], profiles: [profile], refContracts: [ref], builtins: [{ id: 'broken', version: '1.0.0', requires: [], provides: [], activate({ actions, contributions }) {
    actions.register('partial', () => null);
    contributions.registerExtensionPoint({ id: 'bad', kind: 'action', contractMajor: 1, profile: profile.id });
  } }] });
  expect(runtime.plugins.get('broken')?.state).toBe('FAILED');
  expect(runtime.builtinActions.size).toBe(0);
  expect(runtime.contributions.listActions()).toEqual([]);
});

it('rejects unsupported presentation/constraint dimensions rather than accepting inert restrictions', async () => {
  const { createPointCompiler } = await import('../src/ui/point-compiler');
  const compile = createPointCompiler();
  expect(() => compile({ id: 'actions', kind: 'action', contractMajor: 1, contextSchema: {}, constraints: { presentations: ['menu'] } })).toThrow('CONSTRAINT_NOT_SUPPORTED');
  expect(() => compile({ id: 'routes', kind: 'route', contractMajor: 1, contextSchema: {}, constraints: { cardinality: { min: 0, max: 1 } } })).toThrow('CONSTRAINT_NOT_SUPPORTED');
  expect(() => compile({ id: 'cards', kind: 'surface', contractMajor: 1, contextSchema: {}, constraints: { presentations: ['drawer'] } })).toThrow('PRESENTATION_NOT_SUPPORTED');
  expect(compile({ id: 'cards', kind: 'surface', contractMajor: 1, contextSchema: {}, constraints: { presentations: ['inline'] } }).constraints?.presentations).toEqual(['inline']);
});

it('enforces Action cardinality against its single invocation before connecting an owner', async () => {
  const { createActionRuntime } = await import('../src');
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['page'], builtins: [{ id: 'page', version: '1.0.0', requires: [], provides: [], activate({ contributions, actions }) {
    contributions.registerExtensionPoint({ id: 'none', kind: 'action', contractMajor: 1, contextSchema: {}, constraints: { cardinality: { min: 0, max: 0 } } });
    actions.register('check', () => null);
    contributions.registerExtension({ id: 'check', kind: 'action', actionId: 'check', label: 'Check', point: { ownerPluginId: 'page', id: 'none', contractMajor: 1 } });
  } }] });
  let connections = 0;
  const actions = createActionRuntime({ registry: runtime.contributions, policy: () => true, driver: { async connect() { connections++; return { invoke: () => null, dispose() {} }; } } });
  const point = { ownerPluginId: 'page', id: 'none', contractMajor: 1 };
  expect(actions.query('page', point, {})[0].reason).toBe('POINT_CARDINALITY_INVALID');
  expect(() => actions.invoke('page', point, { ownerPluginId: 'page', id: 'check' }, {})).toThrow('POINT_CARDINALITY_INVALID');
  expect(connections).toBe(0);
  await actions.dispose();
});
