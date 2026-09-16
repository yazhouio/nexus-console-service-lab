import { useEffect, useRef, useState } from 'react';

import {
  getCurrentCluster,
  hostConnectionPromise,
  watchCurrentCluster,
  navigateToExampleNode,
} from './host-bridge';

export function App() {
  const [bridgeState, setBridgeState] = useState('CONNECTING');
  const [parentAccessible, setParentAccessible] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [cluster, setCluster] = useState('Not requested');
  const [watchedCluster, setWatchedCluster] = useState('Not subscribed');
  const [watching, setWatching] = useState(false);
  const stopRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    void hostConnectionPromise.then(
      (connection) => {
        setBridgeState(connection.state);
        setParentAccessible(connection.parentAccessible);
      },
      () => setBridgeState('FAILED'),
    );
    return () => {
      disposedRef.current = true;
      void stopRef.current?.().catch(() => undefined);
    };
  }, []);

  return (
    <section
      data-bridge-state={bridgeState}
      data-parent-accessible={String(parentAccessible)}
      data-testid="restricted-surface"
      className="kubeeye-panel"
    >
      <p>Restricted Plugin Fixture</p>
      <h2>KubeEye Overview</h2>
      <p>
        Bridge: <strong>{bridgeState}</strong>
      </p>
      <button
        className="kubeeye-button"
        disabled={bridgeState !== 'CONNECTED'}
        onClick={async () => {
          setCluster('Loading');
          try {
            setCluster(await getCurrentCluster());
          } catch (error) {
            setCluster(error instanceof Error ? error.message : 'FAILED');
          }
        }}
      >
        Read current cluster
      </button>
      <button
        className="kubeeye-button"
        disabled={bridgeState !== 'CONNECTED'}
        onClick={async () => {
          if (watching) {
            const stop = stopRef.current;
            stopRef.current = undefined;
            if (!stop) return;
            try {
              await stop();
            } catch {
              /* Session may already be disposed. */
            }
            setWatching(false);
            return;
          }
          setWatching(true);
          try {
            const stop = await watchCurrentCluster((name) => {
              if (!disposedRef.current) setWatchedCluster(name);
            });
            if (disposedRef.current) await stop();
            else stopRef.current = stop;
          } catch (error) {
            if (!disposedRef.current) {
              setWatching(false);
              setWatchedCluster(error instanceof Error ? error.message : 'FAILED');
            }
          }
        }}
      >
        {watching ? 'Stop watching' : 'Watch current cluster'}
      </button>
      <button
        className="kubeeye-button"
        disabled={bridgeState !== 'CONNECTED'}
        onClick={() => {
          void navigateToExampleNode().catch((error) => setNavigationError(error.message));
        }}
      >
        Open example node
      </button>
      {navigationError && <p role="alert">{navigationError}</p>}
      <p>
        Watched cluster: <strong data-testid="watched-cluster">{watchedCluster}</strong>
      </p>
      <p>
        Current cluster: <strong data-testid="current-cluster">{cluster}</strong>
      </p>
    </section>
  );
}
