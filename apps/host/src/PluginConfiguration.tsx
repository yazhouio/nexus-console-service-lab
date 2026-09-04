import { useState } from 'react';
import type { InstallationStore, ReloadRequired } from '@nexus/plugin-runtime';
import { kubeeyeInstallation } from './plugins/kubeeye-installation';

export function PluginConfiguration({ store }: { readonly store: InstallationStore }) {
  const [status, setStatus] = useState({ message: 'Configuration applied' });
  const selected = store.list().find(record => record.manifest.id === 'kubeeye');
  const change = (update: () => ReloadRequired) => {
    try { update(); setStatus({ message: 'Reload Required — changes apply after reloading this page.' }); }
    catch { setStatus({ message: 'Configuration could not be saved.' }); }
  };
  return <section aria-label="Plugin configuration" style={{ marginTop: 32 }}>
    <h2>Plugin configuration</h2>
    <p>Next runtime: {selected ? `KubeEye ${selected.manifest.version} · ${selected.config.enabled ? 'enabled' : 'disabled'}` : 'KubeEye not installed'}</p>
    <p data-testid="configuration-status">{status.message}</p>
    {!selected && <button onClick={() => change(() => store.install(kubeeyeInstallation))}>Install KubeEye 1.0.0</button>}
    {selected && <>
      <button onClick={() => change(() => store.setEnabled('kubeeye', !selected.config.enabled))}>{selected.config.enabled ? 'Disable' : 'Enable'} KubeEye</button>{' '}
      <button onClick={() => change(() => store.uninstall('kubeeye'))}>Uninstall KubeEye</button>{' '}
      {selected.manifest.version === '1.0.0' ? <button onClick={() => change(() => store.install({
        manifest: { ...kubeeyeInstallation.manifest, version: '2.0.0', entry: '/plugins/kubeeye/2.0.0/' },
        config: { ...selected.config, version: '2.0.0' },
      }))}>Install KubeEye 2.0.0</button> : <button onClick={() => change(() => store.selectVersion('kubeeye', '1.0.0'))}>Roll back to 1.0.0</button>}
    </>}{' '}
    <button onClick={() => window.location.reload()}>Reload page</button>
  </section>;
}
