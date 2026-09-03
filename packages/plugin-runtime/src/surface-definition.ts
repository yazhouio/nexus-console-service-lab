import type { PluginId } from './identifiers';
import type { SandboxSurfaceDefinition } from './contribution';
import { PluginRuntimeContractError } from './runtime-state';

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

export interface SurfaceDefinitionActivation {
  validate(): void;
  apply(): void;
  discard(): void;
}

export interface SurfaceDefinitionRegistryController {
  readonly registry: SurfaceDefinitionRegistry;
  beginDeclaration(
    pluginId: PluginId,
    pluginVersion: string,
    definitions: readonly SandboxSurfaceDefinition[],
  ): SurfaceDefinitionActivation;
}

function key(pluginId: PluginId, surfaceId: string): string {
  return `${pluginId}\u0000${surfaceId}`;
}

export function createSurfaceDefinitionRegistry(): SurfaceDefinitionRegistryController {
  const records = new Map<string, SurfaceDefinitionRecord>();

  const registry: SurfaceDefinitionRegistry = Object.freeze({
    get(pluginId: PluginId, surfaceId: string) {
      return records.get(key(pluginId, surfaceId));
    },
    list(pluginId?: PluginId) {
      return Object.freeze(
        [...records.values()]
          .filter(record => pluginId === undefined || record.pluginId === pluginId)
          .sort(
            (left, right) =>
              left.pluginId.localeCompare(right.pluginId) ||
              left.definition.id.localeCompare(right.definition.id),
          ),
      );
    },
  });

  return {
    registry,
    beginDeclaration(pluginId, pluginVersion, definitions) {
      let active = true;
      let validated = false;

      const assertActive = (): void => {
        if (!active) {
          throw new PluginRuntimeContractError({
            code: 'ACTIVATION_SCOPE_INACTIVE',
            stage: 'assertion',
            message: `Surface declaration for ${pluginId} is inactive.`,
            pluginId,
          });
        }
      };

      return {
        validate() {
          assertActive();
          const localIds = new Set<string>();
          for (const definition of definitions) {
            if (
              typeof definition.id !== 'string' ||
              definition.id.length === 0 ||
              localIds.has(definition.id) ||
              records.has(key(pluginId, definition.id))
            ) {
              throw new PluginRuntimeContractError({
                code: 'INVALID_CONTRIBUTION',
                stage: 'assertion',
                message: `Surface ${definition.id} from ${pluginId} is invalid or duplicated.`,
                pluginId,
              });
            }
            localIds.add(definition.id);
          }
          validated = true;
        },
        apply() {
          assertActive();
          if (!validated) {
            throw new PluginRuntimeContractError({
              code: 'ACTIVATION_SCOPE_NOT_VALIDATED',
              stage: 'assertion',
              message: `Surface declaration for ${pluginId} was not validated.`,
              pluginId,
            });
          }
          for (const definition of definitions) {
            records.set(
              key(pluginId, definition.id),
              Object.freeze({
                pluginId,
                pluginVersion,
                definition: Object.freeze({ ...definition }),
              }),
            );
          }
          active = false;
        },
        discard() {
          active = false;
          validated = false;
        },
      };
    },
  };
}

