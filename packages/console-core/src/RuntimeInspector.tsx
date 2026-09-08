import { useEffect, useState } from 'react';
import { useUiClient } from '@nexus/plugin-runtime/react';
import type { RuntimeSnapshot } from '@nexus/plugin-runtime';

export function RuntimeInspector() {
  const client = useUiClient();
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>();
  const [audit, setAudit] = useState<readonly unknown[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async () => {
      if (pending) return; pending = true;
      try {
        const [next, entries] = await Promise.all([client.invoke<RuntimeSnapshot>('diagnostics.query@1', 'get', null), client.invoke<readonly unknown[]>('audit.query@1', 'list', null)]);
        if (active) { setSnapshot(next); setAudit(entries); }
      } catch { if (active) setError(true); }
      finally { pending = false; }
    };
    void refresh(); const timer = window.setInterval(() => { void refresh(); }, 250);
    return () => { active = false; window.clearInterval(timer); };
  }, [client]);
  if (!snapshot) return <p role="status">{error ? 'Diagnostics unavailable.' : 'Loading diagnostics…'}</p>;
  return <section className="nexus-section-block nexus-runtime-inspector" aria-label="Runtime Inspector">
    <div className="nexus-section-heading"><div><span className="nexus-kicker">OBSERVABILITY</span><h2>Runtime Inspector</h2></div><span className="nexus-muted">Live runtime facts</span></div>
    {snapshot.bootstrapError && <p role="alert">{snapshot.bootstrapError.code}: {snapshot.bootstrapError.message}</p>}
    <table className="nexus-data-table">
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
    {snapshot.ui && <details><summary>UI scopes and relations</summary><pre>{JSON.stringify(snapshot.ui, null, 2)}</pre></details>}
    {snapshot.plugins.flatMap(plugin => (plugin.surfaces ?? []).map(surface => <div key={`${plugin.id}/${surface.id}`}>
      <p>{plugin.id}/{surface.id}: {surface.instances.length === 0 ? 'UNMOUNTED' : `${surface.instances.length} instances`}</p>
      <ul>{surface.instances.map(instance => <li key={instance.surfaceInstanceId}>
        {instance.mountPointId} · {instance.state} · Session {instance.bridgeSession?.state ?? 'PENDING'} · {instance.bridgeSession?.subscriptionCount ?? 0} subscriptions
        {instance.error && ` · ${instance.error.code}`}
      </li>)}</ul>
    </div>))}
    <details><summary>Runtime snapshot</summary><pre data-testid="runtime-snapshot">{JSON.stringify(snapshot, null, 2)}</pre></details>
    <details><summary>Bridge audit ({audit.length})</summary><pre data-testid="bridge-audit">{JSON.stringify(audit, null, 2)}</pre></details>
  </section>;
}
