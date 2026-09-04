import { bootstrapPluginRuntime, createInstallationStore } from '@nexus/plugin-runtime';
import { cluster } from './plugins/cluster';
import { consoleShell } from './plugins/console-shell';
import { clusterBridgeContract, kubeeyeInstallation } from './plugins/kubeeye-installation';

const hostOptions = {
  contributionContractVersion: 2 as const,
  builtins: [consoleShell, cluster], coreRootIds: ['console-shell'],
  supportedHostApis: ['kubesphere.console@1' as const], bridgeContracts: [clusterBridgeContract],
};
const storageKey = 'nexus.plugin-installations.v1';
export const installationStorePromise = Promise.resolve().then(() => createInstallationStore({
  ...hostOptions, records: [kubeeyeInstallation], isEntryAllowed: entry => entry.startsWith('/plugins/'),
  storage: {
    read() { const saved = localStorage.getItem(storageKey); return saved === null ? undefined : JSON.parse(saved); },
    write(snapshot) { localStorage.setItem(storageKey, JSON.stringify(snapshot)); },
  },
}));
export const runtimePromise = installationStorePromise.then(store => bootstrapPluginRuntime({ ...hostOptions, installed: store.list() }));

void runtimePromise.catch(() => undefined);
