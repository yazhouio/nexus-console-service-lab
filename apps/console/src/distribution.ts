import { federationBuiltins, type BuiltinPin } from './federation-builtins';
import { css as localCss } from './ui-local.module.css?artifact';
import { css as coreCss } from '@nexus/console-core/styles.css?artifact';
import { css as clusterCss } from './plugins/cluster.css?artifact';
import { css as deploymentCss } from './plugins/deployment-ui.css?artifact';
import type { PluginDefinition } from '@nexus/plugin-runtime';
import type { BrowserDistribution } from '@nexus/browser-host';
import { consoleCore } from '@nexus/console-core';
import {
  CONSOLE_CORE_ID,
  CONSOLE_PROFILES,
  PLUGIN_REF_CONTRACT,
  CORE_ROUTES_POINT,
  PRIMARY_NAVIGATION_POINT,
  consoleRoute,
} from '@nexus/console-core-api';
import { RESOURCE_REF_CONTRACT, DEPLOYMENT_PROFILES } from '@nexus/cluster-api';
import { cluster } from './plugins/cluster';
import {
  kubeeyeInstallation,
  kubeeyeInstallationV2,
  clusterBridgeContract,
} from './plugins/kubeeye-installation';
import {
  uiFixtureBuiltin,
  uiFixtureInstallations,
  UiCompositionFixture,
  BuiltinStylingFixture,
} from './ui-fixtures';
import { IndependentSurfacesFixture } from './fixtures';
import { contributionGovernance } from './routing/contribution-policy';
import { installationStorage } from './installation-storage';

import { deployment } from './plugins/deployment';
import {
  deploymentHpa,
  deploymentVpa,
  deploymentMonitoring,
  deploymentNetwork,
} from './plugins/deployment-extensions';

declare const NEXUS_BUILTIN_PINS: readonly BuiltinPin[];
declare const NEXUS_REMOTE_DEMO: boolean;
// The build-time branch prevents resolving local plugin source/assets in a remote distribution.
const localDemo: PluginDefinition | undefined = NEXUS_REMOTE_DEMO
  ? undefined
  : require('./plugins/extension-demo').extensionDemo;
const demoCss: readonly string[] = NEXUS_REMOTE_DEMO
  ? []
  : require('./plugins/extension-demo.css?artifact').css;

const fixtures = process.env.PUBLIC_TEST_FIXTURES === 'true';
const core = fixtures
  ? {
      ...consoleCore,
      activate(context: Parameters<typeof consoleCore.activate>[0]) {
        consoleCore.activate(context);
        context.contributions.registerRoute(
          consoleRoute({
            id: 'test-styling',
            path: '/__fixtures__/styling',
            target: { kind: 'builtin', render: BuiltinStylingFixture },
          }),
        );
        context.contributions.registerRoute(
          consoleRoute({
            id: 'test-ui-composition',
            path: '/__fixtures__/ui-composition',
            target: { kind: 'builtin', render: UiCompositionFixture },
          }),
        );
        context.contributions.registerRoute(
          consoleRoute({
            id: 'test-independent-surfaces',
            path: '/__fixtures__/surfaces',
            target: { kind: 'builtin', render: IndependentSurfacesFixture },
          }),
        );
      },
    }
  : consoleCore;
export const distribution: BrowserDistribution = {
  builtinCss: {
    ...(fixtures ? { [uiFixtureBuiltin.id]: localCss } : {}),
    [core.id]: coreCss,
    [cluster.id]: clusterCss,
    ...(localDemo ? { [localDemo.id]: demoCss } : {}),
    ...Object.fromEntries(
      [deployment, deploymentHpa, deploymentVpa, deploymentMonitoring, deploymentNetwork].map(
        (plugin) => [plugin.id, deploymentCss],
      ),
    ),
  },
  applicationLabel: 'Console',
  prepareBuiltins: NEXUS_BUILTIN_PINS.length ? federationBuiltins(NEXUS_BUILTIN_PINS) : undefined,
  builtins: [
    core,
    cluster,
    ...(localDemo ? [localDemo] : []),
    deployment,
    deploymentHpa,
    deploymentVpa,
    deploymentMonitoring,
    deploymentNetwork,
    ...(fixtures ? [uiFixtureBuiltin] : []),
  ],
  coreRootIds: [CONSOLE_CORE_ID],
  rootPresentation: { ownerPluginId: CONSOLE_CORE_ID, surfaceId: 'root' },
  rootRoutePoint: CORE_ROUTES_POINT,
  navigationRootPoints: [PRIMARY_NAVIGATION_POINT],
  supportedHostApis: ['kubesphere.console@1'],
  bridgeContracts: [clusterBridgeContract],
  profiles: [...CONSOLE_PROFILES, ...DEPLOYMENT_PROFILES],
  refContracts: [PLUGIN_REF_CONTRACT, RESOURCE_REF_CONTRACT],
  policyBundle: contributionGovernance,
  capabilityGrants: {
    ...(fixtures ? { 'ui-local': ['ui.overlay'] } : {}),
    'console-core': [
      'routes.query',
      'routes.navigate',
      'plugins.query',
      'plugins.manage',
      'diagnostics.query',
      'diagnostics.export',
      'audit.query',
    ],
    cluster: ['routes.query', 'routes.navigate'],
    deployment: ['routes.navigate'],
  },
  catalog: [
    { record: kubeeyeInstallation, label: 'KubeEye' },
    { record: kubeeyeInstallationV2, label: 'KubeEye' },
  ],
  additionalInstallations: fixtures ? uiFixtureInstallations : [],
  createStore: installationStorage.createStore,
  recovery: installationStorage.recovery,
};
