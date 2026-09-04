import type { PluginDefinition } from '@nexus/plugin-runtime';

import type { ConsoleShellCapability } from './console-shell';

export interface ClusterCapability {
  getCurrentCluster(): string;
  setCurrentCluster(name: string): void;
  watchCurrentCluster(emit: (name: string) => void): { snapshot: string; dispose(): void };
}

function ClusterOverview() {
  return <section>Current cluster: demo-cluster</section>;
}

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
    context.contributions.registerExtension({
      id: 'cluster-overview-card',
      slot: 'console.home.cards',
      order: 100,
      target: { kind: 'builtin', render: ClusterOverview },
    });
  },
};

