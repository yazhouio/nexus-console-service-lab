import { extensionDemoDescriptor, extensionDemoRoutes, extensionDemoNavigation, extensionDemoExtensions } from './extension-demo-data';
import { useState } from 'react';
import { useRouteContext, useSurfaceContext } from '@nexus/plugin-runtime/react';
import type { PluginDefinition, JsonValue } from '@nexus/plugin-runtime';
import { CONSOLE_EXTENSION_POINT_CATALOG,  } from '@nexus/console-core-api';
import { CLUSTER_EXTENSION_POINT_CATALOG,  } from '@nexus/cluster-api';

const pointCatalog = [...CONSOLE_EXTENSION_POINT_CATALOG, ...CLUSTER_EXTENSION_POINT_CATALOG];

function ExtensionDemoCard() {
  const [enabled, setEnabled] = useState(true);
  return <article className="nexus-plugin-card nexus-plugin-card--accent">
    <div className="nexus-plugin-card__topline"><span className="nexus-kicker">BUILTIN PLUGIN</span><span className="nexus-status-chip nexus-status-chip--success">ACTIVE</span></div>
    <h3>Extension Demo</h3>
    <p>One plugin, several host-owned extension points. Each surface is mounted only when its placement needs it.</p>
    <div className="nexus-plugin-card__facts"><span>surface</span><span>typed contract</span><span>lazy mount</span></div>
    <button className="nexus-button nexus-button--secondary" onClick={() => setEnabled(value => !value)}>{enabled ? 'Enabled' : 'Enable'} demo signal</button>
  </article>;
}

function ExtensionDemoSettings() {
  const [mode, setMode] = useState<'safe' | 'fast'>('safe');
  return <article className="nexus-settings-card">
    <div className="nexus-settings-card__heading"><div><span className="nexus-kicker">EXTENSION DEMO</span><h3>Demo preferences</h3></div><span className="nexus-status-chip">PLUGIN OWNED</span></div>
    <p>This bounded section is contributed by a plugin to the host Settings page.</p>
    <div className="nexus-segmented-control" role="group" aria-label="Demo mode">
      <button className={mode === 'safe' ? 'is-active' : ''} onClick={() => setMode('safe')}>Safe mode</button>
      <button className={mode === 'fast' ? 'is-active' : ''} onClick={() => setMode('fast')}>Fast mode</button>
    </div>
    <small>Current mode: {mode}</small>
  </article>;
}

function NodeHealthTab() {
  const context = useSurfaceContext();
  const route = useRouteContext();
  const itemRef = context?.value && typeof context.value === 'object' && !Array.isArray(context.value) && 'itemRef' in context.value
    ? context.value.itemRef
    : undefined;
  return <article className="nexus-node-health">
    <div className="nexus-node-health__status"><span className="nexus-health-dot" />Healthy</div>
    <h3>Node health checks</h3>
    <p>Demo tab mounted for <code>{route.params.node ?? 'node'}</code> through the typed ResourceRef context.</p>
    <dl className="nexus-definition-list"><div><dt>Placement</dt><dd>cluster.node.tabs</dd></div><div><dt>Context</dt><dd>{itemRef ? 'ResourceRef accepted' : 'Waiting for context'}</dd></div></dl>
  </article>;
}

function ExtensionPointGallery() {
  const [copied, setCopied] = useState<string>();
  const copy = (value: string) => {
    setCopied(value);
    window.setTimeout(() => setCopied(current => current === value ? undefined : current), 1400);
  };
  return <div className="nexus-page">
    <div className="nexus-page-heading">
      <div><span className="nexus-kicker">DEVELOPER SURFACES</span><h1>Extension points</h1><p>Host-owned slots with fixed V1 contracts. Plugins only register spec-compliant contributions.</p></div>
      <span className="nexus-status-chip nexus-status-chip--info">V1 SPEC</span>
    </div>
    <div className="nexus-info-banner"><span className="nexus-info-banner__icon">i</span><div><strong>How composition works</strong><p>The host publishes a finite set of typed points. A plugin references a point by owner, id, and contract major; admission, policy, lifecycle, and cleanup stay with the host.</p></div></div>
    <section className="nexus-section-block" aria-labelledby="point-catalog-title">
      <div className="nexus-section-heading"><div><span className="nexus-kicker">HOST CONTRACTS</span><h2 id="point-catalog-title">Available extension points</h2></div><span className="nexus-muted">{pointCatalog.length} fixed points</span></div>
      <div className="nexus-point-grid">{pointCatalog.map(point => {
        const key = `${point.ref.ownerPluginId}/${point.ref.id}`;
        return <button className="nexus-point-card" key={key} onClick={() => copy(key)} aria-label={`Copy ${key}`}>
          <div className="nexus-point-card__header"><span className={`nexus-kind nexus-kind--${point.kind}`}>{point.kind}</span><span className="nexus-point-card__copy">{copied === key ? 'Copied' : 'Copy ref'}</span></div>
          <h3>{point.title}</h3><p>{point.description}</p><code>{key}@{point.ref.contractMajor}</code>
        </button>;
      })}</div>
    </section>
    <section className="nexus-section-block" aria-labelledby="registration-title">
      <div className="nexus-section-heading"><div><span className="nexus-kicker">PLUGIN REGISTRATION</span><h2 id="registration-title">Extension Demo contributions</h2></div><span className="nexus-status-chip nexus-status-chip--success">6 examples</span></div>
      <div className="nexus-registration-list">
        <div><span className="nexus-kind nexus-kind--route">route</span><strong>/extensions</strong><span>registered to Console Routes</span></div>
        <div><span className="nexus-kind nexus-kind--navigation">navigation</span><strong>Extension points</strong><span>registered to Primary navigation</span></div>
        <div><span className="nexus-kind nexus-kind--surface">surface</span><strong>Extension Demo card</strong><span>registered to Home cards</span></div>
        <div><span className="nexus-kind nexus-kind--surface">surface</span><strong>Demo preferences</strong><span>registered to Settings sections</span></div>
        <div><span className="nexus-kind nexus-kind--action">action</span><strong>Node health check</strong><span>registered to Node actions</span></div>
        <div><span className="nexus-kind nexus-kind--tab">tab</span><strong>Health</strong><span>registered to Node tabs</span></div>
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
