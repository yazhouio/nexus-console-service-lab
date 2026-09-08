import { CONSOLE_EXTENSION_POINTS, CONSOLE_EXTENSION_POINT_CATALOG, CONSOLE_PROFILES, PLUGIN_REF_CONTRACT } from '../../packages/console-core-api/src/index.ts';
import { CLUSTER_EXTENSION_POINTS, CLUSTER_EXTENSION_POINT_CATALOG, RESOURCE_REF_CONTRACT } from '../../packages/cluster-api/src/index.ts';
import { consoleCoreDescriptor, consoleCoreRoutes, consoleCoreNavigation, consoleCoreExtensions } from '../../packages/console-core/src/plugin-data.ts';
import { clusterDescriptor, clusterRoutes, clusterNavigation, clusterExtensions } from '../../apps/console/src/plugins/cluster-data.ts';
import { extensionDemoDescriptor, extensionDemoRoutes, extensionDemoNavigation, extensionDemoExtensions } from '../../apps/console/src/plugins/extension-demo-data.ts';
import { kubeeyeManifest, kubeeyeManifestV2 } from '../../apps/console/src/plugins/kubeeye-manifest.ts';
import type { RestrictedPluginManifest } from '../../packages/plugin-runtime/src/manifest.ts';
import type { Source } from './generate.ts';

export const contracts = { profiles: CONSOLE_PROFILES, refContracts: [PLUGIN_REF_CONTRACT, RESOURCE_REF_CONTRACT] };

// Complete describes these four declaration groups only, excluding executable surfaces/handlers.
// Each fixed registerRoute/registerNavigation/registerExtension call consumes the shared data.
const complete = { points: 'complete', routes: 'complete', navigation: 'complete', extensions: 'complete' } as const;
export const sources: readonly Source[] = [
  { descriptor: consoleCoreDescriptor, points: CONSOLE_EXTENSION_POINTS, catalog: CONSOLE_EXTENSION_POINT_CATALOG,
    contributions: { routes: Object.values(consoleCoreRoutes), navigation: Object.values(consoleCoreNavigation), extensions: Object.values(consoleCoreExtensions) },
    coverage: complete, evidence: 'packages/console-core/src/plugin.ts → plugin-data.ts; Point 注册遍历 CONSOLE_EXTENSION_POINTS。',
    origin: 'packages/console-core/src/plugin-data.ts; packages/console-core-api/src/index.ts' },
  { descriptor: clusterDescriptor, points: CLUSTER_EXTENSION_POINTS, catalog: CLUSTER_EXTENSION_POINT_CATALOG,
    contributions: { routes: Object.values(clusterRoutes), navigation: Object.values(clusterNavigation), extensions: Object.values(clusterExtensions) },
    coverage: complete, evidence: 'apps/console/src/plugins/cluster.tsx → cluster-data.ts; Point 注册遍历 CLUSTER_EXTENSION_POINTS。',
    origin: 'apps/console/src/plugins/cluster-data.ts; packages/cluster-api/src/index.ts' },
  { descriptor: extensionDemoDescriptor, points: [],
    contributions: { routes: Object.values(extensionDemoRoutes), navigation: Object.values(extensionDemoNavigation), extensions: Object.values(extensionDemoExtensions) },
    coverage: complete, evidence: 'apps/console/src/plugins/extension-demo.tsx → extension-demo-data.ts; 无 Point 注册。',
    origin: 'apps/console/src/plugins/extension-demo-data.ts' },
  ...[kubeeyeManifest, kubeeyeManifestV2].map((manifest: RestrictedPluginManifest) => ({
    descriptor: manifest, manifest, points: manifest.extensionPoints ?? [], contributions: manifest.contributions,
    coverage: complete, evidence: '原 Restricted Manifest 的完整 extensionPoints/contributions；由原安装校验路径检查形状。',
    origin: 'apps/console/src/plugins/kubeeye-manifest.ts',
  })),
];
