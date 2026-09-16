import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { BuiltinRenderTarget, RouteContext, UiMounted } from '@nexus/plugin-runtime';
import type { UiHost } from '@nexus/plugin-runtime/browser';
import type { UiClient } from '@nexus/plugin-runtime/client';
import { useOutlet } from 'react-router';
import { UiProvider, RoutePresentationProvider } from '@nexus/plugin-runtime/react';
import { SurfaceBoundary } from './SurfaceBoundary';

interface Presentation {
  readonly id: string;
  readonly render: unknown;
  readonly client: UiClient;
  readonly fail: (error: unknown) => void;
  presented?: boolean;
  removed?: () => void;
  committed(): void;
  dispose(): void | Promise<void>;
}
const containers = new WeakMap<HTMLElement, (presentation: Presentation) => void>();

/** The driver still owns execution; this adapter commits its React view inside the Router tree. */
export function renderInTree(
  render: unknown,
  container: HTMLElement,
  client: UiClient,
  fail: (error: unknown) => void,
): Promise<UiMounted> | undefined {
  const publish = containers.get(container);
  if (!publish) return undefined;
  return new Promise((resolve) => {
    const presentation: Presentation = {
      id: crypto.randomUUID(),
      render,
      client,
      fail,
      committed: () => resolve({ dispose: () => presentation.dispose() }),
      dispose: () => undefined,
    };
    publish(presentation);
  });
}

function Committed({
  presentation,
  children,
}: {
  presentation: Presentation;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    presentation.presented = true;
    presentation.committed();
    return () => {
      presentation.presented = false;
      presentation.removed?.();
    };
  }, [presentation]);
  return children;
}

export function ManagedBuiltin({
  ui,
  ownerPluginId,
  surfaceId,
  target,
  mountPointId,
  routeContext,
  onFailure,
  outlet,
}: {
  ui: UiHost;
  ownerPluginId: string;
  surfaceId: string;
  target: BuiltinRenderTarget;
  mountPointId: string;
  routeContext?: RouteContext;
  onFailure?: () => void;
  outlet?: ReactNode;
}) {
  const nested = useOutlet();
  const container = useRef<HTMLDivElement>(null);
  const [presentation, setPresentation] = useState<Presentation>();
  const [execution, setExecution] = useState<{ scopeId: string; phase: string }>();
  const retry = useRef<() => void>(() => undefined);
  const failure = useRef(onFailure);
  failure.current = onFailure;
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let active = true;
    let current: Presentation | undefined;
    containers.set(element, (value) => {
      current = value;
      value.dispose = () => {
        value.committed();
        if (!active) return;
        return new Promise<void>((resolve) => {
          if (value.presented) value.removed = resolve;
          else resolve();
          setPresentation((previous) => (previous === value ? undefined : previous));
        });
      };
      setPresentation(value);
    });
    const root = ui.mountRoot(ownerPluginId, surfaceId, target, element, mountPointId);
    retry.current = () => {
      root.retry();
    };
    const update = () => {
      setExecution({ scopeId: root.scopeId, phase: root.execution.phase });
      if (root.execution.phase === 'failed') failure.current?.();
    };
    update();
    const stop = ui.core.subscribe(update);
    return () => {
      active = false;
      stop();
      containers.delete(element);
      current?.committed();
      root.dispose();
    };
  }, [ui, ownerPluginId, surfaceId, target, mountPointId]);
  const View = presentation?.render as ComponentType<{ routeContext?: RouteContext }> | undefined;
  return (
    <div
      ref={container}
      data-managed-presentation={mountPointId}
      data-execution-scope={execution?.scopeId}
      data-execution-phase={execution?.phase}
    >
      {execution?.phase === 'failed' && (
        <p role="alert">
          Unable to display this view. <button onClick={() => retry.current()}>Retry view</button>
        </p>
      )}
      {presentation && View && (
        <Committed key={presentation.id} presentation={presentation}>
          <SurfaceBoundary fail={presentation.fail}>
            <UiProvider client={presentation.client}>
              <RoutePresentationProvider
                context={routeContext}
                outlet={outlet === undefined ? nested : outlet}
              >
                <View routeContext={routeContext} />
              </RoutePresentationProvider>
            </UiProvider>
          </SurfaceBoundary>
        </Committed>
      )}
    </div>
  );
}
