import { useEffect, useRef, useState } from 'react';

import type {
  MountedSurface,
  WujiePluginAdapter,
} from '@nexus/plugin-runtime/browser';

import { runtimePromise } from './runtime';

const pageStyle = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '64px 24px',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  color: '#172033',
} as const;

export function App() {
  const [runtimeStatus, setRuntimeStatus] = useState('BOOTSTRAPPING');
  const [surfaceState, setSurfaceState] = useState('UNMOUNTED');
  const adapterRef = useRef<WujiePluginAdapter | undefined>(undefined);
  const mountedRef = useRef<MountedSurface | undefined>(undefined);
  const failedInstanceIdRef = useRef<string | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      runtimePromise,
      import('@nexus/plugin-runtime/browser'),
    ]).then(
      ([runtime, browserRuntime]) => {
        if (disposed) {
          return;
        }
        adapterRef.current = browserRuntime.createWujiePluginAdapter({ runtime });
        setRuntimeStatus(
          runtime.ready
            ? `READY · ${runtime.contributions.listRoutes().length} route`
            : 'FAILED',
        );
      },
      () => setRuntimeStatus('FAILED'),
    );

    return () => {
      disposed = true;
      void mountedRef.current?.unmount();
    };
  }, []);

  const mountSurface = async (): Promise<void> => {
    const adapter = adapterRef.current;
    const container = containerRef.current;
    if (adapter === undefined || container === null) {
      return;
    }

    setSurfaceState('MOUNTING');
    try {
      const mounted = await adapter.mount({
        pluginId: 'kubeeye',
        surfaceId: 'overview',
        mountPointId: 'route:kubeeye-overview',
        container,
        initialParameters: { cluster: 'demo' },
      });
      mountedRef.current = mounted;
      failedInstanceIdRef.current = undefined;
      setSurfaceState('MOUNTED');
    } catch (error) {
      failedInstanceIdRef.current =
        typeof error === 'object' &&
        error !== null &&
        'issue' in error &&
        typeof error.issue === 'object' &&
        error.issue !== null &&
        'surfaceInstanceId' in error.issue &&
        typeof error.issue.surfaceInstanceId === 'string'
          ? error.issue.surfaceInstanceId
          : undefined;
      setSurfaceState('FAILED');
    }
  };

  const unmountSurface = async (): Promise<void> => {
    if (mountedRef.current !== undefined) {
      await mountedRef.current.unmount();
    } else if (failedInstanceIdRef.current !== undefined) {
      await adapterRef.current?.unmount(failedInstanceIdRef.current);
    }
    mountedRef.current = undefined;
    failedInstanceIdRef.current = undefined;
    setSurfaceState('UNMOUNTED');
  };

  return (
    <main style={pageStyle}>
      <p>Nexus Console</p>
      <h1>Frontend Plugin Runtime</h1>
      <p>
        Runtime state: <strong>{runtimeStatus}</strong>
      </p>
      <p>
        Restricted Surface: <strong data-testid="surface-state">{surfaceState}</strong>
      </p>
      {surfaceState === 'UNMOUNTED' ? (
        <button disabled={!runtimeStatus.startsWith('READY')} onClick={mountSurface}>
          Open KubeEye Surface
        </button>
      ) : (
        <button onClick={unmountSurface}>Close KubeEye Surface</button>
      )}
      <div
        data-testid="surface-container"
        ref={containerRef}
        style={{ marginTop: 24 }}
      />
    </main>
  );
}
