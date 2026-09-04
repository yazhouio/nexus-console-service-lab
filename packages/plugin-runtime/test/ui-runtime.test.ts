import { describe, expect, it, vi } from 'vitest';
import { createContributionRegistry } from '../src/contribution';
import { createUiRuntime, type UiDriver, type SlotInput } from '../src/ui/runtime';
import { validateContextSchema, matchesContext } from '../src/ui/schema';

const schema = { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'], additionalProperties: false } as const;
const input = (contextKey = 'A', value: number | string = 1): SlotInput => ({ id: 'details', contextKey, context: { value } });
function fixture() {
  const registry = createContributionRegistry();
  for (const owner of ['a','b','c']) {
    const activation = registry.beginActivation(owner);
    activation.context.registerSurface({ id: 'main', target: { kind: 'builtin', render: () => null } });
    activation.context.registerExtensionPoint({ id: 'details', kind: 'surface', contractMajor: 1, contextSchema: schema });
    if (owner !== 'a') activation.context.registerExtension({ id: 'card', kind: 'surface', surfaceId: 'main', point: { ownerPluginId: owner === 'b' ? 'a' : 'b', id: 'details', contractMajor: 1 } });
    activation.commit();
  }
  const disposed: string[] = [];
  const driver: UiDriver = {
    async mount({ attemptId }) { return { dispose() { disposed.push(attemptId); } }; },
    allocate() { return { placement: {}, dispose() {} }; }, visibility() {}, layout() {},
    overlay() { return { placement: {}, dispose() {}, error() {} }; },
  };
  const core = createUiRuntime({ registry: registry.registry, driver, policy: () => true, canOverlay: () => true });
  const root = core.mountRoot('a', 'main', { kind: 'builtin', render: () => null }, {});
  const slot = () => core.mountSlot(root.attemptId, {}, input());
  const execution = (occurrenceId: string) => core.snapshot(root.attemptId).occurrences.find(o => o.occurrenceId === occurrenceId)!.contributions[0].execution!;
  return { core, root, slot, execution, disposed, driver, registry };
}

describe('Host UI composition contracts', () => {
  it('retains same-key executions, separates input rejection, and never resurrects a visited key', async () => {
    const f = fixture(), o = f.slot();
    await vi.waitFor(() => expect(f.execution(o).phase).toBe('ready'));
    const a1 = f.execution(o).attemptId;
    f.core.updateSlot(f.root.attemptId, o, input('A', 2));
    expect(f.execution(o).attemptId).toBe(a1);
    f.core.updateSlot(f.root.attemptId, o, input('A', 'bad'));
    expect(f.core.snapshot(f.root.attemptId).occurrences[0].input).toMatchObject({ acceptance: 'rejected', effective: { value: { value: 2 } } });
    expect(f.execution(o).phase).toBe('ready');
    f.core.updateSlot(f.root.attemptId, o, input('B', 'bad'));
    expect(f.core.snapshot(f.root.attemptId).occurrences[0].input.effective).toBeNull();
    expect(f.core.snapshot(f.root.attemptId).occurrences[0].contributions[0].execution).toBeUndefined();
    f.core.updateSlot(f.root.attemptId, o, input('A', 1));
    expect(f.execution(o).attemptId).not.toBe(a1);
    expect(() => f.core.snapshot(a1)).toThrow('STALE_EXECUTION');
    await f.core.dispose(); expect(f.core.inspect().scopes).toHaveLength(0);
  });
  it('hidden is not keep-alive; separate occurrences never share execution', async () => {
    const f = fixture(), o1 = f.slot(), o2 = f.slot();
    const a1 = f.execution(o1).attemptId, a2 = f.execution(o2).attemptId;
    expect(a1).not.toBe(a2);
    const revision = f.core.snapshot(f.root.attemptId).occurrences[0].input.effective!.revision;
    f.core.updateSlot(f.root.attemptId, o1, { ...input(), hidden: true, sizing: { mode: 'bounded' } });
    expect(f.execution(o1).attemptId).toBe(a1);
    expect(f.core.snapshot(f.root.attemptId).occurrences[0].input.effective!.revision).toBe(revision);
    f.core.unmountSlot(f.root.attemptId, o1);
    expect(() => f.core.snapshot(a1)).toThrow();
    const o3 = f.slot(); expect(f.execution(o3).attemptId).not.toBe(a1); expect(f.execution(o2).attemptId).toBe(a2);
    await f.core.dispose();
  });
  it('captures retry Context at acceptance and then delivers later same-key updates', async () => {
    const f = fixture(), o = f.slot(); await vi.waitFor(() => expect(f.execution(o).phase).toBe('ready'));
    const failed = f.execution(o).attemptId; f.core.failAttempt(failed);
    f.core.updateSlot(f.root.attemptId, o, input('A', 2));
    let release!: () => void;
    f.driver.mount = async () => { await new Promise<void>(r => { release = r; }); return { dispose() {} }; };
    const retried = f.core.retry(f.root.attemptId, o, failed);
    f.core.updateSlot(f.root.attemptId, o, input('A', 3));
    expect(f.core.snapshot(retried)).toMatchObject({ initialContext: { value: { value: 2 } }, context: { value: { value: 3 } } });
    expect(() => f.core.retry(f.root.attemptId, o, failed)).toThrow('STALE_RETRY');
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); release(); await f.core.dispose();
  });
  it('keeps an owner-scope Overlay across retry but cascades child scopes on parent Attempt failure', async () => {
    const f = fixture(), o = f.slot(); await vi.waitFor(() => expect(f.execution(o).phase).toBe('ready'));
    const b1 = f.execution(o).attemptId;
    f.core.mountSlot(b1, {}, input());
    const rootHandle = f.core.openOverlay(f.root.attemptId, 'main', null);
    const bHandle = f.core.openOverlay(b1, 'main', { business: 1 });
    f.core.failAttempt(b1);
    const b2 = f.core.retry(f.root.attemptId, o, b1);
    expect(f.core.overlaySnapshot(b2).overlays.map(x => x.handle)).toEqual([bHandle]);
    expect(f.core.inspect().scopes.filter(s => s.owner === 'c')).toHaveLength(0);
    expect(() => f.core.overlaySnapshot(f.root.attemptId, bHandle)).toThrow('OVERLAY_NOT_OWNED');
    f.core.failAttempt(f.root.attemptId); f.root.retry();
    expect(f.core.overlaySnapshot(f.root.attemptId).overlays.map(x => x.handle)).toEqual([rootHandle]);
    expect(() => f.core.overlaySnapshot(b2, bHandle)).toThrow('STALE_EXECUTION');
    await f.core.dispose(); expect(f.core.inspect().overlays).toBe(0);
  });
  it('commits one Overlay terminal outcome and retains it until owner Scope ends', async () => {
    const f = fixture(), handle = f.core.openOverlay(f.root.attemptId, 'main', { id: 1 });
    const overlayAttempt = f.core.overlaySnapshot(f.root.attemptId, handle).overlays[0].execution!.attemptId;
    f.core.completeOverlay(overlayAttempt, { saved: true });
    f.core.cancelOverlay(f.root.attemptId, handle);
    expect(f.core.overlaySnapshot(f.root.attemptId, handle).overlays[0]).toMatchObject({ outcome: { state: 'completed', result: { saved: true } } });
    expect(f.core.overlaySnapshot(f.root.attemptId, handle).overlays[0].execution).toBeUndefined();
    await f.core.dispose(); expect(() => f.core.overlaySnapshot(f.root.attemptId, handle)).toThrow();
  });
  it('invalidates before cleanup and disposes resources that finish mounting late', async () => {
    const f = fixture(); await vi.waitFor(() => expect(f.root.execution.phase).toBe('ready')); let finish!: (value: { dispose(): void }) => void;
    f.driver.mount = () => new Promise(resolve => { finish = resolve; });
    const o = f.slot(), b = f.execution(o).attemptId;
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    f.core.unmountSlot(f.root.attemptId, o);
    expect(() => f.core.mountSlot(b, {}, input())).toThrow('STALE_EXECUTION');
    const dispose = vi.fn(); finish({ dispose }); await f.core.settled(); expect(dispose).toHaveBeenCalledOnce();
    await f.core.dispose();
  });
  it('assigns Host progress independently of Context revision and returns full recovery snapshots', async () => {
    const f = fixture(), o = f.slot(); const before = f.core.snapshot(f.root.attemptId);
    f.core.updateSlot(f.root.attemptId, o, { ...input(), hidden: true });
    const after = f.core.snapshot(f.root.attemptId);
    expect(after.progress).toBeGreaterThan(before.progress);
    expect(after.occurrences[0].input.effective?.revision).toBe(before.occurrences[0].input.effective?.revision);
    expect(after.occurrences[0].visibility).toBe('hidden'); await f.core.dispose();
  });
  it('isolates unauthorized, mismatched and missing relations while filtering never grants execution', async () => {
    const f = fixture();
    const a = f.registry.beginActivation('other');
    a.context.registerSurface({ id: 'main', target: { kind: 'builtin', render: () => null } });
    a.context.registerExtension({ id: 'ungranted', kind: 'surface', surfaceId: 'main', point: { ownerPluginId: 'a', id: 'details', contractMajor: 1 } });
    a.context.registerExtension({ id: 'new-major', kind: 'surface', surfaceId: 'main', point: { ownerPluginId: 'a', id: 'details', contractMajor: 2 } });
    a.context.registerExtension({ id: 'missing', kind: 'surface', surfaceId: 'absent', point: { ownerPluginId: 'a', id: 'details', contractMajor: 1 } });
    a.commit();
    const policyCalls: unknown[] = [];
    const core = createUiRuntime({ registry: f.registry.registry, driver: f.driver, policy(request) {
      policyCalls.push(request);
      return request.kind === 'surface' && request.contributorId === 'b' && request.contractMajor === 1;
    } });
    const root = core.attachOwner('a', {});
    const o = core.mountSlot(root.attemptId, {}, input());
    expect(core.snapshot(root.attemptId).occurrences[0].contributions.map(c => c.ref.ownerPluginId)).toEqual(['b']);
    core.updateSlot(root.attemptId, o, { ...input(), selected: [{ ownerPluginId: 'other', id: 'ungranted' }] });
    expect(core.inspect().scopes.map(s => s.owner)).toEqual(['a']);
    expect(policyCalls).toContainEqual({ kind: 'surface', contributorId: 'other', ownerPluginId: 'a', targetId: 'details', contractMajor: 2 });
    const allAllowed = createUiRuntime({ registry: f.registry.registry, driver: f.driver, policy: () => true });
    const r = allAllowed.attachOwner('a', {}); allAllowed.mountSlot(r.attemptId, {}, input());
    expect(allAllowed.snapshot(r.attemptId).occurrences[0].contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: { ownerPluginId: 'other', id: 'new-major' }, reason: 'CONTRACT_MISMATCH' }),
      expect.objectContaining({ ref: { ownerPluginId: 'other', id: 'missing' }, reason: 'SURFACE_MISSING' }),
    ]));
    expect(allAllowed.snapshot(r.attemptId).occurrences[0].contributions.filter(c => c.availability === 'unavailable').every(c => !c.execution)).toBe(true);
    await Promise.all([core.dispose(), allAllowed.dispose(), f.core.dispose()]);
  });
});

it('enforces the inline schema subset and structural value constraints', () => {
  validateContextSchema(schema);
  expect(matchesContext(schema, { value: 1 })).toBe(true);
  expect(matchesContext(schema, { value: 1, surprise: true })).toBe(false);
  expect(matchesContext(schema, { value: '1' })).toBe(false);
  expect(() => validateContextSchema({ $ref: 'https://example.com/schema' })).toThrow();
  expect(() => validateContextSchema({ pattern: '(.*)+' })).toThrow();
});
