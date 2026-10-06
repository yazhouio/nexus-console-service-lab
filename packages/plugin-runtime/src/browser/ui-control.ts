import type { ActionRuntime } from '../action-runtime.js';
import { assertUiJson } from '../ui/schema.js';
import { UiError, type SlotInput, type UiRuntime } from '../ui/runtime.js';
export interface UiControlIngress {
  dispatch(value: unknown): void;
  dispose(): void;
}
export type CreateUiControl = (send: (value: unknown) => void) => UiControlIngress;
export function createUiControl(
  core: UiRuntime,
  attemptId: string,
  resolveAnchor: (anchor: string) => unknown,
  onReady?: () => void,
  actions?: ActionRuntime,
): CreateUiControl {
  return (send) => {
    let active = true,
      lastRequest = 0;
    const times: number[] = [];
    const invocations = new Map<string, ReturnType<ActionRuntime['invoke']>>();
    const stop = core.subscribe(() => {
      if (active) {
        try {
          send({ type: 'ui:snapshot', snapshot: core.snapshot(attemptId) });
        } catch {
          /* Attempt invalidation closes this observer. */
        }
      }
    });
    return {
      dispatch(value) {
        let requestId: unknown = null;
        try {
          if (!active) throw new UiError('UI_CONTROL_CLOSED');
          assertUiJson(value);
          const v = value as { requestId: number; type: string; action: string; payload: any };
          requestId = v.requestId;
          if (
            v.type !== 'ui:request' ||
            !Number.isSafeInteger(v.requestId) ||
            v.requestId <= lastRequest ||
            typeof v.action !== 'string'
          )
            throw new UiError('INVALID_UI_REQUEST');
          lastRequest = v.requestId;
          const now = Date.now();
          while (times.length && times[0] < now - 1000) times.shift();
          if (times.length >= 200) throw new UiError('UI_RATE_LIMIT');
          times.push(now);
          const identity = core.identity(attemptId);
          const p = v.payload;
          let result: unknown = null;
          switch (v.action) {
            case 'action.query':
              if (!actions) throw new UiError('ACTIONS_UNAVAILABLE');
              result = JSON.parse(
                JSON.stringify(actions.query(identity.ownerPluginId, p.point, p.context)),
              );
              break;
            case 'action.start': {
              if (!actions || invocations.size >= 128) throw new UiError('ACTION_RESOURCE_LIMIT');
              const invocation = actions.invoke(identity.ownerPluginId, p.point, p.ref, p.context, {
                payload: p.payload,
                timeoutMs: p.timeoutMs,
                signal: identity.signal,
              });
              invocations.set(invocation.invocationId, invocation);
              result = invocation.invocationId;
              break;
            }
            case 'action.wait': {
              const invocation = invocations.get(p.invocationId);
              if (!invocation) throw new UiError('ACTION_NOT_OWNED');
              void invocation.result.then((outcome) => {
                invocations.delete(p.invocationId);
                if (active) send({ type: 'ui:response', requestId, ok: true, result: outcome });
              });
              return;
            }
            case 'action.cancel': {
              const invocation = invocations.get(p.invocationId);
              if (!invocation) throw new UiError('ACTION_NOT_OWNED');
              invocation.cancel();
              break;
            }
            case 'snapshot':
              result = core.snapshot(attemptId);
              break;
            case 'ready':
              onReady?.();
              break;
            case 'slot.mount':
              if (!p || typeof p.anchor !== 'string' || p.anchor.length > 128)
                throw new UiError('INVALID_ANCHOR');
              result = core.mountSlot(attemptId, resolveAnchor(p.anchor), p.input as SlotInput);
              break;
            case 'slot.update':
              core.updateSlot(attemptId, p.occurrenceId, p.input);
              break;
            case 'slot.unmount':
              core.unmountSlot(attemptId, p.occurrenceId);
              break;
            case 'slot.retry':
              core.retry(attemptId, p.occurrenceId, p.retryTarget);
              break;
            default:
              throw new UiError('UNKNOWN_UI_ACTION');
          }
          send({ type: 'ui:response', requestId, ok: true, result });
        } catch (error) {
          if (active)
            send({
              type: 'ui:response',
              requestId,
              ok: false,
              error: { code: error instanceof UiError ? error.code : 'INVALID_UI_REQUEST' },
            });
        }
      },
      dispose() {
        active = false;
        stop();
        for (const invocation of invocations.values()) invocation.cancel();
        invocations.clear();
      },
    };
  };
}
