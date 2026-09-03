import type { PluginDefinition } from '@nexus/plugin-runtime';

import type { ConsoleShellCapability } from './console-shell';

export interface ClusterCapability {
  getCurrentCluster(): string;
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
    context.capabilities.register<ClusterCapability>(
      'kubesphere.cluster@2',
      {
        getCurrentCluster: () => 'demo-cluster',
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

