# Independently built extension-demo

This is the **plugin implementation** layer: a trusted plugin consuming the Console and Cluster reference contracts. Independent build/deployment does not make it a Restricted installation; the Distribution explicitly selects it as trusted code. For a different business system, replace those API dependencies and contribution targets with its published contracts. See [the three layers](../docs/docs/framework-overview.md) and [example map](../docs/docs/example-plugins.md).

Source of the extension-demo Builtin. Exposes `./plugin` (`plugin` and `css`) through Rspack Federation. This project has its own tsconfig and uses only public package exports.

Build public packages first (`pnpm build:public`), then:

```sh
NEXUS_REMOTE_BASE=https://cdn.example.com/plugins/extension-demo/1.0.0/ pnpm --filter @feforgejs/example-builtin-plugin build
```

Publish all of `dist/` to the configured immutable directory. Select its ID/version, actual container name (`nexus_extension_demo_1_0_0` for 1.0.0), and entry URL in Console's `NEXUS_BUILTIN_PINS` build input. Update both the package version and plugin descriptor when publishing a new version; use a new directory.

For an independent repository, install released SDK/API/build-tool packages (or their tarballs) instead of workspace/catalog references. `pnpm test:externalization` exercises this layout automatically. See the maintainer Externalization guide for Host assembly and deployment.
