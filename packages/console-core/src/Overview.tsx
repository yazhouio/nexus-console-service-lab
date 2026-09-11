import { useEffect, useState } from 'react';
import { Slot, useCapabilitySubscription, useUiObservation } from '@nexus/plugin-runtime/react';
import type { ContributionRef, PluginSummary } from '@nexus/plugin-runtime';
import { CONSOLE_EXTENSION_POINT_CATALOG, HOME_CARDS_POINT } from '@nexus/console-core-api';
import { PluginConfiguration } from './PluginConfiguration';
import { RuntimeInspector } from './RuntimeInspector';

export function Overview() {
  const { value: plugins } = useCapabilitySubscription<readonly PluginSummary[]>('plugins.query@1', 'watch');
  const activePlugins = plugins?.filter(plugin => plugin.state === 'ACTIVE').length ?? 0;
  return <div className="core-el-div core-page">
    <div className="core-el-div core-page-heading">
      <div className="core-el-div"><span className="core-el-span core-kicker">NEXUS CONSOLE</span><h1 className="core-el-h1">Frontend Plugin Runtime</h1><p className="core-el-p">Composable operations workspace powered by typed, host-owned extension points.</p></div>
      <div className="core-el-div core-page-heading__meta"><span className="core-el-span core-status-chip core-status-chip--success"><span className="core-el-span core-health-dot" />Operational</span><small className="core-el-small">cooperative isolation</small></div>
    </div>
    <section className="core-el-section core-metric-grid" aria-label="Runtime summary"><div className="core-el-div core-metric-card"><span className="core-el-span core-metric-card__label">ACTIVE PLUGINS</span><strong className="core-el-strong">{activePlugins}</strong><small className="core-el-small">Built-in and installed</small></div><div className="core-el-div core-metric-card"><span className="core-el-span core-metric-card__label">CORE POINTS</span><strong className="core-el-strong">{CONSOLE_EXTENSION_POINT_CATALOG.length}</strong><small className="core-el-small">Fixed V1 contracts</small></div><div className="core-el-div core-metric-card"><span className="core-el-span core-metric-card__label">RUNTIME MODE</span><strong className="core-el-strong">READY</strong><small className="core-el-small">Managed execution</small></div></section>
    <section className="core-el-section core-info-banner core-info-banner--subtle"><span className="core-el-span core-info-banner__icon">✦</span><div className="core-el-div"><strong className="core-el-strong">Build with the host contract</strong><p className="core-el-p">The host owns placement and lifecycle. Plugins bring the feature surface and register against a declared point.</p></div><span className="core-el-span core-info-banner__tag">{CONSOLE_EXTENSION_POINT_CATALOG.length} core points</span></section>
    <section className="core-el-section core-section-block" aria-label="Home cards"><div className="core-el-div core-section-heading"><div className="core-el-div"><span className="core-el-span core-kicker">LIVE COMPOSITION</span><h2 className="core-el-h2">Dashboard extensions</h2></div><span className="core-el-span core-muted">Select a card to mount its surface</span></div><HomeCards /></section>
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
  return <div data-testid="extension-container" className="core-el-div core-home-card-list"><Slot id={HOME_CARDS_POINT.id} contextKey="home" context={{}} selected={selected}
    feedback={(state, retry, error) => <>
      {error && <p className="core-el-p" role="alert">{error}</p>}
      <div className="core-el-div core-placement-list">{state?.contributions.map(contribution => {
        const opened = selected.some(ref => ref.ownerPluginId === contribution.ref.ownerPluginId && ref.id === contribution.ref.id);
        const label = contribution.label ?? contribution.ref.id;
        const execution = contribution.execution;
        return <div className="core-el-div core-placement-row" key={`${contribution.ref.ownerPluginId}/${contribution.ref.id}`}>
          <div className="core-el-div core-placement-row__copy"><span className="core-el-span core-kind core-kind--surface">surface</span><strong className="core-el-strong">{label}</strong><small className="core-el-small">{contribution.ref.ownerPluginId} · {contribution.availability === 'available' ? 'Available' : contribution.reason ?? 'Unavailable'}</small></div>
          <div className="core-el-div core-placement-row__actions"><span data-testid={`extension-state-${contribution.ref.ownerPluginId}`} className={"core-el-span " + (`core-status-chip ${opened && execution?.phase === 'ready' ? 'core-status-chip--success' : ''}`)}><span className="core-el-span core-health-dot" />{!opened ? 'UNMOUNTED' : execution?.phase === 'ready' ? 'MOUNTED' : execution?.phase === 'failed' ? 'ERROR' : 'MOUNTING'}</span><button className="core-el-button core-button core-button--secondary" disabled={!initialized || contribution.availability !== 'available'} onClick={() => setSelected(values => opened ? values.filter(ref => ref.ownerPluginId !== contribution.ref.ownerPluginId || ref.id !== contribution.ref.id) : [...values, contribution.ref])}>{opened ? 'Close' : 'Open'} {label}</button></div>
          {execution?.retryTarget && <button className="core-el-button" onClick={() => { void retry(execution.retryTarget!).catch(() => undefined); }}>Retry {label}</button>}
        </div>;
      })}</div>
    </>} /></div>;
}
