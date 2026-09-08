import { clusterDescriptor, clusterRoutes, clusterNavigation, clusterExtensions } from './cluster-data';
import { useState, useSyncExternalStore } from 'react';
import { ActionMenu, Tabs, useSurfaceContext, RouteOutlet, RouteLink, useRouteContext, useCapabilitySubscription } from '@nexus/plugin-runtime/react';
import type { PluginDefinition, PublicNavigation, RoutesSnapshot } from '@nexus/plugin-runtime';

import { CLUSTER_EXTENSION_POINTS, NODE_ACTIONS_POINT, NODE_TABS_POINT, type ClusterCapability } from '@nexus/cluster-api';

function NodeLayout() {
  const routeContext = useRouteContext();
  const [expanded, setExpanded] = useState(false);
  const { value } = useCapabilitySubscription<RoutesSnapshot>('routes.query@1', 'watch');
  const find = (items: readonly PublicNavigation[]): PublicNavigation | undefined => items.find(item => item.id === 'node-navigation') ?? items.flatMap(item => item.children).find(item => item.id === 'node-navigation');
  const container = find(value?.navigation ?? []);
  return <section className="nexus-page">
    <div className="nexus-page-heading"><div><span className="nexus-kicker">CLUSTER / NODE</span><h1>Node {routeContext.params.node}</h1><p>Resource details and plugin-provided operational views.</p></div><span className="nexus-status-chip nexus-status-chip--success"><span className="nexus-health-dot" />Connected</span></div>
    <div className="nexus-toolbar"><button className="nexus-button nexus-button--secondary" onClick={() => setExpanded(value => !value)}>Toggle node details</button>{expanded && <p className="nexus-inline-note" data-testid="node-details">Cluster: {routeContext.params.cluster}</p>}</div>
    {container && <nav className="nexus-subnav" aria-label="Node tabs"><ul>{container.children.map(item => <li key={item.id}>
      {item.state === 'LINK' && item.routeId ? <RouteLink routeId={item.routeId} params={item.params ?? {}}>{item.label}</RouteLink> : <span aria-disabled={item.state === 'DISABLED'}>{item.label}</span>}
    </li>)}</ul></nav>}
    <section className="nexus-content-card"><div className="nexus-section-heading"><div><span className="nexus-kicker">ACTIONS</span><h2>Node actions</h2></div></div><ActionMenu point={NODE_ACTIONS_POINT} context={{ itemRef: { clusterId: routeContext.params.cluster, apiVersion: 'v1', kind: 'Node', name: routeContext.params.node } }} /></section>
    <section className="nexus-content-card"><div className="nexus-section-heading"><div><span className="nexus-kicker">EXTENSIONS</span><h2>Node views</h2></div><span className="nexus-muted">Host-managed tabs</span></div><Tabs id={NODE_TABS_POINT.id} label="Node extensions" contextKey={`${routeContext.params.cluster}/${routeContext.params.node}`} context={{ itemRef: { clusterId: routeContext.params.cluster, apiVersion: 'v1', kind: 'Node', name: routeContext.params.node } }} /></section>
    <RouteOutlet />
  </section>;
}
function NodeSummary() { const context = useSurfaceContext(); return <pre className="nexus-code-block" aria-label="Resource summary">{JSON.stringify(context?.value)}</pre>; }
function NodeEvents() { return <section className="nexus-content-card"><span className="nexus-kicker">CLUSTER EVENTS</span><h2>Node events</h2><p className="nexus-muted">No new events in the demo cluster.</p></section>; }

export const cluster: PluginDefinition = {
  ...clusterDescriptor,
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
      return <section className="nexus-page"><div className="nexus-page-heading"><div><span className="nexus-kicker">CLUSTER MANAGEMENT</span><h1>Cluster Overview</h1><p>Manage the active Kubernetes cluster exposed by the host capability.</p></div><span className="nexus-status-chip nexus-status-chip--success"><span className="nexus-health-dot" />Healthy</span></div><section className="nexus-cluster-hero"><div className="nexus-cluster-hero__icon">⌘</div><div><span className="nexus-kicker">CURRENT CLUSTER</span><strong>{selected}</strong><p>Connected through <code>kubesphere.cluster@2</code></p></div><button className="nexus-button nexus-button--primary" onClick={() => api.setCurrentCluster(selected === 'demo-cluster' ? 'second-cluster' : 'demo-cluster')}>Switch Host cluster</button></section>
      </section>;
    }
    for (const point of CLUSTER_EXTENSION_POINTS) contributions.registerExtensionPoint(point);
    contributions.registerSurface({ id: 'node-summary', target: { kind: 'builtin', render: NodeSummary } });
    contributions.registerExtension(clusterExtensions['node-summary']);
    contributions.registerRoute({ ...clusterRoutes['cluster-overview-route'], target: { kind: 'builtin', render: ClusterOverview } });
    contributions.registerNavigation(clusterNavigation['cluster-overview-navigation']);
    contributions.registerRoute({ ...clusterRoutes['node-detail'], target: { kind: 'builtin', render: NodeLayout, routeLayout: true } });
    contributions.registerRoute({ ...clusterRoutes['node-events'], target: { kind: 'builtin', render: NodeEvents } });
    contributions.registerNavigation(clusterNavigation['node-navigation']);
    contributions.registerNavigation(clusterNavigation['node-events-navigation']);
    contributions.registerSurface({ id: 'cluster-overview-card', target: { kind: 'builtin', render: ClusterOverview } });
    contributions.registerExtension(clusterExtensions['cluster-overview-card']);
  },
};
