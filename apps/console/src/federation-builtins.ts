import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as jsxDev from 'react/jsx-dev-runtime';
import * as sdk from '@feforgejs/plugin-runtime/react';
import { createInstance } from '@module-federation/enhanced/runtime';
import type { BuiltinPreparationFailure, PreparedBuiltins } from '@feforgejs/browser-host';
import type { PluginDefinition } from '@feforgejs/plugin-runtime';

export interface BuiltinPin {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly entry: string;
}
declare const NEXUS_SHARED_VERSIONS: { react: string; sdk: string };

/** Concrete Distribution wiring. One instance per selection, reused across Host effect replays. */
export function federationBuiltins(
  pins: readonly BuiltinPin[],
  timeoutMs = 15_000,
): () => Promise<PreparedBuiltins> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid Builtin load timeout');
  const selected = pins.map((pin) => Object.freeze({ ...pin }));
  if (
    new Set(selected.map((pin) => pin.id)).size !== selected.length ||
    new Set(selected.map((pin) => pin.name)).size !== selected.length
  )
    throw Error('Duplicate remote Builtin selection');
  for (const pin of selected)
    if (!/^https?:$/.test(new URL(pin.entry).protocol))
      throw Error('Remote entry must be an absolute HTTP URL');
  const shared = (version: string, value: object) => ({
    version,
    lib: () => value,
    shareConfig: { singleton: true, requiredVersion: version },
  });
  let instance: ReturnType<typeof createInstance> | undefined;
  return async () => {
    instance ??= createInstance({
      name: 'nexus_console',
      shareStrategy: 'loaded-first',
      remotes: selected.map((pin) => ({ name: pin.name, entry: pin.entry })),
      shared: {
        react: shared(NEXUS_SHARED_VERSIONS.react, React),
        'react/jsx-runtime': shared(NEXUS_SHARED_VERSIONS.react, jsx),
        'react/jsx-dev-runtime': shared(NEXUS_SHARED_VERSIONS.react, jsxDev),
        '@feforgejs/plugin-runtime/react': shared(NEXUS_SHARED_VERSIONS.sdk, sdk),
      },
    });
    const results = await Promise.all(
      selected.map(async (pin) => {
        let stage: BuiltinPreparationFailure['stage'] = 'load';
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const value = await Promise.race([
            instance!.loadRemote<{ plugin: PluginDefinition; css: readonly string[] }>(
              `${pin.name}/plugin`,
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                stage = 'timeout';
                reject(Error(`Builtin load exceeded ${timeoutMs} ms`));
              }, timeoutMs);
            }),
          ]);
          stage = 'exports';
          if (
            !value ||
            !value.plugin ||
            typeof value.plugin.activate !== 'function' ||
            !Array.isArray(value.plugin.requires) ||
            !Array.isArray(value.plugin.provides) ||
            !Array.isArray(value.css) ||
            !value.css.every(
              (url) => typeof url === 'string' && /^https?:$/.test(new URL(url).protocol),
            )
          )
            throw Error('Expected plugin definition and explicit absolute CSS URL array');
          stage = 'identity';
          if (value.plugin.id !== pin.id || value.plugin.version !== pin.version)
            throw Error(
              `Expected ${pin.id}@${pin.version}, received ${value.plugin.id}@${value.plugin.version}`,
            );
          return { plugin: value.plugin, css: Object.freeze([...value.css]) };
        } catch (error) {
          return {
            failure: Object.freeze({
              id: pin.id,
              version: pin.version,
              entry: pin.entry,
              stage,
              reason: String(error),
            }),
          };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    return Object.freeze({
      builtins: Object.freeze(results.flatMap((result) => (result.plugin ? [result.plugin] : []))),
      builtinCss: Object.freeze(
        Object.fromEntries(
          results.flatMap((result) => (result.plugin ? [[result.plugin.id, result.css]] : [])),
        ),
      ),
      failures: Object.freeze(
        results.flatMap((result) => (result.failure ? [result.failure] : [])),
      ),
    });
  };
}
