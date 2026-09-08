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
  return <div className="nexus-console">
    <aside className="nexus-sidebar">
      <a className="nexus-brand" href="/" aria-label="Nexus Console home"><span className="nexus-brand__mark" aria-hidden="true"><span /><span /><span /></span><span><strong>Nexus</strong><small>Console</small></span></a>
      <div className="nexus-sidebar__workspace"><span className="nexus-sidebar__label">WORKSPACE</span><button className="nexus-workspace-switcher"><span className="nexus-workspace-switcher__avatar">D</span><span><strong>Demo workspace</strong><small>Local cluster</small></span><span className="nexus-chevron">⌄</span></button></div>
      {routes.value && <nav className="nexus-sidebar__nav" aria-label="Primary"><span className="nexus-sidebar__label">CONSOLE</span><Navigation items={routes.value.navigation} current={routes.value.current} /></nav>}
      <div className="nexus-sidebar__footer"><div className="nexus-health-line"><span className="nexus-health-dot" />Host operational</div><small>v1.0.0 · {routes.value?.routes.length ?? 0} routes</small></div>
    </aside>
    <div className="nexus-console__body">
      <header className="nexus-topbar"><div className="nexus-breadcrumb"><span>Console</span><span className="nexus-breadcrumb__separator">/</span><strong>Workspace overview</strong></div><div className="nexus-topbar__actions"><div className="nexus-runtime-badge"><span className="nexus-health-dot" />Runtime <strong data-testid="runtime-state">READY · {routes.value?.routes.length ?? 0} routes</strong></div>{plugins.value?.filter(plugin => plugin.kind === 'restricted').map(plugin => <div className="nexus-plugin-runtime-status" key={plugin.id}><span>{plugin.label}</span><strong data-testid={`plugin-state-${plugin.id}`}>{plugin.state}</strong><small data-testid={`runtime-plugin-version-${plugin.id}`}>{plugin.version ?? 'NONE'}</small></div>)}</div></header>
      <main className="nexus-page-content">
        {process.env.PUBLIC_TEST_FIXTURES === 'true' && <button className="nexus-test-trigger" onClick={() => setFailed(true)}>Crash Console presentation</button>}
        <RouteOutlet />
      </main>
    </div>
  </div>;
}
