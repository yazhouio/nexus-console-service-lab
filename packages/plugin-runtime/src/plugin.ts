import type { CapabilityId, PluginId } from './identifiers';
import type { PluginContributionContext } from './contribution';

export type PluginRole = 'provider' | 'feature';
export type PluginProvenance = 'first-party' | 'partner' | 'third-party';
export interface PluginDescriptor {
  readonly roles?: readonly PluginRole[];
  readonly provenance?: PluginProvenance;
  readonly id: PluginId;
  readonly version: string;
  readonly requires: readonly CapabilityId[];
  readonly provides: readonly CapabilityId[];
}

export interface PluginCapabilityContext {
  register<T>(id: CapabilityId, value: T): void;
  require<T>(id: CapabilityId): T;
}

export interface PluginContext {
  readonly actions: {
    register(id: string, handler: import('./action-runtime').ActionHandler): void;
  };
  readonly capabilities: PluginCapabilityContext;
  readonly contributions: PluginContributionContext;
}

export interface PluginDefinition extends PluginDescriptor {
  activate(context: PluginContext): void | Promise<void>;
}

export type PluginKind = 'builtin' | 'restricted';

export interface PluginCandidate {
  readonly kind: PluginKind;
  readonly descriptor: PluginDescriptor;
}

export interface DependencyEdge {
  readonly consumer: PluginId;
  readonly capability: CapabilityId;
  readonly provider: PluginId;
}

export type ResolutionErrorCode =
  | 'INVALID_PLUGIN_DESCRIPTOR'
  | 'PLUGIN_ID_COLLISION'
  | 'MISSING_CAPABILITY'
  | 'DUPLICATE_CAPABILITY_PROVIDER'
  | 'CIRCULAR_DEPENDENCY'
  | 'CORE_ROOT_MISSING'
  | 'CORE_DEPENDENCY_NOT_BUILTIN';

export type ResolutionValidationStage = 'descriptor' | 'resolve';

export interface ResolutionIssue {
  readonly code: ResolutionErrorCode;
  readonly validationStage: ResolutionValidationStage;
  readonly message: string;
  readonly pluginId?: PluginId;
  readonly pluginIds?: readonly PluginId[];
  readonly capability?: CapabilityId;
  readonly path?: readonly string[];
}

export interface RejectedPlugin {
  readonly candidate: PluginCandidate;
  readonly issue: ResolutionIssue;
}

export interface Resolution {
  readonly order: readonly PluginId[];
  readonly coreClosure: ReadonlySet<PluginId>;
  readonly dependencies: readonly DependencyEdge[];
  readonly skipped: ReadonlyMap<PluginId, ResolutionIssue>;
  readonly rejected: readonly RejectedPlugin[];
}

export class PluginResolutionError extends Error {
  readonly issue: ResolutionIssue;

  constructor(issue: ResolutionIssue) {
    super(issue.message);
    this.name = 'PluginResolutionError';
    this.issue = issue;
  }
}
