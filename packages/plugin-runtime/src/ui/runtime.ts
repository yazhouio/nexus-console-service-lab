import type { ContributionRegistry, HostRenderTarget, JsonValue } from '../contribution';
import { admitContribution, comparePointContributions } from './admission';
import { frozenCopy } from '../immutable';
import { uiKey, type ContributionRef, type CompiledExtensionPointDefinition, type HostContributionPolicy, type SurfaceContributionDefinition, type TabContributionDefinition } from './definitions';
import { assertUiJson, matchesContext, canonicalJson } from './schema';

export class UiError extends Error { constructor(readonly code: string, readonly stage?: UiExecution['stage']) { super(code); this.name = 'UiError'; } }
export interface UiSizing { readonly mode: 'content-sized' | 'bounded'; readonly minWidth?: number; readonly maxWidth?: number; readonly minHeight?: number; readonly maxHeight?: number }
export interface SlotInput { readonly id: string; readonly contextKey: string; readonly context: JsonValue; readonly hidden?: boolean; readonly selected?: readonly ContributionRef[]; readonly sizing?: UiSizing }
export interface ContextSnapshot { readonly contextKey: string; readonly revision: number; readonly value: JsonValue }
export interface UiExecution { readonly phase: 'starting' | 'ready' | 'failed'; readonly attemptId: string; readonly error?: string; readonly stage?: 'artifact' | 'wujie-bootstrap' | 'handshake' | 'render' | 'bridge'; readonly retryTarget?: string }
export interface UiRelation { readonly ref: ContributionRef; readonly definition: SurfaceContributionDefinition | TabContributionDefinition; readonly authorized: boolean; readonly availability: 'available' | 'unavailable'; readonly reason?: string }
export interface SlotObservation {
  readonly occurrenceId: string; readonly pointId: string; readonly runtimeError?: string; readonly lifecycle: 'active'; readonly visibility: 'visible' | 'hidden';
  readonly input: { readonly submittedKey: string; readonly acceptance: 'accepted' | 'rejected'; readonly error?: string; readonly lastAccepted: ContextSnapshot | null; readonly effective: ContextSnapshot | null };
  readonly contributions: readonly { readonly ref: ContributionRef; readonly label?: string; readonly initiallySelected?: boolean; readonly tabId?: string; readonly availability: 'available' | 'unavailable'; readonly reason?: string; readonly selected: boolean; readonly execution?: UiExecution }[];
}
export interface UiObservation { readonly streamId: string; readonly progress: number; readonly initialContext: ContextSnapshot | null; readonly context: ContextSnapshot | null; readonly overlayInput: JsonValue | null; readonly occurrences: readonly SlotObservation[] }
export interface OverlayObservation { readonly handle: string; readonly surfaceId: string; readonly input: JsonValue; readonly outcome: { readonly state: 'pending' | 'completed' | 'cancelled'; readonly result?: JsonValue }; readonly execution?: UiExecution }
export interface OverlaySnapshot { readonly streamId: string; readonly progress: number; readonly overlays: readonly OverlayObservation[] }
export interface UiMounted { dispose(): void | Promise<void> }
export interface UiDriver {
  mount(input: { attemptId: string; ownerPluginId: string; surfaceId: string; target: HostRenderTarget; placement: unknown; signal: AbortSignal }): Promise<UiMounted>;
  allocate(anchor: unknown, id: string, sizing: UiSizing): { placement: unknown; dispose(): void };
  visibility(anchor: unknown, hidden: boolean): void;
  layout(placement: unknown, sizing: UiSizing, order: number): void;
  overlay(handle: string, presentation: 'modal' | 'drawer', close: () => void): { placement: unknown; dispose(): void; error(execution: UiExecution, retry: () => void): void };
}
interface Scope { id: string; owner: string; kind: 'root' | 'contribution' | 'overlay'; parent?: Scope; guardOccurrence?: string; active: boolean; children: Set<Scope>; attempt?: Attempt; surfaceId?: string; target?: HostRenderTarget; placement: unknown; release?: () => void; context: ContextSnapshot | null; overlays: Set<Overlay>; overlay?: Overlay; changed?: () => void }
interface Attempt { id: string; scope: Scope; valid: boolean; signal: AbortController; initial: ContextSnapshot | null; pinned: boolean; occurrences: Set<Occurrence>; execution: UiExecution; task: Promise<void>; mounted?: UiMounted; cleanup?: Promise<void> }
interface Occurrence { id: string; attempt: Attempt; point: CompiledExtensionPointDefinition; anchor: unknown; input: SlotInput; lastAccepted: ContextSnapshot | null; effective: ContextSnapshot | null; error?: string; runtimeError?: string; executions: Map<string, Scope>; active: boolean }
interface Overlay { id: string; owner: Scope; surfaceId: string; input: JsonValue; outcome: OverlayObservation['outcome']; execution: Scope; view: ReturnType<UiDriver['overlay']> }
export interface UiRuntimeOptions {
  /** Supply completed declarations; this runtime snapshots them at construction. */
  registry: ContributionRegistry;
  driver: UiDriver;
  /** Static, side-effect-free admission policy, evaluated once per cross-owner relation.
   * Throwing denies that relation with POLICY_ERROR; it cannot abort unrelated UI.
   * Changes require a new runtime, like changes to declarations.
   */
  policy: HostContributionPolicy;
  canOverlay?: (owner: string) => boolean;
  maxScopes?: number;
  maxDepth?: number;
  maxOverlaysPerScope?: number;
  onError?: (cause: unknown, attemptId: string) => void;
}

/** Host-only logical execution core. Browser placement and communication live in adapters. */
export function createUiRuntime(options: UiRuntimeOptions) {
  const { driver } = options;
  const points = frozenCopy(options.registry.listExtensionPoints());
  const extensions = frozenCopy(options.registry.listExtensions().filter((entry): entry is import('../contribution').OwnedContribution<SurfaceContributionDefinition | TabContributionDefinition> => entry.contribution.kind !== 'action'));
  const surfaces = frozenCopy(options.registry.listUiSurfaces());
  const pointsById = new Map(points.map(point => [uiKey(point.ownerPluginId, point.contribution.id), point]));
  const surfacesById = new Map(surfaces.map(surface => [uiKey(surface.ownerPluginId, surface.contribution.id), surface]));
  const scopes = new Map<string, Scope>();
  const attempts = new Map<string, Attempt>();
  const occurrences = new Map<string, Occurrence>();
  const overlays = new Map<string, Overlay>();
  const listeners = new Set<() => void>();
  const cleanups = new Set<Promise<void>>();
  const epoch = crypto.randomUUID();
  let serial = 0, progress = 0, revision = 0;
  let notifying = false, closed = false;
  const id = (kind: string) => `${epoch}:${kind}:${++serial}`;
  function changed() {
    ++progress;
    if (notifying) return;
    notifying = true;
    queueMicrotask(() => { notifying = false; for (const listener of [...listeners]) { try { listener(); } catch { /* An observer cannot control execution. */ } } });
  }
  const track = (task: Promise<void>) => { cleanups.add(task); void task.finally(() => cleanups.delete(task)).catch(() => undefined); return task; };
  function requireAttempt(attemptId: string): Attempt {
    const a = attempts.get(attemptId);
    if (!a?.valid || !a.scope.active) throw new UiError('STALE_EXECUTION');
    for (let s: Scope | undefined = a.scope; s; s = s.parent) if (!s.active) throw new UiError('STALE_EXECUTION');
    return a;
  }
  function requireOccurrence(attemptId: string, occurrenceId: string): Occurrence {
    const a = requireAttempt(attemptId), o = occurrences.get(occurrenceId);
    if (!o?.active || o.attempt !== a) throw new UiError('STALE_OCCURRENCE');
    return o;
  }
  function newScope(owner: string, kind: Scope['kind'], placement: unknown, parent?: Scope): Scope {
    if (closed) throw new UiError('UI_RUNTIME_CLOSED');
    if (parent && !parent.active) throw new UiError('SCOPE_ENDED');
    let depth = 0; for (let p = parent; p; p = p.parent) ++depth;
    if (scopes.size >= (options.maxScopes ?? 128) || depth >= (options.maxDepth ?? 8)) throw new UiError('UI_RESOURCE_LIMIT');
    const s: Scope = { id: id('scope'), owner, kind, parent, active: true, children: new Set(), placement, context: null, overlays: new Set() };
    scopes.set(s.id, s); parent?.children.add(s); return s;
  }
  function endAttempt(a: Attempt): Promise<void> {
    if (a.cleanup) return a.cleanup;
    a.valid = false;
    // Invalidate descendants before awaiting any physical cleanup.
    for (const o of [...a.occurrences]) endOccurrence(o);
    a.signal.abort();
    a.cleanup = track(a.task.catch(() => undefined).then(async () => {
      try { await a.mounted?.dispose(); } finally { attempts.delete(a.id); changed(); }
    }));
    changed(); return a.cleanup;
  }
  function endScope(s: Scope): void {
    if (!s.active) return;
    s.active = false;
    for (const overlay of [...s.overlays]) {
      if (overlay.outcome.state === 'pending') overlay.outcome = { state: 'cancelled' };
      overlays.delete(overlay.id); overlay.view.dispose();
    }
    s.overlays.clear();
    for (const child of [...s.children]) endScope(child);
    if (s.attempt) void endAttempt(s.attempt);
    s.release?.(); s.parent?.children.delete(s); scopes.delete(s.id); changed();
  }
  function start(s: Scope, initial: ContextSnapshot | null, previous: Promise<void> = Promise.resolve(), attached = false, pinned = false): Attempt {
    if (!s.active) throw new UiError('SCOPE_ENDED');
    const a: Attempt = { id: id('attempt'), scope: s, valid: true, signal: new AbortController(), initial: frozenCopy(initial), pinned, occurrences: new Set(), execution: { phase: 'starting', attemptId: '' }, task: Promise.resolve() };
    a.execution = { phase: attached ? 'ready' : 'starting', attemptId: a.id }; s.attempt = a; attempts.set(a.id, a);
    if (!attached) a.task = previous.catch(() => undefined).then(async () => {
      if (!a.valid) return;
      try {
        a.mounted = await driver.mount({ attemptId: a.id, ownerPluginId: s.owner, surfaceId: s.surfaceId!, target: s.target!, placement: s.placement, signal: a.signal.signal });
        if (a.valid) { a.execution = { phase: 'ready', attemptId: a.id }; s.changed?.(); changed(); }
      } catch (error) {
        if (a.valid) {
          try { options.onError?.(error, a.id); } catch { /* Diagnostics cannot keep a failed execution alive. */ }
          failAttempt(a.id, error instanceof UiError ? error.code : 'SURFACE_FAILED', error instanceof UiError ? error.stage : undefined);
        }
      }
    });
    changed(); return a;
  }
  function failAttempt(attemptId: string, error = 'SURFACE_FAILED', stage?: UiExecution['stage']) {
    const a = attempts.get(attemptId); if (!a?.valid) return;
    a.execution = { phase: 'failed', attemptId, error, ...(stage ? { stage } : {}), retryTarget: attemptId };
    void endAttempt(a); a.scope.changed?.(); changed();
  }
  function retryScope(s: Scope, target: string) {
    const old = s.attempt;
    if (!s.active || old?.id !== target || old.execution.phase !== 'failed') throw new UiError('STALE_RETRY');
    // This synchronous boundary is the Host's acceptance point, before slow cleanup/mount.
    const baseline = frozenCopy(s.context);
    const a = start(s, baseline, endAttempt(old), false, true); s.changed?.(); return a.id;
  }
  function compileRelations(pointOwner: string, point: CompiledExtensionPointDefinition): UiRelation[] {
    return extensions.filter(({ contribution: c }) => c.point.ownerPluginId === pointOwner && c.point.id === point.id).sort((a,b) => comparePointContributions(point, a, b)).map(({ ownerPluginId, contribution: c }) => {
      const admission = admitContribution(ownerPluginId, c, point, options.policy);
      const { authorized } = admission;
      const surface = surfacesById.get(uiKey(ownerPluginId, c.surfaceId));
      const reason = admission.reason ?? (!surface ? 'SURFACE_MISSING' : undefined);
      return { ref: { ownerPluginId, id: c.id }, definition: c, authorized, availability: reason ? 'unavailable' : 'available', ...(reason ? { reason } : {}) };
    });
  }
  const relationTable = new Map(points.map(({ ownerPluginId, contribution }) => [uiKey(ownerPluginId, contribution.id), frozenCopy(compileRelations(ownerPluginId, contribution))]));
  function relations(owner: string, point: CompiledExtensionPointDefinition): readonly UiRelation[] { return relationTable.get(uiKey(owner, point.id)) ?? []; }
  function endOccurrence(o: Occurrence) {
    if (!o.active) return;
    o.active = false; occurrences.delete(o.id); o.attempt.occurrences.delete(o);
    for (const s of o.executions.values()) endScope(s);
    o.executions.clear(); changed();
  }
  function validateInput(input: SlotInput) {
    assertUiJson(input);
    if (typeof input.id !== 'string' || !input.id || typeof input.contextKey !== 'string' || !input.contextKey || input.hidden !== undefined && typeof input.hidden !== 'boolean') throw new UiError('INVALID_SLOT_INPUT');
    if (input.selected !== undefined && (!Array.isArray(input.selected) || input.selected.some(r => !r || typeof r.id !== 'string' || typeof r.ownerPluginId !== 'string'))) throw new UiError('INVALID_SELECTION');
    const size = input.sizing;
    if (size) {
      if (!['content-sized','bounded'].includes(size.mode)) throw new UiError('INVALID_SIZING');
      for (const key of ['minWidth','maxWidth','minHeight','maxHeight'] as const) if (size[key] !== undefined && (!Number.isFinite(size[key]) || size[key]! < 0)) throw new UiError('INVALID_SIZING');
      if ((size.minWidth ?? 0) > (size.maxWidth ?? Infinity) || (size.minHeight ?? 0) > (size.maxHeight ?? Infinity)) throw new UiError('INVALID_SIZING');
    }
  }
  function pointInput(owner: string, point: CompiledExtensionPointDefinition, input: SlotInput): SlotInput {
    validateInput(input);
    if (point.kind !== 'surface' && point.kind !== 'tab') throw new UiError('POINT_KIND_MISMATCH');
    if (point.kind === 'tab') {
      if ((input.selected?.length ?? 0) > 1) throw new UiError('TAB_SELECTION_INVALID');
      input = { ...input, selected: input.selected ?? [] };
    }
    const selected = relations(owner, point).filter(r => r.availability === 'available' && (input.selected === undefined || input.selected.some(ref => uiKey(ref.ownerPluginId, ref.id) === uiKey(r.ref.ownerPluginId, r.ref.id))));
    if (point.constraints?.presentations && !point.constraints.presentations.includes(point.kind === 'tab' ? 'tab' : 'inline')) throw new UiError('POINT_PRESENTATION_INVALID');
    const limits = point.constraints?.cardinality;
    if (limits && (selected.length < limits.min || selected.length > limits.max)) throw new UiError('POINT_CARDINALITY_INVALID');
    const bounds = point.constraints?.sizing;
    if (bounds) {
      const { modes, ...dimensions } = bounds;
      const size = input.sizing ?? { mode: modes[0], ...dimensions };
      if (!modes.includes(size.mode)) throw new UiError('POINT_SIZING_INVALID');
      for (const name of ['Width','Height'] as const) {
        const min = `min${name}` as const, max = `max${name}` as const;
        if (bounds[min] !== undefined && (size[min] ?? 0) < bounds[min]! || bounds[max] !== undefined && (size[max] ?? Infinity) > bounds[max]!) throw new UiError('POINT_SIZING_INVALID');
      }
      input = { ...input, sizing: size };
    }
    return input;
  }
  function reconcile(o: Occurrence, input: SlotInput) {
    input = pointInput(o.attempt.scope.owner, o.point, input);
    if (input.id !== o.point.id) throw new UiError('POINT_CHANGED');
    const keyChanged = input.contextKey !== o.input.contextKey;
    if (keyChanged) { for (const s of o.executions.values()) endScope(s); o.executions.clear(); o.effective = null; }
    const contextChanged = !o.lastAccepted || keyChanged || canonicalJson(o.input.context) !== canonicalJson(input.context);
    o.runtimeError = undefined;
    o.input = frozenCopy(input);
    if (matchesContext(o.point.contextSchema, input.context)) {
      o.error = undefined;
      if (contextChanged) { o.effective = frozenCopy({ contextKey: input.contextKey, revision: ++revision, value: input.context }); o.lastAccepted = o.effective; }
    } else o.error = 'CONTEXT_INVALID';
    driver.visibility(o.anchor, input.hidden ?? false);
    const allowed = relations(o.attempt.scope.owner, o.point).filter(r => r.authorized && r.availability === 'available');
    const selected = allowed.filter(r => input.selected === undefined || input.selected.some(ref => ref.ownerPluginId === r.ref.ownerPluginId && ref.id === r.ref.id));
    for (const [key, s] of o.executions) if (!selected.some(r => uiKey(r.ref.ownerPluginId, r.ref.id) === key)) { endScope(s); o.executions.delete(key); }
    if (o.effective) for (const r of selected) {
      const key = uiKey(r.ref.ownerPluginId, r.ref.id), existing = o.executions.get(key);
      if (existing) {
        existing.context = o.effective;
        try { driver.layout(existing.placement, input.sizing ?? { mode: 'content-sized' }, selected.indexOf(r)); }
        catch { if (existing.attempt) failAttempt(existing.attempt.id); }
        continue;
      }
      const surface = surfacesById.get(uiKey(r.ref.ownerPluginId, r.definition.surfaceId))!;
      let cell: ReturnType<UiDriver['allocate']> | undefined;
      let s: Scope | undefined;
      try {
        cell = driver.allocate(o.anchor, key, input.sizing ?? { mode: 'content-sized' });
        s = newScope(r.ref.ownerPluginId, 'contribution', cell.placement, o.attempt.scope);
        s.release = cell.dispose;
        s.guardOccurrence = o.id; driver.layout(cell.placement, input.sizing ?? { mode: 'content-sized' }, selected.indexOf(r)); s.context = o.effective; s.surfaceId = r.definition.surfaceId; s.target = surface.contribution.target;
        o.executions.set(key, s); start(s, s.context);
      } catch (error) {
        if (s) endScope(s); else cell?.dispose();
        o.runtimeError = error instanceof UiError ? error.code : 'UI_PLACEMENT_FAILED';
      }
    }
    changed();
  }
  function slotSnapshot(o: Occurrence): SlotObservation {
    return {
      occurrenceId: o.id, pointId: o.point.id, ...(o.runtimeError ? { runtimeError: o.runtimeError } : {}), lifecycle: 'active', visibility: o.input.hidden ? 'hidden' : 'visible',
      input: { submittedKey: o.input.contextKey, acceptance: o.error ? 'rejected' : 'accepted', ...(o.error ? { error: o.error } : {}), lastAccepted: o.lastAccepted, effective: o.effective },
      contributions: relations(o.attempt.scope.owner, o.point).filter(r => r.authorized).map(r => {
        const s = o.executions.get(uiKey(r.ref.ownerPluginId, r.ref.id));
        return { ref: r.ref, ...(r.definition.label ? { label: r.definition.label } : {}), ...(r.definition.kind === 'tab' ? { tabId: r.definition.tabId } : r.definition.initiallySelected === undefined ? {} : { initiallySelected: r.definition.initiallySelected }), availability: r.availability, ...(r.reason ? { reason: r.reason } : {}), selected: o.input.selected === undefined || o.input.selected.some(ref => ref.ownerPluginId === r.ref.ownerPluginId && ref.id === r.ref.id), ...(s?.attempt ? { execution: s.attempt.execution } : {}) };
      }),
    };
  }
  function overlaySnapshot(overlay: Overlay): OverlayObservation {
    return { handle: overlay.id, surfaceId: overlay.surfaceId, input: overlay.input, outcome: overlay.outcome, ...(overlay.execution.active && overlay.execution.attempt ? { execution: overlay.execution.attempt.execution } : {}) };
  }
  function finishOverlay(o: Overlay, outcome: OverlayObservation['outcome']) {
    if (!o.owner.active) throw new UiError('SCOPE_ENDED');
    if (o.outcome.state !== 'pending') return o.outcome;
    o.outcome = frozenCopy(outcome); endScope(o.execution); o.view.dispose(); changed(); return o.outcome;
  }
  function ownedOverlay(attemptId: string, handle: string) {
    const a = requireAttempt(attemptId), o = overlays.get(handle);
    if (!o || o.owner !== a.scope) throw new UiError('OVERLAY_NOT_OWNED');
    return o;
  }
  const api = {
    attachOwner(owner: string, placement: unknown) { const s = newScope(owner, 'root', placement); const a = start(s, null, undefined, true); return { scopeId: s.id, attemptId: a.id, dispose: () => endScope(s) }; },
    mountRoot(owner: string, surfaceId: string, target: HostRenderTarget, placement: unknown, previous?: Promise<void>) {
      const s = newScope(owner, 'root', placement); s.surfaceId = surfaceId; s.target = target; start(s, null, previous);
      return { scopeId: s.id, get attemptId() { return s.attempt!.id; }, get execution() { return s.attempt!.execution; }, retry: () => retryScope(s, s.attempt!.id), dispose: () => endScope(s) };
    },
    identity(attemptId: string) { const a = requireAttempt(attemptId); return { ownerPluginId: a.scope.owner, scopeId: a.scope.id, signal: a.signal.signal }; },
    mountSlot(attemptId: string, anchor: unknown, input: SlotInput) {
      validateInput(input); const a = requireAttempt(attemptId);
      if (a.occurrences.size >= 32) throw new UiError('UI_RESOURCE_LIMIT');
      const point = pointsById.get(uiKey(a.scope.owner, input.id))?.contribution;
      if (!point) throw new UiError('POINT_NOT_OWNED');
      input = pointInput(a.scope.owner, point, input);
      const o: Occurrence = { id: id('occurrence'), attempt: a, point, anchor, input: frozenCopy(input), active: true, lastAccepted: null, effective: null, executions: new Map() };
      occurrences.set(o.id, o); a.occurrences.add(o); reconcile(o, input); return o.id;
    },
    updateSlot(attemptId: string, occurrenceId: string, input: SlotInput) { reconcile(requireOccurrence(attemptId, occurrenceId), input); },
    unmountSlot(attemptId: string, occurrenceId: string) { endOccurrence(requireOccurrence(attemptId, occurrenceId)); },
    retry(attemptId: string, occurrenceId: string, target: string) {
      const o = requireOccurrence(attemptId, occurrenceId), s = [...o.executions.values()].find(s => s.attempt?.id === target);
      if (!s) throw new UiError('STALE_RETRY'); return retryScope(s, target);
    },
    snapshot(attemptId: string): UiObservation {
      const a = requireAttempt(attemptId);
      return frozenCopy({ streamId: a.id, progress, initialContext: a.pinned ? a.initial : a.scope.context, context: a.scope.context, overlayInput: a.scope.overlay?.input ?? null, occurrences: [...a.occurrences].map(slotSnapshot) });
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    failAttempt,
    openOverlay(attemptId: string, surfaceId: string, input: JsonValue, presentation: 'modal' | 'drawer' = 'modal') {
      assertUiJson(input); const a = requireAttempt(attemptId);
      if (!options.canOverlay?.(a.scope.owner)) throw new UiError('OVERLAY_PERMISSION_DENIED');
      if (!['modal','drawer'].includes(presentation)) throw new UiError('INVALID_OVERLAY');
      if (a.scope.overlays.size >= (options.maxOverlaysPerScope ?? 32)) throw new UiError('UI_RESOURCE_LIMIT');
      const surface = surfacesById.get(uiKey(a.scope.owner, surfaceId));
      if (!surface) throw new UiError('SURFACE_NOT_OWNED');
      const handle = id('overlay');
      const view = driver.overlay(handle, presentation, () => { const o = overlays.get(handle); if (o) finishOverlay(o, { state: 'cancelled' }); });
      let execution: Scope;
      try { execution = newScope(a.scope.owner, 'overlay', view.placement, a.scope); } catch (error) { view.dispose(); throw error; }
      const o: Overlay = { id: handle, owner: a.scope, surfaceId, input: frozenCopy(input), outcome: { state: 'pending' }, execution, view };
      execution.surfaceId = surfaceId; execution.target = surface.contribution.target; execution.overlay = o;
      execution.changed = () => { if (execution.attempt && o.outcome.state === 'pending') view.error(execution.attempt.execution, () => { if (execution.attempt) retryScope(execution, execution.attempt.id); }); };
      overlays.set(handle, o); a.scope.overlays.add(o); start(execution, null); changed(); return handle;
    },
    overlaySnapshot(attemptId: string, handle?: string): OverlaySnapshot {
      const a = requireAttempt(attemptId);
      const items = handle ? [ownedOverlay(attemptId, handle)] : [...a.scope.overlays];
      return frozenCopy({ streamId: a.scope.id, progress, overlays: items.map(overlaySnapshot) });
    },
    completeOverlay(attemptId: string, result: JsonValue) { assertUiJson(result); const a = requireAttempt(attemptId); if (!a.scope.overlay) throw new UiError('NOT_OVERLAY_EXECUTION'); return finishOverlay(a.scope.overlay, { state: 'completed', result }); },
    cancelOverlay(attemptId: string, handle: string) { return finishOverlay(ownedOverlay(attemptId, handle), { state: 'cancelled' }); },
    inspect() {
      const relationFacts = extensions.map(({ ownerPluginId, contribution }) => {
        const point = pointsById.get(uiKey(contribution.point.ownerPluginId, contribution.point.id));
        const relation = point && relations(point.ownerPluginId, point.contribution).find(r => r.ref.ownerPluginId === ownerPluginId && r.ref.id === contribution.id);
        return { ref: { ownerPluginId, id: contribution.id }, point: contribution.point, availability: relation?.availability ?? 'unavailable', reason: relation?.reason ?? (point ? undefined : 'POINT_MISSING') };
      });
      return frozenCopy({
        progress, relations: relationFacts,
        scopes: [...scopes.values()].map(s => ({ id: s.id, owner: s.owner, kind: s.kind, parentId: s.parent?.id, guardOccurrence: s.guardOccurrence, attemptId: s.attempt?.id, execution: s.attempt?.execution })),
        attempts: [...attempts.values()].map(a => ({ id: a.id, scopeId: a.scope.id, valid: a.valid })),
        occurrences: [...occurrences.values()].map(o => ({ id: o.id, attemptId: o.attempt.id })), overlays: overlays.size,
      });
    },
    async settled() { while (cleanups.size) await Promise.allSettled([...cleanups]); },
    async dispose() { closed = true; for (const s of [...scopes.values()]) if (!s.parent) endScope(s); await api.settled(); listeners.clear(); },
  };
  return api;
}
export type UiRuntime = ReturnType<typeof createUiRuntime>;
export type UiInspection = ReturnType<UiRuntime['inspect']>;
