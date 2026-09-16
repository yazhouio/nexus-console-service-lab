import type {
  ExtensionKind,
  ExtensionPointDefinition,
  ExtensionPointRef,
  PointProfile,
  RefContract,
  RouteContribution,
  NavigationContribution,
  SurfaceContributionDefinition,
} from '@nexus/plugin-runtime';

export const CONSOLE_CORE_ID = 'console-core';
export const CONSOLE_CORE_CAPABILITY = 'kubesphere.console-core@1';
export const CONSOLE_ROOT_SURFACE = 'root';
export const CORE_ROUTES_POINT = {
  ownerPluginId: CONSOLE_CORE_ID,
  id: 'routes',
  contractMajor: 1,
} as const satisfies ExtensionPointRef;
export const PRIMARY_NAVIGATION_POINT = {
  ownerPluginId: CONSOLE_CORE_ID,
  id: 'primary-navigation',
  contractMajor: 1,
} as const satisfies ExtensionPointRef;
export const HOME_CARDS_POINT = {
  ownerPluginId: CONSOLE_CORE_ID,
  id: 'home.cards',
  contractMajor: 1,
} as const satisfies ExtensionPointRef;
export const SETTINGS_SECTIONS_POINT = {
  ownerPluginId: CONSOLE_CORE_ID,
  id: 'settings.sections',
  contractMajor: 1,
} as const satisfies ExtensionPointRef;
export const PLUGIN_DETAILS_ACTIONS_POINT = {
  ownerPluginId: CONSOLE_CORE_ID,
  id: 'plugin-details.actions',
  contractMajor: 1,
} as const satisfies ExtensionPointRef;
export interface PluginRef {
  readonly id: string;
}
export interface ListContext<Ref> {
  readonly selectedRefs: readonly Ref[];
  readonly filtered: boolean;
  readonly matchedCount?: number;
}
export interface DetailContext<Ref> {
  readonly itemRef: Ref;
}
export const PLUGIN_REF_CONTRACT = {
  id: 'console-core.plugin-ref@1',
  schema: {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1, maxLength: 200 } },
    required: ['id'],
    additionalProperties: false,
  },
  traits: { id: { field: 'id' } },
} as const satisfies RefContract;

/**
 * Host-owned point declarations. The public author surface is the fixed V1
 * Kind set; plugins consume these refs and register contributions against
 * them. A plugin must not invent a new Kind or change the point contract.
 */
export type HostExtensionPointDefinition = ExtensionPointDefinition;
export const CONSOLE_EXTENSION_POINTS = [
  { id: CORE_ROUTES_POINT.id, kind: 'route', contractMajor: 1, profile: 'console-core.routes@1' },
  {
    id: PRIMARY_NAVIGATION_POINT.id,
    kind: 'navigation',
    contractMajor: 1,
    profile: 'console-core.navigation@1',
  },
  {
    id: HOME_CARDS_POINT.id,
    kind: 'surface',
    contractMajor: 1,
    profile: 'console-core.home.cards@1',
  },
  {
    id: SETTINGS_SECTIONS_POINT.id,
    kind: 'surface',
    contractMajor: 1,
    profile: 'console-core.settings.sections@1',
  },
  {
    id: PLUGIN_DETAILS_ACTIONS_POINT.id,
    kind: 'action',
    contractMajor: 1,
    profile: 'detail.actions@1',
    bindings: { itemRefContract: PLUGIN_REF_CONTRACT.id },
  },
] as const satisfies readonly HostExtensionPointDefinition[];

export interface ExtensionPointCatalogEntry {
  readonly ref: ExtensionPointRef;
  readonly kind: ExtensionKind;
  readonly title: string;
  readonly description: string;
}
export const CONSOLE_EXTENSION_POINT_CATALOG = [
  {
    ref: CORE_ROUTES_POINT,
    kind: 'route',
    title: 'Routes',
    description: 'Add a page to the host route tree.',
  },
  {
    ref: PRIMARY_NAVIGATION_POINT,
    kind: 'navigation',
    title: 'Primary navigation',
    description: 'Add a link or a navigation group to the host sidebar.',
  },
  {
    ref: HOME_CARDS_POINT,
    kind: 'surface',
    title: 'Home cards',
    description: 'Place a lazily mounted surface on the overview dashboard.',
  },
  {
    ref: SETTINGS_SECTIONS_POINT,
    kind: 'surface',
    title: 'Settings sections',
    description: 'Add a bounded settings section owned by a plugin.',
  },
  {
    ref: PLUGIN_DETAILS_ACTIONS_POINT,
    kind: 'action',
    title: 'Plugin detail actions',
    description: 'Add a typed action to a host-owned plugin detail context.',
  },
] as const satisfies readonly ExtensionPointCatalogEntry[];
const constraints = {
  groups: ['primary', 'secondary', 'danger'],
  order: { min: -10_000, max: 10_000 },
  cardinality: { min: 0, max: 100 },
} as const;
const detail = {
  type: 'object',
  properties: { itemRef: { $refContract: 'itemRefContract' } },
  required: ['itemRef'],
  additionalProperties: false,
} as const;
const empty = { type: 'object', additionalProperties: false } as const;
export const CONSOLE_PROFILES = [
  { id: 'console-core.routes@1', kind: 'route', contextSchema: empty },
  {
    id: 'console-core.navigation@1',
    kind: 'navigation',
    contextSchema: empty,
    allowedConstraints: { groups: ['primary', 'secondary', 'system'], order: constraints.order },
  },
  {
    id: 'console-core.home.cards@1',
    kind: 'surface',
    contextSchema: empty,
    allowedConstraints: constraints,
  },
  {
    id: 'console-core.settings.sections@1',
    kind: 'surface',
    contextSchema: empty,
    allowedConstraints: {
      ...constraints,
      sizing: { modes: ['bounded'], minHeight: 100, maxHeight: 600 },
    },
  },
  {
    id: 'list.actions@1',
    kind: 'action',
    refParameters: ['itemRefContract'],
    contextSchema: {
      type: 'object',
      properties: {
        selectedRefs: { type: 'array', maxItems: 100, items: { $refContract: 'itemRefContract' } },
        filtered: { type: 'boolean' },
        matchedCount: { type: 'integer', minimum: 0 },
      },
      required: ['selectedRefs', 'filtered'],
      additionalProperties: false,
    },
    payloadSchema: { type: 'null' },
    allowedConstraints: constraints,
    allowedPolicyDimensions: ['selectionCount', 'capability', 'trait', 'predicate'],
  },
  {
    id: 'detail.actions@1',
    kind: 'action',
    refParameters: ['itemRefContract'],
    contextSchema: detail,
    payloadSchema: { type: 'null' },
    allowedConstraints: constraints,
    allowedPolicyDimensions: ['capability', 'trait', 'predicate'],
  },
  {
    id: 'detail.tabs@1',
    kind: 'tab',
    refParameters: ['itemRefContract'],
    contextSchema: detail,
    allowedConstraints: { ...constraints, cardinality: { min: 0, max: 1 } },
  },
] as const satisfies readonly PointProfile[];
export function consoleRoute(value: Omit<RouteContribution, 'point'>): RouteContribution {
  return { ...value, point: CORE_ROUTES_POINT };
}
export function primaryNavigation(
  value: Omit<NavigationContribution, 'point'>,
): NavigationContribution {
  return { ...value, point: PRIMARY_NAVIGATION_POINT };
}
export function homeCard(
  value: Omit<SurfaceContributionDefinition, 'kind' | 'point'>,
): SurfaceContributionDefinition {
  return { ...value, kind: 'surface', point: HOME_CARDS_POINT };
}
export function settingsSection(
  value: Omit<SurfaceContributionDefinition, 'kind' | 'point'>,
): SurfaceContributionDefinition {
  return { ...value, kind: 'surface', point: SETTINGS_SECTIONS_POINT };
}
