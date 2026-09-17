import type {
  PluginDescriptor,
  RouteContribution,
  ExtensionContributionDefinition,
} from '@feforgejs/plugin-runtime';
import {
  CONSOLE_CORE_CAPABILITY,
  CORE_ROUTES_POINT,
  primaryNavigation,
} from '@feforgejs/console-core-api';
import {
  DEPLOYMENT_CARDS_POINT,
  DEPLOYMENT_TABS_POINT,
  DEPLOYMENT_ACTIONS_POINT,
} from '@feforgejs/cluster-api';
export const deploymentDescriptor = {
  id: 'deployment',
  version: '1.0.0',
  roles: ['feature'],
  provenance: 'first-party',
  requires: [CONSOLE_CORE_CAPABILITY, 'routes.navigate@1'],
  provides: [],
} as const satisfies PluginDescriptor;
export const deploymentRoutes = {
  list: { id: 'deployment-list', path: '/deployments', point: CORE_ROUTES_POINT },
  detail: {
    id: 'deployment-detail',
    path: '/clusters/:cluster/namespaces/:namespace/deployments/:deployment',
    point: CORE_ROUTES_POINT,
  },
} as const satisfies Record<string, Omit<RouteContribution, 'target'>>;
export const deploymentNavigation = primaryNavigation({
  id: 'deployment-navigation',
  label: 'Deployments',
  routeId: 'deployment-list',
  order: 50,
});
const extensionBase = {
  version: '1.0.0',
  roles: ['feature'],
  provenance: 'first-party',
  requires: [CONSOLE_CORE_CAPABILITY],
  provides: [],
} as const;
export const deploymentHpaDescriptor = {
  ...extensionBase,
  id: 'deployment-hpa',
} as const satisfies PluginDescriptor;
export const deploymentVpaDescriptor = {
  ...extensionBase,
  id: 'deployment-vpa',
} as const satisfies PluginDescriptor;
export const deploymentMonitoringDescriptor = {
  ...extensionBase,
  id: 'deployment-monitoring',
} as const satisfies PluginDescriptor;
export const deploymentNetworkDescriptor = {
  ...extensionBase,
  id: 'deployment-network',
} as const satisfies PluginDescriptor;
export const deploymentExtensions = {
  'hpa-card': {
    id: 'hpa-card',
    kind: 'surface',
    surfaceId: 'hpa-card',
    point: DEPLOYMENT_CARDS_POINT,
    order: 10,
  },
  'vpa-card': {
    id: 'vpa-card',
    kind: 'surface',
    surfaceId: 'vpa-card',
    point: DEPLOYMENT_CARDS_POINT,
    order: 20,
  },
  'vpa-apply': {
    id: 'vpa-apply',
    kind: 'action',
    actionId: 'apply-recommendation',
    label: '应用 VPA 建议',
    point: DEPLOYMENT_ACTIONS_POINT,
  },
  'monitoring-tab': {
    id: 'monitoring-tab',
    kind: 'tab',
    tabId: 'monitoring',
    label: '监控',
    surfaceId: 'monitoring',
    point: DEPLOYMENT_TABS_POINT,
    order: 10,
  },
  'network-tab': {
    id: 'network-tab',
    kind: 'tab',
    tabId: 'network',
    label: '网络',
    surfaceId: 'network',
    point: DEPLOYMENT_TABS_POINT,
    order: 20,
  },
} as const satisfies Record<string, ExtensionContributionDefinition>;
