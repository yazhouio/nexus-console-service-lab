import { useContext } from 'react';
import { HostContext } from './HostContext';
import type { UiHost } from '@nexus/plugin-runtime/browser';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RouteContext, SandboxRenderTarget } from '@nexus/plugin-runtime';
import type { SurfaceMountIssue, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';

// A returning Route also waits for an earlier component's asynchronous cleanup.
const cleanupByAdapter = new WeakMap<WujiePluginAdapter, Map<string, Promise<void>>>();
type Presentation = { state: 'MOUNTING' | 'MOUNTED' } | { state: 'ERROR'; stage?: string };

export function SurfaceMount({ adapter, pluginId, target, mountPointId, label, testId, failure, routeContext, autoMount = false }: {
  readonly adapter: WujiePluginAdapter;
  readonly pluginId: string;
  readonly target: SandboxRenderTarget;
  readonly mountPointId: string;
  readonly label: string;
  readonly testId: string;
  readonly failure?: SurfaceMountIssue;
  readonly routeContext?: RouteContext;
  readonly autoMount?: boolean;
}) {
  const ui = useContext(HostContext)?.ui;
  const uiRootRef = useRef<ReturnType<UiHost['mountRoot']> | undefined>(undefined);
  const [opened, setOpened] = useState(autoMount);
  const [attempt, setAttempt] = useState(0);
  const [presentation, setPresentation] = useState<Presentation>({ state: 'MOUNTING' });
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<string | undefined>(undefined);
  // Canonical value keys: ordinary renders and hash changes do not restart a Surface.
  const contextKey = routeContext === undefined ? '' : JSON.stringify({ ...routeContext, params: Object.fromEntries(Object.entries(routeContext.params).sort(([a], [b]) => a.localeCompare(b))) });
  const targetKey = JSON.stringify(target);

  useLayoutEffect(() => {
    if (!opened || !containerRef.current) return;
    if (ui) {
      const root = ui.mountRoot(pluginId, target.surfaceId, target, containerRef.current, mountPointId, routeContext);
      uiRootRef.current = root;
      const update = () => { const execution = root.execution; setPresentation(execution.phase === 'failed' ? { state: 'ERROR', stage: execution.stage } : { state: execution.phase === 'ready' ? 'MOUNTED' : 'MOUNTING' }); };
      update(); const stop = ui.core.subscribe(update);
      return () => { stop(); root.dispose(); uiRootRef.current = undefined; };
    }
    let current = true;
    const abort = new AbortController();
    const container = containerRef.current;
    const cleanups = cleanupByAdapter.get(adapter) ?? new Map<string, Promise<void>>();
    cleanupByAdapter.set(adapter, cleanups);
    const previous = cleanups.get(mountPointId) ?? Promise.resolve();
    setPresentation({ state: 'MOUNTING' });
    const task = previous.then(async () => {
      if (!current) return;
      const mounting = adapter.mount({ pluginId, surfaceId: target.surfaceId, mountPointId, container,
        layout: target.layout, initialParameters: target.initialParameters,
        routeContext: contextKey ? JSON.parse(contextKey) as RouteContext : undefined, signal: abort.signal });
      instanceRef.current = adapter.listInstances().find(i => i.identity.mountPointId === mountPointId)?.identity.surfaceInstanceId;
      try {
        const mounted = await mounting;
        if (!current) { await mounted.unmount(); return; }
        setPresentation({ state: 'MOUNTED' });
      } catch {
        if (!current) return;
        const record = instanceRef.current ? adapter.getInstance(instanceRef.current) : undefined;
        setPresentation({ state: 'ERROR', stage: record?.state.state === 'FAILED' ? record.state.stage : undefined });
      }
    }).catch(() => { if (current) setPresentation({ state: 'ERROR' }); });
    return () => {
      current = false;
      abort.abort();
      const owned = adapter.listInstances().filter(i => i.identity.mountPointId === mountPointId);
      instanceRef.current = undefined;
      const cleanup = Promise.all([previous, task, ...owned.map(i => adapter.unmount(i.identity.surfaceInstanceId))]).then(() => undefined).catch(() => undefined);
      cleanups.set(mountPointId, cleanup);
      void cleanup.then(() => { if (cleanups.get(mountPointId) === cleanup) cleanups.delete(mountPointId); });
    };
  }, [adapter, ui, pluginId, mountPointId, opened, attempt, contextKey, targetKey]);

  useEffect(() => {
    if (failure && uiRootRef.current?.execution.phase === 'failed') setPresentation({ state: 'ERROR', stage: failure.stage });
    if (failure && failure.surfaceInstanceId === instanceRef.current) setPresentation({ state: 'ERROR', stage: failure.stage });
  }, [failure]);

  const state = opened ? presentation.state : 'UNMOUNTED';
  return <section aria-label={label}>
    <p>{label}: <strong data-testid={`${testId}-state`}>{state}</strong></p>
    {opened && presentation.state === 'MOUNTING' && <p role="status">Loading {label}…</p>}
    {opened && presentation.state === 'ERROR' && <p role="alert">Surface failed{presentation.stage && <> at <span data-testid={testId === 'surface' ? 'failure-stage' : `${testId}-failure-stage`}>{presentation.stage}</span></>}.</p>}
    {opened && presentation.state === 'ERROR' && <button onClick={() => { if (uiRootRef.current) uiRootRef.current.retry(); else setAttempt(n => n + 1); }}>Retry {label}</button>}
    {!autoMount && <button onClick={() => setOpened(value => !value)}>{opened ? 'Close' : 'Open'} {label}</button>}
    <div data-testid={`${testId}-container`} ref={containerRef} style={{ marginTop: 24 }} />
  </section>;
}
