import { realpathSync } from 'node:fs';
import { rspack } from '@rsbuild/core';

/** Validate the same build graph that supplies Distribution's CSS URL arrays. */
export class ArtifactCssClosure {
  constructor(distribution) { this.distribution = realpathSync(distribution); }
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('ArtifactCssClosure', compilation => {
      compilation.hooks.finishModules.tap('ArtifactCssClosure', modules => {
        for (const module of modules) {
          if (!module.identifier().includes('.css?artifact')) continue;
          const declared = compilation.moduleGraph.getIncomingConnections(module).some(connection => connection.originModule?.nameForCondition() === this.distribution);
          if (!declared) compilation.errors.push(new Error(`CSS artifact is missing from Distribution's complete closure: ${module.nameForCondition()}`));
        }
      });
      compilation.hooks.processAssets.tap({ name: 'ArtifactCssClosure', stage: rspack.Compilation.PROCESS_ASSETS_STAGE_REPORT }, assets => {
        for (const [name, source] of Object.entries(assets)) if (name.endsWith('.html') && source.source().toString().includes('/plugin-css/')) {
          compilation.errors.push(new Error(`Plugin CSS must not be injected into Host HTML: ${name}`));
        }
        // Publication inventory only. Runtime consumes generated imports, never this file.
        const css = Object.keys(assets).filter(name => name.startsWith('static/plugin-css/') && name.endsWith('.css')).sort();
        compilation.emitAsset('builtin-css-inventory.json', new rspack.sources.RawSource(JSON.stringify({ css }, null, 2)));
      });
    });
  }
}
