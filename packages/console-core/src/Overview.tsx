import { useEffect, useState } from 'react';
import { Slot, useCapabilitySubscription, useUiObservation } from '@nexus/plugin-runtime/react';
import type { ContributionRef, PluginSummary } from '@nexus/plugin-runtime';
import { CONSOLE_EXTENSION_POINT_CATALOG, HOME_CARDS_POINT } from '@nexus/console-core-api';
import { PluginConfiguration } from './PluginConfiguration';
import { RuntimeInspector } from './RuntimeInspector';

export function Overview() {
  const { value: plugins } = useCapabilitySubscription<readonly PluginSummary[]>('plugins.query@1', 'watch');
  const activePlugins = plugins?.filter(plugin => plugin.state === 'ACTIVE').length ?? 0;
  return <div className="nexus-page">
    <div className="nexus-page-heading">
      <div><span className="nexus-kicker">NEXUS CONSOLE</span><h1>Frontend Plugin Runtime</h1><p>Composable operations workspace powered by typed, host-owned extension points.</p></div>
      <div className="nexus-page-heading__meta"><span className="nexus-status-chip nexus-status-chip--success"><span className="nexus-health-dot" />Operational</span><small>cooperative isolation</small></div>
    </div>
    <section className="nexus-metric-grid" aria-label="Runtime summary"><div className="nexus-metric-card"><span className="nexus-metric-card__label">ACTIVE PLUGINS</span><strong>{activePlugins}</strong><small>Built-in and installed</small></div><div className="nexus-metric-card"><span className="nexus-metric-card__label">CORE POINTS</span><strong>{CONSOLE_EXTENSION_POINT_CATALOG.length}</strong><small>Fixed V1 contracts</small></div><div className="nexus-metric-card"><span className="nexus-metric-card__label">RUNTIME MODE</span><strong>READY</strong><small>Managed execution</small></div></section>
    <section className="nexus-info-banner nexus-info-banner--subtle"><span className="nexus-info-banner__icon">✦</span><div><strong>Build with the host contract</strong><p>The host owns placement and lifecycle. Plugins bring the feature surface and register against a declared point.</p></div><span className="nexus-info-banner__tag">{CONSOLE_EXTENSION_POINT_CATALOG.length} core points</span></section>
    <section className="nexus-section-block" aria-label="Home cards"><div className="nexus-section-heading"><div><span className="nexus-kicker">LIVE COMPOSITION</span><h2>Dashboard extensions</h2></div><span className="nexus-muted">Select a card to mount its surface</span></div><HomeCards /></section>
    <PluginConfiguration />
    <RuntimeInspector />
  </div>;
}
function HomeCards() {
  const observation = useUiObservation();
  const occurrence = observation?.occurrences.find(o => o.pointId === HOME_CARDS_POINT.id);
  const [selected, setSelected] = useState<readonly ContributionRef[]>([]);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (initialized || !occurrence) return;
    setSelected(occurrence.contributions.filter(c => c.availability === 'available' && c.initiallySelected !== false).map(c => c.ref));
    setInitialized(true);
  }, [occurrence, initialized]);
  return <div data-testid="extension-container" className="nexus-home-card-list"><Slot id={HOME_CARDS_POINT.id} contextKey="home" context={{}} selected={selected}
    feedback={(state, retry, error) => <>
      {error && <p role="alert">{error}</p>}
      <div className="nexus-placement-list">{state?.contributions.map(contribution => {
        const opened = selected.some(ref => ref.ownerPluginId === contribution.ref.ownerPluginId && ref.id === contribution.ref.id);
        const label = contribution.label ?? contribution.ref.id;
        const execution = contribution.execution;
        return <div className="nexus-placement-row" key={`${contribution.ref.ownerPluginId}/${contribution.ref.id}`}>
          <div className="nexus-placement-row__copy"><span className="nexus-kind nexus-kind--surface">surface</span><strong>{label}</strong><small>{contribution.ref.ownerPluginId} · {contribution.availability === 'available' ? 'Available' : contribution.reason ?? 'Unavailable'}</small></div>
          <div className="nexus-placement-row__actions"><span data-testid={`extension-state-${contribution.ref.ownerPluginId}`} className={`nexus-status-chip ${opened && execution?.phase === 'ready' ? 'nexus-status-chip--success' : ''}`}><span className="nexus-health-dot" />{!opened ? 'UNMOUNTED' : execution?.phase === 'ready' ? 'MOUNTED' : execution?.phase === 'failed' ? 'ERROR' : 'MOUNTING'}</span><button className="nexus-button nexus-button--secondary" disabled={!initialized || contribution.availability !== 'available'} onClick={() => setSelected(values => opened ? values.filter(ref => ref.ownerPluginId !== contribution.ref.ownerPluginId || ref.id !== contribution.ref.id) : [...values, contribution.ref])}>{opened ? 'Close' : 'Open'} {label}</button></div>
          {execution?.retryTarget && <button onClick={() => { void retry(execution.retryTarget!).catch(() => undefined); }}>Retry {label}</button>}
        </div>;
      })}</div>
    </>} /></div>;
}
