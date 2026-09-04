import { useEffect, useRef, useState } from 'react';
import type { SandboxRenderTarget } from '@nexus/plugin-runtime';
import type { MountedSurface, SurfaceMountIssue, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';

interface MountAttempt {
  readonly abort: AbortController;
  promise?: Promise<MountedSurface>;
}

export function SurfaceMount({ adapter, pluginId, target, mountPointId, label, testId, failure }: {
  readonly adapter: WujiePluginAdapter;
  readonly pluginId: string;
  readonly target: SandboxRenderTarget;
  readonly mountPointId: string;
  readonly label: string;
  readonly testId: string;
  readonly failure?: SurfaceMountIssue;
}) {
  const [state, setState] = useState('UNMOUNTED');
  const [failureStage, setFailureStage] = useState('');
  const [closing, setClosing] = useState(false);
  const attemptRef = useRef<MountAttempt | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const unmountOwnedInstances = () => Promise.all(adapter.listInstances()
    .filter(instance => instance.identity.mountPointId === mountPointId)
    .map(instance => adapter.unmount(instance.identity.surfaceInstanceId)));

  useEffect(() => () => {
    attemptRef.current?.abort.abort();
    attemptRef.current = undefined;
    void unmountOwnedInstances().catch(() => undefined);
  }, [adapter, mountPointId]);

  useEffect(() => {
    if (failure && attemptRef.current && !attemptRef.current.abort.signal.aborted && adapter.getInstance(failure.surfaceInstanceId)) {
      setFailureStage(failure.stage);
      setState('FAILED');
    }
  }, [adapter, failure]);

  const mount = async (): Promise<void> => {
    if (!containerRef.current || attemptRef.current) return;
    const attempt: MountAttempt = { abort: new AbortController() };
    attemptRef.current = attempt;
    setState('MOUNTING');
    setFailureStage('');
    attempt.promise = adapter.mount({
      pluginId, surfaceId: target.surfaceId, mountPointId, container: containerRef.current,
      layout: target.layout, initialParameters: target.initialParameters, signal: attempt.abort.signal,
    });
    try {
      const mounted = await attempt.promise;
      if (attemptRef.current !== attempt || attempt.abort.signal.aborted) { await mounted.unmount(); return; }
      setState('MOUNTED');
    } catch {
      if (attemptRef.current !== attempt || attempt.abort.signal.aborted) return;
      const instance = adapter.listInstances().find(instance => instance.identity.mountPointId === mountPointId);
      if (instance?.state.state === 'FAILED') setFailureStage(instance.state.stage);
      setState('FAILED');
    }
  };

  const unmount = async (): Promise<void> => {
    const attempt = attemptRef.current;
    if (!attempt) return;
    setClosing(true);
    attempt.abort.abort();
    try {
      await unmountOwnedInstances();
      await attempt.promise?.catch(() => undefined);
    } finally {
      if (attemptRef.current === attempt) {
        attemptRef.current = undefined;
        setState('UNMOUNTED'); setFailureStage(''); setClosing(false);
      }
    }
  };

  return <section>
    <p>{label}: <strong data-testid={`${testId}-state`}>{state}</strong></p>
    {failureStage && <p role="alert">Surface failed at <span data-testid={testId === 'surface' ? 'failure-stage' : `${testId}-failure-stage`}>{failureStage}</span>.</p>}
    {state === 'UNMOUNTED'
      ? <button onClick={mount}>Open {label}</button>
      : <button disabled={closing} onClick={unmount}>Close {label}</button>}
    <div data-testid={`${testId}-container`} ref={containerRef} style={{ marginTop: 24 }} />
  </section>;
}
