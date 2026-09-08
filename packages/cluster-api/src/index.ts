import type { ExtensionKind, ExtensionPointDefinition, ExtensionPointRef, RefContract } from '@nexus/plugin-runtime';
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

/** Fixed host-side node extension points. Plugins only register contributions. */
export type ClusterHostExtensionPointDefinition = ExtensionPointDefinition;
export const CLUSTER_EXTENSION_POINTS = [
  { id: NODE_CHILD_ROUTES_POINT.id, kind: 'route', contractMajor: 1, profile: 'console-core.routes@1' },
  { id: NODE_NAVIGATION_POINT.id, kind: 'navigation', contractMajor: 1, profile: 'console-core.navigation@1' },
  { id: NODE_ACTIONS_POINT.id, kind: 'action', contractMajor: 1, profile: 'detail.actions@1', bindings: { itemRefContract: RESOURCE_REF_CONTRACT.id } },
  { id: NODE_TABS_POINT.id, kind: 'tab', contractMajor: 1, profile: 'detail.tabs@1', bindings: { itemRefContract: RESOURCE_REF_CONTRACT.id } },
] as const satisfies readonly ClusterHostExtensionPointDefinition[];
export interface ClusterExtensionPointCatalogEntry {
  readonly ref: ExtensionPointRef;
  readonly kind: ExtensionKind;
  readonly title: string;
  readonly description: string;
}
export const CLUSTER_EXTENSION_POINT_CATALOG = [
  { ref: NODE_CHILD_ROUTES_POINT, kind: 'route', title: 'Node child routes', description: 'Extend the node detail route with a child page.' },
  { ref: NODE_NAVIGATION_POINT, kind: 'navigation', title: 'Node navigation', description: 'Add a node detail navigation item.' },
  { ref: NODE_ACTIONS_POINT, kind: 'action', title: 'Node actions', description: 'Add a typed action for a ResourceRef.' },
  { ref: NODE_TABS_POINT, kind: 'tab', title: 'Node tabs', description: 'Add a lazily mounted tab for a ResourceRef.' },
] as const satisfies readonly ClusterExtensionPointCatalogEntry[];
