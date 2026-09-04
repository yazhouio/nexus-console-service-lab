export { isCapabilityId, isHostApiId } from './identifiers';
export type { CapabilityId, HostApiId, PluginId } from './identifiers';
export type { CapabilityMetadata, CapabilityRegistry } from './capability';
export { DEFAULT_CONTRIBUTION_ORDER } from './contribution';
export type {
  BuiltinRenderTarget,
  ContributionReferenceCatalog,
  ContributionRegistry,
  HostRenderTarget,
  JsonValue,
  NavigationContribution,
  OwnedContribution,
  PluginContributionContext,
  RestrictedContributions,
  RestrictedRouteContribution,
  RestrictedUiExtensionContribution,
  RouteContribution,
  RouteContext,
  RouteMetadata,
  SandboxRenderTarget,
  SandboxSurfaceDefinition,
  UiExtensionContribution,
} from './contribution';
export type {
  BridgeActionContract,
  BridgeCapabilityContract,
  BridgeInvocationContext,
  BridgeSubscriptionActionContract,
  BridgeUnaryActionContract,
  OpenedBridgeSubscription,
  RuntimeSchema,
} from './bridge-contract';
export { bootstrapPluginRuntime } from './bootstrap';
export type {
  BootstrapPluginRuntimeOptions,
  PluginRuntime,
} from './bootstrap';
export { PluginResolutionError } from './plugin';
export type {
  DependencyEdge,
  PluginCandidate,
  PluginCapabilityContext,
  PluginDescriptor,
  PluginDefinition,
  PluginKind,
  PluginContext,
  RejectedPlugin,
  Resolution,
  ResolutionErrorCode,
  ResolutionIssue,
  ResolutionValidationStage,
} from './plugin';
export { resolvePluginSet } from './resolver';
export {
  isPermissionId,
  RestrictedManifestValidationError,
  validateRestrictedInstallRecord,
} from './manifest';
export type {
  InstalledPluginConfig,
  InstalledPluginRecord,
  PermissionId,
  RestrictedInstallValidationOptions,
  RestrictedManifestValidationIssue,
  RestrictedPluginManifest,
} from './manifest';
export {
  BridgeBootstrapValidationError,
  validateBridgeBootstrapDescriptor,
} from './bridge-bootstrap';
export type {
  BridgeBootstrapDescriptor,
  BridgeBootstrapValidationIssue,
} from './bridge-bootstrap';
export {
  PluginRuntimeBootstrapError,
  PluginRuntimeContractError,
} from './runtime-state';
export type {
  PluginFailureStage,
  PluginRuntimeErrorCode,
  PluginRuntimeIssue,
  PluginRuntimeState,
  PluginValidationErrorCode,
  PluginValidationIssue,
} from './runtime-state';
export type {
  SurfaceDefinitionRecord,
  SurfaceDefinitionRegistry,
} from './surface-definition';

export { createInstallationStore, PluginInstallationError } from './installation-store';
export type { InstallationStore, InstallationStoreOptions, InstallationStoreSnapshot, InstallationStorage, ReloadRequired } from './installation-store';
export { inspect } from './inspection';
export type { InspectionSource, ContributionSnapshot, BootstrapFailure, RuntimeSnapshot, PluginSnapshot, SurfaceInstanceSnapshot, RuntimeErrorSnapshot } from './inspection';
export type { ContributionState, ContributionKind, ContributionIdentity, ContributionDiagnosticCode, ContributionDiagnostic, HostContributionFact } from './host-contribution';
export { assertContributionContractCompatible } from './contribution-compatibility';
