const postcss = require('postcss');
const { bundleAsync } = require('lightningcss');
const { readFile } = require('node:fs/promises');
const { dirname, resolve, extname } = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL, fileURLToPath } = require('node:url');
const digest = (value) => createHash('sha256').update(value).digest('hex').slice(0, 20);

module.exports = function () {
  const done = this.async();
  const options = this.getOptions();
  (async () => {
    const { checkCss } = await import('./check-plugin-css.mjs');
    const modules = this.resourcePath.endsWith('.module.css');
    const result = await bundleAsync({
      filename: this.resourcePath,
      minify: true,
      analyzeDependencies: true,
      cssModules: modules
        ? {
            pattern: `${options.namespace}-${digest(await readFile(this.resourcePath))}-[hash]-[local]`,
          }
        : false,
      resolver: {
        read: async (file) => {
          this.addDependency(file);
          const source = await readFile(file, 'utf8');
          postcss.parse(source, { from: file });
          return source;
        },
        resolve: (specifier, from) => {
          if (/^(?:[a-z]+:|\/\/)/i.test(specifier))
            throw Error('Remote CSS @import is not an artifact closure');
          return resolve(dirname(from), specifier);
        },
      },
    });
    let css = Buffer.from(result.code).toString();
    for (const dependency of result.dependencies ?? []) {
      if (dependency.type === 'import') throw Error(`Unbundled CSS import: ${dependency.url}`);
      if (dependency.type !== 'url') continue;
      const url = dependency.url;
      let replacement = url;
      if (!/^(?:[a-z]+:|\/\/|\/|#)/i.test(url)) {
        const source = new URL(url, pathToFileURL(dependency.loc.filePath));
        const bytes = await readFile(fileURLToPath(source));
        this.addDependency(fileURLToPath(source));
        const name = `static/plugin-assets/${digest(bytes)}${extname(source.pathname)}`;
        this.emitFile(name, bytes);
        replacement = `../plugin-assets/${name.split('/').pop()}${source.search}${source.hash}`;
      }
      css = css.replaceAll(dependency.placeholder, replacement);
    }
    checkCss(css, options.namespace, { allowFixed: options.allowFixed });
    const name = `static/plugin-css/${options.namespace}.${digest(css)}.css`;
    this.emitFile(name, css);
    const classes = Object.fromEntries(
      Object.entries(result.exports ?? {}).map(([key, value]) => {
        const composed = value.composes.map((item) => {
          if (item.type === 'dependency') throw Error('Unresolved CSS Modules composition');
          if (item.type === 'global' && !item.name.startsWith(options.namespace + '-'))
            throw Error('CSS Modules cannot compose foreign global classes');
          return item.name;
        });
        return [key, [value.name, ...composed].join(' ')];
      }),
    );
    return `export const css = Object.freeze([new URL(__webpack_public_path__ + ${JSON.stringify(name)}, window.location.origin + '/').href]);\nexport default ${JSON.stringify(classes)};`;
  })().then((value) => done(null, value), done);
};
