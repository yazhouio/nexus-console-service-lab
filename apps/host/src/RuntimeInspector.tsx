import { useEffect, useState } from 'react';
import { inspect, type BootstrapFailure, type PluginRuntime, type InspectionSource } from '@nexus/plugin-runtime';
import type { BridgeAuditEntry, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';

export function RuntimeInspector({ runtime, adapter, audit, hostSource }: {
  readonly runtime: PluginRuntime | BootstrapFailure;
  readonly adapter?: WujiePluginAdapter;
  readonly audit: readonly BridgeAuditEntry[];
  readonly hostSource?: InspectionSource;
}) {
  const read = () => inspect(runtime, { listInstances: () => adapter?.listInstances() ?? [],
    ...(hostSource ? { listHostContributions: () => hostSource.listHostContributions?.() ?? [] } : {}) });
  const [snapshot, setSnapshot] = useState(read);
  useEffect(() => {
    setSnapshot(read());
    const timer = window.setInterval(() => setSnapshot(read()), 250);
    return () => window.clearInterval(timer);
  }, [runtime, adapter, hostSource]);
  return <section aria-label="Runtime Inspector" style={{ marginTop: 32 }}>
    <h2>Runtime Inspector</h2>
    {snapshot.bootstrapError && <p role="alert">{snapshot.bootstrapError.code}: {snapshot.bootstrapError.message}</p>}
    <table style={{ textAlign: 'left', width: '100%' }}>
      <thead><tr><th>Plugin</th><th>State</th><th>Execution</th><th>Core</th></tr></thead>
      <tbody>{snapshot.plugins.map(plugin => <tr key={plugin.id}>
        <td>{plugin.id} {plugin.version}
          <details><summary>Contributions</summary><ul>{[...snapshot.contributions.routes, ...snapshot.contributions.navigation].filter(c => c.ownerPluginId === plugin.id).map(c => <li key={`${c.host?.kind ?? c.path ?? 'navigation'}:${c.id}`}>
            {c.id} · {c.host?.state ?? 'Host analysis not available'}
            {c.host?.fullPath && <code> {c.host.fullPath}</code>}
            {c.host?.parentId && <> · Parent: {c.host.parentId}</>}
            {c.host?.diagnostics.map((d, i) => <pre key={i}>{JSON.stringify(d, null, 2)}</pre>)}
            {c.host?.navigationDiagnostic && <p>Navigation: {c.host.navigationDiagnostic.code}</p>}
          </li>)}</ul></details>
        </td><td>{plugin.state}{plugin.error && ` · ${plugin.error.code}`}</td>
        <td>{plugin.executionMode}</td><td>{plugin.core ? 'Yes' : 'No'}</td>
      </tr>)}</tbody>
    </table>
    {snapshot.plugins.flatMap(plugin => (plugin.surfaces ?? []).map(surface => <div key={`${plugin.id}/${surface.id}`}>
      <p>{plugin.id}/{surface.id}: {surface.instances.length === 0 ? 'UNMOUNTED' : `${surface.instances.length} instances`}</p>
      <ul>{surface.instances.map(instance => <li key={instance.surfaceInstanceId}>
        {instance.mountPointId} · {instance.state} · Session {instance.bridgeSession?.state ?? 'PENDING'} · {instance.bridgeSession?.subscriptionCount ?? 0} subscriptions
        {instance.error && ` · ${instance.error.code}`}
      </li>)}</ul>
    </div>))}
    <details><summary>Runtime snapshot</summary><pre data-testid="runtime-snapshot" style={{ overflow: 'auto' }}>{JSON.stringify(snapshot, null, 2)}</pre></details>
    <details><summary>Bridge audit ({audit.length})</summary><pre data-testid="bridge-audit" style={{ overflow: 'auto' }}>{JSON.stringify(audit, null, 2)}</pre></details>
  </section>;
}
