import type { PluginRuntime } from './bootstrap';
import type { CapabilityMetadata } from './capability';
import type { DependencyEdge, PluginDescriptor, PluginKind } from './plugin';
import type { HostRenderTarget } from './contribution';
import type { PluginRuntimeState } from './runtime-state';
import type { SurfaceFailureStage, SurfaceInstanceRecord } from './browser/wujie-plugin-adapter';
import { frozenCopy } from './immutable';

export interface RuntimeErrorSnapshot { readonly code: string; readonly message: string }
export interface BootstrapFailure { readonly ready: false; readonly error: unknown }
export interface SurfaceInstanceSnapshot {
  readonly surfaceInstanceId: string;
  readonly mountPointId: string;
  readonly wujieName: string;
  readonly state: 'MOUNTING' | 'MOUNTED' | 'FAILED';
  readonly stage?: SurfaceFailureStage;
  readonly error?: RuntimeErrorSnapshot;
  readonly bridgeSession?: Readonly<{ state: 'ACTIVE' | 'DISPOSED'; subscriptionCount: number }>;
}
export interface PluginSnapshot extends PluginDescriptor {
  readonly kind: PluginKind;
  readonly executionMode: 'direct' | 'wujie';
  readonly securityPosture: 'host-privileged' | 'cooperative-isolation';
  readonly core: boolean;
  readonly state: PluginRuntimeState['state'];
  readonly stage?: string;
  readonly error?: RuntimeErrorSnapshot;
  readonly requestedPermissions?: readonly string[];
  readonly grantedPermissions?: readonly string[];
  readonly surfaces?: readonly Readonly<{ id: string; instances: readonly SurfaceInstanceSnapshot[] }>[];
}
interface ContributionSnapshot {
  readonly id: string;
  readonly ownerPluginId: string;
  readonly target?: Readonly<{ kind: HostRenderTarget['kind']; surfaceId?: string }>;
  readonly path?: string;
  readonly slot?: string;
  readonly routeId?: string;
  readonly parentId?: string;
}
export interface RuntimeSnapshot {
  readonly ready: boolean;
  readonly bootstrapError?: RuntimeErrorSnapshot;
  readonly plugins: readonly PluginSnapshot[];
  readonly coreClosure: readonly string[];
  readonly dependencies: readonly DependencyEdge[];
  readonly capabilities: readonly CapabilityMetadata[];
  readonly contributions: Readonly<{
    routes: readonly ContributionSnapshot[];
    navigation: readonly ContributionSnapshot[];
    extensions: readonly ContributionSnapshot[];
  }>;
}

const errorMessages = {
  BOOTSTRAP_FAILED: 'Runtime bootstrap failed.',
  PLUGIN_ACTIVATION_FAILED: 'Plugin activation failed.',
  PLUGIN_SKIPPED: 'Plugin was not admitted to this runtime.',
  ACTIVATION_SCOPE_INACTIVE: 'Plugin activation scope is inactive.',
  ACTIVATION_SCOPE_NOT_VALIDATED: 'Plugin activation was not validated.',
  CAPABILITY_UNAVAILABLE: 'Required capability is unavailable.',
  DUPLICATE_CAPABILITY_PROVIDER: 'Multiple plugins provide the same capability.',
  UNDECLARED_CAPABILITY_REQUIRE: 'Plugin requested an undeclared capability.',
  UNDECLARED_CAPABILITY_PROVIDE: 'Plugin registered an undeclared capability.',
  DECLARED_CAPABILITY_MISSING: 'Plugin did not register a declared capability.',
  INVALID_BRIDGE_CONTRACT: 'Host Bridge contract is invalid.',
  INVALID_CONTRIBUTION: 'Plugin contribution is invalid.',
  HOST_API_INCOMPATIBLE: 'Plugin Host API is unsupported.',
  CAPABILITY_NOT_BRIDGE_EXPOSED: 'Required capability is not exposed through the Bridge.',
  INVALID_RESTRICTED_MANIFEST: 'Restricted manifest is invalid.',
  INVALID_PLUGIN_DESCRIPTOR: 'Plugin descriptor is invalid.',
  PLUGIN_ID_COLLISION: 'Plugin ID is duplicated.',
  MISSING_CAPABILITY: 'Required capability has no provider.',
  CIRCULAR_DEPENDENCY: 'Plugin dependencies contain a cycle.',
  CORE_ROOT_MISSING: 'A Core root is missing.',
  CORE_DEPENDENCY_NOT_BUILTIN: 'A Core dependency is not Builtin.',
  INVALID_SURFACE_MOUNT: 'Surface mount is invalid.',
  SURFACE_MOUNT_CANCELLED: 'Surface mount was cancelled.',
  WUJIE_RESOURCE_FAILED: 'Restricted Surface execution failed.',
  BRIDGE_BOOTSTRAP_FAILED: 'Surface Bridge handshake failed.',
  BRIDGE_PROTOCOL_MISMATCH: 'Bridge protocol is incompatible.',
  BRIDGE_NONCE_INVALID: 'Bridge handshake nonce is invalid.',
  BRIDGE_SESSION_FAILED: 'Surface Bridge session failed.',
} as const;

function safeError(error: unknown, fallback: keyof typeof errorMessages): RuntimeErrorSnapshot {
  let code: string = fallback;
  // Never stringify arbitrary errors, causes, stacks, or Host result objects.
  try {
    if (typeof error === 'object' && error !== null && 'issue' in error) {
      const issue = error.issue;
      if (typeof issue === 'object' && issue !== null && 'code' in issue &&
          typeof issue.code === 'string' && Object.hasOwn(errorMessages, issue.code)) code = issue.code;
    }
  } catch { /* A thrown value may even contain accessors. */ }
  return Object.freeze({ code, message: errorMessages[code as keyof typeof errorMessages] });
}

/** Pure projection. The optional source supplies live instance facts without exposing sessions. */
export function inspect(
  runtime: PluginRuntime | BootstrapFailure,
  source?: { listInstances(): readonly SurfaceInstanceRecord[] },
): RuntimeSnapshot {
  if (!runtime.ready) return frozenCopy({
    ready: false, bootstrapError: safeError(runtime.error, 'BOOTSTRAP_FAILED'),
    plugins: [], coreClosure: [], dependencies: [], capabilities: [],
    contributions: { routes: [], navigation: [], extensions: [] },
  });
  const instances = source?.listInstances() ?? [];
  const target = (value: HostRenderTarget) => value.kind === 'builtin'
    ? { kind: value.kind } : { kind: value.kind, surfaceId: value.surfaceId };
  const plugins: PluginSnapshot[] = [...runtime.plugins].map(([id, state]) => {
    const candidate = runtime.candidates.find(candidate => candidate.descriptor.id === id)!;
    const { descriptor, kind } = candidate;
    const installed = runtime.installations.find(record => record.manifest.id === id);
    return {
      id, version: descriptor.version, requires: descriptor.requires, provides: descriptor.provides,
      kind, executionMode: kind === 'builtin' ? 'direct' : 'wujie',
      securityPosture: kind === 'builtin' ? 'host-privileged' : 'cooperative-isolation',
      core: kind === 'builtin' && runtime.resolution.coreClosure.has(id), state: state.state,
      ...(state.state === 'FAILED' ? { stage: state.stage, error: safeError(state.error, 'PLUGIN_ACTIVATION_FAILED') } : {}),
      ...(state.state === 'SKIPPED' ? { stage: state.stage, error: safeError({ issue: { code: state.reason } }, 'PLUGIN_SKIPPED') } : {}),
      ...(kind === 'restricted' && installed ? {
        requestedPermissions: installed.manifest.permissions, grantedPermissions: installed.config.grantedPermissions,
        surfaces: [...installed.manifest.surfaces].sort((a, b) => a.id.localeCompare(b.id)).map(surface => ({
          id: surface.id,
          instances: instances.filter(instance => instance.identity.pluginId === id && instance.identity.surfaceId === surface.id)
            .sort((a, b) => a.identity.surfaceInstanceId.localeCompare(b.identity.surfaceInstanceId)).map(instance => ({
              surfaceInstanceId: instance.identity.surfaceInstanceId, mountPointId: instance.identity.mountPointId,
              wujieName: instance.wujieName, state: instance.state.state,
              ...(instance.state.state === 'FAILED' ? { stage: instance.state.stage, error: safeError(instance.state.error, 'WUJIE_RESOURCE_FAILED') } : {}),
              ...(instance.bridgeSession ? { bridgeSession: instance.bridgeSession } : {}),
            })),
        })),
      } : {}),
    };
  });
  return frozenCopy({
    ready: true, plugins: plugins.sort((a, b) => a.id.localeCompare(b.id)),
    coreClosure: [...runtime.resolution.coreClosure].sort(), dependencies: runtime.resolution.dependencies,
    capabilities: runtime.capabilities.list(),
    contributions: {
      routes: runtime.contributions.listRoutes().map(({ ownerPluginId, contribution }) => ({ ownerPluginId, id: contribution.id, path: contribution.path, target: target(contribution.target) })),
      navigation: runtime.contributions.listNavigation().map(({ ownerPluginId, contribution }) => ({ ownerPluginId, id: contribution.id, ...(contribution.routeId ? { routeId: contribution.routeId } : {}), ...(contribution.parentId ? { parentId: contribution.parentId } : {}) })),
      extensions: runtime.contributions.listExtensionSlots().flatMap(slot => runtime.contributions.listExtensions(slot).map(({ ownerPluginId, contribution }) => ({ ownerPluginId, id: contribution.id, slot, target: target(contribution.target) }))),
    },
  });
}
