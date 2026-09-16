import { useEffect, useState } from 'react';
import { useUiClient } from '@nexus/plugin-runtime/react';
import type { RuntimeSnapshot } from '@nexus/plugin-runtime';

export function RuntimeInspector() {
  const client = useUiClient();
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>();
  const [audit, setAudit] = useState<readonly unknown[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const [next, entries] = await Promise.all([
          client.invoke<RuntimeSnapshot>('diagnostics.query@1', 'get', null),
          client.invoke<readonly unknown[]>('audit.query@1', 'list', null),
        ]);
        if (active) {
          setSnapshot(next);
          setAudit(entries);
        }
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 250);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [client]);
  if (!snapshot)
    return (
      <p className="core-el-p" role="status">
        {error ? 'Diagnostics unavailable.' : 'Loading diagnostics…'}
      </p>
    );
  return (
    <section
      className="core-el-section core-section-block core-runtime-inspector"
      aria-label="Runtime Inspector"
    >
      <div className="core-el-div core-section-heading">
        <div className="core-el-div">
          <span className="core-el-span core-kicker">OBSERVABILITY</span>
          <h2 className="core-el-h2">Runtime Inspector</h2>
        </div>
        <span className="core-el-span core-muted">Live runtime facts</span>
      </div>
      {snapshot.bootstrapError && (
        <p className="core-el-p" role="alert">
          {snapshot.bootstrapError.code}: {snapshot.bootstrapError.message}
        </p>
      )}
      <table className="core-el-table core-data-table">
        <thead className="core-el-thead">
          <tr className="core-el-tr">
            <th className="core-el-th">Plugin</th>
            <th className="core-el-th">State</th>
            <th className="core-el-th">Execution</th>
            <th className="core-el-th">Core</th>
          </tr>
        </thead>
        <tbody className="core-el-tbody">
          {snapshot.plugins.map((plugin) => (
            <tr className="core-el-tr" key={plugin.id}>
              <td className="core-el-td">
                {plugin.id} {plugin.version}
                <details className="core-el-details">
                  <summary className="core-el-summary">Contributions</summary>
                  <ul className="core-el-ul">
                    {[...snapshot.contributions.routes, ...snapshot.contributions.navigation]
                      .filter((c) => c.ownerPluginId === plugin.id)
                      .map((c) => (
                        <li
                          className="core-el-li"
                          key={`${c.host?.kind ?? c.path ?? 'navigation'}:${c.id}`}
                        >
                          {c.id} · {c.host?.state ?? 'Host analysis not available'}
                          {c.host?.fullPath && (
                            <code className="core-el-code"> {c.host.fullPath}</code>
                          )}
                          {c.host?.parentId && <> · Parent: {c.host.parentId}</>}
                          {c.host?.diagnostics.map((d, i) => (
                            <pre className="core-el-pre" key={i}>
                              {JSON.stringify(d, null, 2)}
                            </pre>
                          ))}
                          {c.host?.navigationDiagnostic && (
                            <p className="core-el-p">
                              Navigation: {c.host.navigationDiagnostic.code}
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>
                </details>
              </td>
              <td className="core-el-td">
                {plugin.state}
                {plugin.error && ` · ${plugin.error.code}`}
              </td>
              <td className="core-el-td">{plugin.executionMode}</td>
              <td className="core-el-td">{plugin.core ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {snapshot.ui && (
        <details className="core-el-details">
          <summary className="core-el-summary">UI scopes and relations</summary>
          <pre className="core-el-pre">{JSON.stringify(snapshot.ui, null, 2)}</pre>
        </details>
      )}
      {snapshot.plugins.flatMap((plugin) =>
        (plugin.surfaces ?? []).map((surface) => (
          <div className="core-el-div" key={`${plugin.id}/${surface.id}`}>
            <p className="core-el-p">
              {plugin.id}/{surface.id}:{' '}
              {surface.instances.length === 0
                ? 'UNMOUNTED'
                : `${surface.instances.length} instances`}
            </p>
            <ul className="core-el-ul">
              {surface.instances.map((instance) => (
                <li className="core-el-li" key={instance.surfaceInstanceId}>
                  {instance.mountPointId} · {instance.state} · Session{' '}
                  {instance.bridgeSession?.state ?? 'PENDING'} ·{' '}
                  {instance.bridgeSession?.subscriptionCount ?? 0} subscriptions
                  {instance.error && ` · ${instance.error.code}`}
                </li>
              ))}
            </ul>
          </div>
        )),
      )}
      <details className="core-el-details">
        <summary className="core-el-summary">Runtime snapshot</summary>
        <pre className="core-el-pre" data-testid="runtime-snapshot">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
      <details className="core-el-details">
        <summary className="core-el-summary">Bridge audit ({audit.length})</summary>
        <pre className="core-el-pre" data-testid="bridge-audit">
          {JSON.stringify(audit, null, 2)}
        </pre>
      </details>
    </section>
  );
}
