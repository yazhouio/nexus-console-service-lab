import { expect, it } from 'vitest';
import type { OwnedContribution, NavigationContribution } from '../src/index';
import { createRouteModel } from './route-fixture';

const routes = [
  {
    ownerPluginId: 'alpha',
    contribution: {
      id: 'node',
      path: '/clusters/:cluster/nodes/:node',
      acceptsChildren: true,
      target: { kind: 'builtin' as const, routeLayout: true, render: () => null },
    },
  },
  ...['alerts', 'events'].map((id) => ({
    ownerPluginId: 'beta',
    contribution: {
      id,
      parentRouteId: 'node',
      path: `${id}/:item`,
      target: { kind: 'builtin' as const, render: () => null },
    },
  })),
];
const navigation: OwnedContribution<NavigationContribution>[] = [
  { ownerPluginId: 'alpha', contribution: { id: 'group', label: 'Node', acceptsChildren: true } },
  {
    ownerPluginId: 'beta',
    contribution: { id: 'events-nav', label: 'Events', parentId: 'group', routeId: 'events' },
  },
];

it('shares only common matched ancestor parameters and keeps missing parameters transient', () => {
  const model = createRouteModel({ routes, navigation, policy: () => true });
  expect(model.navigation[0].children[0].state).toBe('AVAILABLE');
  expect(model.destination('events-nav', '/clusters/demo/nodes/n1/alerts/secret')).toEqual({
    state: 'DISABLED',
    diagnostic: { code: 'TARGET_PARAMS_MISSING', missingParams: ['item'] },
  });
  expect(model.destination('events-nav', '/clusters/demo/nodes/n1/events/e1')).toEqual({
    state: 'LINK',
    href: '/clusters/demo/nodes/n1/events/e1',
  });
  expect(
    model.listHostContributions('/').find((f) => f.contributionId === 'events-nav'),
  ).toMatchObject({ state: 'AVAILABLE', navigationDiagnostic: { code: 'TARGET_PARAMS_MISSING' } });
});

it('applies the same policy request shape to navigation containers and isolates graph cycles', () => {
  const requests: unknown[] = [];
  const model = createRouteModel({
    routes,
    navigation: [
      ...navigation,
      { ownerPluginId: 'beta', contribution: { id: 'cycle-a', label: 'A', parentId: 'cycle-b' } },
      { ownerPluginId: 'beta', contribution: { id: 'cycle-b', label: 'B', parentId: 'cycle-a' } },
      { ownerPluginId: 'beta', contribution: { id: 'dependent', label: 'D', parentId: 'cycle-a' } },
    ],
    policy: (request) => {
      requests.push(request);
      return request.kind === 'route';
    },
  });
  expect(requests).toContainEqual({
    contributorId: 'beta',
    ownerPluginId: 'alpha',
    kind: 'navigation',
    targetId: 'nav-group',
    contractMajor: 1,
  });
  expect(model.navigation.map((n) => n.contribution.id)).toEqual(['group']);
  const facts = model.listHostContributions();
  expect(facts.find((f) => f.contributionId === 'events-nav')).toMatchObject({
    state: 'QUARANTINED',
    diagnostics: [{ code: 'POLICY_DENIED' }],
  });
  expect(facts.find((f) => f.contributionId === 'cycle-a')).toMatchObject({
    state: 'QUARANTINED',
    diagnostics: [{ code: 'PARENT_CYCLE' }],
  });
  expect(facts.find((f) => f.contributionId === 'dependent')).toMatchObject({
    state: 'UNREACHABLE',
    diagnostics: [{ code: 'PARENT_QUARANTINED' }],
  });
});

it('encodes inherited ancestor values and supports sibling tabs with no leaf-only parameters', () => {
  const model = createRouteModel({
    routes: routes.map((r) =>
      r.contribution.id === 'events'
        ? { ...r, contribution: { ...r.contribution, path: 'events' } }
        : r,
    ),
    navigation,
    policy: () => true,
  });
  expect(
    model.destination('events-nav', '/clusters/a%2Fb/nodes/%E8%8A%82%E7%82%B9/alerts/a1'),
  ).toEqual({ state: 'LINK', href: '/clusters/a%2Fb/nodes/%E8%8A%82%E7%82%B9/events' });
  expect(model.destination('events-nav', '/unrelated')).toMatchObject({
    state: 'DISABLED',
    diagnostic: { code: 'TARGET_PARAMS_MISSING', missingParams: ['cluster', 'node'] },
  });
});

it('keeps healthy sibling navigation usable from a quarantined child address', () => {
  const model = createRouteModel({
    routes: [
      ...routes.map((r) =>
        r.contribution.id === 'events'
          ? { ...r, contribution: { ...r.contribution, path: 'events' } }
          : r,
      ),
      { ...routes[1], contribution: { ...routes[1].contribution, id: 'duplicate-alerts' } },
    ],
    navigation,
    policy: () => true,
  });
  expect(model.resolve('/clusters/demo/nodes/n1/alerts/a1').state).toBe('CONFLICT');
  expect(model.destination('events-nav', '/clusters/demo/nodes/n1/alerts/a1')).toEqual({
    state: 'LINK',
    href: '/clusters/demo/nodes/n1/events',
  });
});
