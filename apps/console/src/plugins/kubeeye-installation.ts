import { kubeeyeManifest, kubeeyeManifestV2 } from './kubeeye-manifest';
import { validateRestrictedInstallRecord, type BridgeCapabilityContract } from '@nexus/plugin-runtime';

import type { ClusterCapability } from '@nexus/cluster-api';

export const kubeeyeInstallation = validateRestrictedInstallRecord(
  {
    manifest: kubeeyeManifest,
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
  manifest: kubeeyeManifestV2,
  config: { ...kubeeyeInstallation.config, version: '2.0.0' },
}, { isEntryAllowed: entry => entry.startsWith('/plugins/') });
