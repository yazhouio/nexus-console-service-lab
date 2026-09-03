import type { CapabilityId, PluginId } from './identifiers';

export type PluginRuntimeErrorCode =
  | 'ACTIVATION_SCOPE_INACTIVE'
  | 'ACTIVATION_SCOPE_NOT_VALIDATED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'DUPLICATE_CAPABILITY_PROVIDER'
  | 'UNDECLARED_CAPABILITY_REQUIRE'
  | 'UNDECLARED_CAPABILITY_PROVIDE'
  | 'DECLARED_CAPABILITY_MISSING'
  | 'PLUGIN_ACTIVATION_FAILED'
  | 'INVALID_BRIDGE_CONTRACT'
  | 'INVALID_CONTRIBUTION';

export type PluginFailureStage = 'activate' | 'assertion';

export interface PluginRuntimeIssue {
  readonly code: PluginRuntimeErrorCode;
  readonly stage: PluginFailureStage;
  readonly message: string;
  readonly pluginId?: PluginId;
  readonly capability?: CapabilityId;
  readonly cause?: unknown;
}

export type PluginValidationErrorCode =
  | 'HOST_API_INCOMPATIBLE'
  | 'CAPABILITY_NOT_BRIDGE_EXPOSED'
  | 'INVALID_RESTRICTED_MANIFEST'
  | 'INVALID_CONTRIBUTION'
  | 'CAPABILITY_UNAVAILABLE';

export interface PluginValidationIssue {
  readonly code: PluginValidationErrorCode;
  readonly validationStage: 'manifest' | 'resolve';
  readonly message: string;
  readonly pluginId: PluginId;
  readonly capability?: CapabilityId;
  readonly path?: readonly string[];
}

export class PluginRuntimeContractError extends Error {
  readonly issue: PluginRuntimeIssue;

  constructor(issue: PluginRuntimeIssue) {
    super(issue.message);
    this.name = 'PluginRuntimeContractError';
    this.issue = Object.freeze({ ...issue });
  }
}

export class PluginRuntimeBootstrapError extends Error {
  readonly issue: PluginRuntimeIssue;

  constructor(issue: PluginRuntimeIssue) {
    super(issue.message);
    this.name = 'PluginRuntimeBootstrapError';
    this.issue = Object.freeze({ ...issue });
  }
}

export type PluginRuntimeState =
  | Readonly<{ state: 'ACTIVE' }>
  | Readonly<{
      state: 'SKIPPED';
      stage: 'manifest' | 'resolve';
      reason: string;
    }>
  | Readonly<{
      state: 'FAILED';
      stage: PluginFailureStage;
      error: unknown;
    }>;
