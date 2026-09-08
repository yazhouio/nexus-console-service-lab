import type { ExtensionPointRef, RefContract } from '@nexus/plugin-runtime';
export interface ClusterCapability {
  getCurrentCluster(): string;
  setCurrentCluster(name: string): void;
  watchCurrentCluster(emit: (name: string) => void): { snapshot: string; dispose(): void };
}
export interface ResourceRef {
  readonly clusterId: string;
  readonly apiVersion: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly uid?: string;
}
const text = { type: 'string', minLength: 1, maxLength: 1024 } as const;
export const RESOURCE_REF_CONTRACT = {
  id: 'cluster.resource-ref@1',
  schema: { type: 'object', properties: { clusterId: text, apiVersion: text, kind: text, namespace: text, name: text, uid: text }, required: ['clusterId','apiVersion','kind','name'], additionalProperties: false },
  traits: { uid: { field: 'uid' }, kind: { field: 'kind' } }, predicates: { hasIdentity: { trait: 'uid', op: 'present' } },
} as const satisfies RefContract;
export const NODE_CHILD_ROUTES_POINT = { ownerPluginId: 'cluster', id: 'node.children', contractMajor: 1 } as const satisfies ExtensionPointRef;
export const NODE_NAVIGATION_POINT = { ownerPluginId: 'cluster', id: 'node.navigation', contractMajor: 1 } as const satisfies ExtensionPointRef;
export const NODE_ACTIONS_POINT = { ownerPluginId: 'cluster', id: 'node.actions', contractMajor: 1 } as const satisfies ExtensionPointRef;
export const NODE_TABS_POINT = { ownerPluginId: 'cluster', id: 'node.tabs', contractMajor: 1 } as const satisfies ExtensionPointRef;
