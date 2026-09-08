import { expect, it } from 'vitest';
import { bootstrapPluginRuntime, resolveRootPresentation, type PluginDefinition } from '../src/index';

const core: PluginDefinition = {
  id: 'foundation', version: '1.0.0', requires: [], provides: [],
  activate({ contributions }) {
    contributions.registerSurface({ id: 'root', target: { kind: 'builtin', render: () => null } });
  },
};

it('resolves a distribution-selected declared Core Surface without a business plugin name', async () => {
  const runtime = await bootstrapPluginRuntime({ builtins: [core], coreRootIds: ['foundation'], rootPresentation: { ownerPluginId: 'foundation', surfaceId: 'root' } });
  expect(resolveRootPresentation(runtime)).toMatchObject({ ownerPluginId: 'foundation', contribution: { id: 'root', target: { kind: 'builtin' } } });
});

it('rejects missing, undeclared, or non-Core roots while preserving Runtime Ready', async () => {
  for (const rootPresentation of [undefined, { ownerPluginId: 'optional', surfaceId: 'root' }, { ownerPluginId: 'foundation', surfaceId: 'missing' }]) {
    const runtime = await bootstrapPluginRuntime({ builtins: [core, { ...core, id: 'optional' }], coreRootIds: ['foundation'], rootPresentation });
    expect(() => resolveRootPresentation(runtime)).toThrow(/ROOT_PRESENTATION/);
    expect(runtime.ready).toBe(true);
  }
});
