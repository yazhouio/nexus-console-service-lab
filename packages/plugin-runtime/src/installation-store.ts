import { canonicalJson } from './ui/schema';
import type { BridgeCapabilityContract } from './bridge-contract';
import { validateRestrictedAgainstHost } from './bootstrap';
import type { HostApiId, PluginId } from './identifiers';
import { validateRestrictedInstallRecord, type InstalledPluginConfig, type InstalledPluginRecord, type RestrictedInstallValidationOptions } from './manifest';

export interface InstallationStoreSnapshot {
  readonly records: readonly InstalledPluginRecord[];
  readonly activeVersions: readonly Readonly<{ id: PluginId; version: string }>[];
}

export interface InstallationStorage {
  read(): unknown;
  write(snapshot: InstallationStoreSnapshot): void;
}

export interface InstallationStoreOptions extends RestrictedInstallValidationOptions {
  readonly records?: readonly InstalledPluginRecord[];
  readonly supportedHostApis: readonly HostApiId[];
  readonly bridgeContracts: readonly BridgeCapabilityContract[];
  readonly storage?: InstallationStorage;
}

export interface ReloadRequired { readonly reloadRequired: true }

export interface InstallationStore {
  list(): readonly InstalledPluginRecord[];
  listVersions(id: PluginId): readonly InstalledPluginRecord[];
  snapshot(): InstallationStoreSnapshot;
  install(record: unknown): ReloadRequired;
  selectVersion(id: PluginId, version: string, config?: InstalledPluginConfig): ReloadRequired;
  setEnabled(id: PluginId, enabled: boolean): ReloadRequired;
  uninstall(id: PluginId): ReloadRequired;
}

export class PluginInstallationError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'PluginInstallationError'; }
}

const reloadRequired: ReloadRequired = Object.freeze({ reloadRequired: true });
const key = (id: string, version: string): string => JSON.stringify([id, version]);

/** Configuration persistence only; this store never holds or mutates a running Runtime. */
export function createInstallationStore(options: InstallationStoreOptions): InstallationStore {
  const contracts = new Map(options.bridgeContracts.map(contract => [contract.id, contract]));
  const validate = (value: unknown): InstalledPluginRecord => {
    const record = validateRestrictedInstallRecord(value, options);
    const { issues } = validateRestrictedAgainstHost(
      [{ ...record, config: { ...record.config, enabled: true } }],
      new Set(options.supportedHostApis), contracts,
    );
    if (issues.length) throw new PluginInstallationError(issues[0].code);
    return record;
  };
  let records = new Map<string, InstalledPluginRecord>();
  let active = new Map<PluginId, string>();
  const saved = options.storage?.read();
  if (saved !== undefined && saved !== null) {
    if (typeof saved !== 'object' || !('records' in saved) || !('activeVersions' in saved) ||
        !Array.isArray(saved.records) || !Array.isArray(saved.activeVersions)) {
      throw new PluginInstallationError('INVALID_INSTALLATION_STORE');
    }
    for (const value of saved.records) {
      const record = validateRestrictedInstallRecord(value, options);
      const recordKey = key(record.manifest.id, record.manifest.version);
      if (records.has(recordKey)) throw new PluginInstallationError('INVALID_INSTALLATION_STORE');
      records.set(recordKey, record);
    }
    for (const selection of saved.activeVersions) {
      if (!selection || typeof selection.id !== 'string' || typeof selection.version !== 'string' ||
          active.has(selection.id) || !records.has(key(selection.id, selection.version))) {
        throw new PluginInstallationError('INVALID_INSTALLATION_STORE');
      }
      active.set(selection.id, selection.version);
    }
    if ([...records.values()].some(record => !active.has(record.manifest.id))) throw new PluginInstallationError('INVALID_INSTALLATION_STORE');
  } else {
    for (const value of options.records ?? []) {
      const record = validateRestrictedInstallRecord(value, options);
      records.set(key(record.manifest.id, record.manifest.version), record);
      active.set(record.manifest.id, record.manifest.version);
    }
  }

  const checkContextContracts = (values: readonly InstalledPluginRecord[]) => {
    const contracts = new Map<string, string>();
    for (const record of values) for (const point of record.manifest.extensionPoints ?? []) {
      const key = JSON.stringify([record.manifest.id, point.id, point.contractMajor]);
      const schema = canonicalJson(point.contextSchema);
      if (contracts.has(key) && contracts.get(key) !== schema) throw new PluginInstallationError('CONTEXT_MAJOR_FROZEN');
      contracts.set(key, schema);
    }
  };
  checkContextContracts([...records.values()]);

  const snapshot = (packages = records, versions = active): InstallationStoreSnapshot => Object.freeze({
    records: Object.freeze([...packages.values()].sort((a, b) => key(a.manifest.id, a.manifest.version).localeCompare(key(b.manifest.id, b.manifest.version)))),
    activeVersions: Object.freeze([...versions].sort(([a], [b]) => a.localeCompare(b)).map(([id, version]) => Object.freeze({ id, version }))),
  });
  const commit = (nextRecords: Map<string, InstalledPluginRecord>, nextActive: Map<PluginId, string>): ReloadRequired => {
    checkContextContracts([...nextRecords.values()]);
    // Publish only after durable persistence succeeds; a storage failure changes nothing.
    options.storage?.write(snapshot(nextRecords, nextActive));
    records = nextRecords; active = nextActive;
    return reloadRequired;
  };
  const requireRecord = (id: PluginId, version = active.get(id)): InstalledPluginRecord => {
    const record = version === undefined ? undefined : records.get(key(id, version));
    if (!record) throw new PluginInstallationError('PLUGIN_VERSION_NOT_INSTALLED');
    return record;
  };
  const store: InstallationStore = {
    list: () => Object.freeze([...active].sort(([a], [b]) => a.localeCompare(b)).map(([id, version]) => requireRecord(id, version))),
    listVersions: id => Object.freeze(snapshot().records.filter(record => record.manifest.id === id)),
    snapshot: () => snapshot(),
    install(value) {
      const record = validate(value);
      const { id, version } = record.manifest;
      const recordKey = key(id, version);
      const existing = records.get(recordKey);
      if (existing && JSON.stringify(existing.manifest) !== JSON.stringify(record.manifest)) {
        throw new PluginInstallationError('IMMUTABLE_PLUGIN_VERSION');
      }
      return commit(new Map(records).set(recordKey, record), new Map(active).set(id, version));
    },
    selectVersion(id, version, config) {
      const record = requireRecord(id, version);
      const selected = validate({ manifest: record.manifest, config: config ?? { ...record.config, enabled: requireRecord(id).config.enabled } });
      return commit(new Map(records).set(key(id, version), selected), new Map(active).set(id, version));
    },
    setEnabled(id, enabled) {
      const record = requireRecord(id);
      const value = { manifest: record.manifest, config: { ...record.config, enabled } };
      const updated = enabled ? validate(value) : validateRestrictedInstallRecord(value, options);
      return commit(new Map(records).set(key(id, record.manifest.version), updated), new Map(active));
    },
    uninstall(id) {
      const next = new Map([...records].filter(([, record]) => record.manifest.id !== id));
      const versions = new Map(active); versions.delete(id);
      return commit(next, versions);
    },
  };
  return Object.freeze(store);
}
