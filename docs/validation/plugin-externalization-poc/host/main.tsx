// Minimal React adapter around UNMODIFIED public Runtime APIs. No BrowserHost changes.
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as sdk from '@nexus/plugin-runtime/react';
import { bootstrapPluginRuntime } from '@nexus/plugin-runtime';
import { createUiHost } from '@nexus/plugin-runtime/browser';
import { createInstance } from '@module-federation/enhanced/runtime';

const variant = new URLSearchParams(location.search).get('variant') ?? 'good';
const missing = new URLSearchParams(location.search).has('missing');
const shared = (version, value) => ({
  version,
  lib: () => value,
  shareConfig: { singleton: true, requiredVersion: version },
});
const mf = createInstance({
  name: 'poc_host',
  shareStrategy: 'loaded-first',
  remotes: [{ name: `poc_${variant}`, entry: `${REMOTE_ORIGIN}/${variant}/remoteEntry.js` }],
  shared: {
    react: shared('19.2.8', React),
    'react/jsx-runtime': shared('19.2.8', jsx),
    'react-dom': shared('19.2.8', ReactDOM),
    ...(!missing ? { '@nexus/plugin-runtime/react': shared('0.1.0', sdk) } : {}),
  },
});
document.body.innerHTML =
  '<p>Externalization gate probe</p><button id="host-counter">Host: 0</button><main></main>';
let clicks = 0;
document.querySelector('#host-counter').addEventListener('click', (event) => {
  event.target.textContent = `Host: ${++clicks}`;
});
let module, ui;
const mounts = new Map(),
  errors = [],
  renderEvents = [];
class Boundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error) {
    errors.push(String(error));
    this.props.fail(error);
  }
  render() {
    return this.state.error ? <span data-render-error>Render failed</span> : this.props.children;
  }
}
function renderBuiltin(View, container, client, fail) {
  renderEvents.push({
    event: 'render',
    links: document.querySelectorAll('link[data-nexus-artifact-css]').length,
  });
  const root = createRoot(container);
  return new Promise((resolve) => {
    function Committed() {
      React.useLayoutEffect(
        () =>
          resolve({
            dispose() {
              root.unmount();
            },
          }),
        [],
      );
      return (
        <Boundary fail={fail}>
          <sdk.UiProvider client={client}>
            <sdk.RoutePresentationProvider
              context={{
                routeId: 'poc-route',
                pathname: '/poc',
                search: '',
                params: { id: 'host-context' },
              }}
              outlet={<span data-outlet>Host outlet</span>}
            >
              <sdk.RouteLinkProvider
                renderLink={(props) => (
                  <a href={`/from-host/${props.params.id}`}>{props.children}</a>
                )}
              >
                <React.Suspense fallback={<span data-suspense>Loading</span>}>
                  <View />
                </React.Suspense>
              </sdk.RouteLinkProvider>
            </sdk.RoutePresentationProvider>
          </sdk.UiProvider>
        </Boundary>
      );
    }
    root.render(<Committed />);
  });
}
window.poc = {
  errors,
  renderEvents,
  async load() {
    try {
      module = await mf.loadRemote(`poc_${variant}/plugin`);
      return {
        ok: true,
        css: module.css,
        identity: {
          react: module.identities.useState === React.useState,
          jsx: module.identities.jsx === jsx.jsx,
          uiProvider: module.identities.UiProvider === sdk.UiProvider,
          uiClient: module.identities.useUiClient === sdk.useUiClient,
          routeContext:
            module.identities.RoutePresentationProvider === sdk.RoutePresentationProvider,
          routeLink: module.identities.RouteLinkProvider === sdk.RouteLinkProvider,
        },
      };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },
  async loadLazy() {
    try {
      const value = await module.loadLazy();
      return { ok: true, reactDom: value.reactDomCreatePortal === ReactDOM.createPortal };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },
  async start() {
    const runtime = await bootstrapPluginRuntime({
      builtins: [module.plugin],
      coreRootIds: ['mf-poc'],
    });
    ui = createUiHost({
      runtime,
      restrictedAdapter: {},
      policy: () => true,
      builtinCss: { [module.plugin.id]: module.css },
      renderBuiltin,
      onError(error) {
        errors.push(String(error));
      },
    });
    this.runtime = runtime;
    this.ui = ui;
  },
  mount(id, surface = 'main') {
    const container = document.createElement('div');
    container.dataset.mount = id;
    document.querySelector('main').append(container);
    const target = this.runtime.contributions
      .listUiSurfaces()
      .find((item) => item.ownerPluginId === 'mf-poc' && item.contribution.id === surface)
      .contribution.target;
    mounts.set(id, ui.mountRoot('mf-poc', surface, target, container, id));
  },
  phase(id) {
    return mounts.get(id).execution.phase;
  },
  async close(id) {
    mounts.get(id).dispose();
    await ui.core.settled();
  },
  async dispose() {
    await ui?.dispose();
  },
};
