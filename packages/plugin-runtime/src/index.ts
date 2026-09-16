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
export type { BootstrapPluginRuntimeOptions, PluginRuntime } from './bootstrap';
export { PluginResolutionError } from './plugin';
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
export type { BridgeBootstrapDescriptor, BridgeBootstrapValidationIssue } from './bridge-bootstrap';
export { PluginRuntimeBootstrapError, PluginRuntimeContractError } from './runtime-state';
export type {
  PluginFailureStage,
  PluginRuntimeErrorCode,
  PluginRuntimeIssue,
  PluginRuntimeState,
  PluginValidationErrorCode,
  PluginValidationIssue,
} from './runtime-state';
export type { SurfaceDefinitionRecord, SurfaceDefinitionRegistry } from './surface-definition';

export { createInstallationStore, PluginInstallationError } from './installation-store';
export type {
  InstallationStore,
  InstallationStoreOptions,
  InstallationStoreSnapshot,
  InstallationStorage,
  ReloadRequired,
} from './installation-store';
export { inspect } from './inspection';
export type {
  InspectionSource,
  ContributionSnapshot,
  BootstrapFailure,
  RuntimeSnapshot,
  PluginSnapshot,
  SurfaceInstanceSnapshot,
  RuntimeErrorSnapshot,
} from './inspection';
export type {
  ContributionState,
  ContributionKind,
  ContributionIdentity,
  ContributionDiagnosticCode,
  ContributionDiagnostic,
  HostContributionFact,
} from './host-contribution';
export { assertContributionContractCompatible } from './contribution-compatibility';

export type {
  ExtensionPointRef,
  ExtensionPointDefinition,
  SurfaceContributionDefinition,
  UiSurfaceDefinition,
  ContributionRef,
  HostContributionPolicy,
  HostContributionPolicyRequest,
} from './ui/definitions';
export { validateContextSchema } from './ui/schema';
export type { ContextSchema } from './ui/schema';
export { createUiRuntime, UiError } from './ui/runtime';
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
} from './ui/runtime';
export {
  UI_OVERLAY_CAPABILITY,
  UI_OVERLAY_PERMISSION,
  uiOverlayBridgeContract,
} from './ui/overlay-capability';
export type { UiOverlayCapability } from './ui/overlay-capability';
export { resolveRootPresentation } from './root-presentation';
export type { RootPresentation } from './bootstrap';

export { createRouteModel } from './routing/route-model';
export type {
  RouteModel,
  ResolvedRoute,
  ResolvedNavigation,
  UrlResolution,
  NavigationDestination,
  ContributionPolicyRequest,
} from './routing/route-model';

export type {
  ExtensionKind,
  ContractId,
  PointConstraints,
  PointProfile,
  RefContract,
  PolicyDimension,
  CompiledExtensionPointDefinition,
} from './ui/definitions';
export type { PointContracts } from './ui/point-compiler';

export { createActionRuntime } from './action-runtime';
export type {
  ActionHandler,
  ActionRuntime,
  ActionDriver,
  ActionSession,
  ActionOutcome,
  ActionInput,
} from './action-runtime';
export type {
  ActionDefinition,
  ActionContributionDefinition,
  TabContributionDefinition,
  ExtensionContributionDefinition,
  PointContributionMetadata,
} from './ui/definitions';

export type { ActionCondition, ComparisonOperator } from './ui/definitions';

export {
  createPlatformPlugin,
  platformBridgeContracts,
  PLATFORM_PLUGIN_ID,
  PLATFORM_CAPABILITIES,
} from './platform';
export type {
  PlatformEnvironment,
  PlatformCapabilityId,
  PlatformCatalogEntry,
  PublicRoute,
  PublicRouteLocation,
  PublicNavigation,
  RoutesSnapshot,
  PluginSummary,
} from './platform';
export { createContributionPolicy } from './policy';
export type { ContributionPolicyBundle } from './policy';
export { createUiOverlayPlugin } from './ui/overlay-capability';
