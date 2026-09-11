// Throwaway gate probe, not a production plugin template.
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as sdk from '@nexus/plugin-runtime/react';
import type { PluginDefinition } from '@nexus/plugin-runtime';
import classes, { css as mainCss } from './main.module.css?artifact';
import { css as lazyCss } from './lazy.module.css?artifact';

export const css = [...mainCss, ...lazyCss];
export const identities = {
  useState: React.useState, jsx: jsx.jsx, UiProvider: sdk.UiProvider,
  useUiClient: sdk.useUiClient, RoutePresentationProvider: sdk.RoutePresentationProvider,
  RouteLinkProvider: sdk.RouteLinkProvider,
};
export const loadLazy = () => import('./lazy');
const LazyView = React.lazy(() => loadLazy().then(module => ({ default: module.LazyView })));
// Existing declaration freezing expects a function target; keep React's mutable lazy object inside it.
function LazySurface() { return <LazyView />; }

function View() {
  const client = sdk.useUiClient();
  const route = sdk.useRouteContext();
  const [count, setCount] = React.useState(0);
  return <section className={classes.card} data-probe="main">
    <span data-client>{typeof client.mountSlot}</span>
    <span data-route>{route.params.id}</span>
    <sdk.RouteLink routeId="poc-route" params={{ id: 'linked' }}>Host link</sdk.RouteLink>
    <sdk.RouteOutlet />
    <button data-counter onClick={() => setCount(value => value + 1)}>{count}</button>
  </section>;
}

export const plugin: PluginDefinition = {
  id: 'mf-poc', version: '1.0.0', requires: [], provides: [],
  activate({ contributions }) {
    contributions.registerSurface({ id: 'main', target: { kind: 'builtin', render: View } });
    contributions.registerSurface({ id: 'lazy', target: { kind: 'builtin', render: LazySurface } });
  },
};
