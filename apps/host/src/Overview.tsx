import type { ComponentType } from 'react';
import { useHostServices } from './HostContext';
import { PluginConfiguration } from './PluginConfiguration';
import { RuntimeInspector } from './RuntimeInspector';
import { SurfaceMount } from './SurfaceMount';
import type { ClusterCapability } from './plugins/cluster';

export function Overview() {
  const { runtime, store, adapter, audit, failures, model } = useHostServices();
  const extensions = runtime.contributions.listExtensions('console.home.cards');
  return <>
    <h1>Frontend Plugin Runtime</h1>
    <button onClick={() => {
      const cluster = runtime.capabilities.require<ClusterCapability>('kubesphere.cluster@2');
      cluster.setCurrentCluster(cluster.getCurrentCluster() === 'demo-cluster' ? 'second-cluster' : 'demo-cluster');
    }}>Switch Host cluster</button>
    <p>Isolation: cooperative-isolation — same-origin plugins can access the parent window.</p>
    <section aria-label="Home cards">
      {extensions.map(({ ownerPluginId, contribution }) => {
        if (contribution.target.kind === 'builtin') {
          const Card = contribution.target.render as ComponentType;
          return <Card key={contribution.id} />;
        }
        const mountPointId = `extension:${contribution.slot}/${contribution.id}`;
        return <SurfaceMount key={contribution.id} adapter={adapter} pluginId={ownerPluginId} target={contribution.target}
          mountPointId={mountPointId} label="KubeEye Card" testId="extension" failure={failures[mountPointId]} />;
      })}
    </section>
    <PluginConfiguration store={store} />
    <RuntimeInspector runtime={runtime} adapter={adapter} audit={audit} hostSource={model ? { listHostContributions: () => model.listHostContributions(window.location.pathname + window.location.search) } : undefined} />
  </>;
}
