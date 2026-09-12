import { useEffect, useState } from 'react';
import { BrowserRouter, useLocation } from 'react-router';
import { bootstrapPluginRuntime, createContributionPolicy, createPlatformPlugin, createUiOverlayPlugin, inspect, platformBridgeContracts, resolveRootPresentation, uiOverlayBridgeContract, createRouteModel, type BootstrapFailure } from '@nexus/plugin-runtime';
import { RouteLinkProvider } from '@nexus/plugin-runtime/react';
import { renderBuiltinUi } from './render-builtin-ui';
import { HostContext, type HostServices } from './HostContext';
import { ManagedBuiltin } from './ManagedBuiltin';
import { BreakGlass } from './BreakGlass';
import { SurfaceMount } from './SurfaceMount';
import { RoutedContent } from './routing/RoutePage';
import { mergePreparedBuiltins } from './prepare-builtins';
import type { BrowserDistribution } from './distribution';

type Startup = { state: 'BOOTSTRAPPING' } | { state: 'FAILED'; failure: BootstrapFailure; preparation: unknown } | { state: 'READY'; services: HostServices };

export function BrowserHost({ distribution }: { readonly distribution: BrowserDistribution }) {
  const [startup, setStartup] = useState<Startup>({ state: 'BOOTSTRAPPING' });
  const [presentationFailure, setPresentationFailure] = useState<unknown>();
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setStartup({ state: 'BOOTSTRAPPING' }); setPresentationFailure(undefined);
    const platform = createPlatformPlugin(), overlay = createUiOverlayPlugin();
    const bridgeContracts = [...platformBridgeContracts, uiOverlayBridgeContract, ...distribution.bridgeContracts ?? []];
    let preparation: unknown = Object.freeze({ failures: Object.freeze([]), conflicts: Object.freeze([]) });
    void Promise.resolve().then(async () => {
      const prepared = await distribution.prepareBuiltins?.();
      if (disposed) return;
      preparation = Object.freeze({ failures: Object.freeze((prepared?.failures ?? []).map(failure => Object.freeze({ ...failure }))), conflicts: Object.freeze([]) });
      const merged = mergePreparedBuiltins([platform.plugin, overlay.plugin, ...distribution.builtins], distribution.builtinCss, prepared);
      const policy = createContributionPolicy(distribution.policyBundle);
      const store = distribution.createStore(bridgeContracts);
      const { installed, conflicts } = merged.filterInstallations([...store.list(), ...distribution.additionalInstallations ?? []]);
      preparation = Object.freeze({ failures: merged.failures, conflicts });
      const runtime = await bootstrapPluginRuntime({ ...distribution, builtins: merged.builtins, bridgeContracts, installed });
      if (disposed) return;
      const browser = await import('@nexus/plugin-runtime/browser');
      if (disposed) return;
      const audit: HostServices['audit'][number][] = [];
      const appendAudit = (entry: HostServices['audit'][number]) => { audit.push(entry); if (audit.length > 200) audit.shift(); };
      const adapter = browser.createWujiePluginAdapter({ runtime,
        onLifecycle(event) {
          const name = `nexus:surface:${event.phase}`;
          if (performance.getEntriesByName(name).length >= 100) performance.clearMarks(name);
          performance.mark(name, { detail: event.identity });
        },
        onAudit: appendAudit,
      });
      const presentationErrors: { attemptId: string; message: string }[] = [];
      const ui = browser.createUiHost({ onError(cause, attemptId) { presentationErrors.push({ attemptId, message: String(cause) }); if (presentationErrors.length > 100) presentationErrors.shift(); }, onAudit: appendAudit, runtime, restrictedAdapter: adapter, policy, builtinPermissions: distribution.capabilityGrants, builtinCss: merged.builtinCss, renderBuiltin: renderBuiltinUi });
      overlay.bind(ui.overlayCapability);
      cleanup = () => { void ui.dispose(); for (const instance of adapter.listInstances()) void adapter.unmount(instance.identity.surfaceInstanceId).catch(() => undefined); };
      const model = createRouteModel({ routes: runtime.contributions.listRoutes(), navigation: runtime.contributions.listNavigation(), points: runtime.contributions.listExtensionPoints(), rootRoutePoint: runtime.rootRoutePoint, navigationRootPoints: runtime.navigationRootPoints, policy });
      const diagnostics = () => ({ ...inspect(runtime, { listInstances: () => adapter.listInstances(), inspectUi: () => ui.core.inspect(), inspectActions: () => ui.actions.inspect(), listHostContributions: () => model.listHostContributions(window.location.pathname + window.location.search) }), preparation, presentationErrors: [...presentationErrors] });
      platform.bind({ runtime, model, store, catalog: distribution.catalog,
        location: () => window.location.pathname + window.location.search,
        navigate(href) { window.history.pushState(null, '', href); window.dispatchEvent(new PopStateEvent('popstate')); },
        audit: () => audit, recordAudit: appendAudit, diagnostics,
      });
      setStartup({ state: 'READY', services: { runtime, store, adapter, ui, model, audit, platform, diagnostics } });
    }).catch(error => { cleanup?.(); if (!disposed) setStartup({ state: 'FAILED', failure: { ready: false, error }, preparation }); });
    return () => { disposed = true; cleanup?.(); };
  }, [distribution]);
  if (startup.state === 'BOOTSTRAPPING') return <p role="status">Starting plugin runtime…</p>;
  if (startup.state === 'FAILED') return <BreakGlass ready={false} diagnostics={{ ...inspect(startup.failure), preparation: startup.preparation }} recovery={distribution.recovery} applicationLabel={distribution.applicationLabel} />;
  const { services } = startup;
  let root;
  try { root = resolveRootPresentation(services.runtime); }
  catch { return <BreakGlass ready diagnostics={services.diagnostics()} recovery={distribution.recovery} applicationLabel={distribution.applicationLabel} />; }
  if (presentationFailure) return <BreakGlass ready diagnostics={presentationFailure} recovery={distribution.recovery} applicationLabel={distribution.applicationLabel} />;
  return <HostContext value={services}><BrowserRouter><BrowserPresentation services={services} root={root} onFailure={() => setPresentationFailure(services.diagnostics())} /></BrowserRouter></HostContext>;
}

function BrowserPresentation({ services, root, onFailure }: { services: HostServices; root: ReturnType<typeof resolveRootPresentation>; onFailure(): void }) {
  const location = useLocation();
  useEffect(() => { services.platform.notify('routes.query@1'); }, [services, location.pathname, location.search]);
  return <RouteLinkProvider renderLink={(props, client) => {
    let href: string;
    try { href = services.model.pathFor(props.routeId, props.params); } catch { return <span className={props.className} aria-disabled="true">{props.children}</span>; }
    return <a className={props.className} href={href} aria-current={props.current ? 'page' : undefined} onClick={event => { event.preventDefault(); void client.invoke('routes.navigate@1', 'navigate', { routeId: props.routeId, params: props.params }).catch(() => undefined); }}>{props.children}</a>;
  }}>
    {root.contribution.target.kind === 'builtin' ? <ManagedBuiltin ui={services.ui} ownerPluginId={root.ownerPluginId} surfaceId={root.contribution.id}
      target={root.contribution.target} mountPointId="root-presentation" onFailure={onFailure} outlet={<RoutedContent model={services.model} />} /> : <SurfaceMount pluginId={root.ownerPluginId}
        target={root.contribution.target} mountPointId="root-presentation" label="Application" testId="root-presentation" autoMount onFailure={onFailure} />}
  </RouteLinkProvider>;
}
