import { useState } from 'react';
import type { RecoveryConfiguration } from './distribution.js';

/** This recovery tree has no plugin, Router, theme, or Capability dependencies. */
export function BreakGlass({
  ready,
  diagnostics,
  recovery,
  applicationLabel,
}: {
  ready: boolean;
  diagnostics: unknown;
  recovery: RecoveryConfiguration;
  applicationLabel: string;
}) {
  const [error, setError] = useState<string>();
  const serialized = JSON.stringify(diagnostics, null, 2);
  let changes: ReturnType<NonNullable<RecoveryConfiguration['listChanges']>> = [];
  try {
    changes = recovery.listChanges?.() ?? [];
  } catch {
    /* Corrupt storage is recoverable by clearing it. */
  }
  const recover = (action: () => void) => {
    try {
      action();
      window.location.reload();
    } catch {
      setError('Recovery could not be saved.');
    }
  };
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#172033', background: 'white' }}>
      <h1>{ready ? `${applicationLabel} presentation failed` : 'Runtime startup failed'}</h1>
      <p>
        Runtime state: <strong data-testid="runtime-state">{ready ? 'READY' : 'FAILED'}</strong>
      </p>
      <p role="alert">The normal presentation is unavailable. Recovery changes require a reload.</p>
      {error && <p role="alert">{error}</p>}
      <button
        onClick={() => {
          const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = 'runtime-diagnostics.json';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }}
      >
        Export diagnostics
      </button>{' '}
      {changes.map((change) => (
        <span key={change.id}>
          {recovery.disable && change.canDisable !== false && (
            <button onClick={() => recover(() => recovery.disable!(change.id))}>
              Disable {change.label} and reload
            </button>
          )}
          {change.canRollback && recovery.rollback && (
            <button onClick={() => recover(() => recovery.rollback!(change.id))}>
              Roll back {change.label} and reload
            </button>
          )}
        </span>
      ))}
      <button onClick={() => recover(recovery.clearInstallations)}>
        Clear local installation state and reload
      </button>{' '}
      <button onClick={() => window.location.reload()}>Reload page</button>
      <pre data-testid="runtime-snapshot">{serialized}</pre>
    </main>
  );
}
