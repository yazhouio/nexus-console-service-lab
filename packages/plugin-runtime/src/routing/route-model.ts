import { assertUiJson, matchesContext, type ContextSchema } from '../ui/schema';
import { frozenCopy } from '../immutable';
import { admitContribution, comparePointContributions } from '../ui/admission';
import { uiKey, type CompiledExtensionPointDefinition, type ExtensionPointRef } from '../ui/definitions';
import { matchRoutes, type RouteObject } from 'react-router';
import type {
  ContributionDiagnostic, ContributionIdentity, ContributionState, HostContributionFact,
  NavigationContribution, OwnedContribution, RouteContext, RouteContribution,
} from '../index';
import { makePath, parsePath, relationship, type PathSpace } from './path-space';

export type { HostContributionPolicyRequest as ContributionPolicyRequest, HostContributionPolicy } from '../index';
import type { HostContributionPolicy } from '../index';
export interface ResolvedRoute extends OwnedContribution<RouteContribution> {
  state: ContributionState;
  diagnostics: ContributionDiagnostic[];
  space?: PathSpace;
  ancestry: string[];
  ownParams: string[];
}
export interface ResolvedNavigation extends OwnedContribution<NavigationContribution> {
  state: ContributionState;
  diagnostics: ContributionDiagnostic[];
  children: ResolvedNavigation[];
}
export type UrlResolution =
  | Readonly<{ state: 'MATCHED'; routeId: string; chain: readonly string[]; context: RouteContext }>
  | Readonly<{ state: 'NOT_FOUND' }>
  | Readonly<{ state: 'CONFLICT'; ancestors: readonly string[]; params: Readonly<Record<string, string>>; diagnostics: readonly ContributionDiagnostic[] }>;
export type NavigationDestination =
  | Readonly<{ state: 'GROUP' }>
  | Readonly<{ state: 'LINK'; href: string }>
  | Readonly<{ state: 'DISABLED'; diagnostic: ContributionDiagnostic }>;

const identity = (item: OwnedContribution<{ id: string }>, kind: ContributionIdentity['kind']): ContributionIdentity => ({ ownerPluginId: item.ownerPluginId, kind, contributionId: item.contribution.id });
const stable = <T extends OwnedContribution<{ id: string }>>(a: T, b: T) => a.ownerPluginId.localeCompare(b.ownerPluginId) || a.contribution.id.localeCompare(b.contribution.id);

export function createRouteModel(input: {
  readonly points?: readonly OwnedContribution<CompiledExtensionPointDefinition>[];
  readonly rootRoutePoint?: ExtensionPointRef;
  readonly navigationRootPoints?: readonly ExtensionPointRef[];
  readonly routes: readonly OwnedContribution<RouteContribution>[];
  readonly navigation: readonly OwnedContribution<NavigationContribution>[];
  readonly policy?: HostContributionPolicy;
}) {
  input = frozenCopy(input);
  const points = new Map((input.points ?? []).map(p => [uiKey(p.ownerPluginId, p.contribution.id), p.contribution]));
  function admission(item: OwnedContribution<RouteContribution | NavigationContribution>, kind: 'route' | 'navigation', expected?: ExtensionPointRef, expectedOwner?: string): ContributionDiagnostic | undefined {
    const ref = item.contribution.point;
    if (!expected || !ref) return { code: 'POINT_MISSING' };
    if (expectedOwner !== undefined && expected.ownerPluginId !== expectedOwner) return { code: 'POINT_TARGET_MISMATCH' };
    const point = points.get(uiKey(expected.ownerPluginId, expected.id));
    if (!point || point.contractMajor !== expected.contractMajor) return { code: 'POINT_MISSING' };
    if (ref.ownerPluginId !== expected.ownerPluginId || ref.id !== expected.id) return { code: 'POINT_TARGET_MISMATCH' };
    const result = admitContribution(item.ownerPluginId, { ...item.contribution, point: ref, kind }, point, input.policy ?? (() => false));
    return result.reason ? { code: result.reason as ContributionDiagnostic['code'] } : undefined;
  }
  const routes: ResolvedRoute[] = [...input.routes].sort(stable).map(item => ({ ...item, state: 'AVAILABLE', diagnostics: [], ancestry: [], ownParams: [] }));
  const byId = new Map(routes.map(item => [item.contribution.id, item]));
  const done = new Set<string>();
  const visiting: string[] = [];
  const fail = (item: ResolvedRoute, state: ContributionState, diagnostic: ContributionDiagnostic) => {
    item.state = state; item.diagnostics = [diagnostic];
  };
  function inheritFailure(route: ResolvedRoute, parent: ResolvedRoute) {
    fail(route, 'UNREACHABLE', { code: parent.state === 'QUARANTINED' ? 'PARENT_QUARANTINED' : 'PARENT_UNREACHABLE', related: [identity(parent, 'route')], cause: parent.diagnostics[0] });
  }
  function compile(route: ResolvedRoute): void {
    const { id, path, parentRouteId } = route.contribution;
    if (done.has(id)) return;
    const cycleAt = visiting.indexOf(id);
    if (cycleAt !== -1) {
      const cycle = visiting.slice(cycleAt).map(id => byId.get(id)!);
      for (const member of cycle) {
        fail(member, 'QUARANTINED', { code: 'PARENT_CYCLE', related: cycle.map(r => identity(r, 'route')) });
        done.add(member.contribution.id);
      }
      return;
    }
    visiting.push(id);
    const parent = parentRouteId === undefined ? undefined : byId.get(parentRouteId);
    if (parent) compile(parent);
    if (!done.has(id)) {
      const local = parsePath(path, parentRouteId !== undefined);
      route.ancestry = [...(parent?.ancestry ?? []), id];
      route.ownParams = local?.segments.flatMap(s => s.kind === 'param' ? [s.name] : []) ?? [];
      if (local && (parentRouteId === undefined || parent?.space)) {
        route.space = makePath([...(parent?.space?.segments ?? []), ...local.segments], local.splat);
      }
      if (parentRouteId !== undefined && !parent) fail(route, 'UNREACHABLE', { code: 'PARENT_MISSING' });
      else if (parent && parent.state !== 'AVAILABLE') inheritFailure(route, parent);
      else if (!local) fail(route, 'QUARANTINED', { code: 'INVALID_PATH' });
      else if (parent?.space?.splat) fail(route, 'QUARANTINED', { code: 'PARENT_WILDCARD', related: [identity(parent, 'route')] });
      else if (parent && (parent.contribution.target.kind !== 'builtin' || !parent.contribution.target.routeLayout)) fail(route, 'QUARANTINED', { code: 'PARENT_NOT_LAYOUT', related: [identity(parent, 'route')] });
      else if (parent && parent.ownerPluginId !== route.ownerPluginId && !parent.contribution.childPoint) fail(route, 'QUARANTINED', { code: 'EXTENSION_POINT_CLOSED', related: [identity(parent, 'route')] });
      else {
        const params = route.space!.segments.flatMap(s => s.kind === 'param' ? [s.name] : []);
        if (new Set(params).size !== params.length) fail(route, 'QUARANTINED', { code: 'DUPLICATE_PARAMETER' });
        else {
          const denied = admission(route, 'route', parent ? parent.contribution.childPoint : input.rootRoutePoint, parent?.ownerPluginId);
          if (denied) fail(route, 'QUARANTINED', denied);
        }
      }
      done.add(id);
    }
    visiting.pop();
  }
  routes.forEach(compile);
  const candidates = routes.filter(r => r.state === 'AVAILABLE');
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j];
    if (a.ancestry.includes(b.contribution.id) || b.ancestry.includes(a.contribution.id)) continue;
    const relation = relationship(a.space!, b.space!);
    if (relation.kind === 'DISJOINT') continue;
    if (a.ownerPluginId === b.ownerPluginId && ['CONTAINS', 'WITHIN'].includes(relation.kind)) continue;
    for (const [route, other] of [[a, b], [b, a]]) {
      route.state = 'QUARANTINED';
      route.diagnostics.push({ code: 'ROUTE_CONFLICT', related: [identity(other, 'route')], witness: relation.witness });
    }
  }
  // Propagate ancestor failure after the complete, order-independent conflict pass.
  for (const route of [...routes].sort((a, b) => a.ancestry.length - b.ancestry.length)) {
    const parent = byId.get(route.contribution.parentRouteId ?? '');
    if (parent && parent.state !== 'AVAILABLE' && !route.diagnostics.some(d => d.code === 'PARENT_CYCLE')) inheritFailure(route, parent);
  }
  function toRouteObjects(render?: (route: ResolvedRoute) => RouteObject['element'], includeUnavailable = false): RouteObject[] {
    const eligible = routes.filter(r => r.space && (includeUnavailable || r.state === 'AVAILABLE'));
    const parameterNames = new Set(routes.flatMap(r => r.space?.segments.flatMap(s => s.kind === 'param' ? [s.name] : []) ?? []));
    let placeholderIndex = 0;
    const projectedPath = (route: ResolvedRoute) => {
      const child = route.contribution.parentRouteId !== undefined;
      const local = child ? parsePath(route.contribution.path, true)! : route.space!;
      // A quarantined duplicate parameter must not overwrite a valid Layout's
      // bindings in RR's merged params object. Placeholders only render diagnostics.
      const segments = route.state === 'AVAILABLE' ? local.segments : local.segments.map(segment => {
        if (segment.kind === 'literal') return segment;
        let name: string;
        do { name = `__nexus_unavailable_${placeholderIndex++}`; } while (parameterNames.has(name));
        parameterNames.add(name);
        return { kind: 'param' as const, name };
      });
      const path = makePath(segments, local.splat).path;
      return child ? path.slice(1) : path;
    };
    const project = (parentId?: string): RouteObject[] => eligible.filter(r => r.contribution.parentRouteId === parentId).map(r => ({
      id: r.contribution.id,
      path: projectedPath(r),
      caseSensitive: false, element: render?.(r), children: project(r.contribution.id),
    }));
    return project();
  }
  function resolve(url: string): UrlResolution {
    const location = new URL(url.startsWith('/') ? `http://host.invalid${url}` : url, 'http://host.invalid');
    try { location.pathname.split('/').forEach(segment => decodeURIComponent(segment)); }
    catch { return { state: 'NOT_FOUND' }; }
    const blocked = routes.filter(r => r.state !== 'AVAILABLE' && r.space && matchRoutes([{ path: r.space.path, caseSensitive: false }], location.pathname));
    if (blocked.length) {
      const ancestors = blocked[0].ancestry.slice(0, -1).filter(id => {
        const parent = byId.get(id)!;
        return parent.state === 'AVAILABLE' && !parent.space?.splat && parent.contribution.target.kind === 'builtin' && parent.contribution.target.routeLayout && blocked.every(r => r.ancestry.slice(0, -1).includes(id));
      });
      const parent = byId.get(ancestors.at(-1) ?? '');
      const matchedParent = parent ? matchRoutes([{ path: parent.space!.path.replace(/\/$/, '') + '/*' }], location.pathname)?.[0] : undefined;
      const params = Object.fromEntries(Object.entries(matchedParent?.params ?? {}).filter((p): p is [string, string] => p[0] !== '*' && p[1] !== undefined));
      return { state: 'CONFLICT', ancestors, params, diagnostics: blocked.flatMap(r => r.diagnostics) };
    }
    const matches = matchRoutes(toRouteObjects(), location.pathname);
    const leaf = matches?.at(-1);
    if (!leaf) return { state: 'NOT_FOUND' };
    const params = Object.fromEntries(Object.entries(leaf.params).filter((p): p is [string, string] => p[1] !== undefined));
    return { state: 'MATCHED', routeId: leaf.route.id!, chain: matches!.map(m => m.route.id!), context: { routeId: leaf.route.id!, pathname: location.pathname, search: location.search, params } };
  }
  const items: ResolvedNavigation[] = [...input.navigation].sort(stable).map(item => ({ ...item, state: 'AVAILABLE', diagnostics: [], children: [] }));
  const navigationById = new Map(items.map(item => [item.contribution.id, item]));
  const navDone = new Set<string>();
  const navStack: string[] = [];
  const navFail = (item: ResolvedNavigation, state: ContributionState, diagnostic: ContributionDiagnostic) => { item.state = state; item.diagnostics = [diagnostic]; };
  function compileNavigation(item: ResolvedNavigation): void {
    const { id, parentId } = item.contribution;
    if (navDone.has(id)) return;
    const cycleAt = navStack.indexOf(id);
    if (cycleAt !== -1) {
      const cycle = navStack.slice(cycleAt).map(id => navigationById.get(id)!);
      for (const member of cycle) { navFail(member, 'QUARANTINED', { code: 'PARENT_CYCLE', related: cycle.map(n => identity(n, 'navigation')) }); navDone.add(member.contribution.id); }
      return;
    }
    navStack.push(id);
    const parent = navigationById.get(parentId ?? '');
    if (parent) compileNavigation(parent);
    if (!navDone.has(id)) {
      if (parentId !== undefined && !parent) navFail(item, 'UNREACHABLE', { code: 'PARENT_MISSING' });
      else if (parent && parent.state !== 'AVAILABLE') navFail(item, 'UNREACHABLE', { code: parent.state === 'QUARANTINED' ? 'PARENT_QUARANTINED' : 'PARENT_UNREACHABLE', related: [identity(parent, 'navigation')], cause: parent.diagnostics[0] });
      else if (parent && parent.ownerPluginId !== item.ownerPluginId && !parent.contribution.childPoint) navFail(item, 'QUARANTINED', { code: 'EXTENSION_POINT_CLOSED', related: [identity(parent, 'navigation')] });
      else {
        const rootPoint = input.navigationRootPoints?.find(p => p.ownerPluginId === item.contribution.point?.ownerPluginId && p.id === item.contribution.point?.id);
        const denied = admission(item, 'navigation', parent ? parent.contribution.childPoint : rootPoint, parent?.ownerPluginId);
        if (denied) navFail(item, 'QUARANTINED', denied);
      }
      navDone.add(id);
    }
    navStack.pop();
  }
  items.forEach(compileNavigation);
  // Cyclic/unreachable records remain inspectable but never enter the recursive menu tree.
  const navigation = items.filter(item => item.state === 'AVAILABLE' && !item.contribution.parentId);
  for (const item of items) if (item.state === 'AVAILABLE' && item.contribution.parentId) navigationById.get(item.contribution.parentId)!.children.push(item);

  const sortSiblings = (siblings: ResolvedNavigation[]) => siblings.sort((a, b) => {
    const point = a.contribution.point;
    return comparePointContributions(point ? points.get(uiKey(point.ownerPluginId, point.id)) : undefined, a, b);
  });
  sortSiblings(navigation);
  for (const item of items) sortSiblings(item.children);

  function destination(id: string, url: string): NavigationDestination {
    const item = navigationById.get(id);
    if (!item) return { state: 'DISABLED', diagnostic: { code: 'TARGET_MISSING' } };
    if (item.state !== 'AVAILABLE') return { state: 'DISABLED', diagnostic: item.diagnostics[0] };
    const targetId = item.contribution.routeId;
    if (targetId === undefined) return { state: 'GROUP' };
    const target = byId.get(targetId);
    if (!target) return { state: 'DISABLED', diagnostic: { code: 'TARGET_MISSING' } };
    if (target.state !== 'AVAILABLE') return { state: 'DISABLED', diagnostic: { code: 'TARGET_UNAVAILABLE', related: [identity(target, 'route')], cause: target.diagnostics[0] } };
    const current = resolve(url);
    const params: Record<string, string> = Object.create(null);
    if (current.state !== 'NOT_FOUND') {
      const chain = current.state === 'MATCHED' ? current.chain : current.ancestors;
      const bindings = current.state === 'MATCHED' ? current.context.params : current.params;
      for (const [index, ancestorId] of target.ancestry.entries()) {
        if (chain[index] !== ancestorId) break;
        for (const name of byId.get(ancestorId)!.ownParams) if (Object.hasOwn(bindings, name)) params[name] = bindings[name];
      }
    }
    const missing = target.space!.segments.flatMap(s => s.kind === 'param' && !Object.hasOwn(params, s.name) ? [s.name] : []);
    if (missing.length) return { state: 'DISABLED', diagnostic: { code: 'TARGET_PARAMS_MISSING', missingParams: missing } };
    const href = '/' + target.space!.segments.map(s => s.kind === 'literal' ? s.value : encodeURIComponent(params[s.name])).join('/');
    const resolved = resolve(href);
    if (resolved.state !== 'MATCHED' || !resolved.chain.includes(targetId)) return { state: 'DISABLED', diagnostic: { code: 'TARGET_SHADOWED' } };
    return { state: 'LINK', href };
  }
  function paramsSchema(routeId: string): ContextSchema {
    const route = byId.get(routeId);
    if (!route?.space) throw Error('ROUTE_UNAVAILABLE');
    const names = route.space.segments.flatMap(s => s.kind === 'param' ? [s.name] : []);
    return frozenCopy({ type: 'object', properties: Object.fromEntries([...names.map(name => [name, { type: 'string', minLength: 1, maxLength: 1024 }]), ...(route.space.splat ? [['*', { type: 'string', maxLength: 2048 }]] : [])]), required: names, additionalProperties: false });
  }
  function pathFor(routeId: string, params: Readonly<Record<string, string>>): string {
    const route = byId.get(routeId);
    if (!route?.space || route.state !== 'AVAILABLE') throw Error('ROUTE_UNAVAILABLE');
    assertUiJson(params);
    if (!matchesContext(paramsSchema(routeId), params)) throw Error('ROUTE_PARAMS_INVALID');
    const path = '/' + [...route.space.segments.map(s => s.kind === 'literal' ? s.value : encodeURIComponent(params[s.name])), ...(route.space.splat && params['*'] ? params['*'].split('/').map(encodeURIComponent) : [])].join('/');
    const resolved = resolve(path);
    if (resolved.state !== 'MATCHED' || !resolved.chain.includes(routeId) || Object.entries(params).some(([name, value]) => resolved.context.params[name] !== value)) throw Error('ROUTE_TARGET_UNREACHABLE');
    return path;
  }
  function listHostContributions(url?: string): readonly HostContributionFact[] {
    return [
      ...routes.map(r => ({ ...identity(r, 'route'), state: r.state, declaredPath: r.contribution.path, fullPath: r.space?.path, parentId: r.contribution.parentRouteId, diagnostics: r.diagnostics })),
      ...items.map(item => {
        const dest = url === undefined ? undefined : destination(item.contribution.id, url);
        return { ...identity(item, 'navigation'), state: item.state, parentId: item.contribution.parentId, diagnostics: item.diagnostics,
          ...(item.state === 'AVAILABLE' && dest?.state === 'DISABLED' ? { navigationDiagnostic: dest.diagnostic } : {}) };
      }),
    ];
  }
  for (const route of routes) { Object.assign(route, frozenCopy(route)); Object.freeze(route); }
  for (const item of items) { Object.assign(item, frozenCopy(item)); Object.freeze(item); }
  return Object.freeze({ routes: Object.freeze(routes), navigation: Object.freeze(navigation), toRouteObjects, resolve, destination, paramsSchema, pathFor, listHostContributions });
}
export type RouteModel = ReturnType<typeof createRouteModel>;
