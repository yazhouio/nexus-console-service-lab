import { Component, useLayoutEffect, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { UiProvider } from '@nexus/plugin-runtime/react';
import type { UiClient } from '@nexus/plugin-runtime/client';
import type { UiMounted } from '@nexus/plugin-runtime';

class SurfaceBoundary extends Component<{ children: ReactNode; fail(error: unknown): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.fail(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** A Builtin Surface enters ready after React commits and uses the same failure core. */
export function renderBuiltinUi(render: unknown, container: HTMLElement, client: UiClient, fail: (error: unknown) => void): Promise<UiMounted> {
  const root = createRoot(container);
  const View = render as ComponentType;
  return new Promise(resolve => {
    const mounted: UiMounted = { async dispose() { await Promise.resolve(); root.unmount(); } };
    function Committed() {
      useLayoutEffect(() => { resolve(mounted); }, []);
      return <SurfaceBoundary fail={fail}><UiProvider client={client}><View /></UiProvider></SurfaceBoundary>;
    }
    root.render(<Committed />);
  });
}
