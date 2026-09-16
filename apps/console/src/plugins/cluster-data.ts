import type {
  PluginDescriptor,
  RouteContribution,
  NavigationContribution,
  ExtensionContributionDefinition,
} from '@nexus/plugin-runtime';
import {
  CONSOLE_CORE_CAPABILITY,
  CORE_ROUTES_POINT,
  primaryNavigation,
  homeCard,
} from '@nexus/console-core-api';
import {
  NODE_CHILD_ROUTES_POINT,
  NODE_NAVIGATION_POINT,
  NODE_TABS_POINT,
} from '@nexus/cluster-api';

export const clusterDescriptor = {
  id: 'cluster',
  version: '1.0.0',
  roles: ['provider', 'feature'],
  provenance: 'first-party',
  requires: [CONSOLE_CORE_CAPABILITY, 'routes.query@1', 'routes.navigate@1'],
  provides: ['kubesphere.cluster@2'],
} as const satisfies PluginDescriptor;

export const clusterRoutes = {
  'cluster-overview-route': {
    id: 'cluster-overview-route',
    path: '/clusters/current',
    point: CORE_ROUTES_POINT,
  },
  'node-detail': {
    id: 'node-detail',
    path: '/clusters/:cluster/nodes/:node',
    childPoint: NODE_CHILD_ROUTES_POINT,
    point: CORE_ROUTES_POINT,
  },
  'node-events': {
    id: 'node-events',
    parentRouteId: 'node-detail',
    point: NODE_CHILD_ROUTES_POINT,
    path: 'events',
  },
} as const satisfies Record<string, Omit<RouteContribution, 'target'>>;

export const clusterNavigation = {
  'cluster-overview-navigation': primaryNavigation({
    id: 'cluster-overview-navigation',
    label: 'Cluster Overview',
    routeId: 'cluster-overview-route',
    order: 100,
  }),
  'node-navigation': primaryNavigation({
    id: 'node-navigation',
    label: 'Node',
    routeId: 'node-detail',
    childPoint: NODE_NAVIGATION_POINT,
    order: 150,
  }),
  'node-events-navigation': {
    id: 'node-events-navigation',
    label: 'Events',
    parentId: 'node-navigation',
    routeId: 'node-events',
    point: NODE_NAVIGATION_POINT,
  },
} as const satisfies Record<string, NavigationContribution>;

export const clusterExtensions = {
  'node-summary': {
    id: 'node-summary',
    kind: 'tab',
    tabId: 'summary',
    label: 'Resource summary',
    surfaceId: 'node-summary',
    point: NODE_TABS_POINT,
  },
  'cluster-overview-card': homeCard({
    id: 'cluster-overview-card',
    surfaceId: 'cluster-overview-card',
    label: 'Cluster Card',
    order: 100,
  }),
} as const satisfies Record<string, ExtensionContributionDefinition>;
