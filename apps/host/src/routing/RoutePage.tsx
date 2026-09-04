import { type ComponentType, createContext, useContext } from 'react';
import { useLocation, useParams, useRoutes } from 'react-router';
import type { RouteContext } from '@nexus/plugin-runtime';
import { useHostServices } from '../HostContext';
import { SurfaceMount } from '../SurfaceMount';
import type { ResolvedRoute, RouteModel, UrlResolution } from './route-model';

const ResolutionContext = createContext<UrlResolution>({ state: 'NOT_FOUND' });
function RoutePage({ route }: { readonly route: ResolvedRoute }) {
  const { adapter, failures } = useHostServices();
  const location = useLocation();
  const params = useParams();
  const resolution = useContext(ResolutionContext);
  const target = route.contribution.target;
  // Only a still-available parent Layout can surround a blocked child address.
  if (route.state !== 'AVAILABLE' || (resolution.state === 'CONFLICT' && !resolution.ancestors.includes(route.contribution.id))) {
    return <section role="alert"><h1>Route unavailable</h1>{(resolution.state === 'CONFLICT' ? resolution.diagnostics : route.diagnostics).map((d, i) => <p key={i}>{d.code}</p>)}</section>;
  }
  const bindings = resolution.state === 'CONFLICT' ? resolution.params : params;
  const context: RouteContext = { routeId: route.contribution.id, pathname: location.pathname, search: location.search,
    params: Object.fromEntries(Object.entries(bindings).filter((p): p is [string, string] => p[1] !== undefined && Boolean(route.space?.segments.some(s => s.kind === 'param' && s.name === p[0]) || p[0] === '*' && route.space?.splat))) };
  if (target.kind === 'builtin') {
    const View = target.render as ComponentType<{ routeContext: RouteContext }>;
    return <section data-route-id={context.routeId} data-route-params={JSON.stringify(context.params)}><View routeContext={context} /></section>;
  }
  const mountPointId = `route:${route.contribution.id}`;
  return <section data-route-id={context.routeId} data-route-params={JSON.stringify(context.params)}><SurfaceMount adapter={adapter} pluginId={route.ownerPluginId} target={target} mountPointId={mountPointId}
    label="KubeEye Surface" testId="surface" autoMount routeContext={context} failure={failures[mountPointId]} /></section>;
}

export function RoutedContent({ model }: { readonly model: RouteModel }) {
  const location = useLocation();
  const resolution = model.resolve(location.pathname + location.search);
  // Unavailable entries are diagnostic tombstones, never plugin render targets.
  // They preserve the parent outlet and prevent a wildcard from hiding a conflict.
  const content = useRoutes(model.toRouteObjects(route => <RoutePage route={route} />, true));
  if (resolution.state === 'NOT_FOUND') return <h1>404</h1>;
  if (!content && resolution.state === 'CONFLICT') return <section role="alert"><h1>Route unavailable</h1>{resolution.diagnostics.map((d, i) => <p key={i}>{d.code}</p>)}</section>;
  return <ResolutionContext value={resolution}>{content}</ResolutionContext>;
}
