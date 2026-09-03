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
    context.capabilities.register<ConsoleShellCapability>(
      'kubesphere.console-shell@1',
      { name: 'Nexus Console' },
    );
  },
};

