import type { PluginRuntime } from '../bootstrap';
import { isJsonValue, type JsonValue } from '../contribution';
import { isCapabilityId, type CapabilityId } from '../identifiers';
import type { PermissionId } from '../manifest';
import type { SurfaceInstanceIdentity } from './wujie-plugin-adapter';

export interface BridgeSessionIdentity extends SurfaceInstanceIdentity {
  readonly protocolVersion: number;
  readonly requires: readonly CapabilityId[];
  readonly grantedPermissions: readonly PermissionId[];
}

export interface BridgeRequest {
  readonly type: 'request';
  readonly requestId: string;
  readonly capability: CapabilityId;
  readonly action: string;
  readonly payload: JsonValue;
}

export type BridgeErrorCode =
  | 'BRIDGE_SESSION_INACTIVE'
  | 'UNDECLARED_CAPABILITY_REQUIRE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'UNKNOWN_ACTION'
  | 'INVALID_REQUEST'
  | 'INVALID_RESULT'
  | 'PERMISSION_DENIED'
  | 'ACTION_FAILED';

export type BridgeResponse =
  | Readonly<{
      type: 'response'; requestId: string; ok: true; result: JsonValue;
    }>
  | Readonly<{
      type: 'response'; requestId: string; ok: false;
      error: { readonly code: BridgeErrorCode; readonly message: string };
    }>;

export interface BridgeHostError extends SurfaceInstanceIdentity {
  readonly stage: 'bridge';
  readonly code: BridgeErrorCode;
  readonly requestId: string;
  readonly capability: CapabilityId;
  readonly action: string;
  readonly cause: unknown;
}

export interface PluginBridgeSession {
  readonly identity: BridgeSessionIdentity;
  readonly state: 'ACTIVE' | 'DISPOSED';
  readonly hostErrors: readonly BridgeHostError[];
  dispose(): void;
}

export interface CreatePluginBridgeSessionOptions {
  readonly runtime: PluginRuntime;
  readonly identity: BridgeSessionIdentity;
  readonly port: MessagePort;
  readonly onHostError?: (issue: BridgeHostError) => void;
}

const messages: Record<BridgeErrorCode, string> = {
  BRIDGE_SESSION_INACTIVE: 'Bridge session is inactive.',
  UNDECLARED_CAPABILITY_REQUIRE: 'Capability was not declared by this plugin.',
  CAPABILITY_UNAVAILABLE: 'Capability is unavailable.',
  UNKNOWN_ACTION: 'Unary action is unknown.',
  INVALID_REQUEST: 'Request does not match the Bridge contract.',
  INVALID_RESULT: 'Host result does not match the Bridge contract.',
  PERMISSION_DENIED: 'Required permissions have not been granted.',
  ACTION_FAILED: 'Host action failed.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequest(value: unknown): BridgeRequest | undefined {
  if (!isRecord(value)) return undefined;
  const fields = ['type', 'requestId', 'capability', 'action', 'payload'];
  if (
    Object.keys(value).length !== fields.length ||
    fields.some(field => !Object.hasOwn(value, field)) ||
    value.type !== 'request' ||
    typeof value.requestId !== 'string' || value.requestId.trim() === '' ||
    !isCapabilityId(value.capability) ||
    typeof value.action !== 'string' || value.action.trim() === '' ||
    !isJsonValue(value.payload)
  ) return undefined;
  return value as unknown as BridgeRequest;
}

/** A session is created only by the Host after a successful handshake. */
export function createPluginBridgeSession(
  options: CreatePluginBridgeSessionOptions,
): PluginBridgeSession {
  const { runtime, port } = options;
  const identity: BridgeSessionIdentity = Object.freeze({
    ...options.identity,
    requires: Object.freeze([...options.identity.requires]),
    grantedPermissions: Object.freeze([...options.identity.grantedPermissions]),
  });
  let state: 'ACTIVE' | 'DISPOSED' = 'ACTIVE';
  const pending = new Set<AbortController>();
  const hostErrors: BridgeHostError[] = [];

  const send = (response: BridgeResponse): void => {
    if (state === 'ACTIVE') port.postMessage(response);
  };
  const reject = (requestId: string, code: BridgeErrorCode): void => {
    send({ type: 'response', requestId, ok: false, error: { code, message: messages[code] } });
  };
  const recordHostError = (
    request: BridgeRequest, code: BridgeErrorCode, cause: unknown,
  ): void => {
    const issue: BridgeHostError = Object.freeze({
      pluginId: identity.pluginId,
      pluginVersion: identity.pluginVersion,
      surfaceId: identity.surfaceId,
      surfaceInstanceId: identity.surfaceInstanceId,
      mountPointId: identity.mountPointId,
      stage: 'bridge', code,
      requestId: request.requestId,
      capability: request.capability,
      action: request.action,
      cause,
    });
    hostErrors.push(issue);
    try { options.onHostError?.(issue); } catch { /* Diagnostics cannot break dispatch. */ }
  };

  const dispatch = async (value: unknown): Promise<void> => {
    if (state !== 'ACTIVE') return;
    let request: BridgeRequest | undefined;
    try { request = parseRequest(value); } catch { /* Invalid structured data. */ }
    if (request === undefined) {
      const requestId = isRecord(value) && typeof value.requestId === 'string'
        ? value.requestId : '';
      reject(requestId, 'INVALID_REQUEST');
      return;
    }
    if (!identity.requires.includes(request.capability)) {
      reject(request.requestId, 'UNDECLARED_CAPABILITY_REQUIRE');
      return;
    }
    const contract = runtime.bridgeContracts.get(request.capability);
    if (contract === undefined) {
      reject(request.requestId, 'CAPABILITY_UNAVAILABLE');
      return;
    }
    const action = Object.hasOwn(contract.actions, request.action)
      ? contract.actions[request.action] : undefined;
    if (action === undefined || action.kind !== 'request') {
      reject(request.requestId, 'UNKNOWN_ACTION');
      return;
    }
    let payload: JsonValue;
    try {
      payload = action.requestSchema.parse(request.payload);
      if (!isJsonValue(payload)) throw new Error('Schema returned non-JSON request.');
    } catch {
      reject(request.requestId, 'INVALID_REQUEST');
      return;
    }
    if (action.requiredPermissions.some(permission => !identity.grantedPermissions.includes(permission))) {
      reject(request.requestId, 'PERMISSION_DENIED');
      return;
    }
    const provider = runtime.capabilities.list().find(entry => entry.id === request.capability);
    if (provider === undefined || runtime.plugins.get(provider.providerPluginId)?.state !== 'ACTIVE') {
      reject(request.requestId, 'CAPABILITY_UNAVAILABLE');
      return;
    }
    const controller = new AbortController();
    pending.add(controller);
    try {
      let rawResult: unknown;
      try {
        rawResult = await action.invoke(runtime.capabilities.require(request.capability), payload, {
          pluginId: identity.pluginId,
          surfaceId: identity.surfaceId,
          surfaceInstanceId: identity.surfaceInstanceId,
          mountPointId: identity.mountPointId,
          signal: controller.signal,
        });
      } catch (cause) {
        if (!controller.signal.aborted) {
          recordHostError(request, 'ACTION_FAILED', cause);
          reject(request.requestId, 'ACTION_FAILED');
        }
        return;
      }
      if (controller.signal.aborted) return;
      let result: JsonValue;
      try {
        result = action.resultSchema.parse(rawResult);
        if (!isJsonValue(result)) throw new Error('Schema returned non-JSON result.');
        // Strip all live Host references before handing data to the transport.
        result = JSON.parse(JSON.stringify(result)) as JsonValue;
      } catch (cause) {
        recordHostError(request, 'INVALID_RESULT', cause);
        reject(request.requestId, 'INVALID_RESULT');
        return;
      }
      send({ type: 'response', requestId: request.requestId, ok: true, result });
    } finally {
      pending.delete(controller);
    }
  };

  const onMessage = (event: MessageEvent): void => {
    // A closed/failed transport cannot leak an unhandled promise rejection.
    void dispatch(event.data).catch(() => session.dispose());
  };
  const session: PluginBridgeSession = Object.freeze({
    identity,
    get state() { return state; },
    get hostErrors() { return Object.freeze([...hostErrors]); },
    dispose() {
      if (state === 'DISPOSED') return;
      state = 'DISPOSED';
      for (const controller of pending) controller.abort();
      pending.clear();
      port.removeEventListener('message', onMessage);
      port.close();
    },
  });
  port.addEventListener('message', onMessage);
  port.start();
  return session;
}
