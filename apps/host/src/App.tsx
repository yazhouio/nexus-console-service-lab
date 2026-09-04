import { useEffect, useState } from 'react';
import type { BootstrapFailure, InstallationStore, PluginRuntime } from '@nexus/plugin-runtime';
import type { BridgeAuditEntry, SurfaceMountIssue, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';

import { installationStorePromise, runtimePromise } from './runtime';
import { PluginConfiguration } from './PluginConfiguration';
import { RuntimeInspector } from './RuntimeInspector';
import type { ClusterCapability } from './plugins/cluster';
import { SurfaceMount } from './SurfaceMount';

const pageStyle = {
  maxWidth: 880, margin: '0 auto', padding: '64px 24px',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#172033',
} as const;

export function App() {
  const [runtime, setRuntime] = useState<PluginRuntime>();
  const [adapter, setAdapter] = useState<WujiePluginAdapter>();
  const [bootstrapFailure, setBootstrapFailure] = useState<BootstrapFailure>();
  const [store, setStore] = useState<InstallationStore>();
  const [audit, setAudit] = useState<readonly BridgeAuditEntry[]>([]);
  const [failures, setFailures] = useState<Record<string, SurfaceMountIssue>>({});

  useEffect(() => {
    let disposed = false;
    let mountedAdapter: WujiePluginAdapter | undefined;
    void Promise.all([runtimePromise, installationStorePromise, import('@nexus/plugin-runtime/browser')]).then(
      ([runtime, store, browser]) => {
        if (disposed) return;
        mountedAdapter = browser.createWujiePluginAdapter({ runtime, onAudit(entry) {
          if (!disposed) setAudit(previous => [...previous.slice(-199), entry]);
        }, onSurfaceError(error) {
          if (!disposed) setFailures(previous => ({ ...previous, [error.issue.mountPointId]: error.issue }));
        } });
        setRuntime(runtime); setStore(store); setAdapter(mountedAdapter);
      },
      error => { if (!disposed) setBootstrapFailure({ ready: false, error }); },
    );
    return () => {
      disposed = true;
      for (const instance of mountedAdapter?.listInstances() ?? []) {
        void mountedAdapter?.unmount(instance.identity.surfaceInstanceId).catch(() => undefined);
      }
    };
  }, []);

  const route = runtime?.contributions.listRoutes().find(route => route.ownerPluginId === 'kubeeye');
  // Only the mounted Host slot asks for its contributions. Unknown slots stay unused.
  const extensions = runtime?.contributions.listExtensions('console.home.cards') ?? [];
  return <main style={pageStyle}>
    <p>Nexus Console</p>
    <h1>Frontend Plugin Runtime</h1>
    <p>Runtime state: <strong data-testid="runtime-state">{runtime ? `READY · ${runtime.contributions.listRoutes().length} routes` : bootstrapFailure ? 'FAILED' : 'BOOTSTRAPPING'}</strong></p>
    <p>KubeEye Plugin: <strong data-testid="plugin-state">{runtime?.plugins.get('kubeeye')?.state ?? 'MISSING'}</strong></p>
    <p>Runtime KubeEye version: <strong data-testid="runtime-plugin-version">{runtime?.restrictedPlugins.get('kubeeye')?.manifest.version ?? 'NONE'}</strong></p>
    {runtime && <button onClick={() => {
      const cluster = runtime.capabilities.require<ClusterCapability>('kubesphere.cluster@2');
      cluster.setCurrentCluster(cluster.getCurrentCluster() === 'demo-cluster' ? 'second-cluster' : 'demo-cluster');
    }}>Switch Host cluster</button>}
    <p>Isolation: cooperative-isolation — same-origin plugins can access the parent window.</p>
    {adapter && route?.contribution.target.kind === 'sandbox-surface' && <SurfaceMount
      adapter={adapter} pluginId={route.ownerPluginId} target={route.contribution.target}
      mountPointId={`route:${route.contribution.id}`} label="KubeEye Surface" testId="surface"
      failure={failures[`route:${route.contribution.id}`]}
    />}
    <section aria-label="Home cards">
      {adapter && extensions.map(extension => extension.contribution.target.kind === 'sandbox-surface' && <SurfaceMount
        key={extension.contribution.id} adapter={adapter} pluginId={extension.ownerPluginId}
        target={extension.contribution.target} mountPointId={`extension:${extension.contribution.slot}/${extension.contribution.id}`}
        label="KubeEye Card" testId="extension" failure={failures[`extension:${extension.contribution.slot}/${extension.contribution.id}`]}
      />)}
    </section>
    {store && <PluginConfiguration store={store} />}
    {(runtime || bootstrapFailure) && <RuntimeInspector runtime={(runtime ?? bootstrapFailure)!} adapter={adapter} audit={audit} />}
  </main>;
}
