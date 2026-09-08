import { useState } from 'react';
import { RouteOutlet, useCapabilitySubscription } from '@nexus/plugin-runtime/react';
import type { PluginSummary, RoutesSnapshot } from '@nexus/plugin-runtime';
import { Navigation } from './Navigation';

export function ConsoleLayout() {
  const plugins = useCapabilitySubscription<readonly PluginSummary[]>('plugins.query@1', 'watch');
  const routes = useCapabilitySubscription<RoutesSnapshot>('routes.query@1', 'watch');
  const [failed, setFailed] = useState(false);
  if (failed) throw Error('Console presentation fixture failure');
  if (plugins.error || routes.error) throw plugins.error ?? routes.error;
  return <div className="nexus-console" style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#172033' }}>
    <header><p>Nexus Console</p>
      <p>Runtime state: <strong data-testid="runtime-state">READY · {routes.value?.routes.length ?? 0} routes</strong></p>
      {plugins.value?.filter(plugin => plugin.kind === 'restricted').map(plugin => <div key={plugin.id}>
        <p>{plugin.label} Plugin: <strong data-testid={`plugin-state-${plugin.id}`}>{plugin.state}</strong></p>
        <p>Runtime {plugin.label} version: <strong data-testid={`runtime-plugin-version-${plugin.id}`}>{plugin.version ?? 'NONE'}</strong></p>
      </div>)}
    </header>
    {process.env.PUBLIC_TEST_FIXTURES === 'true' && <button onClick={() => setFailed(true)}>Crash Console presentation</button>}
    {routes.value && <nav aria-label="Primary"><Navigation items={routes.value.navigation} current={routes.value.current} /></nav>}
    <main><RouteOutlet /></main>
  </div>;
}
