import { expect, it } from 'vitest';
import { bootstrapPluginRuntime, createRouteModel } from '../src/index';

it('requires versioned Route and Navigation Point grants, isolates policy exceptions and freezes admission', async () => {
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['owner'], builtins: [{ id: 'owner', version: '1.0.0', requires: [], provides: [], activate({ contributions }) {
    contributions.registerExtensionPoint({ id: 'routes', kind: 'route', contractMajor: 2, contextSchema: { type: 'object' } });
    contributions.registerExtensionPoint({ id: 'primary', kind: 'navigation', contractMajor: 1, contextSchema: { type: 'object' } });
  } }] });
  const point = { ownerPluginId: 'owner', id: 'routes', contractMajor: 2 };
  const routes = ['good','bad','old'].map(id => ({ ownerPluginId: id, contribution: { id, path: `/${id}`, point: { ...point, contractMajor: id === 'old' ? 1 : 2 }, target: { kind: 'builtin' as const, render: () => null } } }));
  let allow = true, calls = 0;
  const model = createRouteModel({ routes, navigation: [], points: runtime.contributions.listExtensionPoints(), rootRoutePoint: point, policy(request) { calls++; if (request.contributorId === 'bad') throw Error('private secret'); return allow && request.contractMajor === 2; } });
  allow = false;
  expect(model.resolve('/good').state).toBe('MATCHED');
  expect(model.resolve('/old').state).toBe('CONFLICT');
  expect(model.routes.find(r => r.contribution.id === 'bad')?.diagnostics).toEqual([{ code: 'POLICY_ERROR' }]);
  expect(JSON.stringify(model.listHostContributions())).not.toContain('private secret');
  model.resolve('/good'); model.listHostContributions('/good');
  expect(calls).toBe(3);
});

it('sorts each Navigation sibling set by Point group, order and stable owner/id across containers', async () => {
  const rootPoint = { ownerPluginId: 'owner', id: 'primary', contractMajor: 1 };
  const childPoint = { ownerPluginId: 'owner', id: 'secondary', contractMajor: 1 };
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['owner'], builtins: [{ id: 'owner', version: '1.0.0', requires: [], provides: [], activate({ contributions }) {
    for (const id of ['primary','secondary']) contributions.registerExtensionPoint({ id, kind: 'navigation', contractMajor: 1, contextSchema: { type: 'object' }, constraints: { groups: ['first', 'last'], order: { min: -10, max: 10 } } });
  } }] });
  const navigation = [
    { ownerPluginId: 'owner', contribution: { id: 'parent', label: 'Group', point: rootPoint, childPoint, group: 'first', order: 10 } },
    { ownerPluginId: 'z', contribution: { id: 'root-last', label: 'Last', point: rootPoint, group: 'last', order: -10 } },
    { ownerPluginId: 'z', contribution: { id: 'child-last', label: 'Last child', point: childPoint, parentId: 'parent', group: 'last', order: -10 } },
    { ownerPluginId: 'a', contribution: { id: 'child-first', label: 'First child', point: childPoint, parentId: 'parent', group: 'first', order: 10 } },
  ];
  for (const entries of [navigation, [...navigation].reverse()]) {
    const model = createRouteModel({ routes: [], navigation: entries, points: runtime.contributions.listExtensionPoints(), navigationRootPoints: [rootPoint], policy: () => true });
    expect(model.navigation.map(n => n.contribution.id)).toEqual(['parent','root-last']);
    expect(model.navigation[0].children.map(n => n.contribution.id)).toEqual(['child-first','child-last']);
  }
});

it('rejects undeclared and unversioned root admission even when a policy grants everything', () => {
  const model = createRouteModel({ routes: [{ ownerPluginId: 'first-party', contribution: { id: 'page', path: '/page', target: { kind: 'builtin', render: () => null } } }], navigation: [{ ownerPluginId: 'first-party', contribution: { id: 'nav', label: 'Page' } }], policy: () => true });
  expect(model.routes[0].diagnostics).toEqual([{ code: 'POINT_MISSING' }]);
  expect(model.listHostContributions().find(fact => fact.contributionId === 'nav')?.diagnostics).toEqual([{ code: 'POINT_MISSING' }]);
});

it('cannot lend another owner’s Point to open a Route layout', async () => {
  const root = { ownerPluginId: 'owner', id: 'routes', contractMajor: 1 }, borrowed = { ownerPluginId: 'other', id: 'children', contractMajor: 1 };
  const runtime = await bootstrapPluginRuntime({ coreRootIds: ['owner'], builtins: [
    { id: 'owner', version: '1.0.0', requires: [], provides: [], activate({ contributions }) { contributions.registerExtensionPoint({ id: root.id, kind: 'route', contractMajor: 1, contextSchema: {} }); } },
    { id: 'other', version: '1.0.0', requires: [], provides: [], activate({ contributions }) { contributions.registerExtensionPoint({ id: borrowed.id, kind: 'route', contractMajor: 1, contextSchema: {} }); } },
  ] });
  const model = createRouteModel({ points: runtime.contributions.listExtensionPoints(), rootRoutePoint: root, navigation: [], policy: () => true, routes: [
    { ownerPluginId: 'owner', contribution: { id: 'layout', path: '/layout', point: root, childPoint: borrowed, target: { kind: 'builtin', render: () => null, routeLayout: true } } },
    { ownerPluginId: 'other', contribution: { id: 'child', parentRouteId: 'layout', path: 'child', point: borrowed, target: { kind: 'builtin', render: () => null } } },
  ] });
  expect(model.routes.find(route => route.contribution.id === 'child')?.diagnostics).toEqual([{ code: 'POINT_TARGET_MISMATCH' }]);
});
