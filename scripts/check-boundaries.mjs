import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

const root = resolve(import.meta.dirname, '..');
function role(file) {
  if (file.startsWith('packages/design-tokens/')) return 'tokens';
  if (file.startsWith('packages/plugin-runtime/')) return 'runtime';
  if (file.startsWith('packages/browser-host/')) return 'host';
  if (file.startsWith('packages/console-core/')) return 'core';
  if (/^packages\/[^/]+-api\//.test(file)) return 'api';
  if (file.startsWith('apps/console/src/plugins/') || /^apps\/(?:example-restricted-plugin|ui-composition-fixtures)\//.test(file)) return 'feature';
  if (file.startsWith('apps/console/')) return 'distribution';
  return undefined;
}
const packageRoots = {
  '@nexus/design-tokens': 'packages/design-tokens', '@nexus/plugin-runtime': 'packages/plugin-runtime', '@nexus/browser-host': 'packages/browser-host',
  '@nexus/console-core': 'packages/console-core', '@nexus/console-core-api': 'packages/console-core-api', '@nexus/cluster-api': 'packages/cluster-api',
};
export function checkImport(file, specifier, typeOnly = false) {
  const sourceRole = role(file);
  if (!sourceRole) return;
  const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  const targetFile = specifier.startsWith('.') ? relative(root, resolve(root, dirname(file), specifier)) : packageRoots[packageName] ? `${packageRoots[packageName]}/${specifier.slice(packageName.length + 1)}` : undefined;
  const targetRole = targetFile ? role(targetFile) : undefined;
  const samePackage = targetFile && file.split('/').slice(0, 2).join('/') === targetFile.split('/').slice(0, 2).join('/');
  if (samePackage && !specifier.startsWith('@')) {
    if (sourceRole === 'feature' && targetRole !== 'feature') return 'Feature cannot import Distribution internals';
    return;
  }
  if (sourceRole === 'distribution') {
    if (specifier.startsWith('@nexus/browser-host/') && specifier !== '@nexus/browser-host/testing') return 'Distribution may use only public Host exports';
    return;
  }
  if (targetFile && !specifier.startsWith('@nexus/')) return 'Cross-package relative imports bypass public exports';
  if (specifier.startsWith('@nexus/plugin-runtime/') && !['@nexus/plugin-runtime/react', '@nexus/plugin-runtime/client', ...(sourceRole === 'host' ? ['@nexus/plugin-runtime/browser'] : [])].includes(specifier)) return 'Runtime private/browser entry is unavailable to this layer';
  if (sourceRole === 'runtime' && targetRole && targetRole !== 'runtime') return 'Runtime cannot depend on Host or business packages';
  if (sourceRole === 'host' && targetRole && !['runtime', 'host'].includes(targetRole)) return 'Host cannot depend on business implementations or APIs';
  if (sourceRole === 'core' && targetRole && !['core', 'runtime', 'tokens'].includes(targetRole) && packageName !== '@nexus/console-core-api') return 'Core can depend only on its API and public Runtime contracts';
  if (sourceRole === 'feature' && targetRole && !['runtime', 'api', 'tokens'].includes(targetRole)) return 'Feature cannot depend on Core implementations or Host';
  if (sourceRole === 'api' && (!typeOnly || targetRole && !['runtime', 'api'].includes(targetRole))) return 'API packages import external contracts as types only';
  if (specifier.startsWith('@nexus/') && !targetRole) return 'Unknown workspace dependency must declare its architecture boundary';
}

export function checkSource(file, source) {
  const scanner = createScanner(true, undefined, source), tokens = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) tokens.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue(), start: scanner.getTokenStart() });
  const errors = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], prev = tokens[i - 1];
    if (token.kind !== SyntaxKind.StringLiteral && token.kind !== SyntaxKind.NoSubstitutionTemplateLiteral) continue;
    const call = prev?.text === '(' && ['import', 'require'].includes(tokens[i - 2]?.text);
    if (!call && !['from', 'import'].includes(prev?.text)) continue;
    let begin = i - 1;
    while (begin > 0 && !['import', 'export', ';'].includes(tokens[begin].text)) begin--;
    const typeOnly = !call && tokens[begin + 1]?.text === 'type';
    const message = checkImport(file, token.value, typeOnly);
    if (message) errors.push(`${file}:${source.slice(0, token.start).split('\n').length}: ${message}: ${token.value}`);
  }
  return errors;
}
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', 'dist-validation', '.git'].includes(entry.name)) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
export async function checkWorkspace() {
  const errors = [];
  for (const folder of ['packages', 'apps']) for (const path of await files(resolve(root, folder))) {
    const file = relative(root, path);
    if (!role(file)) continue;
    if (file.includes('/src/') && /\.[cm]?[jt]sx?$/.test(file)) errors.push(...checkSource(file, await readFile(path, 'utf8')));
    if (path.endsWith('/package.json') && !file.includes('/src/')) {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
        const message = checkImport(file, dependency, true);
        if (message) errors.push(`${file}: ${message}: ${dependency}`);
      }
    }
  }
  return errors;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = await checkWorkspace();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Workspace dependency boundaries passed.');
}
