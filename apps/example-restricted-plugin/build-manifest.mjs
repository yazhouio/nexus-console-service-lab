import { writeFile } from 'node:fs/promises';
import { kubeeyeManifest, kubeeyeManifestV2 } from './manifest.ts';
for (const [file, manifest] of [['manifest.json', kubeeyeManifest], ['manifest-v2.json', kubeeyeManifestV2]]) await writeFile(new URL(file, import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
