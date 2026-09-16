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
  return (
    <div className="core-el-div core-console">
      <aside className="core-el-aside core-sidebar">
        <a className="core-el-a core-brand" href="/" aria-label="Nexus Console home">
          <span className="core-el-span core-brand__mark" aria-hidden="true">
            <span className="core-el-span" />
            <span className="core-el-span" />
            <span className="core-el-span" />
          </span>
          <span className="core-el-span">
            <strong className="core-el-strong">Nexus</strong>
            <small className="core-el-small">Console</small>
          </span>
        </a>
        <div className="core-el-div core-sidebar__workspace">
          <span className="core-el-span core-sidebar__label">WORKSPACE</span>
          <button className="core-el-button core-workspace-switcher">
            <span className="core-el-span core-workspace-switcher__avatar">D</span>
            <span className="core-el-span">
              <strong className="core-el-strong">Demo workspace</strong>
              <small className="core-el-small">Local cluster</small>
            </span>
            <span className="core-el-span core-chevron">⌄</span>
          </button>
        </div>
        {routes.value && (
          <nav className="core-el-nav core-sidebar__nav" aria-label="Primary">
            <span className="core-el-span core-sidebar__label">CONSOLE</span>
            <Navigation items={routes.value.navigation} current={routes.value.current} />
          </nav>
        )}
        <div className="core-el-div core-sidebar__footer">
          <div className="core-el-div core-health-line">
            <span className="core-el-span core-health-dot" />
            Host operational
          </div>
          <small className="core-el-small">
            v1.0.0 · {routes.value?.routes.length ?? 0} routes
          </small>
        </div>
      </aside>
      <div className="core-el-div core-console__body">
        <header className="core-el-header core-topbar">
          <div className="core-el-div core-breadcrumb">
            <span className="core-el-span">Console</span>
            <span className="core-el-span core-breadcrumb__separator">/</span>
            <strong className="core-el-strong">Workspace overview</strong>
          </div>
          <div className="core-el-div core-topbar__actions">
            <div className="core-el-div core-runtime-badge">
              <span className="core-el-span core-health-dot" />
              Runtime{' '}
              <strong className="core-el-strong" data-testid="runtime-state">
                READY · {routes.value?.routes.length ?? 0} routes
              </strong>
            </div>
            {plugins.value
              ?.filter((plugin) => plugin.kind === 'restricted')
              .map((plugin) => (
                <div className="core-el-div core-plugin-runtime-status" key={plugin.id}>
                  <span className="core-el-span">{plugin.label}</span>
                  <strong className="core-el-strong" data-testid={`plugin-state-${plugin.id}`}>
                    {plugin.state}
                  </strong>
                  <small
                    className="core-el-small"
                    data-testid={`runtime-plugin-version-${plugin.id}`}
                  >
                    {plugin.version ?? 'NONE'}
                  </small>
                </div>
              ))}
          </div>
        </header>
        <main className="core-el-main core-page-content">
          {process.env.PUBLIC_TEST_FIXTURES === 'true' && (
            <button className="core-el-button core-test-trigger" onClick={() => setFailed(true)}>
              Crash Console presentation
            </button>
          )}
          <RouteOutlet />
        </main>
      </div>
    </div>
  );
}
