import { bootstrapPluginRuntime } from '@nexus/plugin-runtime';

import { cluster } from './plugins/cluster';
import { consoleShell } from './plugins/console-shell';
import {
  clusterBridgeContract,
  kubeeyeInstallation,
} from './plugins/kubeeye-installation';

export const runtimePromise = bootstrapPluginRuntime({
  builtins: [consoleShell, cluster],
  coreRootIds: ['console-shell'],
  installed: [kubeeyeInstallation],
  supportedHostApis: ['kubesphere.console@1'],
  bridgeContracts: [clusterBridgeContract],
});
