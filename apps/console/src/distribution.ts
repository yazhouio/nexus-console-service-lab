import type { BrowserDistribution } from '@nexus/browser-host';
import { consoleCore } from '@nexus/console-core';
import { CONSOLE_CORE_ID, CONSOLE_PROFILES, PLUGIN_REF_CONTRACT, CORE_ROUTES_POINT, PRIMARY_NAVIGATION_POINT, consoleRoute } from '@nexus/console-core-api';
import { RESOURCE_REF_CONTRACT } from '@nexus/cluster-api';
import { cluster } from './plugins/cluster';
import { extensionDemo } from './plugins/extension-demo';
import { kubeeyeInstallation, kubeeyeInstallationV2, clusterBridgeContract } from './plugins/kubeeye-installation';
import { uiFixtureBuiltin, uiFixtureInstallations, UiCompositionFixture } from './ui-fixtures';
import { IndependentSurfacesFixture } from './fixtures';
import { contributionGovernance } from './routing/contribution-policy';
import { installationStorage } from './installation-storage';

const fixtures = process.env.PUBLIC_TEST_FIXTURES === 'true';
const core = fixtures ? { ...consoleCore, activate(context: Parameters<typeof consoleCore.activate>[0]) {
  consoleCore.activate(context);
  context.contributions.registerRoute(consoleRoute({ id: 'test-ui-composition', path: '/__fixtures__/ui-composition', target: { kind: 'builtin', render: UiCompositionFixture } }));
  context.contributions.registerRoute(consoleRoute({ id: 'test-independent-surfaces', path: '/__fixtures__/surfaces', target: { kind: 'builtin', render: IndependentSurfacesFixture } }));
} } : consoleCore;
export const distribution: BrowserDistribution = {
  applicationLabel: 'Console', builtins: [core, cluster, extensionDemo, ...(fixtures ? [uiFixtureBuiltin] : [])], coreRootIds: [CONSOLE_CORE_ID],
  rootPresentation: { ownerPluginId: CONSOLE_CORE_ID, surfaceId: 'root' }, rootRoutePoint: CORE_ROUTES_POINT, navigationRootPoints: [PRIMARY_NAVIGATION_POINT],
  supportedHostApis: ['kubesphere.console@1'], bridgeContracts: [clusterBridgeContract], profiles: CONSOLE_PROFILES, refContracts: [PLUGIN_REF_CONTRACT, RESOURCE_REF_CONTRACT],
  policyBundle: contributionGovernance,
  capabilityGrants: { 'console-core': ['routes.query','routes.navigate','plugins.query','plugins.manage','diagnostics.query','diagnostics.export','audit.query'], cluster: ['routes.query','routes.navigate'] },
  catalog: [{ record: kubeeyeInstallation, label: 'KubeEye' }, { record: kubeeyeInstallationV2, label: 'KubeEye' }],
  additionalInstallations: fixtures ? uiFixtureInstallations : [],
  createStore: installationStorage.createStore, recovery: installationStorage.recovery,
};
