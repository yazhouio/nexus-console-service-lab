import { requireInvocationContext } from './invocation-authority';
import type { PluginRuntime } from './bootstrap';
import type { PluginDefinition } from './plugin';
import type { BridgeCapabilityContract, BridgeInvocationContext, RuntimeSchema } from './bridge-contract';
import type { InstallationStore } from './installation-store';
import type { InstalledPluginRecord } from './manifest';
import type { JsonValue } from './contribution';
import type { RouteModel, ResolvedNavigation } from './routing/route-model';
import { inspect, type RuntimeSnapshot } from './inspection';
import { frozenCopy } from './immutable';
import { assertUiJson, matchesContext, type ContextSchema } from './ui/schema';

export const PLATFORM_PLUGIN_ID = 'nexus-platform';
export const PLATFORM_CAPABILITIES = ['routes.query@1','routes.navigate@1','plugins.query@1','plugins.manage@1','diagnostics.query@1','diagnostics.export@1','audit.query@1'] as const;
export type PlatformCapabilityId = typeof PLATFORM_CAPABILITIES[number];
export interface PublicRoute {
  readonly routeId: string;
  readonly ownerPluginId: string;
  readonly ancestry: readonly string[];
  readonly paramsSchema: ContextSchema;
  readonly state: string;
}
export interface PublicRouteLocation {
  readonly routeId: string;
  readonly ownerPluginId: string;
  readonly ancestry: readonly string[];
  readonly params: Readonly<Record<string, string>>;
}
export interface PublicNavigation {
  readonly id: string;
  readonly ownerPluginId: string;
  readonly label: string;
  readonly routeId?: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly point?: { readonly ownerPluginId: string; readonly id: string; readonly contractMajor: number };
  readonly state: 'GROUP' | 'LINK' | 'DISABLED';
  readonly diagnostic?: string;
  readonly children: readonly PublicNavigation[];
}
export interface RoutesSnapshot {
  readonly routes: readonly PublicRoute[];
  readonly current: PublicRouteLocation | null;
  readonly navigation: readonly PublicNavigation[];
}
export interface PluginSummary {
  readonly id: string;
  readonly label: string;
  readonly version: string | null;
  readonly state: string;
  readonly kind: 'builtin' | 'restricted';
  readonly core: boolean;
  readonly manageable: boolean;
  readonly versions: readonly string[];
  readonly installedVersions: readonly string[];
  readonly configuration: { readonly version: string; readonly enabled: boolean } | null;
}
export interface PlatformCatalogEntry { readonly record: InstalledPluginRecord; readonly label: string }
export interface PlatformEnvironment {
  readonly runtime: PluginRuntime;
  readonly model: RouteModel;
  readonly store: InstallationStore;
  readonly catalog?: readonly PlatformCatalogEntry[];
  location(): string;
  navigate(href: string): void;
  diagnostics?(): RuntimeSnapshot;
  audit(): readonly unknown[];
  recordAudit(entry: { type: 'navigation'; pluginId: string; routeId: string; ownerPluginId: string; timestamp: number }): void;
}
interface PlatformService {
  invoke(action: string, payload: JsonValue, context: BridgeInvocationContext): JsonValue;
  watch(context: BridgeInvocationContext, emit: (value: JsonValue) => void): { snapshot: JsonValue; dispose(): void };
}
const json = (value: unknown): JsonValue => {
  const snapshot: unknown = JSON.parse(JSON.stringify(value));
  assertUiJson(snapshot);
  return snapshot;
};
const boundedJson: RuntimeSchema<JsonValue> = { parse(value) { assertUiJson(value); return value; } };
function request(schema: ContextSchema): RuntimeSchema<JsonValue> {
  return { parse(value) { assertUiJson(value); if (!matchesContext(schema, value)) throw Error('INVALID_PLATFORM_REQUEST'); return value; } };
}
const empty = request({ type: 'null' });
const id = { type: 'string', minLength: 1, maxLength: 200 } as const;
const object = (properties: Record<string, ContextSchema>, required = Object.keys(properties)): ContextSchema => ({ type: 'object', properties, required, additionalProperties: false });
const unarySchemas: Readonly<Record<PlatformCapabilityId, Readonly<Record<string, RuntimeSchema<JsonValue>>>>> = {
  'routes.query@1': { list: empty, current: empty, navigation: empty },
  'routes.navigate@1': { navigate: request(object({ routeId: id, params: { type: 'object', maxProperties: 32 } })) },
  'plugins.query@1': { list: empty },
  'plugins.manage@1': { install: request(object({ id, version: id })), selectVersion: request(object({ id, version: id })), setEnabled: request(object({ id, enabled: { type: 'boolean' } })), uninstall: request(object({ id })) },
  'diagnostics.query@1': { get: empty },
  'diagnostics.export@1': { export: empty },
  'audit.query@1': { list: empty },
};
export const platformBridgeContracts: readonly BridgeCapabilityContract[] = frozenCopy(PLATFORM_CAPABILITIES.map(capability => ({
  id: capability,
  actions: {
    ...Object.fromEntries(Object.entries(unarySchemas[capability]).map(([action, requestSchema]) => [action, {
      kind: 'request' as const, requestSchema, resultSchema: boundedJson, requiredPermissions: [capability.split('@')[0]],
      invoke(value: unknown, payload: JsonValue, context: BridgeInvocationContext) { return (value as PlatformService).invoke(action, payload, context); },
    }])),
    ...(['routes.query@1','plugins.query@1'].includes(capability) ? { watch: {
      kind: 'subscription' as const, requestSchema: empty, snapshotSchema: boundedJson, eventSchema: boundedJson, requiredPermissions: [capability.split('@')[0]],
      open(value: unknown, _payload: JsonValue, context: BridgeInvocationContext, emit: (value: JsonValue) => void) { return (value as PlatformService).watch(context, emit); },
    } } : {}),
  },
})));

/** Registers local contracts during Core activation; the Host binds browser/storage adapters afterwards. */
export function createPlatformPlugin() {
  let environment: PlatformEnvironment | undefined;
  const watchers = new Map<PlatformCapabilityId, Set<(value: JsonValue) => void>>();
  const bound = () => { if (!environment) throw Error('PLATFORM_NOT_BOUND'); return environment; };
  function routes(): readonly PublicRoute[] {
    return bound().model.routes.map(route => ({ routeId: route.contribution.id, ownerPluginId: route.ownerPluginId, ancestry: route.ancestry, paramsSchema: bound().model.paramsSchema(route.contribution.id), state: route.state }));
  }
  function current(): PublicRouteLocation | null {
    const env = bound(), resolved = env.model.resolve(env.location());
    if (resolved.state !== 'MATCHED') return null;
    return { routeId: resolved.routeId, ownerPluginId: env.model.routes.find(r => r.contribution.id === resolved.routeId)!.ownerPluginId, ancestry: resolved.chain, params: resolved.context.params };
  }
  function navigation(items = bound().model.navigation): readonly PublicNavigation[] {
    const env = bound();
    return items.map((item: ResolvedNavigation) => {
      const destination = env.model.destination(item.contribution.id, env.location());
      const location = destination.state === 'LINK' ? env.model.resolve(destination.href) : undefined;
      return { id: item.contribution.id, ownerPluginId: item.ownerPluginId, label: item.contribution.label,
        ...(item.contribution.point ? { point: item.contribution.point } : {}),
        ...(item.contribution.routeId ? { routeId: item.contribution.routeId } : {}),
        ...(location?.state === 'MATCHED' ? { params: location.context.params } : {}),
        state: destination.state, ...(destination.state === 'DISABLED' ? { diagnostic: destination.diagnostic.code } : {}), children: navigation(item.children),
      };
    });
  }
  function plugins(): readonly PluginSummary[] {
    const env = bound(), records = env.store.list(), catalog = env.catalog ?? [];
    const ids = new Set([...env.runtime.candidates.map(p => p.descriptor.id), ...records.map(p => p.manifest.id), ...catalog.map(p => p.record.manifest.id)]);
    return [...ids].sort().map(id => {
      const candidate = env.runtime.candidates.find(p => p.descriptor.id === id), record = records.find(p => p.manifest.id === id);
      const core = env.runtime.resolution.coreClosure.has(id), kind = candidate?.kind ?? 'restricted';
      return { id, label: catalog.find(p => p.record.manifest.id === id)?.label ?? id, version: candidate?.descriptor.version ?? null, state: env.runtime.plugins.get(id)?.state ?? 'MISSING', kind, core, manageable: kind === 'restricted' && !core,
        installedVersions: env.store.listVersions(id).map(p => p.manifest.version),
        versions: [...new Set([...catalog.filter(p => p.record.manifest.id === id).map(p => p.record.manifest.version), ...env.store.listVersions(id).map(p => p.manifest.version)])].sort(),
        configuration: record ? { version: record.manifest.version, enabled: record.config.enabled } : null };
    });
  }
  const snapshot = (capability: PlatformCapabilityId) => capability === 'routes.query@1' ? json({ routes: routes(), current: current(), navigation: navigation() }) : json(plugins());
  function notify(capability: PlatformCapabilityId) {
    for (const emit of watchers.get(capability) ?? []) { try { emit(snapshot(capability)); } catch { /* A failed observer cannot change platform state. */ } }
  }
  function manage(action: string, payload: Record<string, JsonValue>) {
    const env = bound(), id = payload.id as string;
    if (env.runtime.resolution.coreClosure.has(id) || env.runtime.candidates.some(p => p.descriptor.id === id && p.kind === 'builtin')) throw Error('PLUGIN_READ_ONLY');
    if (action === 'install') {
      const entry = env.catalog?.find(p => p.record.manifest.id === id && p.record.manifest.version === payload.version);
      if (!entry) throw Error('PLUGIN_NOT_INSTALLABLE');
      const current = env.store.list().find(record => record.manifest.id === id);
      env.store.install(current ? { ...entry.record, config: { ...current.config, version: entry.record.manifest.version, grantedPermissions: current.config.grantedPermissions.filter(permission => entry.record.manifest.permissions.includes(permission)) } } : entry.record);
    } else if (action === 'selectVersion') env.store.selectVersion(id, payload.version as string);
    else if (action === 'setEnabled') env.store.setEnabled(id, payload.enabled as boolean);
    else env.store.uninstall(id);
    notify('plugins.query@1');
    return { reloadRequired: true };
  }
  const plugin: PluginDefinition = {
    id: PLATFORM_PLUGIN_ID, version: '1.0.0', roles: ['provider'], requires: [], provides: PLATFORM_CAPABILITIES,
    activate({ capabilities }) {
      for (const capability of PLATFORM_CAPABILITIES) capabilities.register<PlatformService>(capability, {
        invoke(action, payload, context) {
          requireInvocationContext(context, capability, action);
          const env = bound();
          const schema = unarySchemas[capability][action];
          if (!schema) throw Error('PLATFORM_ACTION_UNKNOWN');
          schema.parse(payload);
          if (capability === 'routes.query@1') return json(action === 'list' ? routes() : action === 'current' ? current() : navigation());
          if (capability === 'routes.navigate@1') {
            const input = payload as { routeId: string; params: Record<string, string> };
            const href = env.model.pathFor(input.routeId, input.params);
            env.navigate(href);
            env.recordAudit({ type: 'navigation', pluginId: context.pluginId, routeId: input.routeId, ownerPluginId: env.model.routes.find(r => r.contribution.id === input.routeId)!.ownerPluginId, timestamp: Date.now() });
            notify('routes.query@1');
            return null;
          }
          if (capability === 'plugins.query@1') return json(plugins());
          if (capability === 'plugins.manage@1') return manage(action, payload as Record<string, JsonValue>);
          if (capability === 'audit.query@1') return json(env.audit());
          const diagnostics = env.diagnostics?.() ?? inspect(env.runtime, { listHostContributions: () => env.model.listHostContributions(env.location()) });
          return capability === 'diagnostics.export@1' ? { filename: 'runtime-diagnostics.json', contents: JSON.stringify(diagnostics, null, 2) } : json(diagnostics);
        },
        watch(context, emit) {
          requireInvocationContext(context, capability, 'watch');
          const listeners = watchers.get(capability) ?? new Set(); watchers.set(capability, listeners); listeners.add(emit);
          return { snapshot: snapshot(capability), dispose() { listeners.delete(emit); } };
        },
      });
    },
  };
  return { plugin, bind(value: PlatformEnvironment) { if (environment) throw Error('PLATFORM_ALREADY_BOUND'); environment = { ...value, catalog: frozenCopy(value.catalog ?? []) }; }, notify };
}
