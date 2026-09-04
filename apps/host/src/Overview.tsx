import { useState } from 'react';
import { Slot } from '@nexus/plugin-runtime/react';
import { UiOwner } from './UiOwner';
import { useHostServices } from './HostContext';
import { PluginConfiguration } from './PluginConfiguration';
import { RuntimeInspector } from './RuntimeInspector';
import type { ClusterCapability } from './plugins/cluster';

export function Overview() {
  const { runtime, store, adapter, audit, failures, model } = useHostServices();

  return <>
    <h1>Frontend Plugin Runtime</h1>
    <button onClick={() => {
      const cluster = runtime.capabilities.require<ClusterCapability>('kubesphere.cluster@2');
      cluster.setCurrentCluster(cluster.getCurrentCluster() === 'demo-cluster' ? 'second-cluster' : 'demo-cluster');
    }}>Switch Host cluster</button>
    <p>Isolation: cooperative-isolation — same-origin plugins can access the parent window.</p>
    <section aria-label="Home cards">
      <UiOwner owner="console-shell"><HomeCards /></UiOwner>
    </section>
    <PluginConfiguration store={store} />
    <RuntimeInspector runtime={runtime} adapter={adapter} audit={audit} hostSource={model ? { listHostContributions: () => model.listHostContributions(window.location.pathname + window.location.search) } : undefined} />
  </>;
}

function HomeCards() {
  const [opened, setOpened] = useState(false);
  return <>
    <button onClick={() => setOpened(v => !v)}>{opened ? 'Close' : 'Open'} KubeEye Card</button>
    <div data-testid="extension-container"><Slot id="home.cards" contextKey="home" context={{}}
      selected={opened ? undefined : [{ ownerPluginId: 'cluster', id: 'cluster-overview-card' }]}
      feedback={(state, retry) => {
        const execution = state?.contributions.find(c => c.ref.ownerPluginId === 'kubeeye')?.execution;
        return <><p>KubeEye Card: <strong data-testid="extension-state">{!opened ? 'UNMOUNTED' : execution?.phase === 'ready' ? 'MOUNTED' : execution?.phase === 'failed' ? 'ERROR' : 'MOUNTING'}</strong></p>
          {execution?.retryTarget && <button onClick={() => { void retry(execution.retryTarget!).catch(() => undefined); }}>Retry KubeEye Card</button>}</>;
      }} /></div>
  </>;
}
