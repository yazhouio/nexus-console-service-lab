import { expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import type { OwnedContribution, RouteContribution } from '../src/index';
import { createRouteModel } from './route-fixture';

function route(id: string, path: string, metadata: Partial<RouteContribution> = {}): OwnedContribution<RouteContribution> {
  return { ownerPluginId: 'owner', contribution: { id, path, target: { kind: 'builtin', render: () => null }, ...metadata } };
}

it('executes an accepted specialization chain with the pinned real matcher', () => {
  const declarations = [route('wide', '/clusters/*'), route('detail', '/clusters/:id'), route('current', '/clusters/current')];
  for (const routes of [declarations, [...declarations].reverse()]) {
    const model = createRouteModel({ routes, navigation: [] });
    expect(model.routes.every(r => r.state === 'AVAILABLE')).toBe(true);
    for (const [url, id, params] of [
      ['/clusters', 'wide', { '*': '' }], ['/CLUSTERS/', 'wide', { '*': '' }],
      ['/clusters/current', 'current', {}], ['/CLUSTERS/%63urrent///?q=x#hash', 'current', {}],
      ['/clusters/demo', 'detail', { id: 'demo' }], ['/clusters/caf%C3%A9', 'detail', { id: 'café' }],
      ['/clusters/a%2Fb', 'detail', { id: 'a/b' }], ['/clusters/a%252Fb', 'detail', { id: 'a/b' }],
      ['/clusters/deep/path', 'wide', { '*': 'deep/path' }],
    ] as const) {
      const matches = matchRoutes(model.toRouteObjects(), url);
      expect(matches?.map(m => m.route.id), url).toEqual([id]);
      expect(matches?.at(-1)?.params, url).toEqual(params);
      expect(model.resolve(url)).toMatchObject({ state: 'MATCHED', routeId: id, context: { params } });
    }
  }
});

it('preserves nested match chains and inherited parameters for encoded and case variants', () => {
  const model = createRouteModel({ routes: [
    route('node', '/clusters/:cluster/nodes/:node', { acceptsChildren: true, target: { kind: 'builtin', routeLayout: true, render: () => null } }),
    { ...route('alerts', 'alerts/:alert', { parentRouteId: 'node' }), ownerPluginId: 'extension' },
  ], navigation: [], policy: () => true });
  const matches = matchRoutes(model.toRouteObjects(), '/CLUSTERS/demo/nodes/n%2F1/ALERTS/a%20b/?severity=high');
  expect(matches?.map(m => m.route.id)).toEqual(['node', 'alerts']);
  expect(matches?.at(-1)?.params).toEqual({ cluster: 'demo', node: 'n/1', alert: 'a b' });
});

// Constructed families prove the expected relation by construction; generated URLs only
// check the executor, never decide whether overlapping ownership is legal.
it('generated owner, parameter-renaming and registration-order properties stay compatible', () => {
  for (let i = 0; i < 40; i++) {
    const prefix = `/region-${i}`;
    const narrow = route('narrow', `${prefix}/current`);
    const wide = route('wide', `${prefix}/:parameter_${i}`);
    const declarations = i % 2 ? [wide, narrow] : [narrow, wide];
    const accepted = createRouteModel({ routes: declarations, navigation: [] });
    expect(accepted.routes.map(r => r.state)).toEqual(['AVAILABLE', 'AVAILABLE']);
    const url = i % 2 ? `${prefix.toUpperCase()}/CURRENT/` : `${prefix}/current`;
    expect(matchRoutes(accepted.toRouteObjects(), url)?.at(-1)?.route.id).toBe('narrow');
    const conflictingOwner = createRouteModel({ routes: declarations.map(r => r.contribution.id === 'narrow' ? { ...r, ownerPluginId: 'other' } : r), navigation: [] });
    expect(conflictingOwner.routes.map(r => r.state)).toEqual(['QUARANTINED', 'QUARANTINED']);
    const renamed = createRouteModel({ routes: [wide, route('renamed', `${prefix}/:other_${i}`)], navigation: [] });
    expect(renamed.routes.map(r => r.state)).toEqual(['QUARANTINED', 'QUARANTINED']);
    const crossing = createRouteModel({ routes: [route('a', `${prefix}/:a/end`), route('b', `${prefix}/start/:b`)], navigation: [] });
    expect(crossing.routes.map(r => r.state)).toEqual(['QUARANTINED', 'QUARANTINED']);
  }
});

it('rejects the prototype-setting parameter name that the executor cannot bind', () => {
  const model = createRouteModel({ routes: [route('bad', '/:__proto__')], navigation: [] });
  expect(model.routes[0].state).toBe('QUARANTINED');
});

it.each([
  ['/x/value', 'CONFLICT'], ['/X/%61///', 'CONFLICT'],
  ['/x/a%2Fb', 'CONFLICT'], ['/x/a%252Fb', 'CONFLICT'],
  ['/x/%', 'NOT_FOUND'], ['//x/value', 'NOT_FOUND'],
  ['/x//value', 'NOT_FOUND'], ['/x/value/extra', 'NOT_FOUND'],
  ['/safe', 'MATCHED'],
])('keeps quarantined URL membership consistent for %s', (url, state) => {
  const model = createRouteModel({ routes: [route('a', '/x/:id'), route('b', '/x/:other'), route('safe', '/safe')], navigation: [] });
  expect(model.resolve(url).state).toBe(state);
});

it('diagnostic placeholders cannot overwrite an available Layout parameter', () => {
  const model = createRouteModel({ routes: [
    route('parent', '/p/:id', { target: { kind: 'builtin', routeLayout: true, render: () => null } }),
    route('invalid', ':id', { parentRouteId: 'parent' }),
  ], navigation: [] });
  expect(model.routes.find(r => r.contribution.id === 'invalid')?.state).toBe('QUARANTINED');
  const matches = matchRoutes(model.toRouteObjects(() => null, true), '/p/parent-value/child-value');
  expect(matches?.find(m => m.route.id === 'parent')?.params.id).toBe('parent-value');
});
