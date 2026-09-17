import { useLayoutEffect, useRef, useState } from 'react';
import { useHostServices } from './HostContext.js';
import type { UiHost } from '@feforgejs/plugin-runtime/browser';
import type { RouteContext, SandboxRenderTarget } from '@feforgejs/plugin-runtime';

type Presentation = { state: 'MOUNTING' | 'MOUNTED' } | { state: 'ERROR'; stage?: string };

export function SurfaceMount({
  pluginId,
  target,
  mountPointId,
  label,
  testId,
  routeContext,
  onFailure,
  autoMount = false,
}: {
  readonly pluginId: string;
  readonly target: SandboxRenderTarget;
  readonly mountPointId: string;
  readonly label: string;
  readonly testId: string;
  readonly routeContext?: RouteContext;
  readonly autoMount?: boolean;
  readonly onFailure?: () => void;
}) {
  const { ui } = useHostServices();
  const failed = useRef(onFailure);
  failed.current = onFailure;
  const uiRootRef = useRef<ReturnType<UiHost['mountRoot']> | undefined>(undefined);
  const [opened, setOpened] = useState(autoMount);
  const [presentation, setPresentation] = useState<Presentation>({ state: 'MOUNTING' });
  const containerRef = useRef<HTMLDivElement>(null);
  // Canonical value keys: ordinary renders and hash changes do not restart a Surface.
  const contextKey =
    routeContext === undefined
      ? ''
      : JSON.stringify({
          ...routeContext,
          params: Object.fromEntries(
            Object.entries(routeContext.params).sort(([a], [b]) => a.localeCompare(b)),
          ),
        });
  const targetKey = JSON.stringify(target);

  useLayoutEffect(() => {
    if (!opened || !containerRef.current) return;
    const root = ui.mountRoot(
      pluginId,
      target.surfaceId,
      target,
      containerRef.current,
      mountPointId,
      routeContext,
    );
    uiRootRef.current = root;
    const update = () => {
      const execution = root.execution;
      if (execution.phase === 'failed') failed.current?.();
      setPresentation(
        execution.phase === 'failed'
          ? { state: 'ERROR', stage: execution.stage }
          : { state: execution.phase === 'ready' ? 'MOUNTED' : 'MOUNTING' },
      );
    };
    update();
    const stop = ui.core.subscribe(update);
    return () => {
      stop();
      root.dispose();
      uiRootRef.current = undefined;
    };
  }, [ui, pluginId, mountPointId, opened, contextKey, targetKey]);

  const state = opened ? presentation.state : 'UNMOUNTED';
  return (
    <section aria-label={label}>
      <p>
        {label}: <strong data-testid={`${testId}-state`}>{state}</strong>
      </p>
      {opened && presentation.state === 'MOUNTING' && <p role="status">Loading {label}…</p>}
      {opened && presentation.state === 'ERROR' && (
        <p role="alert">
          Surface failed
          {presentation.stage && (
            <>
              {' '}
              at{' '}
              <span
                data-testid={testId === 'surface' ? 'failure-stage' : `${testId}-failure-stage`}
              >
                {presentation.stage}
              </span>
            </>
          )}
          .
        </p>
      )}
      {opened && presentation.state === 'ERROR' && (
        <button
          onClick={() => {
            uiRootRef.current?.retry();
          }}
        >
          Retry {label}
        </button>
      )}
      {!autoMount && (
        <button onClick={() => setOpened((value) => !value)}>
          {opened ? 'Close' : 'Open'} {label}
        </button>
      )}
      <div data-testid={`${testId}-container`} ref={containerRef} style={{ marginTop: 24 }} />
    </section>
  );
}
