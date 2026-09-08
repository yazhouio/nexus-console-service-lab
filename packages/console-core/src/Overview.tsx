import { useEffect, useState } from 'react';
import { Slot, useUiObservation } from '@nexus/plugin-runtime/react';
import type { ContributionRef } from '@nexus/plugin-runtime';
import { HOME_CARDS_POINT } from '@nexus/console-core-api';
import { PluginConfiguration } from './PluginConfiguration';
import { RuntimeInspector } from './RuntimeInspector';

export function Overview() {
  return <>
    <h1>Frontend Plugin Runtime</h1>
    <p>Isolation: cooperative-isolation — same-origin plugins can access the parent window.</p>
    <section aria-label="Home cards"><HomeCards /></section>
    <PluginConfiguration />
    <RuntimeInspector />
  </>;
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
  return <div data-testid="extension-container"><Slot id={HOME_CARDS_POINT.id} contextKey="home" context={{}} selected={selected}
    feedback={(state, retry, error) => <>
      {error && <p role="alert">{error}</p>}
      {state?.contributions.map(contribution => {
        const opened = selected.some(ref => ref.ownerPluginId === contribution.ref.ownerPluginId && ref.id === contribution.ref.id);
        const label = contribution.label ?? contribution.ref.id;
        const execution = contribution.execution;
        return <div key={`${contribution.ref.ownerPluginId}/${contribution.ref.id}`}>
          <button disabled={!initialized || contribution.availability !== 'available'} onClick={() => setSelected(values => opened ? values.filter(ref => ref.ownerPluginId !== contribution.ref.ownerPluginId || ref.id !== contribution.ref.id) : [...values, contribution.ref])}>{opened ? 'Close' : 'Open'} {label}</button>
          <p>{label}: <strong data-testid={`extension-state-${contribution.ref.ownerPluginId}`}>{!opened ? 'UNMOUNTED' : execution?.phase === 'ready' ? 'MOUNTED' : execution?.phase === 'failed' ? 'ERROR' : 'MOUNTING'}</strong></p>
          {execution?.retryTarget && <button onClick={() => { void retry(execution.retryTarget!).catch(() => undefined); }}>Retry {label}</button>}
        </div>;
      })}
    </>} /></div>;
}
