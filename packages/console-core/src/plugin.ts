import { consoleCoreDescriptor, consoleCoreRoutes, consoleCoreNavigation, consoleCoreExtensions } from './plugin-data';
import type { PluginDefinition } from '@nexus/plugin-runtime';
import { CONSOLE_CORE_CAPABILITY, CONSOLE_ROOT_SURFACE, CONSOLE_EXTENSION_POINTS } from '@nexus/console-core-api';
import { ConsoleLayout } from './ConsoleLayout';
import { Overview } from './Overview';
import { Settings } from './Settings';

export const consoleCore: PluginDefinition = {
  ...consoleCoreDescriptor,
  activate({ contributions, capabilities, actions }) {
    contributions.registerSurface({ id: CONSOLE_ROOT_SURFACE, target: { kind: 'builtin', render: ConsoleLayout } });
    for (const point of CONSOLE_EXTENSION_POINTS) contributions.registerExtensionPoint(point);
    actions.register('plugin-status', async ({ context, capabilities }) => {
      const id = (context as { itemRef: { id: string } }).itemRef.id;
      const plugins = await capabilities.invoke('plugins.query@1', 'list', null) as unknown as import('@nexus/plugin-runtime').PluginSummary[];
      const plugin = plugins.find(plugin => plugin.id === id);
      return plugin ? { id: plugin.id, state: plugin.state, version: plugin.version } : null;
    });
    contributions.registerExtension(consoleCoreExtensions['plugin-status']);
    contributions.registerRoute({ ...consoleCoreRoutes['host-overview'], target: { kind: 'builtin', render: Overview } });
    contributions.registerRoute({ ...consoleCoreRoutes['console-settings'], target: { kind: 'builtin', render: Settings } });
    contributions.registerNavigation(consoleCoreNavigation['host-overview-navigation']);
    contributions.registerNavigation(consoleCoreNavigation['console-settings-navigation']);
    capabilities.register(CONSOLE_CORE_CAPABILITY, { name: 'Nexus Console' });
  },
};
