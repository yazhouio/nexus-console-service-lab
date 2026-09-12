import v1 from '@nexus/example-restricted-plugin/manifest.json' with { type: 'json' };
import v2 from '@nexus/example-restricted-plugin/manifest-v2.json' with { type: 'json' };
import type { RestrictedPluginManifest } from '@nexus/plugin-runtime';
export const kubeeyeManifest = v1 as unknown as RestrictedPluginManifest;
export const kubeeyeManifestV2 = v2 as unknown as RestrictedPluginManifest;
