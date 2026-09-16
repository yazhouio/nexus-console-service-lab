import { createUiClient } from '@nexus/plugin-runtime/client';

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
      (field) => !['protocolVersion', 'surfaceInstanceId', 'nonce'].includes(field),
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
    return Promise.resolve(Object.freeze({ state: 'STANDALONE', parentAccessible: false }));
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
      const ui = createUiClient(port);
      void ui.refresh().catch(reject);
      window.addEventListener('pagehide', () => ui.dispose(), { once: true });
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

/** Fixture-local client; the capability and actions remain Host-defined. */
async function send(port: MessagePort, message: Record<string, unknown>): Promise<unknown> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      port.removeEventListener('message', onMessage);
    };
    const onMessage = (event: MessageEvent): void => {
      if (
        !isRecord(event.data) ||
        event.data.type !== 'response' ||
        event.data.requestId !== requestId
      )
        return;
      cleanup();
      if (event.data.ok === true) resolve(event.data.result);
      else {
        const code =
          isRecord(event.data.error) && typeof event.data.error.code === 'string'
            ? event.data.error.code
            : 'INVALID_RESPONSE';
        reject(new Error(code));
      }
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('TIMEOUT'));
    }, 15_000);
    port.addEventListener('message', onMessage);
    port.postMessage({ ...message, requestId });
  });
}

async function connectedPort(): Promise<MessagePort> {
  const connection = await hostConnectionPromise;
  if (connection.state !== 'CONNECTED') throw new Error('Host Bridge is not connected.');
  return connection.port;
}

export async function getCurrentCluster(): Promise<string> {
  const result = await send(await connectedPort(), {
    type: 'request',
    capability: 'kubesphere.cluster@2',
    action: 'getCurrentCluster',
    payload: null,
  });
  if (typeof result !== 'string') throw Error('INVALID_RESPONSE');
  return result;
}

export async function watchCurrentCluster(
  onValue: (name: string) => void,
): Promise<() => Promise<void>> {
  const port = await connectedPort();
  let subscriptionId: string | undefined;
  let stopped = false;
  const onEvent = (event: MessageEvent): void => {
    if (
      !stopped &&
      isRecord(event.data) &&
      event.data.type === 'event' &&
      event.data.subscriptionId === subscriptionId &&
      typeof event.data.payload === 'string'
    )
      onValue(event.data.payload);
  };
  port.addEventListener('message', onEvent);
  try {
    const result = await send(port, {
      type: 'request',
      capability: 'kubesphere.cluster@2',
      action: 'watchCurrentCluster',
      payload: null,
    });
    if (
      !isRecord(result) ||
      typeof result.subscriptionId !== 'string' ||
      typeof result.snapshot !== 'string'
    )
      throw Error('INVALID_RESPONSE');
    subscriptionId = result.subscriptionId;
    onValue(result.snapshot);
    return async () => {
      if (stopped) return;
      stopped = true;
      port.removeEventListener('message', onEvent);
      await send(port, { type: 'unsubscribe', subscriptionId });
    };
  } catch (error) {
    port.removeEventListener('message', onEvent);
    throw error;
  }
}

export async function navigateToExampleNode(): Promise<void> {
  await send(await connectedPort(), {
    type: 'request',
    capability: 'routes.navigate@1',
    action: 'navigate',
    payload: { routeId: 'node-detail', params: { cluster: 'demo', node: 'n1' } },
  });
}
