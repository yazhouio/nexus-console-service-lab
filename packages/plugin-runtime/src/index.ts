export { isCapabilityId, isHostApiId } from './identifiers.js';
export type { CapabilityId, HostApiId, PluginId } from './identifiers.js';
export type { CapabilityMetadata, CapabilityRegistry } from './capability.js';
export { DEFAULT_CONTRIBUTION_ORDER } from './contribution.js';
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
} from './contribution.js';
export type {
  BridgeActionContract,
  BridgeCapabilityContract,
  BridgeInvocationContext,
  BridgeSubscriptionActionContract,
  BridgeUnaryActionContract,
  OpenedBridgeSubscription,
  RuntimeSchema,
} from './bridge-contract.js';
export { bootstrapPluginRuntime } from './bootstrap.js';
export type { BootstrapPluginRuntimeOptions, PluginRuntime } from './bootstrap.js';
export { PluginResolutionError } from './plugin.js';
export type {
  DependencyEdge,
  PluginCandidate,
  PluginCapabilityContext,
  PluginDescriptor,
  PluginDefinition,
  PluginKind,
  PluginContext,
  PluginRole,
  PluginProvenance,
  RejectedPlugin,
  Resolution,
  ResolutionErrorCode,
  ResolutionIssue,
  ResolutionValidationStage,
} from './plugin.js';
export { resolvePluginSet } from './resolver.js';
export {
  isPermissionId,
  RestrictedManifestValidationError,
  validateRestrictedInstallRecord,
} from './manifest.js';
export type {
  InstalledPluginConfig,
  InstalledPluginRecord,
  PermissionId,
  RestrictedInstallValidationOptions,
  RestrictedManifestValidationIssue,
  RestrictedPluginManifest,
} from './manifest.js';
export {
  BridgeBootstrapValidationError,
  validateBridgeBootstrapDescriptor,
} from './bridge-bootstrap.js';
export type {
  BridgeBootstrapDescriptor,
  BridgeBootstrapValidationIssue,
} from './bridge-bootstrap.js';
export { PluginRuntimeBootstrapError, PluginRuntimeContractError } from './runtime-state.js';
export type {
  PluginFailureStage,
  PluginRuntimeErrorCode,
  PluginRuntimeIssue,
  PluginRuntimeState,
  PluginValidationErrorCode,
  PluginValidationIssue,
} from './runtime-state.js';
export type { SurfaceDefinitionRecord, SurfaceDefinitionRegistry } from './surface-definition.js';

export { createInstallationStore, PluginInstallationError } from './installation-store.js';
export type {
  InstallationStore,
  InstallationStoreOptions,
  InstallationStoreSnapshot,
  InstallationStorage,
  ReloadRequired,
} from './installation-store.js';
export { inspect } from './inspection.js';
export type {
  InspectionSource,
  ContributionSnapshot,
  BootstrapFailure,
  RuntimeSnapshot,
  PluginSnapshot,
  SurfaceInstanceSnapshot,
  RuntimeErrorSnapshot,
} from './inspection.js';
export type {
  ContributionState,
  ContributionKind,
  ContributionIdentity,
  ContributionDiagnosticCode,
  ContributionDiagnostic,
  HostContributionFact,
} from './host-contribution.js';
export { assertContributionContractCompatible } from './contribution-compatibility.js';

export type {
  ExtensionPointRef,
  ExtensionPointDefinition,
  SurfaceContributionDefinition,
  UiSurfaceDefinition,
  ContributionRef,
  HostContributionPolicy,
  HostContributionPolicyRequest,
} from './ui/definitions.js';
export { validateContextSchema } from './ui/schema.js';
export type { ContextSchema } from './ui/schema.js';
export { createUiRuntime, UiError } from './ui/runtime.js';
export type {
  UiRuntime,
  UiRuntimeOptions,
  UiDriver,
  UiMounted,
  UiSizing,
  UiExecution,
  SlotInput,
  SlotObservation,
  ContextSnapshot,
  UiObservation,
  OverlaySnapshot,
  OverlayObservation,
  UiInspection,
} from './ui/runtime.js';
export {
  UI_OVERLAY_CAPABILITY,
  UI_OVERLAY_PERMISSION,
  uiOverlayBridgeContract,
} from './ui/overlay-capability.js';
export type { UiOverlayCapability } from './ui/overlay-capability.js';
export { resolveRootPresentation } from './root-presentation.js';
export type { RootPresentation } from './bootstrap.js';

export { createRouteModel } from './routing/route-model.js';
export type {
  RouteModel,
  ResolvedRoute,
  ResolvedNavigation,
  UrlResolution,
  NavigationDestination,
  ContributionPolicyRequest,
} from './routing/route-model.js';

export type {
  ExtensionKind,
  ContractId,
  PointConstraints,
  PointProfile,
  RefContract,
  PolicyDimension,
  CompiledExtensionPointDefinition,
} from './ui/definitions.js';
export type { PointContracts } from './ui/point-compiler.js';

export { createActionRuntime } from './action-runtime.js';
export type {
  ActionHandler,
  ActionRuntime,
  ActionDriver,
  ActionSession,
  ActionOutcome,
  ActionInput,
} from './action-runtime.js';
export type {
  ActionDefinition,
  ActionContributionDefinition,
  TabContributionDefinition,
  ExtensionContributionDefinition,
  PointContributionMetadata,
} from './ui/definitions.js';

export type { ActionCondition, ComparisonOperator } from './ui/definitions.js';

export {
  createPlatformPlugin,
  platformBridgeContracts,
  PLATFORM_PLUGIN_ID,
  PLATFORM_CAPABILITIES,
} from './platform.js';
export type {
  PlatformEnvironment,
  PlatformCapabilityId,
  PlatformCatalogEntry,
  PublicRoute,
  PublicRouteLocation,
  PublicNavigation,
  RoutesSnapshot,
  PluginSummary,
} from './platform.js';
export { createContributionPolicy } from './policy.js';
export type { ContributionPolicyBundle } from './policy.js';
export { createUiOverlayPlugin } from './ui/overlay-capability.js';
