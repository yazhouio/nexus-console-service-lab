import { UI_OVERLAY_CAPABILITY, type PluginDefinition, type UiOverlayCapability } from '@nexus/plugin-runtime';
let service: UiOverlayCapability | undefined;
export function bindUiOverlay(value: UiOverlayCapability) { service = value; }
export const uiOverlayPlugin: PluginDefinition = {
  id: 'host-ui-overlay', version: '1.0.0', requires: [], provides: [UI_OVERLAY_CAPABILITY],
  activate(context) { context.capabilities.register<UiOverlayCapability>(UI_OVERLAY_CAPABILITY, {
    invoke(action, payload, invocation) { if (!service) throw Error('UI Host not ready.'); return service.invoke(action, payload, invocation); },
    observe(payload, invocation, emit) { if (!service) throw Error('UI Host not ready.'); return service.observe(payload, invocation, emit); },
  }); },
};
