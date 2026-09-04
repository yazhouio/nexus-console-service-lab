import type { PluginRuntime } from '../bootstrap';
import type { BridgeSubscriptionActionContract, OpenedBridgeSubscription } from '../bridge-contract';
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

export interface BridgeUnsubscribeRequest {
  readonly type: 'unsubscribe';
  readonly requestId: string;
  readonly subscriptionId: string;
}

export interface BridgeEvent {
  readonly type: 'event';
  readonly subscriptionId: string;
  readonly payload: JsonValue;
}

export interface BridgeSubscriptionResult {
  readonly subscriptionId: string;
  readonly snapshot: JsonValue;
}

export type BridgeErrorCode =
  | 'BRIDGE_SESSION_INACTIVE' | 'UNDECLARED_CAPABILITY_REQUIRE'
  | 'CAPABILITY_UNAVAILABLE' | 'UNKNOWN_ACTION' | 'INVALID_REQUEST'
  | 'INVALID_RESULT' | 'PERMISSION_DENIED' | 'ACTION_FAILED'
  | 'DUPLICATE_REQUEST' | 'MESSAGE_TOO_LARGE' | 'RATE_LIMITED'
  | 'CONCURRENCY_LIMITED' | 'TIMEOUT' | 'INVALID_EVENT' | 'SUBSCRIPTION_LIMITED';

export type BridgeResponse =
  | Readonly<{ type: 'response'; requestId: string; ok: true; result: JsonValue }>
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

export interface BridgeAuditEntry extends SurfaceInstanceIdentity {
  readonly type: 'request' | 'subscription' | 'unsubscribe' | 'event';
  readonly subscriptionId?: string;
  readonly requestId: string;
  /** Diagnostic text may be truncated; it is not an invocable capability ID. */
  readonly capability?: string;
  readonly action?: string;
  readonly resultCode: 'OK' | BridgeErrorCode;
  readonly duration: number;
  readonly timestamp: number;
}

export interface BridgeLimits {
  readonly maxMessageBytes: number;
  readonly maxConcurrentRequests: number;
  readonly requestsPerSecond: number;
  readonly requestTimeoutMs: number;
  readonly maxProtocolViolations: number;
  /** Lifetime budget: IDs are never evicted and reused within a session. */
  readonly maxRequestIds: number;
  readonly maxDiagnosticEntries: number;
  readonly maxSubscriptions: number;
  readonly maxBufferedEvents: number;
  readonly eventsPerSecond: number;
}

export const DEFAULT_BRIDGE_LIMITS: BridgeLimits = Object.freeze({
  maxMessageBytes: 65_536, maxConcurrentRequests: 16, requestsPerSecond: 100,
  requestTimeoutMs: 10_000, maxProtocolViolations: 3, maxRequestIds: 10_000,
  maxDiagnosticEntries: 200, maxSubscriptions: 32, maxBufferedEvents: 64, eventsPerSecond: 100,
});

export interface PluginBridgeSession {
  readonly identity: BridgeSessionIdentity;
  readonly state: 'ACTIVE' | 'DISPOSED';
  readonly pendingRequestCount: number;
  readonly subscriptionCount: number;
  readonly hostErrors: readonly BridgeHostError[];
  readonly audit: readonly BridgeAuditEntry[];
  /** Host ingress; disposed sessions return INACTIVE locally after the port closes. */
  dispatch(value: unknown): Promise<BridgeResponse>;
  dispose(): void;
}

export interface CreatePluginBridgeSessionOptions {
  readonly runtime: PluginRuntime;
  readonly identity: BridgeSessionIdentity;
  readonly port: MessagePort;
  readonly limits?: Partial<BridgeLimits>;
  readonly onHostError?: (issue: BridgeHostError) => void;
  readonly onAudit?: (entry: BridgeAuditEntry) => void;
  readonly onSessionFailure?: (code: BridgeErrorCode) => void;
}

const messages: Record<BridgeErrorCode, string> = {
  BRIDGE_SESSION_INACTIVE: 'Bridge session is inactive.',
  UNDECLARED_CAPABILITY_REQUIRE: 'Capability was not declared by this plugin.',
  CAPABILITY_UNAVAILABLE: 'Capability is unavailable.',
  UNKNOWN_ACTION: 'Action is unknown.',
  INVALID_REQUEST: 'Request does not match the Bridge contract.',
  INVALID_RESULT: 'Host result does not match the Bridge contract.',
  PERMISSION_DENIED: 'Required permissions have not been granted.',
  ACTION_FAILED: 'Host action failed.',
  DUPLICATE_REQUEST: 'Request ID was already used in this session.',
  MESSAGE_TOO_LARGE: 'Bridge message exceeds the size limit.',
  RATE_LIMITED: 'Bridge request rate or session ID budget exceeded.',
  CONCURRENCY_LIMITED: 'Too many concurrent Bridge requests.',
  TIMEOUT: 'Host action timed out.',
  INVALID_EVENT: 'Host event does not match the Bridge contract.',
  SUBSCRIPTION_LIMITED: 'Too many subscriptions in this session.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequest(value: unknown): BridgeRequest | BridgeUnsubscribeRequest | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'unsubscribe' && Object.keys(value).length === 3 &&
      typeof value.requestId === 'string' && value.requestId.length <= 128 && value.requestId.trim() !== '' &&
      typeof value.subscriptionId === 'string' && value.subscriptionId.trim() !== '') {
    return value as unknown as BridgeUnsubscribeRequest;
  }
  const fields = ['type', 'requestId', 'capability', 'action', 'payload'];
  if (
    Object.keys(value).length !== fields.length ||
    fields.some(field => !Object.hasOwn(value, field)) || value.type !== 'request' ||
    typeof value.requestId !== 'string' || value.requestId.length > 128 || value.requestId.trim() === '' ||
    !isCapabilityId(value.capability) ||
    typeof value.action !== 'string' || value.action.trim() === '' ||
    !isJsonValue(value.payload)
  ) return undefined;
  return value as unknown as BridgeRequest;
}

function jsonCopy(value: unknown): JsonValue {
  if (!isJsonValue(value)) throw new Error('Expected JSON data.');
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

interface Subscription {
  readonly request: BridgeRequest;
  readonly action: BridgeSubscriptionActionContract;
  readonly controller: AbortController;
  readonly buffer: JsonValue[];
  subscriptionId?: string;
  ready: boolean;
  closed: boolean;
  disposer?: () => void | Promise<void>;
}

/** A session is created only by the Host after a successful handshake. */
export function createPluginBridgeSession(options: CreatePluginBridgeSessionOptions): PluginBridgeSession {
  const { runtime, port } = options;
  const limits = { ...DEFAULT_BRIDGE_LIMITS, ...options.limits };
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('Bridge limits must be positive safe integers.');
  }
  if (limits.maxMessageBytes < 256) throw new Error('Bridge messages require at least 256 bytes for control responses.');
  const identity: BridgeSessionIdentity = Object.freeze({
    ...options.identity,
    requires: Object.freeze([...options.identity.requires]),
    grantedPermissions: Object.freeze([...options.identity.grantedPermissions]),
  });
  const attribution: SurfaceInstanceIdentity = Object.freeze({
    pluginId: identity.pluginId, pluginVersion: identity.pluginVersion,
    surfaceId: identity.surfaceId, surfaceInstanceId: identity.surfaceInstanceId,
    mountPointId: identity.mountPointId,
  });
  let state: 'ACTIVE' | 'DISPOSED' = 'ACTIVE';
  const pending = new Set<AbortController>();
  const requestIds = new Set<string>();
  const hostErrors: BridgeHostError[] = [];
  const audit: BridgeAuditEntry[] = [];
  const requestTimes: number[] = [];
  const eventTimes: number[] = [];
  const subscriptions = new Set<Subscription>();
  let nextSubscriptionId = 0;
  let violations = 0;

  const append = <T>(entries: T[], value: T): void => {
    entries.push(value);
    if (entries.length > limits.maxDiagnosticEntries) entries.shift();
  };
  const recordAudit = (details: Omit<BridgeAuditEntry, keyof SurfaceInstanceIdentity>): void => {
    const entry: BridgeAuditEntry = Object.freeze({
      ...attribution, ...details, requestId: details.requestId.slice(0, 128),
      ...(details.capability === undefined ? {} : { capability: details.capability.slice(0, 256) }),
      ...(details.action === undefined ? {} : { action: details.action.slice(0, 128) }),
      ...(details.subscriptionId === undefined ? {} : { subscriptionId: details.subscriptionId.slice(0, 128) }),
    });
    append(audit, entry);
    try { options.onAudit?.(entry); } catch { /* Audit sinks do not control dispatch. */ }
  };
  const fits = (value: unknown): boolean =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= limits.maxMessageBytes;
  const recordHostError = (request: BridgeRequest, code: BridgeErrorCode, cause: unknown): void => {
    const issue: BridgeHostError = Object.freeze({
      ...attribution, stage: 'bridge', code, requestId: request.requestId,
      capability: request.capability, action: request.action, cause,
    });
    append(hostErrors, issue);
    try { options.onHostError?.(issue); } catch { /* Diagnostics cannot break dispatch. */ }
  };
  const failSession = (code: BridgeErrorCode): void => {
    session.dispose();
    try { options.onSessionFailure?.(code); } catch { /* Host diagnostics only. */ }
  };

  const disposeProvider = (subscription: Subscription): void => {
    const disposer = subscription.disposer;
    subscription.disposer = undefined;
    if (!disposer) return;
    try {
      void Promise.resolve(disposer()).catch(cause => recordHostError(subscription.request, 'ACTION_FAILED', cause));
    } catch (cause) { recordHostError(subscription.request, 'ACTION_FAILED', cause); }
  };
  const closeSubscription = (subscription: Subscription, code: BridgeErrorCode = 'BRIDGE_SESSION_INACTIVE'): void => {
    if (subscription.closed) return;
    subscription.closed = true;
    subscriptions.delete(subscription);
    subscription.buffer.length = 0;
    subscription.controller.abort(code);
    disposeProvider(subscription);
  };
  const eventFailure = (subscription: Subscription, code: BridgeErrorCode, cause: unknown): void => {
    recordHostError(subscription.request, code, cause);
    recordAudit({
      type: 'event', requestId: subscription.request.requestId,
      capability: subscription.request.capability, action: subscription.request.action,
      ...(subscription.subscriptionId ? { subscriptionId: subscription.subscriptionId } : {}),
      resultCode: code, duration: 0, timestamp: Date.now(),
    });
    closeSubscription(subscription, code);
  };
  const deliverEvent = (subscription: Subscription, payload: JsonValue): void => {
    if (state !== 'ACTIVE' || subscription.closed) return;
    const event: BridgeEvent = { type: 'event', subscriptionId: subscription.subscriptionId!, payload };
    if (!fits(event)) { eventFailure(subscription, 'MESSAGE_TOO_LARGE', undefined); return; }
    const now = Date.now();
    while (eventTimes.length && eventTimes[0] <= now - 1000) eventTimes.shift();
    if (eventTimes.length >= limits.eventsPerSecond) { eventFailure(subscription, 'RATE_LIMITED', undefined); return; }
    eventTimes.push(now);
    try { port.postMessage(event); }
    catch { failSession('BRIDGE_SESSION_INACTIVE'); }
  };
  const emitEvent = (subscription: Subscription, value: JsonValue): void => {
    if (state !== 'ACTIVE' || subscription.closed) return;
    let payload: JsonValue;
    try { payload = jsonCopy(subscription.action.eventSchema.parse(value)); }
    catch (cause) { eventFailure(subscription, 'INVALID_EVENT', cause); return; }
    if (!subscription.ready) {
      // Include the maximum session-local ID length when bounding buffered bytes.
      if (!fits({ type: 'event', subscriptionId: 'subscription-9007199254740991', payload })) {
        eventFailure(subscription, 'MESSAGE_TOO_LARGE', undefined);
      } else if (subscription.buffer.length >= limits.maxBufferedEvents) {
        eventFailure(subscription, 'INVALID_EVENT', new Error('Event buffer limit exceeded.'));
      } else subscription.buffer.push(payload);
      return;
    }
    deliverEvent(subscription, payload);
  };

  const dispatch = async (value: unknown): Promise<BridgeResponse> => {
    const started = Date.now();
    const fields = isRecord(value) ? value : {};
    const requestId = typeof fields.requestId === 'string' ? fields.requestId : '';
    let request: BridgeRequest | BridgeUnsubscribeRequest | undefined;
    // Read only correlation metadata before validation. Authorization still uses
    // the parsed envelope and the immutable MessagePort-bound identity below.
    let auditType: BridgeAuditEntry['type'] = fields.type === 'unsubscribe' ? 'unsubscribe' : 'request';
    let subscriptionId = fields.type === 'unsubscribe' && typeof fields.subscriptionId === 'string'
      ? fields.subscriptionId : undefined;
    let auditTarget: Pick<BridgeRequest, 'capability' | 'action'> | undefined;
    if (fields.type === 'unsubscribe') {
      auditTarget = [...subscriptions].find(entry => entry.subscriptionId === subscriptionId)?.request;
    } else if (isCapabilityId(fields.capability) && typeof fields.action === 'string') {
      auditTarget = { capability: fields.capability, action: fields.action };
      const actions = runtime.bridgeContracts.get(fields.capability)?.actions;
      if (actions && Object.hasOwn(actions, fields.action)) auditType = actions[fields.action].kind;
    }
    // Every exit, including pre-provider rejection and cancellation, is audited once.
    const finish = (response: BridgeResponse): BridgeResponse => {
      recordAudit({
        type: auditType, requestId: requestId.slice(0, 128),
        ...(subscriptionId === undefined ? {} : { subscriptionId }),
        ...(auditTarget ? { capability: auditTarget.capability, action: auditTarget.action } : {}),
        resultCode: response.ok ? 'OK' : response.error.code,
        duration: Math.max(0, Date.now() - started), timestamp: started,
      });
      if (state === 'ACTIVE') {
        try { port.postMessage(response); } catch { failSession('BRIDGE_SESSION_INACTIVE'); }
      }
      return response;
    };
    const reject = (code: BridgeErrorCode, severe = false): BridgeResponse => {
      let response: BridgeResponse = { type: 'response', requestId, ok: false, error: { code, message: messages[code] } };
      // An invalid correlation ID must not turn a rejection into another oversized message.
      if (!fits(response)) response = { ...response, requestId: '' };
      finish(response);
      if (severe && ++violations >= limits.maxProtocolViolations && state === 'ACTIVE') failSession(code);
      return response;
    };
    if (state !== 'ACTIVE') return reject('BRIDGE_SESSION_INACTIVE');
    try {
      if (!fits(value)) return reject('MESSAGE_TOO_LARGE', true);
      request = parseRequest(value);
    } catch { /* Cyclic or non-JSON input is an invalid envelope. */ }
    if (request === undefined) return reject('INVALID_REQUEST', true);
    if (request.type === 'unsubscribe') subscriptionId = request.subscriptionId;
    if (requestIds.has(requestId)) return reject('DUPLICATE_REQUEST', true);
    if (requestIds.size >= limits.maxRequestIds) {
      const response = reject('RATE_LIMITED');
      failSession('RATE_LIMITED');
      return response;
    }
    requestIds.add(requestId);
    violations = 0;
    if (request.type === 'unsubscribe') {
      subscriptionId = request.subscriptionId;
      const subscription = [...subscriptions].find(entry => entry.subscriptionId === subscriptionId);
      if (subscription) closeSubscription(subscription);
      return finish({ type: 'response', requestId, ok: true, result: null });
    }
    // Count all valid envelopes, including rejected actions, against the session rate.
    while (requestTimes.length && requestTimes[0] <= started - 1000) requestTimes.shift();
    if (requestTimes.length >= limits.requestsPerSecond) return reject('RATE_LIMITED');
    requestTimes.push(started);
    const actionRequest = request;
    if (!identity.requires.includes(request.capability)) return reject('UNDECLARED_CAPABILITY_REQUIRE');
    const contract = runtime.bridgeContracts.get(request.capability);
    if (contract === undefined) return reject('CAPABILITY_UNAVAILABLE');
    const action = Object.hasOwn(contract.actions, request.action) ? contract.actions[request.action] : undefined;
    if (action === undefined) return reject('UNKNOWN_ACTION');
    auditType = action.kind;
    let payload: JsonValue;
    try { payload = jsonCopy(action.requestSchema.parse(request.payload)); }
    catch { return reject('INVALID_REQUEST'); }
    if (action.requiredPermissions.some(permission => !identity.grantedPermissions.includes(permission))) return reject('PERMISSION_DENIED');
    const provider = runtime.capabilities.list().find(entry => entry.id === request.capability);
    if (provider === undefined || runtime.plugins.get(provider.providerPluginId)?.state !== 'ACTIVE') return reject('CAPABILITY_UNAVAILABLE');
    if (pending.size >= limits.maxConcurrentRequests) return reject('CONCURRENCY_LIMITED');
    if (action.kind === 'subscription' && subscriptions.size >= limits.maxSubscriptions) return reject('SUBSCRIPTION_LIMITED');
    const controller = new AbortController();
    const subscription: Subscription | undefined = action.kind === 'subscription'
      ? { request: actionRequest, action, controller, buffer: [], ready: false, closed: false } : undefined;
    if (subscription) subscriptions.add(subscription);
    pending.add(controller);
    const cancelled = new Promise<never>((_resolve, rejectPromise) => {
      controller.signal.addEventListener('abort', () => rejectPromise(controller.signal.reason), { once: true });
    });
    const timeout = setTimeout(() => controller.abort('TIMEOUT'), limits.requestTimeoutMs);
    try {
      let rawResult: unknown;
      try {
        rawResult = await Promise.race([
          Promise.resolve().then(async () => {
            if (controller.signal.aborted) throw controller.signal.reason;
            const context = {
              pluginId: identity.pluginId, surfaceId: identity.surfaceId,
              surfaceInstanceId: identity.surfaceInstanceId, mountPointId: identity.mountPointId,
              signal: controller.signal,
            };
            const capability = runtime.capabilities.require(actionRequest.capability);
            if (action.kind === 'request') return action.invoke(capability, payload, context);
            const opened = await action.open(capability, payload, context, event => emitEvent(subscription!, event));
            subscription!.disposer = () => opened.dispose();
            // A provider may finish opening after timeout/unmount. It still owes cleanup.
            if (subscription!.closed) disposeProvider(subscription!);
            return opened;

          }), cancelled,
        ]);
      } catch (cause) {
        const code = controller.signal.aborted
          ? controller.signal.reason as BridgeErrorCode
          : 'ACTION_FAILED';
        if (!controller.signal.aborted) recordHostError(request, code, cause);
        return reject(code);
      }
      if (controller.signal.aborted) return reject('BRIDGE_SESSION_INACTIVE');
      let result: JsonValue;
      try {
        if (action.kind === 'request') result = jsonCopy(action.resultSchema.parse(rawResult));
        else {
          const opened = rawResult as OpenedBridgeSubscription;
          if (typeof opened.dispose !== 'function') throw Error('Subscription must have a disposer.');
          const snapshot = jsonCopy(action.snapshotSchema.parse(opened.snapshot));
          subscriptionId = `subscription-${++nextSubscriptionId}`;
          subscription!.subscriptionId = subscriptionId;
          result = { subscriptionId, snapshot };
        }
      }
      catch (cause) { recordHostError(request, 'INVALID_RESULT', cause); return reject('INVALID_RESULT'); }
      const response: BridgeResponse = { type: 'response', requestId, ok: true, result };
      if (!fits(response)) return reject('MESSAGE_TOO_LARGE');
      finish(response);
      if (subscription && !subscription.closed) {
        subscription.ready = true;
        const buffered = subscription.buffer.splice(0);
        for (const event of buffered) deliverEvent(subscription, event);
      }
      return response;
    } finally {
      if (subscription && !subscription.ready) closeSubscription(subscription);
      clearTimeout(timeout);
      pending.delete(controller);
    }
  };

  const onMessage = (event: MessageEvent): void => {
    void dispatch(event.data).catch(() => failSession('BRIDGE_SESSION_INACTIVE'));
  };
  const session: PluginBridgeSession = Object.freeze({
    identity,
    get state() { return state; },
    get pendingRequestCount() { return pending.size; },
    get subscriptionCount() { return [...subscriptions].filter(entry => entry.ready).length; },
    get hostErrors() { return Object.freeze([...hostErrors]); },
    get audit() { return Object.freeze([...audit]); },
    dispatch,
    dispose() {
      if (state === 'DISPOSED') return;
      state = 'DISPOSED';
      for (const controller of pending) controller.abort('BRIDGE_SESSION_INACTIVE');
      pending.clear();
      for (const subscription of subscriptions) closeSubscription(subscription);
      port.removeEventListener('message', onMessage);
      port.close();
    },
  });
  port.addEventListener('message', onMessage);
  port.start();
  return session;
}
