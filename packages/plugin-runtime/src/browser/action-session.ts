import type { JsonValue } from '../contribution.js';
import { assertUiJson } from '../ui/schema.js';
import type { CreateUiControl } from './ui-control.js';

/** One execution channel, sharing the same authenticated port as capability RPC. */
export function createActionExecutionChannel(signal: AbortSignal) {
  let send: ((value: unknown) => void) | undefined;
  let started = false,
    readyReceived = false,
    completed = false,
    closed = false,
    lastRequest = 0;
  let readyResolve!: () => void, readyReject!: (error: Error) => void;
  let resultResolve!: (value: JsonValue) => void, resultReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const result = new Promise<JsonValue>((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });
  void ready.catch(() => undefined);
  void result.catch(() => undefined);
  const dispose = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    readyReject(Error('ACTION_CONNECTION_CLOSED'));
    resultReject(Error('ACTION_CONNECTION_CLOSED'));
  };
  const cancel = () => {
    send?.({ type: 'action:cancel' });
    dispose();
  };
  const timer = setTimeout(dispose, 10_000);
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const control: CreateUiControl = (sender) => {
    send = sender;
    return {
      dispatch(value) {
        if (closed) return;
        try {
          assertUiJson(value);
          const message = value as {
            requestId: number;
            action: string;
            payload: { ok: boolean; result?: JsonValue };
          };
          if (!Number.isSafeInteger(message.requestId) || message.requestId <= lastRequest)
            throw Error('ACTION_PROTOCOL_INVALID');
          lastRequest = message.requestId;
          if (message.action === 'action.ready' && !readyReceived && !started) {
            readyReceived = true;
            clearTimeout(timer);
            readyResolve();
          } else if (message.action === 'action.complete' && started && !completed) {
            completed = true;
            if (message.payload?.ok === true) {
              assertUiJson(message.payload.result);
              resultResolve(message.payload.result);
            } else resultReject(Error('ACTION_FAILED'));
          } else throw Error('ACTION_PROTOCOL_INVALID');
        } catch {
          dispose();
        }
      },
      dispose,
    };
  };
  return {
    control,
    ready,
    invoke() {
      if (closed || started || !readyReceived) throw Error('ACTION_ALREADY_FINISHED');
      started = true;
      send?.({ type: 'action:execute' });
      return result;
    },
    cancel,
    dispose,
  };
}
