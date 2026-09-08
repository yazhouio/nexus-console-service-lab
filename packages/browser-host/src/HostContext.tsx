import { createContext, useContext } from 'react';
import type { InstallationStore, PluginRuntime, RuntimeSnapshot, createPlatformPlugin } from '@nexus/plugin-runtime';
import type { UiHost, BridgeAuditEntry, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';
import type { RouteModel } from '@nexus/plugin-runtime';

export interface HostServices {
  readonly runtime: PluginRuntime;
  readonly ui: UiHost;
  readonly store: InstallationStore;
  readonly adapter: WujiePluginAdapter;
  readonly audit: readonly (BridgeAuditEntry | { type: 'navigation'; pluginId: string; routeId: string; ownerPluginId: string; timestamp: number })[];
  readonly model: RouteModel;
  readonly platform: ReturnType<typeof createPlatformPlugin>;
  diagnostics(): RuntimeSnapshot;
}
export const HostContext = createContext<HostServices | undefined>(undefined);
export function useHostServices(): HostServices {
  const services = useContext(HostContext);
  if (!services) throw new Error('Host services are not ready.');
  return services;
}
