import { describe, expect, it, vi } from 'vitest';

import {
  BRIDGE_CONNECTED_MESSAGE,
  BRIDGE_CONNECT_MESSAGE,
  BridgeHandshakeError,
  createWindowBridgeHandshakeCoordinator,
} from '../src/browser';

interface FakeHostWindow {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  dispatch(event: MessageEvent): void;
}

function fakeHostWindow(): FakeHostWindow {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    dispatch(event) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}

function connectEvent(
  data: Record<string, unknown>,
  postMessage = vi.fn(),
): MessageEvent {
  return {
    data,
    origin: 'http://localhost:3000',
    source: { postMessage },
  } as unknown as MessageEvent;
}

const request = {
  descriptor: {
    protocolVersion: 1,
    surfaceInstanceId: 'surface-1',
    nonce: 'nonce-1',
  },
  expectedOrigin: 'http://localhost:3000',
  timeoutMs: 1_000,
} as const;

describe('Window Bridge handshake', () => {
  it('consumes a successful nonce once, even if the connect message is replayed', async () => {
    const hostWindow = fakeHostWindow();
    const postMessage = vi.fn();
    const port = { close: vi.fn() };
    const createChannel = vi.fn(() => ({ port1: port, port2: port }) as unknown as MessageChannel);
    const attempt = createWindowBridgeHandshakeCoordinator(hostWindow, createChannel).begin(request);
    const event = connectEvent({ type: BRIDGE_CONNECT_MESSAGE, ...request.descriptor }, postMessage);
    hostWindow.dispatch(event);
    hostWindow.dispatch(event);
    await attempt.result;
    expect(createChannel).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledOnce();
    attempt.cancel();
    attempt.cancel();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('rejects channel allocation failure and removes the handshake listener', async () => {
    const hostWindow = fakeHostWindow();
    const createChannel = vi.fn(() => { throw new Error('allocation failed'); });
    const attempt = createWindowBridgeHandshakeCoordinator(hostWindow, createChannel).begin(request);
    const event = connectEvent({ type: BRIDGE_CONNECT_MESSAGE, ...request.descriptor });
    hostWindow.dispatch(event);
    await expect(attempt.result).rejects.toMatchObject({ code: 'BRIDGE_BOOTSTRAP_FAILED' });
    hostWindow.dispatch(event);
    expect(createChannel).toHaveBeenCalledOnce();
  });

  it('validates the bound descriptor and transfers one MessagePort', async () => {
    const hostWindow = fakeHostWindow();
    const hostPort = { start: vi.fn(), close: vi.fn() };
    const pluginPort = { close: vi.fn() };
    const postMessage = vi.fn();
    const coordinator = createWindowBridgeHandshakeCoordinator(
      hostWindow,
      () =>
        ({ port1: hostPort, port2: pluginPort }) as unknown as MessageChannel,
    );
    const attempt = coordinator.begin(request);

    hostWindow.dispatch(
      connectEvent(
        {
          type: BRIDGE_CONNECT_MESSAGE,
          ...request.descriptor,
        },
        postMessage,
      ),
    );

    await expect(attempt.result).resolves.toBe(hostPort);
    expect(hostPort.start).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: BRIDGE_CONNECTED_MESSAGE,
        protocolVersion: 1,
        surfaceInstanceId: 'surface-1',
      },
      'http://localhost:3000',
      [pluginPort],
    );
  });

  it.each([
    [
      'BRIDGE_PROTOCOL_MISMATCH',
      { ...request.descriptor, protocolVersion: 2 },
    ],
    ['BRIDGE_NONCE_INVALID', { ...request.descriptor, nonce: 'wrong' }],
    [
      'BRIDGE_BOOTSTRAP_FAILED',
      { ...request.descriptor, pluginId: 'forged-plugin' },
    ],
  ] as const)('rejects invalid handshake facts with %s', async (code, fields) => {
    const hostWindow = fakeHostWindow();
    const coordinator = createWindowBridgeHandshakeCoordinator(hostWindow);
    const attempt = coordinator.begin(request);

    hostWindow.dispatch(
      connectEvent({ type: BRIDGE_CONNECT_MESSAGE, ...fields }),
    );

    await expect(attempt.result).rejects.toMatchObject({
      code,
    } satisfies Partial<BridgeHandshakeError>);
  });

  it('ignores a handshake belonging to another Surface Instance', async () => {
    vi.useFakeTimers();
    try {
      const hostWindow = fakeHostWindow();
      const coordinator = createWindowBridgeHandshakeCoordinator(hostWindow);
      const attempt = coordinator.begin({ ...request, timeoutMs: 10 });
      const rejection = expect(attempt.result).rejects.toMatchObject({
        code: 'BRIDGE_BOOTSTRAP_FAILED',
      });

      hostWindow.dispatch(
        connectEvent({
          type: BRIDGE_CONNECT_MESSAGE,
          protocolVersion: 1,
          surfaceInstanceId: 'surface-2',
          nonce: 'nonce-2',
          pluginId: 'untrusted-but-unrelated',
        }),
      );
      await vi.advanceTimersByTimeAsync(10);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
