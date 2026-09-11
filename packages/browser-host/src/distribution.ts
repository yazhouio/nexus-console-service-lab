import type { BootstrapPluginRuntimeOptions, BridgeCapabilityContract, ContributionPolicyBundle, InstallationStore, InstalledPluginRecord, PlatformCatalogEntry } from '@nexus/plugin-runtime';
export interface RecoveryChange { readonly id: string; readonly label: string; readonly canRollback: boolean; readonly canDisable?: boolean }
export interface RecoveryConfiguration {
  clearInstallations(): void;
  listChanges?(): readonly RecoveryChange[];
  disable?(id: string): void;
  rollback?(id: string): void;
}
export interface BrowserDistribution extends Omit<BootstrapPluginRuntimeOptions, 'installed'> {
  /** Build-generated absolute CSS URLs, associated with the selected Builtin definitions. */
  readonly builtinCss?: Readonly<Record<string, readonly string[]>>;
  readonly applicationLabel: string;
  readonly policyBundle: ContributionPolicyBundle;
  readonly capabilityGrants: Readonly<Record<string, readonly string[]>>;
  readonly catalog?: readonly PlatformCatalogEntry[];
  readonly additionalInstallations?: readonly InstalledPluginRecord[];
  readonly recovery: RecoveryConfiguration;
  createStore(bridgeContracts: readonly BridgeCapabilityContract[]): InstallationStore;
}
