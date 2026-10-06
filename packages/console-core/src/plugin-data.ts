import type {
  PluginDescriptor,
  RouteContribution,
  NavigationContribution,
  ExtensionContributionDefinition,
} from '@feforgejs/plugin-runtime';
import {
  CONSOLE_CORE_ID,
  CONSOLE_CORE_CAPABILITY,
  CORE_ROUTES_POINT,
  PLUGIN_DETAILS_ACTIONS_POINT,
  primaryNavigation,
} from '@feforgejs/console-core-api';

export const consoleCoreDescriptor = {
  id: CONSOLE_CORE_ID,
  version: '1.0.0',
  roles: ['provider', 'feature'],
  provenance: 'first-party',
  requires: [
    'routes.query@1',
    'routes.navigate@1',
    'plugins.query@1',
    'plugins.manage@1',
    'diagnostics.query@1',
    'diagnostics.export@1',
    'audit.query@1',
  ],
  provides: [CONSOLE_CORE_CAPABILITY],
} as const satisfies PluginDescriptor;

export const consoleCoreRoutes = {
  'host-overview': { id: 'host-overview', path: '/', point: CORE_ROUTES_POINT },
  'console-settings': { id: 'console-settings', path: '/settings', point: CORE_ROUTES_POINT },
} as const satisfies Record<string, Omit<RouteContribution, 'target'>>;

export const consoleCoreNavigation = {
  'host-overview-navigation': primaryNavigation({
    id: 'host-overview-navigation',
    label: 'Overview',
    routeId: 'host-overview',
    order: 0,
  }),
  'console-settings-navigation': primaryNavigation({
    id: 'console-settings-navigation',
    label: 'Settings',
    routeId: 'console-settings',
    group: 'system',
    order: 1000,
  }),
} as const satisfies Record<string, NavigationContribution>;

export const consoleCoreExtensions = {
  'plugin-status': {
    id: 'plugin-status',
    kind: 'action',
    actionId: 'plugin-status',
    label: 'Check plugin status',
    point: PLUGIN_DETAILS_ACTIONS_POINT,
  },
} as const satisfies Record<string, ExtensionContributionDefinition>;
