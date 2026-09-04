import { useEffect, useState } from 'react';

import { getCurrentCluster, hostConnectionPromise } from './host-bridge';

const cardStyle = {
  padding: 24,
  border: '1px solid #cdd5e1',
  borderRadius: 12,
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  color: '#172033',
  background: '#ffffff',
} as const;

export function App() {
  const [bridgeState, setBridgeState] = useState('CONNECTING');
  const [parentAccessible, setParentAccessible] = useState(false);
  const [cluster, setCluster] = useState('Not requested');

  useEffect(() => {
    void hostConnectionPromise.then(
      connection => {
        setBridgeState(connection.state);
        setParentAccessible(connection.parentAccessible);
      },
      () => setBridgeState('FAILED'),
    );
  }, []);

  return (
    <section
      data-bridge-state={bridgeState}
      data-parent-accessible={String(parentAccessible)}
      data-testid="restricted-surface"
      style={cardStyle}
    >
      <p>Restricted Plugin Fixture</p>
      <h2>KubeEye Overview</h2>
      <p>
        Bridge: <strong>{bridgeState}</strong>
      </p>
      <button disabled={bridgeState !== 'CONNECTED'} onClick={async () => {
        setCluster('Loading');
        try { setCluster(await getCurrentCluster()); }
        catch (error) { setCluster(error instanceof Error ? error.message : 'FAILED'); }
      }}>Read current cluster</button>
      <p>Current cluster: <strong data-testid="current-cluster">{cluster}</strong></p>
    </section>
  );
}
