import { useState, useSyncExternalStore } from 'react';
import { ActionMenu, Tabs, useSurfaceContext, RouteOutlet, RouteLink, useRouteContext, useCapabilitySubscription } from '@nexus/plugin-runtime/react';
import type { PluginDefinition, PublicNavigation, RoutesSnapshot } from '@nexus/plugin-runtime';
import { CONSOLE_CORE_CAPABILITY, consoleRoute, primaryNavigation, homeCard } from '@nexus/console-core-api';
import { NODE_CHILD_ROUTES_POINT, NODE_NAVIGATION_POINT, NODE_ACTIONS_POINT, NODE_TABS_POINT, RESOURCE_REF_CONTRACT, type ClusterCapability } from '@nexus/cluster-api';

function NodeLayout() {
  const routeContext = useRouteContext();
  const [expanded, setExpanded] = useState(false);
  const { value } = useCapabilitySubscription<RoutesSnapshot>('routes.query@1', 'watch');
  const find = (items: readonly PublicNavigation[]): PublicNavigation | undefined => items.find(item => item.id === 'node-navigation') ?? items.flatMap(item => item.children).find(item => item.id === 'node-navigation');
  const container = find(value?.navigation ?? []);
  return <section>
    <h1>Node {routeContext.params.node}</h1>
    <button onClick={() => setExpanded(value => !value)}>Toggle node details</button>
    {expanded && <p data-testid="node-details">Cluster: {routeContext.params.cluster}</p>}
    {container && <nav aria-label="Node tabs"><ul>{container.children.map(item => <li key={item.id}>
      {item.state === 'LINK' && item.routeId ? <RouteLink routeId={item.routeId} params={item.params ?? {}}>{item.label}</RouteLink> : <span aria-disabled={item.state === 'DISABLED'}>{item.label}</span>}
    </li>)}</ul></nav>}
    <ActionMenu point={NODE_ACTIONS_POINT} context={{ itemRef: { clusterId: routeContext.params.cluster, apiVersion: 'v1', kind: 'Node', name: routeContext.params.node } }} />
    <Tabs id={NODE_TABS_POINT.id} label="Node extensions" contextKey={`${routeContext.params.cluster}/${routeContext.params.node}`} context={{ itemRef: { clusterId: routeContext.params.cluster, apiVersion: 'v1', kind: 'Node', name: routeContext.params.node } }} />
    <RouteOutlet />
  </section>;
}
function NodeSummary() { const context = useSurfaceContext(); return <pre aria-label="Resource summary">{JSON.stringify(context?.value)}</pre>; }
function NodeEvents() { return <h2>Node events</h2>; }

export const cluster: PluginDefinition = {
  id: 'cluster', version: '1.0.0', roles: ['provider','feature'], provenance: 'first-party', requires: [CONSOLE_CORE_CAPABILITY,'routes.query@1','routes.navigate@1'], provides: ['kubesphere.cluster@2'],
  activate({ contributions, capabilities }) {
    let current = 'demo-cluster';
    const listeners = new Set<(name: string) => void>();
    const api: ClusterCapability = {
      getCurrentCluster: () => current,
      setCurrentCluster(name) { current = name; for (const listener of listeners) listener(name); },
      watchCurrentCluster(emit) { listeners.add(emit); return { snapshot: current, dispose() { listeners.delete(emit); } }; },
    };
    capabilities.register('kubesphere.cluster@2', api);
    function ClusterOverview() {
      const selected = useSyncExternalStore(emit => api.watchCurrentCluster(emit).dispose, api.getCurrentCluster);
      return <section><h1>Cluster Overview</h1>Current cluster: {selected}
        <button onClick={() => api.setCurrentCluster(selected === 'demo-cluster' ? 'second-cluster' : 'demo-cluster')}>Switch Host cluster</button>
      </section>;
    }
    contributions.registerExtensionPoint({ id: NODE_CHILD_ROUTES_POINT.id, kind: 'route', contractMajor: 1, profile: 'console-core.routes@1' });
    contributions.registerExtensionPoint({ id: NODE_NAVIGATION_POINT.id, kind: 'navigation', contractMajor: 1, profile: 'console-core.navigation@1' });
    contributions.registerExtensionPoint({ id: NODE_ACTIONS_POINT.id, kind: 'action', contractMajor: 1, profile: 'detail.actions@1', bindings: { itemRefContract: RESOURCE_REF_CONTRACT.id } });
    contributions.registerExtensionPoint({ id: NODE_TABS_POINT.id, kind: 'tab', contractMajor: 1, profile: 'detail.tabs@1', bindings: { itemRefContract: RESOURCE_REF_CONTRACT.id } });
    contributions.registerSurface({ id: 'node-summary', target: { kind: 'builtin', render: NodeSummary } });
    contributions.registerExtension({ id: 'node-summary', kind: 'tab', tabId: 'summary', label: 'Resource summary', surfaceId: 'node-summary', point: NODE_TABS_POINT });
    contributions.registerRoute(consoleRoute({ id: 'cluster-overview-route', path: '/clusters/current', target: { kind: 'builtin', render: ClusterOverview } }));
    contributions.registerNavigation(primaryNavigation({ id: 'cluster-overview-navigation', label: 'Cluster Overview', routeId: 'cluster-overview-route', order: 100 }));
    contributions.registerRoute(consoleRoute({ id: 'node-detail', path: '/clusters/:cluster/nodes/:node', childPoint: NODE_CHILD_ROUTES_POINT, target: { kind: 'builtin', render: NodeLayout, routeLayout: true } }));
    contributions.registerRoute({ id: 'node-events', parentRouteId: 'node-detail', point: NODE_CHILD_ROUTES_POINT, path: 'events', target: { kind: 'builtin', render: NodeEvents } });
    contributions.registerNavigation(primaryNavigation({ id: 'node-navigation', label: 'Node', routeId: 'node-detail', childPoint: NODE_NAVIGATION_POINT, order: 150 }));
    contributions.registerNavigation({ id: 'node-events-navigation', label: 'Events', parentId: 'node-navigation', routeId: 'node-events', point: NODE_NAVIGATION_POINT });
    contributions.registerSurface({ id: 'cluster-overview-card', target: { kind: 'builtin', render: ClusterOverview } });
    contributions.registerExtension(homeCard({ id: 'cluster-overview-card', surfaceId: 'cluster-overview-card', label: 'Cluster Card', order: 100 }));
  },
};
