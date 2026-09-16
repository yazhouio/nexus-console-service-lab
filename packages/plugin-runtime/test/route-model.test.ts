import { describe, expect, it } from 'vitest';
import type { OwnedContribution, RouteContribution } from '../src/index';
import { createRouteModel } from './route-fixture';

export function route(
  id: string,
  path: string,
  ownerPluginId = 'alpha',
  metadata: Partial<RouteContribution> = {},
): OwnedContribution<RouteContribution> {
  return {
    ownerPluginId,
    contribution: { id, path, target: { kind: 'builtin', render: () => null }, ...metadata },
  };
}

describe('Host ownership policy', () => {
  it('isolates conflicting authorized children without disabling their parent or healthy sibling', () => {
    const model = createRouteModel({
      routes: [
        route('node', '/clusters/:cluster/nodes/:node', 'alpha', {
          acceptsChildren: true,
          target: { kind: 'builtin', render: () => null, routeLayout: true },
        }),
        route('alerts-a', 'alerts', 'beta', { parentRouteId: 'node' }),
        route('alerts-b', 'ALERTS/', 'gamma', { parentRouteId: 'node' }),
        route('events', 'events', 'beta', { parentRouteId: 'node' }),
        route('dependent', 'detail', 'beta', { parentRouteId: 'alerts-a' }),
      ],
      navigation: [],
      policy: () => true,
    });
    expect(model.resolve('/clusters/demo/nodes/n1').state).toBe('MATCHED');
    expect(model.resolve('/clusters/demo/nodes/n1/alerts').state).toBe('CONFLICT');
    expect(model.resolve('/clusters/demo/nodes/n1/events')).toMatchObject({
      state: 'MATCHED',
      chain: ['node', 'events'],
      context: { params: { cluster: 'demo', node: 'n1' } },
    });
    expect(model.routes.find((r) => r.contribution.id === 'dependent')).toMatchObject({
      state: 'UNREACHABLE',
      diagnostics: [{ code: 'PARENT_QUARANTINED' }],
    });
  });

  it('quarantines intersecting owners and keeps their addresses from falling through to a wildcard', () => {
    const model = createRouteModel({
      routes: [
        route('a', '/clusters/:id'),
        route('b', '/clusters/current', 'beta'),
        route('fallback', '/*'),
      ],
      navigation: [],
    });
    expect(model.routes.map((r) => [r.contribution.id, r.state])).toEqual([
      ['a', 'QUARANTINED'],
      ['fallback', 'QUARANTINED'],
      ['b', 'QUARANTINED'],
    ]);
    expect(model.resolve('/clusters/current').state).toBe('CONFLICT');
    expect(model.routes.find((r) => r.contribution.id === 'a')?.diagnostics[0]).toMatchObject({
      code: 'ROUTE_CONFLICT',
      witness: '/clusters/current',
    });
  });
});

it.each([
  ['/x/:id', '/X/:renamed/', 'QUARANTINED'],
  ['/:a/b', '/a/:b', 'QUARANTINED'],
  ['/x/*', '/x/:id', 'AVAILABLE'],
  ['/x/:id', '/x/current', 'AVAILABLE'],
  ['/x', '/x/*', 'AVAILABLE'],
  ['/x/:id', '/y/:id', 'AVAILABLE'],
])('governs same-owner %s and %s structurally', (a, b, state) => {
  for (const routes of [
    [route('a', a), route('b', b)],
    [route('b', b), route('a', a)],
  ]) {
    expect(createRouteModel({ routes, navigation: [] }).routes.map((r) => r.state)).toEqual([
      state,
      state,
    ]);
  }
});

it.each([
  '/:id.json',
  '/:id?',
  '/x/*/y',
  '/x//y',
  '/x/../y',
  '/x/./y',
  '/x?y',
  '/x#y',
  '/x/%61',
  '/:123',
  '/:id/:id',
])('isolates unsupported grammar %s', (path) => {
  const model = createRouteModel({
    routes: [route('bad', path), route('good', '/good')],
    navigation: [],
  });
  expect(model.routes.find((r) => r.contribution.id === 'bad')?.state).toBe('QUARANTINED');
  expect(model.resolve('/good').state).toBe('MATCHED');
});

it.each([
  [false, true, 'EXTENSION_POINT_CLOSED'],
  [true, false, 'POLICY_DENIED'],
] as const)(
  'requires both an open extension point (%s) and Host authorization (%s)',
  (acceptsChildren, grant, code) => {
    const model = createRouteModel({
      routes: [
        route('parent', '/p', 'alpha', {
          acceptsChildren,
          target: { kind: 'builtin', render: () => null, routeLayout: true },
        }),
        route('child', 'child', 'beta', { parentRouteId: 'parent' }),
      ],
      navigation: [],
      policy: () => grant,
    });
    expect(model.routes.find((r) => r.contribution.id === 'child')?.diagnostics[0].code).toBe(code);
    expect(model.resolve('/p').state).toBe('MATCHED');
    expect(model.resolve('/p/child').state).toBe('CONFLICT');
  },
);

it('reports missing parents, cycles and their dependents without losing other contributions', () => {
  const model = createRouteModel({
    routes: [
      route('a', 'a', 'alpha', { parentRouteId: 'b' }),
      route('b', 'b', 'alpha', { parentRouteId: 'a' }),
      route('dependent', 'child', 'alpha', { parentRouteId: 'a' }),
      route('missing', 'child', 'alpha', { parentRouteId: 'absent' }),
      route('good', '/good'),
    ],
    navigation: [],
  });
  expect(model.routes.map((r) => [r.contribution.id, r.state, r.diagnostics[0]?.code])).toEqual([
    ['a', 'QUARANTINED', 'PARENT_CYCLE'],
    ['b', 'QUARANTINED', 'PARENT_CYCLE'],
    ['dependent', 'UNREACHABLE', 'PARENT_QUARANTINED'],
    ['good', 'AVAILABLE', undefined],
    ['missing', 'UNREACHABLE', 'PARENT_MISSING'],
  ]);
});

it.each([
  ['/absolute', 'INVALID_PATH'],
  ['', 'INVALID_PATH'],
  ['../x', 'INVALID_PATH'],
  ['./x', 'INVALID_PATH'],
  [':id', 'DUPLICATE_PARAMETER'],
])('rejects invalid child path %s', (path, code) => {
  const model = createRouteModel({
    routes: [
      route('p', '/:id', 'alpha', {
        target: { kind: 'builtin', render: () => null, routeLayout: true },
      }),
      route('c', path, 'alpha', { parentRouteId: 'p' }),
    ],
    navigation: [],
  });
  expect(model.routes.find((r) => r.contribution.id === 'c')?.diagnostics[0].code).toBe(code);
});

it('checks full paths across separately declared parents and propagates conflict to descendants', () => {
  const layout = { kind: 'builtin' as const, routeLayout: true, render: () => null };
  const model = createRouteModel({
    routes: [
      route('p1', '/x', 'alpha', { target: layout }),
      route('c1', ':id/end', 'alpha', { parentRouteId: 'p1', target: layout }),
      route('p2', '/x/:name', 'beta', { target: layout }),
      route('c2', 'end', 'beta', { parentRouteId: 'p2', target: layout }),
      route('descendant', 'child', 'alpha', { parentRouteId: 'c1' }),
    ],
    navigation: [],
  });
  expect(model.routes.find((r) => r.contribution.id === 'p1')?.state).toBe('AVAILABLE');
  expect(model.routes.find((r) => r.contribution.id === 'c1')?.state).toBe('QUARANTINED');
  expect(model.routes.find((r) => r.contribution.id === 'c2')?.state).toBe('QUARANTINED');
  expect(model.resolve('/x/item/end/child').state).toBe('CONFLICT');
});

it('only preserves explicit available Layout ancestors when resolving a conflict', () => {
  const model = createRouteModel({
    routes: [
      route('wide', '/a/*'),
      route('conflict', '/a/x', 'beta'),
      route('unrelated-layout', '/a/:id/details', 'alpha', {
        target: { kind: 'builtin', routeLayout: true, render: () => null },
      }),
    ],
    navigation: [],
  });
  expect(model.resolve('/a/n/details')).toMatchObject({ state: 'CONFLICT', ancestors: [] });
});

it('does not let malformed URL encoding bypass a conflict into a wildcard', () => {
  const model = createRouteModel({
    routes: [route('a', '/x/:id'), route('b', '/x/:other'), route('fallback', '/x/*')],
    navigation: [],
  });
  expect(model.resolve('/x/%').state).toBe('NOT_FOUND');
  expect(model.resolve('/x/value').state).toBe('CONFLICT');
});

it('uses executor-compatible ASCII case folding and treats double leading slashes as a pathname', () => {
  const model = createRouteModel({
    routes: [route('a', '/k'), route('b', '/K'), route('home', '/')],
    navigation: [],
  });
  expect(model.resolve('/%E2%84%AA').state).toBe('NOT_FOUND');
  expect(model.resolve('//k').state).toBe('NOT_FOUND');
  expect(model.resolve('/K').state).toBe('CONFLICT');
});
