import { frozenCopy } from './immutable';
import type { PluginId } from './identifiers';
import { PluginRuntimeContractError } from './runtime-state';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface BuiltinRenderTarget {
  readonly kind: 'builtin';
  readonly render: unknown;
  /** Host-realm component that renders its nested outlet. */
  readonly routeLayout?: boolean;
}

export interface SandboxSurfaceDefinition {
  readonly id: string;
}

export interface SandboxRenderTarget {
  readonly kind: 'sandbox-surface';
  readonly surfaceId: string;
  readonly layout?: JsonValue;
  readonly initialParameters?: JsonValue;
}

export type HostRenderTarget = BuiltinRenderTarget | SandboxRenderTarget;

export interface RouteContext {
  readonly routeId: string;
  readonly pathname: string;
  readonly params: Readonly<Record<string, string>>;
  readonly search: string;
}

export interface RouteMetadata {
  readonly parentRouteId?: string;
  readonly acceptsChildren?: boolean;
}

export interface RouteContribution extends RouteMetadata {
  readonly id: string;
  readonly path: string;
  readonly target: HostRenderTarget;
}

export interface RestrictedRouteContribution extends RouteMetadata {
  readonly id: string;
  readonly path: string;
  readonly surfaceId: string;
  readonly layout?: JsonValue;
  readonly initialParameters?: JsonValue;
}

export interface NavigationContribution {
  readonly acceptsChildren?: boolean;
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly routeId?: string;
  readonly order?: number;
}

export interface UiExtensionContribution {
  readonly id: string;
  readonly slot: string;
  readonly order?: number;
  readonly target: HostRenderTarget;
}

export interface RestrictedUiExtensionContribution {
  readonly id: string;
  readonly slot: string;
  readonly surfaceId: string;
  readonly order?: number;
  readonly layout?: JsonValue;
  readonly initialParameters?: JsonValue;
}

export interface RestrictedContributions {
  readonly routes?: readonly RestrictedRouteContribution[];
  readonly navigation?: readonly NavigationContribution[];
  readonly extensions?: readonly RestrictedUiExtensionContribution[];
}

export interface OwnedContribution<T> {
  readonly ownerPluginId: PluginId;
  readonly contribution: T;
}

export interface ContributionRegistry {
  listExtensionSlots(): readonly string[];
  listRoutes(): readonly OwnedContribution<RouteContribution>[];
  listNavigation(): readonly OwnedContribution<NavigationContribution>[];
  listExtensions(
    slot: string,
  ): readonly OwnedContribution<UiExtensionContribution>[];
}

export interface PluginContributionContext {
  registerRoute(contribution: RouteContribution): void;
  registerNavigation(contribution: NavigationContribution): void;
  registerExtension(contribution: UiExtensionContribution): void;
}

export interface ContributionActivation {
  readonly context: PluginContributionContext;
  validate(): void;
  apply(): void;
  commit(): void;
  discard(): void;
}

export interface ContributionReferenceCatalog {
  readonly routeIds: ReadonlySet<string>;
  readonly navigationIds: ReadonlySet<string>;
}

export interface ContributionRegistryController {
  readonly registry: ContributionRegistry;
  beginActivation(
    ownerPluginId: PluginId,
    references?: ContributionReferenceCatalog,
  ): ContributionActivation;
}

export const DEFAULT_CONTRIBUTION_ORDER = 1_000;

export function isJsonValue(
  value: unknown,
  ancestors = new Set<unknown>(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return false;
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return value.every(entry => isJsonValue(entry, nextAncestors));
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  return Object.values(value).every(entry =>
    isJsonValue(entry, nextAncestors),
  );
}

function invalidContribution(
  ownerPluginId: PluginId,
  message: string,
): never {
  throw new PluginRuntimeContractError({
    code: 'INVALID_CONTRIBUTION',
    stage: 'assertion',
    message,
    pluginId: ownerPluginId,
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRenderTarget(
  ownerPluginId: PluginId,
  target: HostRenderTarget,
): void {
  if (target.kind === 'builtin') {
    if (target.render === undefined) {
      invalidContribution(
        ownerPluginId,
        `Builtin render target from ${ownerPluginId} must provide render.`,
      );
    }
    return;
  }

  if (
    target.kind !== 'sandbox-surface' ||
    !isNonEmptyString(target.surfaceId) ||
    (target.layout !== undefined && !isJsonValue(target.layout)) ||
    (target.initialParameters !== undefined &&
      !isJsonValue(target.initialParameters))
  ) {
    invalidContribution(
      ownerPluginId,
      `Plugin ${ownerPluginId} registered an invalid sandbox render target.`,
    );
  }
}

function stableOwned<T extends { readonly id: string }>(
  values: Iterable<OwnedContribution<T>>,
): readonly OwnedContribution<T>[] {
  return Object.freeze(
    [...values].sort(
      (left, right) =>
        left.ownerPluginId.localeCompare(right.ownerPluginId) ||
        left.contribution.id.localeCompare(right.contribution.id),
    ),
  );
}

function visualOwned<
  T extends { readonly id: string; readonly order?: number },
>(values: Iterable<OwnedContribution<T>>): readonly OwnedContribution<T>[] {
  return Object.freeze(
    [...values].sort(
      (left, right) =>
        (left.contribution.order ?? DEFAULT_CONTRIBUTION_ORDER) -
          (right.contribution.order ?? DEFAULT_CONTRIBUTION_ORDER) ||
        left.ownerPluginId.localeCompare(right.ownerPluginId) ||
        left.contribution.id.localeCompare(right.contribution.id),
    ),
  );
}

function owned<T>(
  ownerPluginId: PluginId,
  contribution: T,
): OwnedContribution<T> {
  return Object.freeze({
    ownerPluginId,
    contribution: frozenCopy(contribution),
  });
}

export function createContributionRegistry(): ContributionRegistryController {
  const routes = new Map<string, OwnedContribution<RouteContribution>>();
  const navigation = new Map<
    string,
    OwnedContribution<NavigationContribution>
  >();
  const extensions = new Map<
    string,
    Map<string, OwnedContribution<UiExtensionContribution>>
  >();

  const registry: ContributionRegistry = Object.freeze({
    listExtensionSlots: () => Object.freeze([...extensions.keys()].sort()),
    listRoutes: () => stableOwned(routes.values()),
    listNavigation: () => visualOwned(navigation.values()),
    listExtensions: (slot: string) =>
      visualOwned(extensions.get(slot)?.values() ?? []),
  });

  return {
    registry,

    beginActivation(
      ownerPluginId: PluginId,
      references?: ContributionReferenceCatalog,
    ): ContributionActivation {
      const stagedRoutes: RouteContribution[] = [];
      const stagedNavigation: NavigationContribution[] = [];
      const stagedExtensions: UiExtensionContribution[] = [];
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

      const context: PluginContributionContext = Object.freeze({
        registerRoute(contribution: RouteContribution) {
          assertActive();
          stagedRoutes.push(contribution);
          validated = false;
        },
        registerNavigation(contribution: NavigationContribution) {
          assertActive();
          stagedNavigation.push(contribution);
          validated = false;
        },
        registerExtension(contribution: UiExtensionContribution) {
          assertActive();
          stagedExtensions.push(contribution);
          validated = false;
        },
      });

      const validate = (): void => {
        assertActive();

        const routeIds = new Set(routes.keys());
        for (const route of stagedRoutes) {
          if (
            !isNonEmptyString(route.id) ||
            !isNonEmptyString(route.path) ||
            routeIds.has(route.id) ||
            (route.parentRouteId !== undefined && !isNonEmptyString(route.parentRouteId)) ||
            (route.acceptsChildren !== undefined && typeof route.acceptsChildren !== 'boolean')
          ) {
            invalidContribution(
              ownerPluginId,
              `Route ${route.id} from ${ownerPluginId} is invalid or duplicated.`,
            );
          }
          validateRenderTarget(ownerPluginId, route.target);
          routeIds.add(route.id);
        }

        const navigationIds = new Set(navigation.keys());
        for (const item of stagedNavigation) {
          if (
            !isNonEmptyString(item.id) ||
            !isNonEmptyString(item.label) ||
            navigationIds.has(item.id) ||
            (item.acceptsChildren !== undefined && typeof item.acceptsChildren !== 'boolean') ||
            (item.order !== undefined && !Number.isFinite(item.order))
          ) {
            invalidContribution(
              ownerPluginId,
              `Navigation ${item.id} from ${ownerPluginId} is invalid or duplicated.`,
            );
          }
          navigationIds.add(item.id);
        }

        const routeReferenceIds = new Set([
          ...routeIds,
          ...(references?.routeIds ?? []),
        ]);
        const navigationReferenceIds = new Set([
          ...navigationIds,
          ...(references?.navigationIds ?? []),
        ]);
        for (const item of stagedNavigation) {
          if (
            item.routeId !== undefined &&
            !routeReferenceIds.has(item.routeId)
          ) {
            invalidContribution(
              ownerPluginId,
              `Navigation ${item.id} references unknown route ${item.routeId}.`,
            );
          }
          if (
            item.parentId !== undefined &&
            !navigationReferenceIds.has(item.parentId)
          ) {
            invalidContribution(
              ownerPluginId,
              `Navigation ${item.id} references unknown parent ${item.parentId}.`,
            );
          }
        }

        const extensionIdsBySlot = new Map<string, Set<string>>();
        for (const [slot, records] of extensions) {
          extensionIdsBySlot.set(slot, new Set(records.keys()));
        }
        for (const extension of stagedExtensions) {
          const ids = extensionIdsBySlot.get(extension.slot) ?? new Set<string>();
          if (
            !isNonEmptyString(extension.id) ||
            !isNonEmptyString(extension.slot) ||
            ids.has(extension.id) ||
            (extension.order !== undefined && !Number.isFinite(extension.order))
          ) {
            invalidContribution(
              ownerPluginId,
              `Extension ${extension.id} from ${ownerPluginId} is invalid or duplicated in slot ${extension.slot}.`,
            );
          }
          validateRenderTarget(ownerPluginId, extension.target);
          ids.add(extension.id);
          extensionIdsBySlot.set(extension.slot, ids);
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

        for (const route of stagedRoutes) {
          routes.set(route.id, owned(ownerPluginId, route));
        }
        for (const item of stagedNavigation) {
          navigation.set(item.id, owned(ownerPluginId, item));
        }
        for (const extension of stagedExtensions) {
          const records = extensions.get(extension.slot) ?? new Map();
          records.set(extension.id, owned(ownerPluginId, extension));
          extensions.set(extension.slot, records);
        }
        active = false;
      };

      return {
        context,
        validate,
        apply,
        commit() {
          validate();
          apply();
        },
        discard() {
          stagedRoutes.length = 0;
          stagedNavigation.length = 0;
          stagedExtensions.length = 0;
          active = false;
          validated = false;
        },
      };
    },
  };
}
