import type { HostRenderTarget } from '../contribution.js';
import { assertUiJson, validateContextSchema, type ContextSchema } from './schema.js';
export interface ExtensionPointRef {
  readonly ownerPluginId: string;
  readonly id: string;
  readonly contractMajor: number;
}
export type ExtensionKind = 'route' | 'navigation' | 'action' | 'tab' | 'surface';
export type ContractId = `${string}@${number}`;
export type PolicyDimension = 'selectionCount' | 'capability' | 'trait' | 'predicate';
export interface PointConstraints {
  readonly cardinality?: { readonly min: number; readonly max: number };
  readonly groups?: readonly string[];
  readonly order?: { readonly min: number; readonly max: number };
  readonly sizing?: {
    readonly modes: readonly ('content-sized' | 'bounded')[];
    readonly minWidth?: number;
    readonly maxWidth?: number;
    readonly minHeight?: number;
    readonly maxHeight?: number;
  };
  readonly presentations?: readonly string[];
}
export interface ExtensionPointDefinition {
  readonly constraints?: PointConstraints;
  readonly id: string;
  readonly kind: ExtensionKind;
  readonly contractMajor: number;
  readonly contextSchema?: ContextSchema;
  readonly payloadSchema?: ContextSchema;
  readonly profile?: ContractId;
  readonly bindings?: Readonly<Record<string, ContractId>>;
}
export interface CompiledExtensionPointDefinition extends ExtensionPointDefinition {
  readonly contextSchema: ContextSchema;
  readonly allowedPolicyDimensions: readonly PolicyDimension[];
  readonly refContracts: Readonly<Record<string, RefContract>>;
}
export interface PointProfile {
  readonly allowedConstraints?: PointConstraints;
  readonly id: ContractId;
  readonly kind: ExtensionKind;
  readonly contextSchema: ContextSchema;
  readonly payloadSchema?: ContextSchema;
  readonly refParameters?: readonly string[];
  readonly allowedPolicyDimensions?: readonly PolicyDimension[];
}
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'present';
export type ActionCondition =
  | {
      readonly source: 'selectionCount';
      readonly op: ComparisonOperator;
      readonly value?: import('../contribution.js').JsonValue;
    }
  | { readonly source: 'capability'; readonly id: ContractId; readonly available: boolean }
  | {
      readonly source: 'trait';
      readonly name: string;
      readonly op: ComparisonOperator;
      readonly value?: import('../contribution.js').JsonValue;
      readonly match: 'all' | 'any';
    }
  | {
      readonly source: 'predicate';
      readonly name: string;
      readonly value: boolean;
      readonly match: 'all' | 'any';
    };
export interface RefContract {
  readonly traits?: Readonly<Record<string, { readonly field: string }>>;
  readonly predicates?: Readonly<
    Record<
      string,
      {
        readonly trait: string;
        readonly op: ComparisonOperator;
        readonly value?: import('../contribution.js').JsonValue;
      }
    >
  >;
  readonly id: ContractId;
  readonly schema: ContextSchema;
}
export interface PointContributionMetadata {
  readonly id: string;
  readonly point: ExtensionPointRef;
  readonly order?: number;
  readonly group?: string;
  readonly label?: string;
  readonly expectedProfile?: ContractId;
  readonly expectedRefContract?: ContractId;
}
export interface SurfaceContributionDefinition extends PointContributionMetadata {
  readonly kind: 'surface';
  readonly surfaceId: string;
  readonly initiallySelected?: boolean;
}
export interface TabContributionDefinition extends PointContributionMetadata {
  readonly kind: 'tab';
  readonly tabId: string;
  readonly label: string;
  readonly surfaceId: string;
}
export interface ActionContributionDefinition extends PointContributionMetadata {
  readonly kind: 'action';
  readonly actionId: string;
  readonly label: string;
  readonly visibleWhen?: readonly ActionCondition[];
  readonly disabledWhen?: readonly ActionCondition[];
}
export interface ActionDefinition {
  readonly id: string;
}
export type ExtensionContributionDefinition =
  | SurfaceContributionDefinition
  | TabContributionDefinition
  | ActionContributionDefinition;
export interface UiSurfaceDefinition {
  readonly id: string;
  readonly target: HostRenderTarget;
}
export interface ContributionRef {
  readonly ownerPluginId: string;
  readonly id: string;
}
export interface HostContributionPolicyRequest {
  readonly contributorId: string;
  readonly ownerPluginId: string;
  readonly targetId: string;
  readonly kind: ExtensionKind;
  readonly contractMajor: number;
}
export type HostContributionPolicy = (request: HostContributionPolicyRequest) => boolean;
export const uiKey = (owner: string, id: string): string => JSON.stringify([owner, id]);
export function assertPoint(value: ExtensionPointDefinition): void {
  if (
    !value ||
    Object.keys(value).some(
      (k) =>
        ![
          'id',
          'kind',
          'contractMajor',
          'contextSchema',
          'payloadSchema',
          'profile',
          'bindings',
          'constraints',
        ].includes(k),
    ) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    !['route', 'navigation', 'action', 'tab', 'surface'].includes(value.kind) ||
    !Number.isSafeInteger(value.contractMajor) ||
    value.contractMajor < 1
  )
    throw Error('Invalid Extension Point.');
  if (value.profile !== undefined) {
    if (
      typeof value.profile !== 'string' ||
      !/^[^@\s]+@[1-9][0-9]*$/.test(value.profile) ||
      value.contextSchema !== undefined ||
      value.payloadSchema !== undefined
    )
      throw Error('Profile Points cannot redefine schemas.');
  } else {
    if (value.bindings !== undefined) throw Error('Bindings require a Profile.');
    validateContextSchema(value.contextSchema);
    if (value.payloadSchema !== undefined) validateContextSchema(value.payloadSchema);
  }
}
export function assertExtensionContribution(value: ExtensionContributionDefinition): void {
  if (!value || !['surface', 'action', 'tab'].includes(value.kind))
    throw Error('Invalid extension kind.');
  const fields = new Set([
    'id',
    'kind',
    'point',
    'order',
    'group',
    'label',
    'expectedProfile',
    'expectedRefContract',
    ...(value.kind === 'action'
      ? ['actionId', 'visibleWhen', 'disabledWhen']
      : value.kind === 'tab'
        ? ['tabId', 'surfaceId']
        : ['surfaceId', 'initiallySelected']),
  ]);
  if (
    Object.keys(value).some((k) => !fields.has(k)) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    (value.order !== undefined && !Number.isSafeInteger(value.order))
  )
    throw Error('Invalid contribution metadata.');
  for (const name of ['group', 'label', 'expectedProfile', 'expectedRefContract'] as const)
    if (value[name] !== undefined && (typeof value[name] !== 'string' || !value[name]!.trim()))
      throw Error('Invalid contribution metadata.');
  if (
    value.kind === 'surface' &&
    value.initiallySelected !== undefined &&
    typeof value.initiallySelected !== 'boolean'
  )
    throw Error('Invalid initial selection.');
  if (value.kind !== 'surface' && !value.label) throw Error('A label is required.');
  if (
    value.kind === 'action'
      ? typeof value.actionId !== 'string' || !value.actionId
      : typeof value.surfaceId !== 'string' || !value.surfaceId
  )
    throw Error('An execution id is required.');
  if (value.kind === 'tab' && (typeof value.tabId !== 'string' || !value.tabId))
    throw Error('A Tab id is required.');
  if (value.kind === 'action')
    for (const conditions of [value.visibleWhen, value.disabledWhen]) {
      if (conditions !== undefined && (!Array.isArray(conditions) || conditions.length > 20))
        throw Error('Invalid Action conditions.');
      conditions?.forEach(assertActionCondition);
    }
  assertPointRef(value.point);
  assertUiJson(Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)));
}
export function assertPointRef(p: ExtensionPointRef): void {
  if (
    !p ||
    Object.keys(p).some((k) => !['ownerPluginId', 'id', 'contractMajor'].includes(k)) ||
    typeof p.id !== 'string' ||
    !p.id.trim() ||
    typeof p.ownerPluginId !== 'string' ||
    !p.ownerPluginId.trim() ||
    !Number.isSafeInteger(p.contractMajor) ||
    p.contractMajor < 1
  )
    throw Error('Invalid Point reference.');
}
export function assertSurfaceContribution(value: SurfaceContributionDefinition): void {
  if (value.kind !== 'surface') throw Error('Expected a Surface contribution.');
  assertExtensionContribution(value);
}

export function assertActionCondition(condition: ActionCondition): void {
  if (
    !condition ||
    !['selectionCount', 'capability', 'trait', 'predicate'].includes(condition.source)
  )
    throw Error('Invalid Action condition.');
  const fields =
    condition.source === 'capability'
      ? ['source', 'id', 'available']
      : condition.source === 'selectionCount'
        ? ['source', 'op', 'value']
        : condition.source === 'trait'
          ? ['source', 'name', 'op', 'value', 'match']
          : ['source', 'name', 'value', 'match'];
  if (Object.keys(condition).some((k) => !fields.includes(k)))
    throw Error('Invalid Action condition.');
  if (condition.source === 'capability') {
    if (
      typeof condition.id !== 'string' ||
      !/^[^@\s]+@[1-9][0-9]*$/.test(condition.id) ||
      typeof condition.available !== 'boolean'
    )
      throw Error('Invalid capability condition.');
  } else {
    if (
      condition.source !== 'selectionCount' &&
      (typeof condition.name !== 'string' ||
        !condition.name ||
        !['all', 'any'].includes(condition.match))
    )
      throw Error('Invalid Ref condition.');
    if (
      condition.source === 'predicate'
        ? typeof condition.value !== 'boolean'
        : !['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'present'].includes(condition.op)
    )
      throw Error('Invalid comparison.');
  }
}
