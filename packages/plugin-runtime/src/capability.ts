import type { CapabilityId, PluginId } from './identifiers';
import type {
  PluginCapabilityContext,
  PluginDescriptor,
} from './plugin';
import { PluginRuntimeContractError } from './runtime-state';

export interface CapabilityMetadata {
  readonly id: CapabilityId;
  readonly providerPluginId: PluginId;
}

export interface CapabilityRegistry {
  get<T>(id: CapabilityId): T | undefined;
  require<T>(id: CapabilityId): T;
  list(): readonly CapabilityMetadata[];
}

interface CapabilityRecord extends CapabilityMetadata {
  readonly value: unknown;
}

export interface CapabilityActivation {
  readonly context: PluginCapabilityContext;
  validate(): void;
  apply(): void;
  commit(): void;
  discard(): void;
}

export interface CapabilityRegistryController {
  readonly registry: CapabilityRegistry;
  beginActivation(
    ownerPluginId: PluginId,
    descriptor: PluginDescriptor,
  ): CapabilityActivation;
}

export function createCapabilityRegistry(): CapabilityRegistryController {
  const records = new Map<CapabilityId, CapabilityRecord>();

  const registry: CapabilityRegistry = Object.freeze({
    get<T>(id: CapabilityId): T | undefined {
      return records.get(id)?.value as T | undefined;
    },

    require<T>(id: CapabilityId): T {
      const record = records.get(id);
      if (record === undefined) {
        throw new PluginRuntimeContractError({
          code: 'CAPABILITY_UNAVAILABLE',
          stage: 'assertion',
          message: `Capability ${id} is unavailable.`,
          capability: id,
        });
      }
      return record.value as T;
    },

    list(): readonly CapabilityMetadata[] {
      return Object.freeze(
        [...records.values()]
          .map(record =>
            Object.freeze({
              id: record.id,
              providerPluginId: record.providerPluginId,
            }),
          )
          .sort((left, right) => left.id.localeCompare(right.id)),
      );
    },
  });

  return {
    registry,

    beginActivation(
      ownerPluginId: PluginId,
      descriptor: PluginDescriptor,
    ): CapabilityActivation {
      const staged = new Map<CapabilityId, CapabilityRecord>();
      let active = true;
      let validated = false;

      const assertActive = (): void => {
        if (!active) {
          throw new PluginRuntimeContractError({
            code: 'ACTIVATION_SCOPE_INACTIVE',
            stage: 'assertion',
            message: `Activation scope for ${ownerPluginId} is inactive.`,
            pluginId: ownerPluginId,
          });
        }
      };

      const context: PluginCapabilityContext = Object.freeze({
        register<T>(id: CapabilityId, value: T): void {
          assertActive();
          if (!descriptor.provides.includes(id)) {
            throw new PluginRuntimeContractError({
              code: 'UNDECLARED_CAPABILITY_PROVIDE',
              stage: 'assertion',
              message: `Plugin ${ownerPluginId} did not declare provide ${id}.`,
              pluginId: ownerPluginId,
              capability: id,
            });
          }
          if (staged.has(id) || records.has(id)) {
            throw new PluginRuntimeContractError({
              code: 'DUPLICATE_CAPABILITY_PROVIDER',
              stage: 'assertion',
              message: `Capability ${id} already has a provider.`,
              pluginId: ownerPluginId,
              capability: id,
            });
          }
          staged.set(id, {
            id,
            providerPluginId: ownerPluginId,
            value,
          });
          validated = false;
        },

        require<T>(id: CapabilityId): T {
          assertActive();
          if (!descriptor.requires.includes(id)) {
            throw new PluginRuntimeContractError({
              code: 'UNDECLARED_CAPABILITY_REQUIRE',
              stage: 'assertion',
              message: `Plugin ${ownerPluginId} did not declare require ${id}.`,
              pluginId: ownerPluginId,
              capability: id,
            });
          }
          return registry.require<T>(id);
        },
      });

      const validate = (): void => {
        assertActive();

        for (const capability of descriptor.provides) {
          if (!staged.has(capability)) {
            throw new PluginRuntimeContractError({
              code: 'DECLARED_CAPABILITY_MISSING',
              stage: 'assertion',
              message: `Plugin ${ownerPluginId} did not register declared capability ${capability}.`,
              pluginId: ownerPluginId,
              capability,
            });
          }
        }

        for (const capability of staged.keys()) {
          if (records.has(capability)) {
            throw new PluginRuntimeContractError({
              code: 'DUPLICATE_CAPABILITY_PROVIDER',
              stage: 'assertion',
              message: `Capability ${capability} already has a provider.`,
              pluginId: ownerPluginId,
              capability,
            });
          }
        }
        validated = true;
      };

      const apply = (): void => {
        assertActive();
        if (!validated) {
          throw new PluginRuntimeContractError({
            code: 'ACTIVATION_SCOPE_NOT_VALIDATED',
            stage: 'assertion',
            message: `Activation scope for ${ownerPluginId} was not validated.`,
            pluginId: ownerPluginId,
          });
        }

        for (const [capability, record] of staged) {
          records.set(capability, Object.freeze(record));
        }
        staged.clear();
        active = false;
      };

      return {
        context,
        validate,
        apply,

        commit(): void {
          validate();
          apply();
        },

        discard(): void {
          staged.clear();
          active = false;
          validated = false;
        },
      };
    },
  };
}
