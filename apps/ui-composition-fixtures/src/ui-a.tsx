import { useEffect, useState } from 'react';
import { Slot, useUiClient, useUiObservation } from '@nexus/plugin-runtime/react';
import { mount, surfaceId } from './mount';
function Dialog() { const client = useUiClient(); const state = useUiObservation(); return <section data-testid="a-dialog">A dialog {JSON.stringify(state?.overlayInput)}<button onClick={() => { void client.overlay.complete({ done: true }).catch(() => undefined); }}>Complete A</button></section>; }
function Page() {
  const client = useUiClient(); const [key, setKey] = useState('A'); const [value, setValue] = useState<number | string>(1);
  const [hidden, setHidden] = useState(false), [shown, setShown] = useState(true), [second, setSecond] = useState(false), [filtered, setFiltered] = useState(false), [bounded, setBounded] = useState(false);
  const [overlays, setOverlays] = useState('');
  useEffect(() => { let stop: (() => void) | undefined; let active = true; void client.overlay.observe(s => { if (active) setOverlays(JSON.stringify(s)); }).then(dispose => { if (active) stop = dispose; else dispose(); }).catch(() => undefined); return () => { active = false; stop?.(); }; }, [client]);
  const input = { node: key, value };
  return <section data-testid="ui-a">
    <h2>A node page</h2><p data-testid="a-key">{key}</p>
    <button onClick={() => setValue(v => typeof v === 'number' ? v + 1 : 2)}>Update context</button>
    <button onClick={() => setTimeout(() => { throw Error('A fixture render failure'); }, 0)}>Crash A</button>
    <button onClick={() => { setKey('A'); setValue(1); }}>Visit A</button><button onClick={() => { setKey('B'); setValue(1); }}>Visit B</button>
    <button onClick={() => setValue('invalid')}>Invalid same key</button><button onClick={() => { setKey('invalid-key'); setValue('invalid'); }}>Invalid next key</button>
    <button onClick={() => setHidden(v => !v)}>Toggle hidden</button><button onClick={() => setShown(v => !v)}>Toggle Slot</button>
    <button onClick={() => setSecond(v => !v)}>Toggle second Slot</button><button onClick={() => setFiltered(v => !v)}>Toggle filter</button><button onClick={() => setBounded(v => !v)}>Toggle sizing</button>
    <button onClick={() => { void client.overlay.open('dialog', { node: key }).catch(() => undefined); }}>Open A overlay</button>
    <pre data-testid="a-overlays">{overlays}</pre>
    {shown && <Slot id="details" contextKey={key} context={input} hidden={hidden} selected={filtered ? [{ ownerPluginId: 'ui-local', id: 'local-card' }] : undefined} sizing={{ mode: bounded ? 'bounded' : 'content-sized', minHeight: 80, maxHeight: 500 }} feedback={(s, retry, error) => <>
      {error && <p role="alert">{error}</p>}
      <pre data-testid="a-observation">{JSON.stringify(s)}</pre>
      {s?.input.acceptance === 'rejected' && <p role="alert">Context rejected</p>}
      {s?.contributions.map(c => c.execution?.retryTarget && <button key={c.ref.id} onClick={() => { void retry(c.execution!.retryTarget!).catch(() => undefined); }}>Retry {c.ref.id}</button>)}
    </>} />}
    {second && <Slot id="details" contextKey={key} context={{ node: 'second', value: 99 }} />}
  </section>;
}
mount(surfaceId() === 'dialog' ? <Dialog /> : <Page />);
