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

/** Fixture-local client for the single unary action demonstrated by this app. */
export async function getCurrentCluster(): Promise<string> {
  const connection = await hostConnectionPromise;
  if (connection.state !== 'CONNECTED') throw new Error('Host Bridge is not connected.');
  const requestId = crypto.randomUUID();
  return new Promise<string>((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      connection.port.removeEventListener('message', onMessage);
    };
    const onMessage = (event: MessageEvent): void => {
      if (!isRecord(event.data) || event.data.type !== 'response' || event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok === true && typeof event.data.result === 'string') {
        resolve(event.data.result);
      } else {
        const code = isRecord(event.data.error) && typeof event.data.error.code === 'string'
          ? event.data.error.code : 'INVALID_RESPONSE';
        reject(new Error(code));
      }
    };
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('TIMEOUT')); }, 5_000);
    connection.port.addEventListener('message', onMessage);
    connection.port.postMessage({
      type: 'request', requestId, capability: 'kubesphere.cluster@2',
      action: 'getCurrentCluster', payload: null,
    });
  });
}
