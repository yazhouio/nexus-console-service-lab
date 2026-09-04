import { UiCompositionFixture } from '../ui-fixtures';
import { IndependentSurfacesFixture } from '../fixtures';
import { Overview } from '../Overview';
import type { PluginDefinition } from '@nexus/plugin-runtime';

export interface ConsoleShellCapability {
  readonly name: string;
}

export const consoleShell: PluginDefinition = {
  id: 'console-shell',
  version: '1.0.0',
  requires: [],
  provides: ['kubesphere.console-shell@1'],
  activate(context) {
    context.contributions.registerExtensionPoint({ id: 'home.cards', kind: 'surface', contractMajor: 1, contextSchema: { type: 'object' } });
    if (process.env.PUBLIC_TEST_FIXTURES === 'true') context.contributions.registerRoute({ id: 'test-ui-composition', path: '/__fixtures__/ui-composition', target: { kind: 'builtin', render: UiCompositionFixture } });
    if (process.env.PUBLIC_TEST_FIXTURES === 'true') context.contributions.registerRoute({ id: 'test-independent-surfaces', path: '/__fixtures__/surfaces', target: { kind: 'builtin', render: IndependentSurfacesFixture } });
    context.contributions.registerRoute({ id: 'host-overview', path: '/', target: { kind: 'builtin', render: Overview } });
    context.contributions.registerNavigation({ id: 'host-overview-navigation', label: 'Overview', routeId: 'host-overview', order: 0 });
    context.capabilities.register<ConsoleShellCapability>(
      'kubesphere.console-shell@1',
      { name: 'Nexus Console' },
    );
  },
};

