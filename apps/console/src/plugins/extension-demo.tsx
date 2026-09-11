import { extensionDemoDescriptor, extensionDemoRoutes, extensionDemoNavigation, extensionDemoExtensions } from './extension-demo-data';
import { useState } from 'react';
import { useRouteContext, useSurfaceContext } from '@nexus/plugin-runtime/react';
import type { PluginDefinition, JsonValue } from '@nexus/plugin-runtime';
import { CONSOLE_EXTENSION_POINT_CATALOG,  } from '@nexus/console-core-api';
import { CLUSTER_EXTENSION_POINT_CATALOG,  } from '@nexus/cluster-api';

const pointCatalog = [...CONSOLE_EXTENSION_POINT_CATALOG, ...CLUSTER_EXTENSION_POINT_CATALOG];

function ExtensionDemoCard() {
  const [enabled, setEnabled] = useState(true);
  return <article className="extension-demo-el-article extension-demo-plugin-card extension-demo-plugin-card--accent">
    <div className="extension-demo-el-div extension-demo-plugin-card__topline"><span className="extension-demo-el-span extension-demo-kicker">BUILTIN PLUGIN</span><span className="extension-demo-el-span extension-demo-status-chip extension-demo-status-chip--success">ACTIVE</span></div>
    <h3 className="extension-demo-el-h3">Extension Demo</h3>
    <p className="extension-demo-el-p">One plugin, several host-owned extension points. Each surface is mounted only when its placement needs it.</p>
    <div className="extension-demo-el-div extension-demo-plugin-card__facts"><span className="extension-demo-el-span">surface</span><span className="extension-demo-el-span">typed contract</span><span className="extension-demo-el-span">lazy mount</span></div>
    <button className="extension-demo-el-button extension-demo-button extension-demo-button--secondary" onClick={() => setEnabled(value => !value)}>{enabled ? 'Enabled' : 'Enable'} demo signal</button>
  </article>;
}

function ExtensionDemoSettings() {
  const [mode, setMode] = useState<'safe' | 'fast'>('safe');
  return <article className="extension-demo-el-article extension-demo-settings-card">
    <div className="extension-demo-el-div extension-demo-settings-card__heading"><div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kicker">EXTENSION DEMO</span><h3 className="extension-demo-el-h3">Demo preferences</h3></div><span className="extension-demo-el-span extension-demo-status-chip">PLUGIN OWNED</span></div>
    <p className="extension-demo-el-p">This bounded section is contributed by a plugin to the host Settings page.</p>
    <div className="extension-demo-el-div extension-demo-segmented-control" role="group" aria-label="Demo mode">
      <button className={"extension-demo-el-button " + (mode === 'safe' ? 'extension-demo-is-active' : '')} onClick={() => setMode('safe')}>Safe mode</button>
      <button className={"extension-demo-el-button " + (mode === 'fast' ? 'extension-demo-is-active' : '')} onClick={() => setMode('fast')}>Fast mode</button>
    </div>
    <small className="extension-demo-el-small">Current mode: {mode}</small>
  </article>;
}

function NodeHealthTab() {
  const context = useSurfaceContext();
  const route = useRouteContext();
  const itemRef = context?.value && typeof context.value === 'object' && !Array.isArray(context.value) && 'itemRef' in context.value
    ? context.value.itemRef
    : undefined;
  return <article className="extension-demo-el-article extension-demo-node-health">
    <div className="extension-demo-el-div extension-demo-node-health__status"><span className="extension-demo-el-span extension-demo-health-dot" />Healthy</div>
    <h3 className="extension-demo-el-h3">Node health checks</h3>
    <p className="extension-demo-el-p">Demo tab mounted for <code className="extension-demo-el-code">{route.params.node ?? 'node'}</code> through the typed ResourceRef context.</p>
    <dl className="extension-demo-el-dl extension-demo-definition-list"><div className="extension-demo-el-div"><dt className="extension-demo-el-dt">Placement</dt><dd className="extension-demo-el-dd">cluster.node.tabs</dd></div><div className="extension-demo-el-div"><dt className="extension-demo-el-dt">Context</dt><dd className="extension-demo-el-dd">{itemRef ? 'ResourceRef accepted' : 'Waiting for context'}</dd></div></dl>
  </article>;
}

function ExtensionPointGallery() {
  const [copied, setCopied] = useState<string>();
  const copy = (value: string) => {
    setCopied(value);
    window.setTimeout(() => setCopied(current => current === value ? undefined : current), 1400);
  };
  return <div className="extension-demo-el-div extension-demo-page">
    <div className="extension-demo-el-div extension-demo-page-heading">
      <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kicker">DEVELOPER SURFACES</span><h1 className="extension-demo-el-h1">Extension points</h1><p className="extension-demo-el-p">Host-owned slots with fixed V1 contracts. Plugins only register spec-compliant contributions.</p></div>
      <span className="extension-demo-el-span extension-demo-status-chip extension-demo-status-chip--info">V1 SPEC</span>
    </div>
    <div className="extension-demo-el-div extension-demo-info-banner"><span className="extension-demo-el-span extension-demo-info-banner__icon">i</span><div className="extension-demo-el-div"><strong className="extension-demo-el-strong">How composition works</strong><p className="extension-demo-el-p">The host publishes a finite set of typed points. A plugin references a point by owner, id, and contract major; admission, policy, lifecycle, and cleanup stay with the host.</p></div></div>
    <section className="extension-demo-el-section extension-demo-section-block" aria-labelledby="point-catalog-title">
      <div className="extension-demo-el-div extension-demo-section-heading"><div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kicker">HOST CONTRACTS</span><h2 className="extension-demo-el-h2" id="point-catalog-title">Available extension points</h2></div><span className="extension-demo-el-span extension-demo-muted">{pointCatalog.length} fixed points</span></div>
      <div className="extension-demo-el-div extension-demo-point-grid">{pointCatalog.map(point => {
        const key = `${point.ref.ownerPluginId}/${point.ref.id}`;
        return <button className="extension-demo-el-button extension-demo-point-card" key={key} onClick={() => copy(key)} aria-label={`Copy ${key}`}>
          <div className="extension-demo-el-div extension-demo-point-card__header"><span className={"extension-demo-el-span " + (`extension-demo-kind extension-demo-kind--${point.kind}`)}>{point.kind}</span><span className="extension-demo-el-span extension-demo-point-card__copy">{copied === key ? 'Copied' : 'Copy ref'}</span></div>
          <h3 className="extension-demo-el-h3">{point.title}</h3><p className="extension-demo-el-p">{point.description}</p><code className="extension-demo-el-code">{key}@{point.ref.contractMajor}</code>
        </button>;
      })}</div>
    </section>
    <section className="extension-demo-el-section extension-demo-section-block" aria-labelledby="registration-title">
      <div className="extension-demo-el-div extension-demo-section-heading"><div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kicker">PLUGIN REGISTRATION</span><h2 className="extension-demo-el-h2" id="registration-title">Extension Demo contributions</h2></div><span className="extension-demo-el-span extension-demo-status-chip extension-demo-status-chip--success">6 examples</span></div>
      <div className="extension-demo-el-div extension-demo-registration-list">
        <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kind extension-demo-kind--route">route</span><strong className="extension-demo-el-strong">/extensions</strong><span className="extension-demo-el-span">registered to Console Routes</span></div>
        <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kind extension-demo-kind--navigation">navigation</span><strong className="extension-demo-el-strong">Extension points</strong><span className="extension-demo-el-span">registered to Primary navigation</span></div>
        <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kind extension-demo-kind--surface">surface</span><strong className="extension-demo-el-strong">Extension Demo card</strong><span className="extension-demo-el-span">registered to Home cards</span></div>
        <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kind extension-demo-kind--surface">surface</span><strong className="extension-demo-el-strong">Demo preferences</strong><span className="extension-demo-el-span">registered to Settings sections</span></div>
        <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kind extension-demo-kind--action">action</span><strong className="extension-demo-el-strong">Node health check</strong><span className="extension-demo-el-span">registered to Node actions</span></div>
        <div className="extension-demo-el-div"><span className="extension-demo-el-span extension-demo-kind extension-demo-kind--tab">tab</span><strong className="extension-demo-el-strong">Health</strong><span className="extension-demo-el-span">registered to Node tabs</span></div>
      </div>
    </section>
  </div>;
}

export const extensionDemo: PluginDefinition = {
  ...extensionDemoDescriptor,
  activate({ contributions, actions }) {
    actions.register('node-health-check', async ({ context }) => ({ state: 'healthy', checkedBy: 'extension-demo', context } as unknown as JsonValue));
    actions.register('plugin-contract-check', async ({ context }) => ({ state: 'registered', context } as unknown as JsonValue));

    contributions.registerSurface({ id: 'extension-demo-card', target: { kind: 'builtin', render: ExtensionDemoCard } });
    contributions.registerSurface({ id: 'extension-demo-settings', target: { kind: 'builtin', render: ExtensionDemoSettings } });
    contributions.registerSurface({ id: 'extension-demo-node-health', target: { kind: 'builtin', render: NodeHealthTab } });

    contributions.registerRoute({ ...extensionDemoRoutes['extension-demo-route'], target: { kind: 'builtin', render: ExtensionPointGallery } });
    contributions.registerNavigation(extensionDemoNavigation['extension-demo-navigation']);
    contributions.registerExtension(extensionDemoExtensions['extension-demo-home-card']);
    contributions.registerExtension(extensionDemoExtensions['extension-demo-settings-section']);
    contributions.registerExtension(extensionDemoExtensions['extension-demo-plugin-action']);
    contributions.registerExtension(extensionDemoExtensions['extension-demo-node-action']);
    contributions.registerExtension(extensionDemoExtensions['extension-demo-node-health-tab']);
  },
};
