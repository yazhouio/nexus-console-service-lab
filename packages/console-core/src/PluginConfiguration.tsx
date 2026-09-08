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
  return <section aria-label="Plugin configuration" style={{ marginTop: 32 }}>
    <h2>Plugin configuration</h2>
    <p data-testid="configuration-status">{error ? 'Plugin configuration is unavailable.' : status}</p>
    {plugins?.map(plugin => <section key={plugin.id} aria-label={`${plugin.label} configuration`}>
      {!plugin.manageable ? <p>{plugin.label} · {plugin.core ? 'Required system plugin' : 'Builtin'} · Read only</p> : <>
        <p>Next runtime: {plugin.configuration ? `${plugin.label} ${plugin.configuration.version} · ${plugin.configuration.enabled ? 'enabled' : 'disabled'}` : `${plugin.label} not installed`}</p>
        {plugin.configuration && <>
          <button disabled={pending} onClick={() => { void change('setEnabled', { id: plugin.id, enabled: !plugin.configuration!.enabled }); }}>{plugin.configuration.enabled ? 'Disable' : 'Enable'} {plugin.label}</button>{' '}
          <button disabled={pending} onClick={() => { void change('uninstall', { id: plugin.id }); }}>Uninstall {plugin.label}</button>{' '}
        </>}
        {plugin.versions.filter(version => version !== plugin.configuration?.version).map(version => {
          const rollback = plugin.configuration && plugin.installedVersions.includes(version);
          return <button disabled={pending} key={version} onClick={() => { void change(rollback ? 'selectVersion' : 'install', { id: plugin.id, version }); }}>{rollback ? `Roll back to ${version}` : `Install ${plugin.label} ${version}`}</button>;
        })}
      </>}
      <ActionMenu point={PLUGIN_DETAILS_ACTIONS_POINT} context={{ itemRef: { id: plugin.id } }} />
    </section>)}
    <button disabled={pending} onClick={() => window.location.reload()}>Reload page</button>
  </section>;
}
