import type { PluginDescriptor, RouteContribution, NavigationContribution, ExtensionContributionDefinition } from '@nexus/plugin-runtime';
import { CONSOLE_CORE_CAPABILITY, CORE_ROUTES_POINT, PLUGIN_DETAILS_ACTIONS_POINT, primaryNavigation, homeCard, settingsSection } from '@nexus/console-core-api';
import { NODE_ACTIONS_POINT, NODE_TABS_POINT } from '@nexus/cluster-api';

export const extensionDemoDescriptor = {
  id: 'extension-demo', version: '1.0.0', roles: ['feature'], provenance: 'first-party',
  requires: [CONSOLE_CORE_CAPABILITY], provides: []
} as const satisfies PluginDescriptor;

export const extensionDemoRoutes = {
  'extension-demo-route': { id: 'extension-demo-route', path: '/extensions', point: CORE_ROUTES_POINT },
} as const satisfies Record<string, Omit<RouteContribution, 'target'>>;

export const extensionDemoNavigation = {
  'extension-demo-navigation': primaryNavigation({ id: 'extension-demo-navigation', label: 'Extension points', routeId: 'extension-demo-route', group: 'secondary', order: 800 }),
} as const satisfies Record<string, NavigationContribution>;

export const extensionDemoExtensions = {
  'extension-demo-home-card': homeCard({ id: 'extension-demo-home-card', label: 'Extension Demo', surfaceId: 'extension-demo-card', order: 10, initiallySelected: false }),
  'extension-demo-settings-section': settingsSection({ id: 'extension-demo-settings-section', label: 'Demo preferences', surfaceId: 'extension-demo-settings', order: 10 }),
  'extension-demo-plugin-action': { id: 'extension-demo-plugin-action', kind: 'action', actionId: 'plugin-contract-check', label: 'Check extension contract', point: PLUGIN_DETAILS_ACTIONS_POINT, order: 50, group: 'secondary', expectedProfile: 'detail.actions@1', expectedRefContract: 'console-core.plugin-ref@1' },
  'extension-demo-node-action': { id: 'extension-demo-node-action', kind: 'action', actionId: 'node-health-check', label: 'Check node health', point: NODE_ACTIONS_POINT, order: 50, expectedProfile: 'detail.actions@1', expectedRefContract: 'cluster.resource-ref@1' },
  'extension-demo-node-health-tab': { id: 'extension-demo-node-health-tab', kind: 'tab', tabId: 'health', label: 'Health', surfaceId: 'extension-demo-node-health', point: NODE_TABS_POINT, order: -50, expectedProfile: 'detail.tabs@1', expectedRefContract: 'cluster.resource-ref@1' },
} as const satisfies Record<string, ExtensionContributionDefinition>;
