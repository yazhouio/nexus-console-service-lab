import { expect, it, vi } from 'vitest';
import { bootstrapPluginRuntime, createUiRuntime } from '../src/index';

it('admits Tabs with Tab grants and reuses Surface scopes, unmounting on switch and creating a new scope on return', async () => {
  const runtime = await bootstrapPluginRuntime({
    coreRootIds: ['page'],
    builtins: [
      {
        id: 'page',
        version: '1.0.0',
        requires: [],
        provides: [],
        activate({ contributions }) {
          contributions.registerExtensionPoint({
            id: 'tabs',
            kind: 'tab',
            contractMajor: 1,
            contextSchema: { type: 'object' },
          });
        },
      },
      {
        id: 'feature',
        version: '1.0.0',
        requires: [],
        provides: [],
        activate({ contributions }) {
          for (const id of ['one', 'two']) {
            contributions.registerSurface({ id, target: { kind: 'builtin', render: () => null } });
            contributions.registerExtension({
              id,
              kind: 'tab',
              tabId: id,
              label: id,
              surfaceId: id,
              point: { ownerPluginId: 'page', id: 'tabs', contractMajor: 1 },
            });
          }
        },
      },
    ],
  });
  const disposed: string[] = [];
  const ui = createUiRuntime({
    registry: runtime.contributions,
    policy: (request) => request.kind === 'tab' && request.contractMajor === 1,
    driver: {
      async mount({ attemptId }) {
        return {
          dispose() {
            disposed.push(attemptId);
          },
        };
      },
      allocate() {
        return { placement: {}, dispose() {} };
      },
      visibility() {},
      layout() {},
      overlay() {
        throw Error('unused');
      },
    },
  });
  const root = ui.attachOwner('page', {});
  const input = (id: string) => ({
    id: 'tabs',
    contextKey: 'item',
    context: {},
    selected: [{ ownerPluginId: 'feature', id }],
  });
  expect(() =>
    ui.mountSlot(
      root.attemptId,
      {},
      {
        ...input('one'),
        selected: [
          { ownerPluginId: 'feature', id: 'one' },
          { ownerPluginId: 'feature', id: 'two' },
        ],
      },
    ),
  ).toThrow('TAB_SELECTION_INVALID');
  expect(ui.snapshot(root.attemptId).occurrences).toHaveLength(0);
  const slot = ui.mountSlot(root.attemptId, {}, input('one'));
  const execution = () =>
    ui.snapshot(root.attemptId).occurrences[0].contributions.find((c) => c.selected)?.execution;
  await vi.waitFor(() => expect(execution()?.phase).toBe('ready'));
  const first = execution()!.attemptId;
  ui.updateSlot(root.attemptId, slot, input('two'));
  await vi.waitFor(() => expect(disposed).toContain(first));
  ui.updateSlot(root.attemptId, slot, input('one'));
  await vi.waitFor(() => expect(execution()?.phase).toBe('ready'));
  expect(execution()!.attemptId).not.toBe(first);
  expect(ui.inspect().scopes.filter((s) => s.kind === 'contribution')).toHaveLength(1);
  await ui.dispose();
});
