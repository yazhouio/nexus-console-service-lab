import type { ContributionRegistry, JsonValue, OwnedContribution } from './contribution';
import { frozenCopy } from './immutable';
import { UiError } from './ui/runtime';
import { assertUiJson, matchesContext } from './ui/schema';
import { actionAvailability, conditionError } from './ui/action-conditions';
import { admitContribution, comparePointContributions } from './ui/admission';
import { uiKey, type ActionContributionDefinition, type ContributionRef, type ExtensionPointRef, type HostContributionPolicy } from './ui/definitions';

export interface ActionInput {
  readonly invocationId: string;
  readonly ownerPluginId: string;
  readonly actionId: string;
  readonly context: JsonValue;
  readonly payload: JsonValue;
  readonly signal: AbortSignal;
}
export type ActionHandler = (input: ActionInput & { readonly capabilities: { invoke(capability: `${string}@${number}`, action: string, payload: JsonValue): Promise<JsonValue> } }) => JsonValue | Promise<JsonValue>;
export interface ActionSession {
  invoke(): JsonValue | Promise<JsonValue>;
  cancel?(): void;
  dispose(): void | Promise<void>;
}
export interface ActionDriver { connect(input: ActionInput): Promise<ActionSession> }
export type ActionOutcome = { readonly invocationId: string } & (
  { readonly state: 'succeeded'; readonly result: JsonValue } |
  { readonly state: 'failed'; readonly code: string } |
  { readonly state: 'cancelled' | 'timed-out' }
);

/** Action owns a one-shot Invocation. It neither allocates nor requires a Surface Scope. */
export function createActionRuntime(options: { registry: ContributionRegistry; policy: HostContributionPolicy; driver: ActionDriver; timeoutMs?: number; canUseCapability?: (owner: string, capability: `${string}@${number}`) => boolean }) {
  const points = new Map(frozenCopy(options.registry.listExtensionPoints()).map(p => [uiKey(p.ownerPluginId, p.contribution.id), p]));
  const definitions = new Set(options.registry.listActions().map(a => uiKey(a.ownerPluginId, a.contribution.id)));
  const relations = frozenCopy(options.registry.listExtensions().filter((e): e is OwnedContribution<ActionContributionDefinition> => e.contribution.kind === 'action').map(entry => {
    const definition = entry.contribution;
    const point = points.get(uiKey(definition.point.ownerPluginId, definition.point.id));
    const admission = point ? admitContribution(entry.ownerPluginId, definition, point.contribution, options.policy) : { authorized: false, reason: 'POINT_MISSING' };
    return { ...entry, ...admission, reason: admission.reason ?? (point ? conditionError(point.contribution, definition) : undefined) ?? (!definitions.has(uiKey(entry.ownerPluginId, definition.actionId)) ? 'ACTION_MISSING' : undefined) };
  }));
  const active = new Map<string, { ownerPluginId: string; actionId: string; cancel(): void }>();
  const outcomes: { readonly invocationId: string; readonly state: ActionOutcome['state']; readonly code?: string }[] = [];
  const cleanups = new Set<Promise<void>>();
  let closed = false;
  const track = (task: Promise<void>) => { cleanups.add(task); void task.finally(() => cleanups.delete(task)).catch(() => undefined); };
  function resolvePoint(owner: string, ref: ExtensionPointRef, context: JsonValue) {
    if (closed) throw new UiError('ACTION_RUNTIME_CLOSED');
    const point = points.get(uiKey(ref.ownerPluginId, ref.id));
    if (owner !== ref.ownerPluginId) throw new UiError('POINT_NOT_OWNED');
    if (!point || point.contribution.contractMajor !== ref.contractMajor || point.contribution.kind !== 'action') throw new UiError('POINT_CONTRACT_MISMATCH');
    assertUiJson(context);
    if (!matchesContext(point.contribution.contextSchema, context)) throw new UiError('CONTEXT_INVALID');
    return point.contribution;
  }
  const api = {
    query(owner: string, point: ExtensionPointRef, context: JsonValue) {
      const contract = resolvePoint(owner, point, context);
      return relations.filter(r => r.contribution.point.ownerPluginId === point.ownerPluginId && r.contribution.point.id === point.id).sort((a, b) => comparePointContributions(contract, a, b)).map(r => ({ ...r, ...actionAvailability(contract, r.contribution, context, id => options.canUseCapability?.(r.ownerPluginId, id) ?? false) }));
    },
    invoke(owner: string, pointRef: ExtensionPointRef, ref: ContributionRef, context: JsonValue, input: { payload?: JsonValue; timeoutMs?: number; signal?: AbortSignal } = {}) {
      const point = resolvePoint(owner, pointRef, context);
      const relation = api.query(owner, pointRef, context).find(r => r.ownerPluginId === ref.ownerPluginId && r.contribution.id === ref.id);
      if (!relation || relation.reason) throw new UiError(relation?.reason ?? 'ACTION_NOT_AVAILABLE');
      if (!relation.visible || relation.disabled) throw new UiError('ACTION_DISABLED');
      const payload = input.payload ?? null;
      assertUiJson(payload);
      if (point.payloadSchema && !matchesContext(point.payloadSchema, payload)) throw new UiError('PAYLOAD_INVALID');
      const timeoutMs = input.timeoutMs ?? options.timeoutMs ?? 30_000;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new UiError('INVALID_ACTION_TIMEOUT');
      if (active.size >= 128) throw new UiError('ACTION_RESOURCE_LIMIT');
      const invocationId = crypto.randomUUID();
      const controller = new AbortController();
      let resolve!: (outcome: ActionOutcome) => void;
      const result = new Promise<ActionOutcome>(r => { resolve = r; });
      let completed = false, session: ActionSession | undefined, disposed = false;
      const dispose = () => {
        if (disposed || !session) return;
        disposed = true;
        track(Promise.resolve().then(() => session!.dispose()).catch(() => undefined));
      };
      const finish = (outcome: ActionOutcome) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer); input.signal?.removeEventListener('abort', cancel);
        if (outcome.state === 'cancelled' || outcome.state === 'timed-out') { try { session?.cancel?.(); } catch { /* Best effort only. */ } }
        controller.abort(); dispose(); active.delete(invocationId);
        const snapshot = frozenCopy(outcome); outcomes.push({ invocationId: snapshot.invocationId, state: snapshot.state, ...(snapshot.state === 'failed' ? { code: snapshot.code } : {}) }); if (outcomes.length > 200) outcomes.shift();
        resolve(snapshot);
      };
      const cancel = () => finish({ invocationId, state: 'cancelled' });
      const timer = setTimeout(() => finish({ invocationId, state: 'timed-out' }), timeoutMs);
      active.set(invocationId, { ownerPluginId: ref.ownerPluginId, actionId: relation.contribution.actionId, cancel });
      input.signal?.addEventListener('abort', cancel, { once: true });
      const snapshot = frozenCopy(context), payloadSnapshot = frozenCopy(payload);
      if (input.signal?.aborted) cancel();
      else track(Promise.resolve().then(async () => {
        if (completed) return;
        try {
          session = await options.driver.connect({ invocationId, ownerPluginId: ref.ownerPluginId, actionId: relation.contribution.actionId, context: snapshot, payload: payloadSnapshot, signal: controller.signal });
          if (completed) { dispose(); return; }
          void Promise.resolve().then(() => completed ? undefined : session!.invoke()).then(value => {
            assertUiJson(value);
            finish({ invocationId, state: 'succeeded', result: value });
          }).catch(() => finish({ invocationId, state: 'failed', code: 'ACTION_FAILED' }));
        } catch { finish({ invocationId, state: 'failed', code: 'ACTION_CONNECTION_FAILED' }); }
      }));
      return Object.freeze({ invocationId, result, cancel });
    },
    inspect() { return frozenCopy({ active: [...active].map(([invocationId, value]) => ({ invocationId, ownerPluginId: value.ownerPluginId, actionId: value.actionId })), outcomes, relations }); },
    async settled() { while (cleanups.size) await Promise.allSettled([...cleanups]); },
    async dispose() { closed = true; for (const invocation of active.values()) invocation.cancel(); await api.settled(); },
  };
  return api;
}
export type ActionRuntime = ReturnType<typeof createActionRuntime>;
