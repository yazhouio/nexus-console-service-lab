import type { PluginId } from './identifiers';
import type { ContributionRegistry, SandboxSurfaceDefinition } from './contribution';
import { uiKey } from './ui/definitions';

export interface SurfaceDefinitionRecord {
  readonly pluginId: PluginId;
  readonly pluginVersion: string;
  readonly definition: SandboxSurfaceDefinition;
}

export interface SurfaceDefinitionRegistry {
  get(
    pluginId: PluginId,
    surfaceId: string,
  ): SurfaceDefinitionRecord | undefined;
  list(pluginId?: PluginId): readonly SurfaceDefinitionRecord[];
}

export function projectSurfaceDefinitions(registry: ContributionRegistry, versionOf: (owner: PluginId) => string | undefined): SurfaceDefinitionRegistry {
  // Built only after declaration admission. This is a derived index, not a second
  // writable registry or activation transaction.
  const records: readonly SurfaceDefinitionRecord[] = Object.freeze(registry.listUiSurfaces().flatMap(({ ownerPluginId, contribution }) => {
    const version = versionOf(ownerPluginId);
    if (version === undefined || contribution.target.kind !== 'sandbox-surface') return [];
    return [Object.freeze({ pluginId: ownerPluginId, pluginVersion: version, definition: Object.freeze({ id: contribution.id }) })];
  }));
  const byId = new Map(records.map(record => [uiKey(record.pluginId, record.definition.id), record]));
  return Object.freeze({
    list: (owner?: PluginId) => owner === undefined ? records : Object.freeze(records.filter(record => record.pluginId === owner)),
    get: (owner: PluginId, id: string) => byId.get(uiKey(owner, id)),
  });
}
