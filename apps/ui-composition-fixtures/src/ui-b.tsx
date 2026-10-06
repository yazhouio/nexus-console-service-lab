import { useEffect, useState } from 'react';
import {
  Slot,
  useSurfaceContext,
  useUiClient,
  useUiObservation,
} from '@feforgejs/plugin-runtime/react';
import { mount, surfaceId } from './mount';
function Dialog() {
  const client = useUiClient();
  const observation = useUiObservation();
  return (
    <section data-testid="b-dialog">
      B dialog {JSON.stringify(observation?.overlayInput)}
      <button
        onClick={() => {
          void client.overlay.complete({ saved: true }).catch(() => undefined);
        }}
      >
        Complete B
      </button>
    </section>
  );
}
function Card() {
  const context = useSurfaceContext(),
    client = useUiClient();
  const [instance] = useState(() => crypto.randomUUID());
  const [overlays, setOverlays] = useState('');
  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;
    void client.overlay
      .observe((s) => {
        if (active) setOverlays(JSON.stringify(s));
      })
      .then((dispose) => {
        if (active) stop = dispose;
        else dispose();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop?.();
    };
  }, [client]);
  return (
    <section data-testid="ui-b">
      <h3>B business card</h3>
      <p data-testid="b-instance">{instance}</p>
      <pre data-testid="b-context">{JSON.stringify(context)}</pre>
      <button
        onClick={() =>
          setTimeout(() => {
            throw Error('B fixture render failure');
          }, 0)
        }
      >
        Crash B
      </button>
      <button
        onClick={() => {
          void client.overlay.open('dialog', context?.value ?? null).catch(() => undefined);
        }}
      >
        Open B overlay
      </button>
      <pre data-testid="b-overlays">{overlays}</pre>
      {context && <Slot id="children" contextKey={context.contextKey} context={context.value} />}
    </section>
  );
}
mount(surfaceId() === 'dialog' ? <Dialog /> : <Card />);
