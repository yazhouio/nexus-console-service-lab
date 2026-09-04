import { renderBuiltinUi } from './render-builtin-ui';
import { bindUiOverlay } from './plugins/ui-overlay';
import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router';
import type { BootstrapFailure } from '@nexus/plugin-runtime';
import { installationStorePromise, runtimePromise } from './runtime';
import { HostContext, type HostServices } from './HostContext';
import { Overview } from './Overview';
import { RuntimeInspector } from './RuntimeInspector';
import { SurfaceMount } from './SurfaceMount';
import { createRouteModel } from './routing/route-model';
import { contributionPolicy } from './routing/contribution-policy';
import { Navigation } from './routing/Navigation';
import { RoutedContent } from './routing/RoutePage';

const pageStyle = { maxWidth: 1080, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#172033' } as const;
// Production builds must pass the release gate in rsbuild.config.ts before this becomes true.
const routingEnabled = process.env.PUBLIC_HOST_ROUTING === 'true';
type Startup = { state: 'BOOTSTRAPPING' } | { state: 'FAILED'; failure: BootstrapFailure } | { state: 'READY'; services: HostServices };

export function App() {
  const [startup, setStartup] = useState<Startup>({ state: 'BOOTSTRAPPING' });
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([runtimePromise, installationStorePromise, import('@nexus/plugin-runtime/browser')]).then(([runtime, store, browser]) => {
      if (disposed) return;
      const adapter = browser.createWujiePluginAdapter({ runtime,
        onLifecycle(event) {
          const name = `nexus:surface:${event.phase}`;
          if (performance.getEntriesByName(name).length >= 100) performance.clearMarks(name);
          performance.mark(name, { detail: event.identity });
        },
        onAudit(entry) { if (!disposed) setStartup(s => s.state === 'READY' ? { ...s, services: { ...s.services, audit: [...s.services.audit.slice(-199), entry] } } : s); },
        onSurfaceError(error) { if (!disposed) setStartup(s => s.state === 'READY' ? { ...s, services: { ...s.services, failures: { ...s.services.failures, [error.issue.mountPointId]: error.issue } } } : s); },
      });
      const ui = browser.createUiHost({ runtime, restrictedAdapter: adapter, policy: contributionPolicy, renderBuiltin: renderBuiltinUi });
      bindUiOverlay(ui.overlayCapability);
      cleanup = () => { void ui.dispose(); };
      const cleanupUi = cleanup;
      cleanup = () => { cleanupUi(); for (const instance of adapter.listInstances()) void adapter.unmount(instance.identity.surfaceInstanceId).catch(() => undefined); };
      const model = routingEnabled ? createRouteModel({ routes: runtime.contributions.listRoutes(), navigation: runtime.contributions.listNavigation(), policy: contributionPolicy }) : undefined;
      setStartup({ state: 'READY', services: { runtime, store, adapter, ui, model, audit: [], failures: {} } });
    }).catch(error => { if (!disposed) setStartup({ state: 'FAILED', failure: { ready: false, error } }); });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  const services = startup.state === 'READY' ? startup.services : undefined;
  return <div style={pageStyle}>
    <header><p>Nexus Console</p>
      <p>Runtime state: <strong data-testid="runtime-state">{services ? `READY · ${services.runtime.contributions.listRoutes().length} routes` : startup.state}</strong></p>
      <p>KubeEye Plugin: <strong data-testid="plugin-state">{services?.runtime.plugins.get('kubeeye')?.state ?? 'MISSING'}</strong></p>
      <p>Runtime KubeEye version: <strong data-testid="runtime-plugin-version">{services?.runtime.restrictedPlugins.get('kubeeye')?.manifest.version ?? 'NONE'}</strong></p>
    </header>
    {startup.state === 'BOOTSTRAPPING' && <p role="status">Starting plugin runtime…</p>}
    {startup.state === 'FAILED' && <><h1>Runtime startup failed</h1><RuntimeInspector runtime={startup.failure} audit={[]} /></>}
    {services && <HostContext value={services}>
      {services.model ? <BrowserRouter><nav aria-label="Primary"><Navigation model={services.model} /></nav><main><RoutedContent model={services.model} /></main></BrowserRouter> : <main><LegacySurface /><Overview /></main>}
    </HostContext>}
  </div>;
}

function LegacySurface() {
  // Keep existing manual access when the environment has not enabled routing.
  return <HostContext.Consumer>{services => {
    const route = services?.runtime.contributions.listRoutes().find(r => r.contribution.id === 'kubeeye-overview-route');
    return services && route?.contribution.target.kind === 'sandbox-surface' ? <SurfaceMount adapter={services.adapter} pluginId={route.ownerPluginId}
      target={route.contribution.target} mountPointId={`route:${route.contribution.id}`} label="KubeEye Surface" testId="surface" failure={services.failures[`route:${route.contribution.id}`]} /> : null;
  }}</HostContext.Consumer>;
}
