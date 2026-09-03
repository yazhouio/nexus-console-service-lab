import {
  validateBridgeBootstrapDescriptor,
  type BridgeBootstrapDescriptor,
} from '../bridge-bootstrap';

export const BRIDGE_CONNECT_MESSAGE = 'nexus:bridge:connect';
export const BRIDGE_CONNECTED_MESSAGE = 'nexus:bridge:connected';

export type BridgeHandshakeErrorCode =
  | 'BRIDGE_BOOTSTRAP_FAILED'
  | 'BRIDGE_PROTOCOL_MISMATCH'
  | 'BRIDGE_NONCE_INVALID';

export class BridgeHandshakeError extends Error {
  readonly code: BridgeHandshakeErrorCode;

  constructor(code: BridgeHandshakeErrorCode, message: string) {
    super(message);
    this.name = 'BridgeHandshakeError';
    this.code = code;
  }
}

export interface BridgeHandshakeAttempt {
  readonly result: Promise<MessagePort>;
  cancel(): void;
}

export interface BridgeHandshakeRequest {
  readonly descriptor: BridgeBootstrapDescriptor;
  readonly expectedOrigin: string;
  readonly timeoutMs: number;
}

export interface BridgeHandshakeCoordinator {
  begin(request: BridgeHandshakeRequest): BridgeHandshakeAttempt;
}

interface HostWindow {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
}

interface MessageDestination {
  postMessage(
    message: unknown,
    targetOrigin: string,
    transfer?: readonly Transferable[],
  ): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConnectMessage(value: unknown):
  | (BridgeBootstrapDescriptor & { readonly type: typeof BRIDGE_CONNECT_MESSAGE })
  | undefined {
  if (!isRecord(value) || value.type !== BRIDGE_CONNECT_MESSAGE) {
    return undefined;
  }

  const allowedFields = new Set([
    'type',
    'protocolVersion',
    'surfaceInstanceId',
    'nonce',
  ]);
  if (Object.keys(value).some(field => !allowedFields.has(field))) {
    throw new BridgeHandshakeError(
      'BRIDGE_BOOTSTRAP_FAILED',
      'Bridge connect message contains fields outside the bootstrap contract.',
    );
  }

  let descriptor: BridgeBootstrapDescriptor;
  try {
    descriptor = validateBridgeBootstrapDescriptor({
      protocolVersion: value.protocolVersion,
      surfaceInstanceId: value.surfaceInstanceId,
      nonce: value.nonce,
    });
  } catch (error) {
    throw new BridgeHandshakeError(
      'BRIDGE_BOOTSTRAP_FAILED',
      error instanceof Error ? error.message : 'Bridge descriptor is invalid.',
    );
  }

  return Object.freeze({ type: BRIDGE_CONNECT_MESSAGE, ...descriptor });
}

export function createWindowBridgeHandshakeCoordinator(
  hostWindow: HostWindow = window,
  createChannel: () => MessageChannel = () => new MessageChannel(),
): BridgeHandshakeCoordinator {
  return Object.freeze({
    begin(request: BridgeHandshakeRequest): BridgeHandshakeAttempt {
      let settled = false;
      let connectedPort: MessagePort | undefined;
      let rejectResult: (error: Error) => void = () => undefined;

      const cleanup = (): void => {
        hostWindow.removeEventListener('message', onMessage);
        clearTimeout(timeout);
      };

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        rejectResult(error);
      };

      let resolveResult: (port: MessagePort) => void = () => undefined;
      const result = new Promise<MessagePort>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      const onMessage = (event: MessageEvent): void => {
        if (
          isRecord(event.data) &&
          event.data.type === BRIDGE_CONNECT_MESSAGE &&
          typeof event.data.surfaceInstanceId === 'string' &&
          event.data.surfaceInstanceId !== request.descriptor.surfaceInstanceId
        ) {
          return;
        }

        let message: ReturnType<typeof parseConnectMessage>;
        try {
          message = parseConnectMessage(event.data);
        } catch (error) {
          fail(
            error instanceof Error
              ? error
              : new BridgeHandshakeError(
                  'BRIDGE_BOOTSTRAP_FAILED',
                  'Bridge connect message is invalid.',
                ),
          );
          return;
        }

        if (
          message === undefined ||
          message.surfaceInstanceId !== request.descriptor.surfaceInstanceId
        ) {
          return;
        }
        if (event.origin !== request.expectedOrigin || event.source === null) {
          fail(
            new BridgeHandshakeError(
              'BRIDGE_BOOTSTRAP_FAILED',
              'Bridge connect message did not come from the expected same origin.',
            ),
          );
          return;
        }
        if (message.protocolVersion !== request.descriptor.protocolVersion) {
          fail(
            new BridgeHandshakeError(
              'BRIDGE_PROTOCOL_MISMATCH',
              `Bridge protocol ${message.protocolVersion} is not supported.`,
            ),
          );
          return;
        }
        if (message.nonce !== request.descriptor.nonce) {
          fail(
            new BridgeHandshakeError(
              'BRIDGE_NONCE_INVALID',
              'Bridge nonce is invalid or has already been consumed.',
            ),
          );
          return;
        }

        const channel = createChannel();
        try {
          (event.source as MessageDestination).postMessage(
            Object.freeze({
              type: BRIDGE_CONNECTED_MESSAGE,
              protocolVersion: request.descriptor.protocolVersion,
              surfaceInstanceId: request.descriptor.surfaceInstanceId,
            }),
            request.expectedOrigin,
            [channel.port2],
          );
          channel.port1.start();
        } catch (error) {
          channel.port1.close();
          channel.port2.close();
          fail(
            new BridgeHandshakeError(
              'BRIDGE_BOOTSTRAP_FAILED',
              error instanceof Error
                ? error.message
                : 'Bridge MessagePort transfer failed.',
            ),
          );
          return;
        }

        settled = true;
        connectedPort = channel.port1;
        cleanup();
        resolveResult(channel.port1);
      };

      hostWindow.addEventListener('message', onMessage);
      const timeout = setTimeout(
        () =>
          fail(
            new BridgeHandshakeError(
              'BRIDGE_BOOTSTRAP_FAILED',
              `Bridge handshake timed out after ${request.timeoutMs}ms.`,
            ),
          ),
        request.timeoutMs,
      );

      return Object.freeze({
        result,
        cancel() {
          if (connectedPort !== undefined) {
            connectedPort.close();
            connectedPort = undefined;
            return;
          }
          fail(
            new BridgeHandshakeError(
              'BRIDGE_BOOTSTRAP_FAILED',
              'Bridge handshake was cancelled.',
            ),
          );
        },
      });
    },
  });
}
