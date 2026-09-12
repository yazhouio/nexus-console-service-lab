# @nexus/plugin-build

Build-only CSS artifact tooling shared by Console and independent Builtins. Requires Rsbuild 2.2.2; never import this package into browser application code.

- `@nexus/plugin-build/artifact-css-loader`: Rspack loader for `*.css?artifact`; options `{ namespace, allowFixed? }`. Exports a class map and absolute `css` URL array, emits CSS and referenced local assets.
- `@nexus/plugin-build/reject-unmanaged-css`: rejects ordinary plugin CSS imports.
- `@nexus/plugin-build/closure`: `ArtifactCssClosure(entry)` validates that the release entry directly includes all compiled CSS artifacts, including lazy component CSS.
- `@nexus/plugin-build/check-css`: `checkCss(css, namespace, options?)` validates CSS ownership.

Exclude `?artifact` from the default CSS rule, apply the artifact loader as `javascript/auto`, and point the closure check at the Distribution or Remote expose entry. Use an absolute immutable Remote assetPrefix. The emitted inventory is only a publication check; browser Runtime consumes the exported URL arrays.

See `apps/example-builtin-plugin/rsbuild.config.ts` in the source repository for the complete Remote wiring. This package does not load or manage CSS in the browser.
