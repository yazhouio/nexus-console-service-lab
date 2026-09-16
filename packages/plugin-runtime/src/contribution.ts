import { assertPointRef, assertExtensionContribution, uiKey, type ExtensionPointRef, type ContractId, type CompiledExtensionPointDefinition, type ExtensionPointDefinition, type ActionDefinition, type ExtensionContributionDefinition, type UiSurfaceDefinition } from './ui/definitions';
import { createPointCompiler, type PointContracts } from './ui/point-compiler';
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
  readonly point?: ExtensionPointRef;
  readonly childPoint?: ExtensionPointRef;
  readonly expectedProfile?: ContractId;
  readonly expectedRefContract?: ContractId;
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
  readonly point?: ExtensionPointRef;
  readonly childPoint?: ExtensionPointRef;
  readonly expectedProfile?: ContractId;
  readonly expectedRefContract?: ContractId;
  readonly group?: string;
  readonly acceptsChildren?: boolean;
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly routeId?: string;
  readonly order?: number;
}

export type UiExtensionContribution = ExtensionContributionDefinition;
export type RestrictedUiExtensionContribution = ExtensionContributionDefinition;

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
  listActions(): readonly OwnedContribution<ActionDefinition>[];
  listExtensionPoints(): readonly OwnedContribution<CompiledExtensionPointDefinition>[];
  listUiSurfaces(): readonly OwnedContribution<UiSurfaceDefinition>[];
  listRoutes(): readonly OwnedContribution<RouteContribution>[];
  listNavigation(): readonly OwnedContribution<NavigationContribution>[];
  listExtensions(
    point?: { readonly ownerPluginId: string; readonly id: string },
  ): readonly OwnedContribution<UiExtensionContribution>[];
}

export interface PluginContributionContext {
  registerAction(definition: ActionDefinition): void;
  registerRoute(contribution: RouteContribution): void;
  registerNavigation(contribution: NavigationContribution): void;
  registerExtension(contribution: UiExtensionContribution): void;
  registerExtensionPoint(definition: ExtensionPointDefinition): void;
  registerSurface(definition: UiSurfaceDefinition): void;
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

export function createContributionRegistry(contracts: PointContracts = {}): ContributionRegistryController {
  const compilePoint = createPointCompiler(contracts);
  const routes = new Map<string, OwnedContribution<RouteContribution>>();
  const navigation = new Map<
    string,
    OwnedContribution<NavigationContribution>
  >();
  const extensions = new Map<string, OwnedContribution<UiExtensionContribution>>();
  const points = new Map<string, OwnedContribution<CompiledExtensionPointDefinition>>();
  const actions = new Map<string, OwnedContribution<ActionDefinition>>();
  const surfaces = new Map<string, OwnedContribution<UiSurfaceDefinition>>();
  const registry: ContributionRegistry = Object.freeze({
    listActions: () => stableOwned(actions.values()),
    listExtensionPoints: () => stableOwned(points.values()),
    listUiSurfaces: () => stableOwned(surfaces.values()),
    listRoutes: () => stableOwned(routes.values()),
    listNavigation: () => visualOwned(navigation.values()),
    listExtensions: (point?: { ownerPluginId: string; id: string }) => Object.freeze([...extensions.values()]
      .filter(e => !point || e.contribution.point.ownerPluginId === point.ownerPluginId && e.contribution.point.id === point.id)
      .sort((a, b) => (a.contribution.order ?? 0) - (b.contribution.order ?? 0) || (uiKey(a.ownerPluginId, a.contribution.id) < uiKey(b.ownerPluginId, b.contribution.id) ? -1 : 1))),
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
      const stagedPoints: ExtensionPointDefinition[] = [];
      const stagedActions: ActionDefinition[] = [];
      const stagedSurfaces: UiSurfaceDefinition[] = [];
      let compiledPoints: CompiledExtensionPointDefinition[] = [];
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
        registerAction(definition: ActionDefinition) { assertActive(); stagedActions.push(definition); validated = false; },
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
        registerExtensionPoint(definition: ExtensionPointDefinition) { assertActive(); stagedPoints.push(definition); validated = false; },
        registerSurface(definition: UiSurfaceDefinition) { assertActive(); stagedSurfaces.push(definition); validated = false; },
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
          assertRouteMetadata(ownerPluginId, route);
          if (routeIds.has(route.id)) invalidContribution(ownerPluginId, `Route ${route.id} from ${ownerPluginId} is invalid or duplicated.`);
          validateRenderTarget(ownerPluginId, route.target);
          routeIds.add(route.id);
        }

        const navigationIds = new Set(navigation.keys());
        for (const item of stagedNavigation) {
          assertNavigationMetadata(ownerPluginId, item);
          if (navigationIds.has(item.id)) invalidContribution(ownerPluginId, `Navigation ${item.id} from ${ownerPluginId} is invalid or duplicated.`);
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

        try {
          for (const [staged, stored] of [[stagedExtensions, extensions], [stagedPoints, points], [stagedSurfaces, surfaces], [stagedActions, actions]] as const) {
            const ids = new Set<string>();
            for (const entry of staged) {
              if (!isNonEmptyString(entry.id) || ids.has(entry.id) || stored.has(uiKey(ownerPluginId, entry.id))) throw Error('Duplicate UI definition.');
              ids.add(entry.id);
            }
          }
          stagedExtensions.forEach(assertExtensionContribution);
          stagedActions.forEach(a => { if (Object.keys(a).some(k => k !== 'id')) throw Error('Invalid Action definition.'); });
          compiledPoints = stagedPoints.map(compilePoint);
          stagedSurfaces.forEach(s => validateRenderTarget(ownerPluginId, s.target));
        } catch (error) { invalidContribution(ownerPluginId, error instanceof Error ? error.message : 'Invalid UI declaration.'); }

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
        for (const extension of stagedExtensions) extensions.set(uiKey(ownerPluginId, extension.id), owned(ownerPluginId, extension));
        for (const action of stagedActions) actions.set(uiKey(ownerPluginId, action.id), owned(ownerPluginId, action));
        for (const point of compiledPoints) points.set(uiKey(ownerPluginId, point.id), owned(ownerPluginId, point));
        for (const surface of stagedSurfaces) surfaces.set(uiKey(ownerPluginId, surface.id), owned(ownerPluginId, surface));
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

/** Shared shape checks for registration and repository documentation; no relation admission. */
export function assertRouteMetadata(ownerPluginId: string, route: Omit<RouteContribution, 'target'>): void {
  if (
    !isNonEmptyString(route.id) ||
    !isNonEmptyString(route.path) ||
    (route.parentRouteId !== undefined && !isNonEmptyString(route.parentRouteId)) ||
    (route.acceptsChildren !== undefined && typeof route.acceptsChildren !== 'boolean')
  ) {
    invalidContribution(
      ownerPluginId,
      `Route ${route.id} from ${ownerPluginId} is invalid or duplicated.`,
    );
  }
  if (route.point) assertPointRef(route.point);
  if (route.childPoint) assertPointRef(route.childPoint);
}

export function assertNavigationMetadata(ownerPluginId: string, item: NavigationContribution): void {
  if (
    !isNonEmptyString(item.id) ||
    !isNonEmptyString(item.label) ||
    (item.acceptsChildren !== undefined && typeof item.acceptsChildren !== 'boolean') ||
    (item.order !== undefined && !Number.isFinite(item.order))
  ) {
    invalidContribution(
      ownerPluginId,
      `Navigation ${item.id} from ${ownerPluginId} is invalid or duplicated.`,
    );
  }
  if (item.point) assertPointRef(item.point);
  if (item.childPoint) assertPointRef(item.childPoint);
}
