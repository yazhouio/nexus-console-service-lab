import type { PluginDefinition, InstalledPluginRecord } from '@nexus/plugin-runtime';
import type { PreparedBuiltins } from './distribution';

/** Distribution selections reserve identities even when their code could not be obtained. */
export function mergePreparedBuiltins(local: readonly PluginDefinition[], css: Readonly<Record<string, readonly string[]>> = {}, prepared?: PreparedBuiltins) {
  const builtins = [...local, ...prepared?.builtins ?? []];
  const reserved = new Set<string>();
  for (const selection of [...builtins, ...prepared?.failures ?? []]) {
    if (reserved.has(selection.id)) throw Error(`Duplicate Builtin selection: ${selection.id}`);
    reserved.add(selection.id);
  }
  const failures = Object.freeze((prepared?.failures ?? []).map(failure => Object.freeze({ ...failure })));
  const builtinCss = Object.freeze(Object.fromEntries(Object.entries({ ...css, ...prepared?.builtinCss }).map(([id, urls]) => [id, Object.freeze([...urls])])));
  return { builtins, builtinCss, failures, filterInstallations(records: readonly InstalledPluginRecord[]) {
    const conflicts = Object.freeze(records.filter(record => reserved.has(record.manifest.id)).map(record => Object.freeze({
      id: record.manifest.id, version: record.manifest.version, reason: 'Identity reserved by a selected Builtin',
    })));
    return { installed: records.filter(record => !reserved.has(record.manifest.id)), conflicts };
  } };
}
