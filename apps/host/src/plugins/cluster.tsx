import { useState } from 'react';
import { Outlet } from 'react-router';
import type { RouteContext } from '@nexus/plugin-runtime';
import { useHostServices } from '../HostContext';
import { Navigation } from '../routing/Navigation';
import type { PluginDefinition } from '@nexus/plugin-runtime';

import type { ConsoleShellCapability } from './console-shell';

export interface ClusterCapability {
  getCurrentCluster(): string;
  setCurrentCluster(name: string): void;
  watchCurrentCluster(emit: (name: string) => void): { snapshot: string; dispose(): void };
}

function ClusterOverview() {
  return <section><h1>Cluster Overview</h1>Current cluster: demo-cluster</section>;
}

function NodeLayout({ routeContext }: { readonly routeContext: RouteContext }) {
  const [expanded, setExpanded] = useState(false);
  const { model } = useHostServices();
  const container = model?.navigation.find(item => item.contribution.id === 'node-navigation');
  return <section>
    <h1>Node {routeContext.params.node}</h1>
    <button onClick={() => setExpanded(value => !value)}>Toggle node details</button>
    {expanded && <p data-testid="node-details">Cluster: {routeContext.params.cluster}</p>}
    {model && container && <nav aria-label="Node tabs"><Navigation model={model} items={container.children} /></nav>}
    <Outlet />
  </section>;
}
function NodeEvents() { return <h2>Node events</h2>; }

export const cluster: PluginDefinition = {
  id: 'cluster',
  version: '1.0.0',
  requires: ['kubesphere.console-shell@1'],
  provides: ['kubesphere.cluster@2'],
  activate(context) {
    context.capabilities.require<ConsoleShellCapability>(
      'kubesphere.console-shell@1',
    );
    let current = 'demo-cluster';
    const listeners = new Set<(name: string) => void>();
    context.capabilities.register<ClusterCapability>(
      'kubesphere.cluster@2',
      {
        getCurrentCluster: () => current,
        setCurrentCluster(name) { current = name; for (const listener of listeners) listener(name); },
        watchCurrentCluster(emit) {
          listeners.add(emit);
          return { snapshot: current, dispose: () => { listeners.delete(emit); } };
        },
      },
    );
    context.contributions.registerRoute({
      id: 'cluster-overview-route',
      path: '/clusters/current',
      target: { kind: 'builtin', render: ClusterOverview },
    });
    context.contributions.registerNavigation({
      id: 'cluster-overview-navigation',
      label: 'Cluster Overview',
      routeId: 'cluster-overview-route',
      order: 100,
    });
    context.contributions.registerRoute({ id: 'node-detail', path: '/clusters/:cluster/nodes/:node', acceptsChildren: true, target: { kind: 'builtin', render: NodeLayout, routeLayout: true } });
    context.contributions.registerRoute({ id: 'node-events', parentRouteId: 'node-detail', path: 'events', target: { kind: 'builtin', render: NodeEvents } });
    context.contributions.registerNavigation({ id: 'node-navigation', label: 'Node', routeId: 'node-detail', acceptsChildren: true, order: 150 });
    context.contributions.registerNavigation({ id: 'node-events-navigation', label: 'Events', parentId: 'node-navigation', routeId: 'node-events' });
    context.contributions.registerExtension({
      id: 'cluster-overview-card',
      slot: 'console.home.cards',
      order: 100,
      target: { kind: 'builtin', render: ClusterOverview },
    });
  },
};

