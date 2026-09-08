import type { BridgeCapabilityContract, BridgeInvocationContext } from '../bridge-contract';
import type { JsonValue } from '../contribution';
import { assertUiJson } from './schema';
export const UI_OVERLAY_CAPABILITY = 'nexus.ui-overlay@1' as const;
export const UI_OVERLAY_PERMISSION = 'ui.overlay';
export interface UiOverlayCapability {
  invoke(action: 'open' | 'complete' | 'cancel', payload: JsonValue, context: BridgeInvocationContext): JsonValue;
  observe(payload: JsonValue, context: BridgeInvocationContext, emit: (value: JsonValue) => void): { snapshot: JsonValue; dispose(): void };
}
const json = { parse(value: unknown): JsonValue { assertUiJson(value); return value; } };
export const uiOverlayBridgeContract: BridgeCapabilityContract = {
  id: UI_OVERLAY_CAPABILITY,
  actions: {
    ...Object.fromEntries((['open', 'complete', 'cancel'] as const).map(action => [action, {
      kind: 'request' as const, requestSchema: json, resultSchema: json, requiredPermissions: [UI_OVERLAY_PERMISSION],
      invoke(capability: unknown, payload: JsonValue, context: BridgeInvocationContext) { return (capability as UiOverlayCapability).invoke(action, payload, context); },
    }])),
    observe: { kind: 'subscription', requestSchema: json, snapshotSchema: json, eventSchema: json, requiredPermissions: [UI_OVERLAY_PERMISSION],
      open(capability, payload, context, emit) { return (capability as UiOverlayCapability).observe(payload, context, emit); } },
  },
};

export function createUiOverlayPlugin() {
  let service: UiOverlayCapability | undefined;
  const plugin: import('../plugin').PluginDefinition = {
    id: 'nexus-ui-overlay', version: '1.0.0', requires: [], provides: [UI_OVERLAY_CAPABILITY],
    activate({ capabilities }) {
      capabilities.register<UiOverlayCapability>(UI_OVERLAY_CAPABILITY, {
        invoke(action, payload, context) { if (!service) throw Error('UI_NOT_BOUND'); return service.invoke(action, payload, context); },
        observe(payload, context, emit) { if (!service) throw Error('UI_NOT_BOUND'); return service.observe(payload, context, emit); },
      });
    },
  };
  return { plugin, bind(value: UiOverlayCapability) { if (service) throw Error('UI_ALREADY_BOUND'); service = value; } };
}
