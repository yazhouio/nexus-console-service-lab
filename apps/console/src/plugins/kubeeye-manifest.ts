import type { RestrictedPluginManifest } from '@nexus/plugin-runtime';
import { NODE_CHILD_ROUTES_POINT, NODE_NAVIGATION_POINT } from '@nexus/cluster-api';
import { CORE_ROUTES_POINT, PRIMARY_NAVIGATION_POINT } from '@nexus/console-core-api';

export const kubeeyeManifest = {
  id: 'kubeeye',
  version: '1.0.0',
  entry: '/plugins/kubeeye/1.0.0/',
  hostApi: 'kubesphere.console@1',
  requires: ['kubesphere.cluster@2','routes.query@1','routes.navigate@1'],
  provides: [],
  permissions: ['cluster.read','routes.query','routes.navigate'],
  surfaces: [{ id: 'overview' }],
  contributions: {
    routes: [
      {
        id: 'kubeeye-overview-route', point: CORE_ROUTES_POINT,
        path: '/kubeeye',
        surfaceId: 'overview',
        layout: { width: 'full' },
        initialParameters: { view: 'route' },
      },
    ],
    extensions: [{
      id: 'kubeeye-overview-card', kind: 'surface', label: 'KubeEye Card', initiallySelected: false, point: { ownerPluginId: 'console-core', id: 'home.cards', contractMajor: 1 }, surfaceId: 'overview',
    }, {
      id: 'kubeeye-unused', kind: 'surface', point: { ownerPluginId: 'console-core', id: 'unavailable', contractMajor: 1 }, surfaceId: 'overview',
    }],
    navigation: [
      {
        id: 'kubeeye-overview-navigation', point: PRIMARY_NAVIGATION_POINT,
        label: 'KubeEye',
        routeId: 'kubeeye-overview-route',
        order: 200,
      },
    ],
  },
} as const satisfies RestrictedPluginManifest;

export const kubeeyeManifestV2 = {
  ...kubeeyeManifest, version: '2.0.0', entry: '/plugins/kubeeye/2.0.0/',
  contributions: {
    ...kubeeyeManifest.contributions,
    routes: [...(kubeeyeManifest.contributions.routes ?? []), {
      id: 'node-alert-messages', parentRouteId: 'node-detail', point: NODE_CHILD_ROUTES_POINT, path: 'alert-messages', surfaceId: 'overview', initialParameters: { view: 'node-alerts' },
    }],
    navigation: [...(kubeeyeManifest.contributions.navigation ?? []), {
      id: 'node-alert-navigation', label: 'Alerts', parentId: 'node-navigation', point: NODE_NAVIGATION_POINT, routeId: 'node-alert-messages',
    }],
  },
} as const satisfies RestrictedPluginManifest;
