import { assertUiJson } from '../ui/schema';
import { UiError, type SlotInput, type UiRuntime } from '../ui/runtime';
export interface UiControlIngress { dispatch(value: unknown): void; dispose(): void }
export type CreateUiControl = (send: (value: unknown) => void) => UiControlIngress;
export function createUiControl(core: UiRuntime, attemptId: string, resolveAnchor: (anchor: string) => unknown, onReady?: () => void): CreateUiControl {
  return send => {
    let active = true, lastRequest = 0;
    const times: number[] = [];
    const stop = core.subscribe(() => { if (active) { try { send({ type: 'ui:snapshot', snapshot: core.snapshot(attemptId) }); } catch { /* Attempt invalidation closes this observer. */ } } });
    return {
      dispatch(value) {
        let requestId: unknown = null;
        try {
          if (!active) throw new UiError('UI_CONTROL_CLOSED');
          assertUiJson(value);
          const v = value as { requestId: number; type: string; action: string; payload: any };
          requestId = v.requestId;
          if (v.type !== 'ui:request' || !Number.isSafeInteger(v.requestId) || v.requestId <= lastRequest || typeof v.action !== 'string') throw new UiError('INVALID_UI_REQUEST');
          lastRequest = v.requestId;
          const now = Date.now(); while (times.length && times[0] < now - 1000) times.shift();
          if (times.length >= 200) throw new UiError('UI_RATE_LIMIT'); times.push(now);
          core.identity(attemptId);
          const p = v.payload;
          let result: unknown = null;
          switch (v.action) {
            case 'snapshot': result = core.snapshot(attemptId); break;
            case 'ready': onReady?.(); break;
            case 'slot.mount':
              if (!p || typeof p.anchor !== 'string' || p.anchor.length > 128) throw new UiError('INVALID_ANCHOR');
              result = core.mountSlot(attemptId, resolveAnchor(p.anchor), p.input as SlotInput); break;
            case 'slot.update': core.updateSlot(attemptId, p.occurrenceId, p.input); break;
            case 'slot.unmount': core.unmountSlot(attemptId, p.occurrenceId); break;
            case 'slot.retry': core.retry(attemptId, p.occurrenceId, p.retryTarget); break;
            default: throw new UiError('UNKNOWN_UI_ACTION');
          }
          send({ type: 'ui:response', requestId, ok: true, result });
        } catch (error) { if (active) send({ type: 'ui:response', requestId, ok: false, error: { code: error instanceof UiError ? error.code : 'INVALID_UI_REQUEST' } }); }
      },
      dispose() { active = false; stop(); },
    };
  };
}
