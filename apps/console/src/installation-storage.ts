import {
  createInstallationStore,
  type BridgeCapabilityContract,
  type InstallationStore,
  type InstallationStoreSnapshot,
} from '@nexus/plugin-runtime';
import { kubeeyeInstallation, clusterBridgeContract } from './plugins/kubeeye-installation';
import { platformBridgeContracts, uiOverlayBridgeContract } from '@nexus/plugin-runtime';

const key = 'nexus.plugin-installations.v1';
const historyKey = `${key}.previous`;
const recentKey = `${key}.recent`;
const read = (name: string) => {
  const value = localStorage.getItem(name);
  return value === null ? undefined : JSON.parse(value);
};
const builtinIds = new Set([
  'console-core',
  'cluster',
  'nexus-platform',
  'nexus-ui-overlay',
  'ui-local',
]);
function createStore(bridgeContracts: readonly BridgeCapabilityContract[]) {
  let store: InstallationStore;
  store = createInstallationStore({
    records: [kubeeyeInstallation],
    supportedHostApis: ['kubesphere.console@1'],
    bridgeContracts,
    isEntryAllowed: (entry) => entry.startsWith('/plugins/'),
    storage: {
      read: () => read(key),
      write(snapshot) {
        const previous = store.snapshot();
        const changed = [
          ...new Set(
            [...previous.activeVersions, ...snapshot.activeVersions].map((value) => value.id),
          ),
        ].filter(
          (id) =>
            JSON.stringify(previous.records.filter((r) => r.manifest.id === id)) !==
              JSON.stringify(snapshot.records.filter((r) => r.manifest.id === id)) ||
            previous.activeVersions.find((v) => v.id === id)?.version !==
              snapshot.activeVersions.find((v) => v.id === id)?.version,
        );
        // The selected configuration is durable before publishing recovery metadata.
        localStorage.setItem(key, JSON.stringify(snapshot));
        try {
          localStorage.setItem(historyKey, JSON.stringify(previous));
          localStorage.setItem(
            recentKey,
            JSON.stringify(changed.filter((id) => !builtinIds.has(id))),
          );
        } catch {
          /* Recovery history is best effort; the committed configuration stays valid. */
        }
      },
    },
  });
  return store;
}
const recoveryStore = () =>
  createStore([...platformBridgeContracts, uiOverlayBridgeContract, clusterBridgeContract]);
const requireRecent = (id: string) => {
  const recent = read(recentKey);
  if (builtinIds.has(id) || !Array.isArray(recent) || !recent.includes(id))
    throw Error('RECOVERY_TARGET_READ_ONLY');
};
export const installationStorage = {
  createStore,
  recovery: {
    clearInstallations() {
      localStorage.removeItem(key);
      localStorage.removeItem(historyKey);
      localStorage.removeItem(recentKey);
    },
    listChanges() {
      const recent = read(recentKey),
        previous = read(historyKey) as InstallationStoreSnapshot | undefined;
      const current = recoveryStore().list();
      return (Array.isArray(recent) ? recent : [])
        .filter((id): id is string => typeof id === 'string' && !builtinIds.has(id))
        .map((id) => ({
          id,
          label: id,
          canDisable: current.some((record) => record.manifest.id === id),
          canRollback: Array.isArray(previous?.activeVersions) && Array.isArray(previous?.records),
        }));
    },
    disable(id: string) {
      requireRecent(id);
      recoveryStore().setEnabled(id, false);
    },
    rollback(id: string) {
      requireRecent(id);
      const previous = read(historyKey) as InstallationStoreSnapshot;
      const version = previous.activeVersions.find((value) => value.id === id)?.version;
      const store = recoveryStore();
      if (!version) {
        store.uninstall(id);
        return;
      }
      const record = previous.records.find(
        (record) => record.manifest.id === id && record.manifest.version === version,
      );
      if (!record) throw Error('RECOVERY_VERSION_MISSING');
      // Reinstall the prior selected record, including its prior enabled/grant configuration.
      store.install(record);
    },
  },
};
