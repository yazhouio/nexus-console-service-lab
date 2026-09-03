const CONNECT_MESSAGE = 'nexus:bridge:connect';
const CONNECTED_MESSAGE = 'nexus:bridge:connected';

interface BridgeBootstrapDescriptor {
  readonly protocolVersion: number;
  readonly surfaceInstanceId: string;
  readonly nonce: string;
}

interface WujieRuntime {
  readonly props?: unknown;
}

declare global {
  interface Window {
    readonly $wujie?: WujieRuntime;
  }
}

export type HostConnection =
  | Readonly<{
      state: 'STANDALONE';
      parentAccessible: false;
    }>
  | Readonly<{
      state: 'CONNECTED';
      parentAccessible: boolean;
      port: MessagePort;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDescriptor(): BridgeBootstrapDescriptor | undefined {
  const props = window.$wujie?.props;
  if (!isRecord(props) || !isRecord(props.bridge)) {
    return undefined;
  }
  const bridge = props.bridge;
  if (
    Object.keys(bridge).some(
      field =>
        !['protocolVersion', 'surfaceInstanceId', 'nonce'].includes(field),
    ) ||
    typeof bridge.protocolVersion !== 'number' ||
    !Number.isInteger(bridge.protocolVersion) ||
    typeof bridge.surfaceInstanceId !== 'string' ||
    typeof bridge.nonce !== 'string'
  ) {
    throw new Error('Host provided an invalid Bridge Bootstrap Descriptor.');
  }
  return Object.freeze({
    protocolVersion: bridge.protocolVersion,
    surfaceInstanceId: bridge.surfaceInstanceId,
    nonce: bridge.nonce,
  });
}

function canAccessParent(): boolean {
  try {
    return window.parent !== window && window.parent.document !== undefined;
  } catch {
    return false;
  }
}

export function connectHostBridge(): Promise<HostConnection> {
  const descriptor = readDescriptor();
  if (descriptor === undefined) {
    return Promise.resolve(
      Object.freeze({ state: 'STANDALONE', parentAccessible: false }),
    );
  }

  return new Promise<HostConnection>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Host Bridge handshake timed out.'));
    }, 10_000);

    const onMessage = (event: MessageEvent): void => {
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        !isRecord(event.data) ||
        event.data.type !== CONNECTED_MESSAGE ||
        event.data.protocolVersion !== descriptor.protocolVersion ||
        event.data.surfaceInstanceId !== descriptor.surfaceInstanceId ||
        event.ports.length !== 1
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      const port = event.ports[0];
      port.start();
      resolve(
        Object.freeze({
          state: 'CONNECTED',
          parentAccessible: canAccessParent(),
          port,
        }),
      );
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage(
      Object.freeze({ type: CONNECT_MESSAGE, ...descriptor }),
      window.location.origin,
    );
  });
}

export const hostConnectionPromise = connectHostBridge();
