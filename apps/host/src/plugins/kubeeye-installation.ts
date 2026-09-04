import {
  validateRestrictedInstallRecord,
  type BridgeCapabilityContract,
} from '@nexus/plugin-runtime';

import type { ClusterCapability } from './cluster';

export const kubeeyeInstallation = validateRestrictedInstallRecord(
  {
    manifest: {
      id: 'kubeeye',
      version: '1.0.0',
      entry: '/plugins/kubeeye/1.0.0/',
      hostApi: 'kubesphere.console@1',
      requires: ['kubesphere.cluster@2'],
      provides: [],
      permissions: ['cluster.read'],
      surfaces: [{ id: 'overview' }],
      contributions: {
        routes: [
          {
            id: 'kubeeye-overview-route',
            path: '/kubeeye',
            surfaceId: 'overview',
            layout: { width: 'full' },
            initialParameters: { view: 'route' },
          },
        ],
        extensions: [{
          id: 'kubeeye-overview-card', slot: 'console.home.cards', surfaceId: 'overview',
          layout: { width: 'compact' }, initialParameters: { view: 'card' },
        }, {
          id: 'kubeeye-unused', slot: 'unavailable.slot', surfaceId: 'overview',
        }],
        navigation: [
          {
            id: 'kubeeye-overview-navigation',
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
      grantedPermissions: ['cluster.read'],
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
        id: 'node-alert-messages', parentRouteId: 'node-detail', path: 'alert-messages', surfaceId: 'overview', initialParameters: { view: 'node-alerts' },
      }],
      navigation: [...(kubeeyeInstallation.manifest.contributions.navigation ?? []), {
        id: 'node-alert-navigation', label: 'Alerts', parentId: 'node-navigation', routeId: 'node-alert-messages',
      }],
    },
  },
  config: { ...kubeeyeInstallation.config, version: '2.0.0' },
}, { isEntryAllowed: entry => entry.startsWith('/plugins/') });
