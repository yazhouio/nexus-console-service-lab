import type { PluginDefinition } from '@nexus/plugin-runtime';
import { CONSOLE_CORE_ID, CONSOLE_CORE_CAPABILITY, CONSOLE_ROOT_SURFACE, CONSOLE_EXTENSION_POINTS, PLUGIN_DETAILS_ACTIONS_POINT, consoleRoute, primaryNavigation } from '@nexus/console-core-api';
import { ConsoleLayout } from './ConsoleLayout';
import { Overview } from './Overview';
import { Settings } from './Settings';

export const consoleCore: PluginDefinition = {
  id: CONSOLE_CORE_ID, version: '1.0.0', roles: ['provider','feature'], provenance: 'first-party',
  requires: ['routes.query@1','routes.navigate@1','plugins.query@1','plugins.manage@1','diagnostics.query@1','diagnostics.export@1','audit.query@1'],
  provides: [CONSOLE_CORE_CAPABILITY],
  activate({ contributions, capabilities, actions }) {
    contributions.registerSurface({ id: CONSOLE_ROOT_SURFACE, target: { kind: 'builtin', render: ConsoleLayout } });
    for (const point of CONSOLE_EXTENSION_POINTS) contributions.registerExtensionPoint(point);
    actions.register('plugin-status', async ({ context, capabilities }) => {
      const id = (context as { itemRef: { id: string } }).itemRef.id;
      const plugins = await capabilities.invoke('plugins.query@1', 'list', null) as unknown as import('@nexus/plugin-runtime').PluginSummary[];
      const plugin = plugins.find(plugin => plugin.id === id);
      return plugin ? { id: plugin.id, state: plugin.state, version: plugin.version } : null;
    });
    contributions.registerExtension({ id: 'plugin-status', kind: 'action', actionId: 'plugin-status', label: 'Check plugin status', point: PLUGIN_DETAILS_ACTIONS_POINT });
    contributions.registerRoute(consoleRoute({ id: 'host-overview', path: '/', target: { kind: 'builtin', render: Overview } }));
    contributions.registerRoute(consoleRoute({ id: 'console-settings', path: '/settings', target: { kind: 'builtin', render: Settings } }));
    contributions.registerNavigation(primaryNavigation({ id: 'host-overview-navigation', label: 'Overview', routeId: 'host-overview', order: 0 }));
    contributions.registerNavigation(primaryNavigation({ id: 'console-settings-navigation', label: 'Settings', routeId: 'console-settings', group: 'system', order: 1000 }));
    capabilities.register(CONSOLE_CORE_CAPABILITY, { name: 'Nexus Console' });
  },
};
