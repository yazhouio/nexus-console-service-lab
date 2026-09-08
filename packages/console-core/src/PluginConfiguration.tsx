import { PLUGIN_DETAILS_ACTIONS_POINT } from '@nexus/console-core-api';
import { useState } from 'react';
import { ActionMenu, useCapabilitySubscription, useUiClient } from '@nexus/plugin-runtime/react';
import type { PluginSummary } from '@nexus/plugin-runtime';

export function PluginConfiguration() {
  const client = useUiClient();
  const { value: plugins, error } = useCapabilitySubscription<readonly PluginSummary[]>('plugins.query@1', 'watch');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('Configuration applied');
  const change = async (action: string, payload: { id: string; version?: string; enabled?: boolean }) => {
    setPending(true); setStatus('Saving configuration…');
    try { await client.invoke('plugins.manage@1', action, payload); setStatus('Reload Required — changes apply after reloading this page.'); }
    catch { setStatus('Configuration could not be saved.'); }
    finally { setPending(false); }
  };
  return <section className="nexus-section-block nexus-plugin-configuration" aria-label="Plugin configuration">
    <div className="nexus-section-heading"><div><span className="nexus-kicker">RUNTIME CONTROL</span><h2>Plugin configuration</h2></div><span className="nexus-muted">Changes apply after reload</span></div>
    <p data-testid="configuration-status">{error ? 'Plugin configuration is unavailable.' : status}</p>
    <div className="nexus-plugin-list">{plugins?.map(plugin => <section className="nexus-plugin-row" key={plugin.id} aria-label={`${plugin.label} configuration`}>
      {!plugin.manageable ? <p>{plugin.label} · {plugin.core ? 'Required system plugin' : 'Builtin'} · Read only</p> : <>
        <div className="nexus-plugin-row__heading"><strong>{plugin.label}</strong><span className={`nexus-status-chip ${plugin.configuration?.enabled ? 'nexus-status-chip--success' : ''}`}>{plugin.configuration ? (plugin.configuration.enabled ? 'ENABLED' : 'DISABLED') : 'NOT INSTALLED'}</span></div><p>Next runtime: {plugin.configuration ? `${plugin.label} ${plugin.configuration.version} · ${plugin.configuration.enabled ? 'enabled' : 'disabled'}` : `${plugin.label} not installed`}</p>
        {plugin.configuration && <>
          <button className="nexus-button nexus-button--secondary" disabled={pending} onClick={() => { void change('setEnabled', { id: plugin.id, enabled: !plugin.configuration!.enabled }); }}>{plugin.configuration.enabled ? 'Disable' : 'Enable'} {plugin.label}</button>{' '}
          <button className="nexus-button nexus-button--ghost nexus-button--danger" disabled={pending} onClick={() => { void change('uninstall', { id: plugin.id }); }}>Uninstall {plugin.label}</button>{' '}
        </>}
        {plugin.versions.filter(version => version !== plugin.configuration?.version).map(version => {
          const rollback = plugin.configuration && plugin.installedVersions.includes(version);
          return <button className="nexus-button nexus-button--text" disabled={pending} key={version} onClick={() => { void change(rollback ? 'selectVersion' : 'install', { id: plugin.id, version }); }}>{rollback ? `Roll back to ${version}` : `Install ${plugin.label} ${version}`}</button>;
        })}
      </>}
      <ActionMenu point={PLUGIN_DETAILS_ACTIONS_POINT} context={{ itemRef: { id: plugin.id } }} />
    </section>)}</div>
    <button className="nexus-button nexus-button--primary" disabled={pending} onClick={() => window.location.reload()}>Reload page</button>
  </section>;
}
