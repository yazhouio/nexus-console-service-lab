import { useEffect, useRef, useState } from 'react';
import type { OwnedContribution, RouteContribution } from '@nexus/plugin-runtime';
import type { MountedSurface, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';

import { runtimePromise } from './runtime';

const pageStyle = {
  maxWidth: 880, margin: '0 auto', padding: '64px 24px',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#172033',
} as const;

interface MountAttempt {
  readonly abort: AbortController;
  promise: Promise<MountedSurface> | undefined;
}

export function App() {
  const [runtimeStatus, setRuntimeStatus] = useState('BOOTSTRAPPING');
  const [pluginStatus, setPluginStatus] = useState('PENDING');
  const [surfaceState, setSurfaceState] = useState('UNMOUNTED');
  const [failureStage, setFailureStage] = useState('');
  const [closing, setClosing] = useState(false);
  const adapterRef = useRef<WujiePluginAdapter | undefined>(undefined);
  const routeRef = useRef<OwnedContribution<RouteContribution> | undefined>(undefined);
  const attemptRef = useRef<MountAttempt | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    void Promise.all([runtimePromise, import('@nexus/plugin-runtime/browser')]).then(
      ([runtime, browserRuntime]) => {
        if (disposed) return;
        routeRef.current = runtime.contributions.listRoutes().find(route =>
          route.ownerPluginId === 'kubeeye' && route.contribution.target.kind === 'sandbox-surface',
        );
        adapterRef.current = browserRuntime.createWujiePluginAdapter({
          runtime,
          onSurfaceError(error) {
            if (disposed || attemptRef.current?.abort.signal.aborted) return;
            setFailureStage(error.issue.stage);
            setSurfaceState('FAILED');
          },
        });
        setPluginStatus(runtime.plugins.get('kubeeye')?.state ?? 'MISSING');
        setRuntimeStatus(`READY · ${runtime.contributions.listRoutes().length} routes`);
      },
      () => { if (!disposed) setRuntimeStatus('FAILED'); },
    );
    return () => {
      disposed = true;
      attemptRef.current?.abort.abort();
      attemptRef.current = undefined;
      const adapter = adapterRef.current;
      for (const instance of adapter?.listInstances() ?? []) {
        void adapter?.unmount(instance.identity.surfaceInstanceId).catch(() => undefined);
      }
    };
  }, []);

  const mountSurface = async (): Promise<void> => {
    const adapter = adapterRef.current;
    const route = routeRef.current;
    const container = containerRef.current;
    if (!adapter || !route || !container || route.contribution.target.kind !== 'sandbox-surface' || attemptRef.current) return;
    const attempt: MountAttempt = { abort: new AbortController(), promise: undefined };
    attemptRef.current = attempt;
    setSurfaceState('MOUNTING');
    setFailureStage('');
    attempt.promise = adapter.mount({
      pluginId: route.ownerPluginId,
      surfaceId: route.contribution.target.surfaceId,
      mountPointId: `route:${route.contribution.id}`,
      container,
      layout: route.contribution.target.layout,
      initialParameters: route.contribution.target.initialParameters,
      signal: attempt.abort.signal,
    });
    try {
      const mounted = await attempt.promise;
      if (attemptRef.current !== attempt || attempt.abort.signal.aborted) {
        await mounted.unmount();
        return;
      }
      setSurfaceState('MOUNTED');
    } catch {
      if (attemptRef.current !== attempt || attempt.abort.signal.aborted) return;
      const failed = adapter.listInstances().find(instance => instance.state.state === 'FAILED');
      if (failed?.state.state === 'FAILED') setFailureStage(failed.state.stage);
      setSurfaceState('FAILED');
    }
  };

  const unmountSurface = async (): Promise<void> => {
    const attempt = attemptRef.current;
    const adapter = adapterRef.current;
    if (!attempt || !adapter) return;
    setClosing(true);
    attempt.abort.abort();
    try {
      await Promise.all(adapter.listInstances().map(instance =>
        adapter.unmount(instance.identity.surfaceInstanceId),
      ));
      await attempt.promise?.catch(() => undefined);
    } finally {
      if (attemptRef.current === attempt) {
        attemptRef.current = undefined;
        setSurfaceState('UNMOUNTED');
        setFailureStage('');
        setClosing(false);
      }
    }
  };

  return (
    <main style={pageStyle}>
      <p>Nexus Console</p>
      <h1>Frontend Plugin Runtime</h1>
      <p>Runtime state: <strong data-testid="runtime-state">{runtimeStatus}</strong></p>
      <p>KubeEye Plugin: <strong data-testid="plugin-state">{pluginStatus}</strong></p>
      <p>Restricted Surface: <strong data-testid="surface-state">{surfaceState}</strong></p>
      {failureStage && <p role="alert">Surface failed at <span data-testid="failure-stage">{failureStage}</span>.</p>}
      <p>Isolation: cooperative-isolation — same-origin plugins can access the parent window.</p>
      {surfaceState === 'UNMOUNTED' ? (
        <button disabled={!runtimeStatus.startsWith('READY') || pluginStatus !== 'ACTIVE'} onClick={mountSurface}>
          Open KubeEye Surface
        </button>
      ) : (
        <button disabled={closing} onClick={unmountSurface}>Close KubeEye Surface</button>
      )}
      <div data-testid="surface-container" ref={containerRef} style={{ marginTop: 24 }} />
    </main>
  );
}
