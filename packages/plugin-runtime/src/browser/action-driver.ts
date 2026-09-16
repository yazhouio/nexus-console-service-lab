import { frozenCopy } from '../immutable';
import type { PluginRuntime } from '../bootstrap';
import type { ActionDriver } from '../action-runtime';
import { createUiClient } from '../ui-client';
import { uiKey } from '../ui/definitions';
import { createPluginBridgeSession, type BridgeAuditEntry } from './plugin-bridge';
import type { WujiePluginAdapter } from './wujie-plugin-adapter';

export function createBrowserActionDriver(options: {
  runtime: PluginRuntime;
  onAudit?: (entry: BridgeAuditEntry) => void;
  restrictedAdapter: WujiePluginAdapter;
  builtinPermissions?: Readonly<Record<string, readonly string[]>>;
}): ActionDriver {
  options = { ...options, builtinPermissions: frozenCopy(options.builtinPermissions ?? {}) };
  return {
    async connect(input) {
      if (input.signal.aborted) throw Error('ACTION_CANCELLED');
      if (options.runtime.restrictedPlugins.has(input.ownerPluginId)) {
        const container = document.createElement('div');
        container.hidden = true;
        container.dataset.nexusAction = input.invocationId;
        document.body.append(container);
        try {
          const session = await options.restrictedAdapter.connectAction(input, container);
          return {
            invoke: session.invoke,
            cancel: session.cancel,
            async dispose() {
              try {
                await session.dispose();
              } finally {
                container.remove();
              }
            },
          };
        } catch (error) {
          container.remove();
          throw error;
        }
      }
      const handler = options.runtime.builtinActions.get(
        uiKey(input.ownerPluginId, input.actionId),
      );
      const descriptor = options.runtime.candidates.find(
        (candidate) => candidate.descriptor.id === input.ownerPluginId,
      )?.descriptor;
      if (
        !handler ||
        !descriptor ||
        options.runtime.plugins.get(input.ownerPluginId)?.state !== 'ACTIVE'
      )
        throw Error('ACTION_OWNER_UNAVAILABLE');
      const ports = new MessageChannel();
      const session = createPluginBridgeSession({
        runtime: options.runtime,
        port: ports.port1,
        onAudit: options.onAudit,
        identity: {
          execution: { kind: 'action', actionId: input.actionId, invocationId: input.invocationId },
          pluginId: input.ownerPluginId,
          pluginVersion: descriptor.version,
          surfaceId: input.actionId,
          surfaceInstanceId: input.invocationId,
          mountPointId: input.invocationId,
          protocolVersion: 1,
          requires: descriptor.requires,
          grantedPermissions: options.builtinPermissions?.[input.ownerPluginId] ?? [],
        },
      });
      const client = createUiClient(ports.port2);
      let invoked = false,
        disposed = false;
      const dispose = async () => {
        if (!disposed) {
          disposed = true;
          input.signal.removeEventListener('abort', onAbort);
          client.dispose();
          session.dispose();
          ports.port2.close();
        }
        await session.settled();
      };
      const onAbort = () => {
        void dispose();
      };
      input.signal.addEventListener('abort', onAbort, { once: true });
      return {
        invoke() {
          if (invoked || disposed || input.signal.aborted) throw Error('ACTION_ALREADY_FINISHED');
          invoked = true;
          return handler({ ...input, capabilities: client });
        },
        dispose,
      };
    },
  };
}
