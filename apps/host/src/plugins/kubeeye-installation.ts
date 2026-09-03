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
          },
        ],
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

