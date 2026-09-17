import { SurfaceBoundary } from './SurfaceBoundary.js';
import { useLayoutEffect, type ComponentType } from 'react';
import { renderInTree } from './ManagedBuiltin.js';
import { createRoot } from 'react-dom/client';
import { UiProvider } from '@feforgejs/plugin-runtime/react';
import type { UiClient } from '@feforgejs/plugin-runtime/client';
import type { UiMounted } from '@feforgejs/plugin-runtime';

/** A Builtin Surface enters ready after React commits and uses the same failure core. */
export function renderBuiltinUi(
  render: unknown,
  container: HTMLElement,
  client: UiClient,
  fail: (error: unknown) => void,
): Promise<UiMounted> {
  const tree = renderInTree(render, container, client, fail);
  if (tree) return tree;
  const root = createRoot(container);
  const View = render as ComponentType;
  return new Promise((resolve) => {
    const mounted: UiMounted = {
      async dispose() {
        await Promise.resolve();
        root.unmount();
      },
    };
    function Committed() {
      useLayoutEffect(() => {
        resolve(mounted);
      }, []);
      return (
        <SurfaceBoundary fail={fail}>
          <UiProvider client={client}>
            <View />
          </UiProvider>
        </SurfaceBoundary>
      );
    }
    root.render(<Committed />);
  });
}
