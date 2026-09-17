import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { connectUiHost } from '@feforgejs/plugin-runtime/client';
import { UiProvider } from '@feforgejs/plugin-runtime/react';
export function surfaceId() {
  return (window as Window & { $wujie?: { props?: { surface?: { id?: string } } } }).$wujie?.props
    ?.surface?.id;
}
export function mount(element: ReactNode) {
  void connectUiHost()
    .then((client) => {
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <UiProvider client={client}>
            <div
              data-nexus-surface-content
              style={{
                padding: 12,
                border: '1px solid #cdd5e1',
                boxSizing: 'border-box',
                fontFamily: 'sans-serif',
              }}
            >
              {element}
            </div>
          </UiProvider>
        </StrictMode>,
      );
    })
    .catch((error) => {
      document.getElementById('root')!.textContent = error.message;
    });
}
