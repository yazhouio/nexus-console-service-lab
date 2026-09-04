import { createContext, useContext } from 'react';
import type { InstallationStore, PluginRuntime } from '@nexus/plugin-runtime';
import type { UiHost, BridgeAuditEntry, SurfaceMountIssue, WujiePluginAdapter } from '@nexus/plugin-runtime/browser';
import type { RouteModel } from './routing/route-model';

export interface HostServices {
  readonly runtime: PluginRuntime;
  readonly ui: UiHost;
  readonly store: InstallationStore;
  readonly adapter: WujiePluginAdapter;
  readonly audit: readonly BridgeAuditEntry[];
  readonly failures: Readonly<Record<string, SurfaceMountIssue>>;
  readonly model?: RouteModel;
}
export const HostContext = createContext<HostServices | undefined>(undefined);
export function useHostServices(): HostServices {
  const services = useContext(HostContext);
  if (!services) throw new Error('Host services are not ready.');
  return services;
}
