import {
  validateRestrictedInstallRecord,
  type BridgeCapabilityContract,
} from '@nexus/plugin-runtime';

import type { ClusterCapability } from '@nexus/cluster-api';
import { NODE_CHILD_ROUTES_POINT, NODE_NAVIGATION_POINT } from '@nexus/cluster-api';
import { CORE_ROUTES_POINT, PRIMARY_NAVIGATION_POINT } from '@nexus/console-core-api';

export const kubeeyeInstallation = validateRestrictedInstallRecord(
  {
    manifest: {
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
    },
    config: {
      id: 'kubeeye',
      version: '1.0.0',
      enabled: true,
      grantedPermissions: ['cluster.read','routes.query','routes.navigate'],
    },
  },
  {
    isEntryAllowed: entry => entry.startsWith('/plugins/'),
  },
);

export const clusterBridgeContract: BridgeCapabilityContract = {
  id: 'kubesphere.cluster@2',
  actions: {
    watchCurrentCluster: {
      kind: 'subscription', requiredPermissions: ['cluster.read'],
      requestSchema: { parse(value) { if (value !== null) throw Error('Expected null'); return null; } },
      snapshotSchema: { parse(value) { if (typeof value !== 'string') throw Error('Expected cluster name'); return value; } },
      eventSchema: { parse(value) { if (typeof value !== 'string') throw Error('Expected cluster name'); return value; } },
      open(capability, _payload, _context, emit) { return (capability as ClusterCapability).watchCurrentCluster(emit); },
    },
    getCurrentCluster: {
      kind: 'request',
      requiredPermissions: ['cluster.read'],
      requestSchema: {
        parse(value) {
          if (value !== null) {
            throw new Error('Expected a null request.');
          }
          return value;
        },
      },
      resultSchema: {
        parse(value) {
          if (typeof value !== 'string') {
            throw new Error('Expected a cluster name.');
          }
          return value;
        },
      },
      invoke(capability) {
        return (capability as ClusterCapability).getCurrentCluster();
      },
    },
  },
};


/** Only publish these declarations to a Host advertising contribution contract v2. */
export const kubeeyeInstallationV2 = validateRestrictedInstallRecord({
  manifest: {
    ...kubeeyeInstallation.manifest, version: '2.0.0', entry: '/plugins/kubeeye/2.0.0/',
    contributions: {
      ...kubeeyeInstallation.manifest.contributions,
      routes: [...(kubeeyeInstallation.manifest.contributions.routes ?? []), {
        id: 'node-alert-messages', parentRouteId: 'node-detail', point: NODE_CHILD_ROUTES_POINT, path: 'alert-messages', surfaceId: 'overview', initialParameters: { view: 'node-alerts' },
      }],
      navigation: [...(kubeeyeInstallation.manifest.contributions.navigation ?? []), {
        id: 'node-alert-navigation', label: 'Alerts', parentId: 'node-navigation', point: NODE_NAVIGATION_POINT, routeId: 'node-alert-messages',
      }],
    },
  },
  config: { ...kubeeyeInstallation.config, version: '2.0.0' },
}, { isEntryAllowed: entry => entry.startsWith('/plugins/') });
