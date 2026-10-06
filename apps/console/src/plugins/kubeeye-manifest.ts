import v1 from '@feforgejs/example-restricted-plugin/manifest.json' with { type: 'json' };
import v2 from '@feforgejs/example-restricted-plugin/manifest-v2.json' with { type: 'json' };
import type { RestrictedPluginManifest } from '@feforgejs/plugin-runtime';
export const kubeeyeManifest = v1 as unknown as RestrictedPluginManifest;
export const kubeeyeManifestV2 = v2 as unknown as RestrictedPluginManifest;
