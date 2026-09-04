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
