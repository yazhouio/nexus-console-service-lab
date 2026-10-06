import type { PluginRuntime } from './bootstrap.js';
import { UiError } from './ui/runtime.js';

/** Resolve the distribution's root from accepted declarations; presentation never changes Ready. */
export function resolveRootPresentation(runtime: PluginRuntime) {
  const ref = runtime.rootPresentation;
  if (!ref) throw new UiError('ROOT_PRESENTATION_MISSING');
  if (
    !runtime.resolution.coreClosure.has(ref.ownerPluginId) ||
    runtime.plugins.get(ref.ownerPluginId)?.state !== 'ACTIVE'
  ) {
    throw new UiError('ROOT_PRESENTATION_OWNER_INVALID');
  }
  const surface = runtime.contributions
    .listUiSurfaces()
    .find(
      (entry) =>
        entry.ownerPluginId === ref.ownerPluginId && entry.contribution.id === ref.surfaceId,
    );
  if (!surface) throw new UiError('ROOT_PRESENTATION_SURFACE_MISSING');
  return surface;
}
