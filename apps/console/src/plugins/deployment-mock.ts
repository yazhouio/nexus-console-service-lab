import { useSyncExternalStore } from 'react';
import type { ResourceRef } from '@nexus/cluster-api';

export interface DeploymentRecord {
  ref: ResourceRef;
  image: string;
  replicas: number;
  ready: number;
  cpu: number;
  memory: number;
  hpa: boolean;
  min: number;
  max: number;
  requestCpu: number;
  requestMemory: number;
  service: string;
  port: number;
  events: readonly string[];
}
const initial: DeploymentRecord[] = [
  {
    ref: {
      clusterId: 'demo-cluster',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'production',
      name: 'checkout',
      uid: 'mock-checkout',
    },
    image: 'registry.example/checkout:2.4.1',
    replicas: 3,
    ready: 3,
    cpu: 62,
    memory: 384,
    hpa: true,
    min: 2,
    max: 8,
    requestCpu: 250,
    requestMemory: 512,
    service: 'checkout',
    port: 8080,
    events: ['Deployment rollout completed', 'All 3 replicas are ready'],
  },
  {
    ref: {
      clusterId: 'demo-cluster',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'production',
      name: 'payments',
      uid: 'mock-payments',
    },
    image: 'registry.example/payments:1.8.0',
    replicas: 2,
    ready: 2,
    cpu: 35,
    memory: 256,
    hpa: false,
    min: 2,
    max: 6,
    requestCpu: 250,
    requestMemory: 512,
    service: 'payments',
    port: 9000,
    events: ['Deployment rollout completed'],
  },
  {
    ref: {
      clusterId: 'demo-cluster',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      namespace: 'staging',
      name: 'catalog',
      uid: 'mock-catalog',
    },
    image: 'registry.example/catalog:3.0.0-rc1',
    replicas: 2,
    ready: 1,
    cpu: 81,
    memory: 640,
    hpa: true,
    min: 2,
    max: 5,
    requestCpu: 500,
    requestMemory: 768,
    service: 'catalog',
    port: 8080,
    events: ['Waiting for one replica to become ready'],
  },
];
// Shared mock backend adapter. UI plugins share data, never import one another's components.
let records: readonly DeploymentRecord[] = initial;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useDeployments() {
  return useSyncExternalStore(subscribe, () => records);
}
export function findDeployment(ref: ResourceRef | undefined) {
  return records.find(
    (item) =>
      item.ref.clusterId === ref?.clusterId &&
      item.ref.namespace === ref.namespace &&
      item.ref.name === ref.name,
  );
}
export function updateDeployment(
  ref: ResourceRef,
  change: Partial<Omit<DeploymentRecord, 'ref'>>,
  event: string,
) {
  const current = findDeployment(ref);
  if (!current) throw new Error('Deployment not found');
  records = records.map((item) =>
    item === current ? { ...item, ...change, events: [event, ...item.events] } : item,
  );
  listeners.forEach((listener) => listener());
}
