import { frozenCopy } from '../immutable';
import type { JsonValue } from '../contribution';
import {
  assertPoint,
  type CompiledExtensionPointDefinition,
  type ExtensionPointDefinition,
  type PointConstraints,
  type PointProfile,
  type RefContract,
} from './definitions';
import { assertUiJson, canonicalJson, validateContextSchema, type ContextSchema } from './schema';

export interface PointContracts {
  readonly profiles?: readonly PointProfile[];
  readonly refContracts?: readonly RefContract[];
}

/** Static catalogs belong to the declaration compiler, never to an execution session. */
export function createPointCompiler(input: PointContracts = {}) {
  function catalog<T extends { id: string }>(
    definitions: readonly T[],
    validate: (definition: T) => void,
  ) {
    const result = new Map<string, T>();
    for (const value of frozenCopy(definitions)) {
      assertUiJson(value);
      if (!/^[^@\s]+@[1-9][0-9]*$/.test(value.id)) throw Error('INVALID_CONTRACT_ID');
      validate(value);
      if (result.has(value.id) && canonicalJson(result.get(value.id)) !== canonicalJson(value))
        throw Error('CONTRACT_ID_CONFLICT');
      result.set(value.id, value);
    }
    return result;
  }
  const refs = catalog(input.refContracts ?? [], (ref) => {
    if (Object.keys(ref).some((key) => !['id', 'schema', 'traits', 'predicates'].includes(key)))
      throw Error('INVALID_REF_CONTRACT');
    if (!/[./]/.test(ref.id.split('@')[0])) throw Error('REF_CONTRACT_NAMESPACE_REQUIRED');
    validateContextSchema(ref.schema);
    const properties = ref.schema.properties;
    for (const trait of Object.values(ref.traits ?? {})) {
      if (
        !trait ||
        Object.keys(trait).some((k) => k !== 'field') ||
        typeof trait.field !== 'string' ||
        !properties ||
        typeof properties !== 'object' ||
        !Object.hasOwn(properties, trait.field)
      )
        throw Error('INVALID_REF_TRAIT');
    }
    for (const predicate of Object.values(ref.predicates ?? {})) {
      if (
        !predicate ||
        Object.keys(predicate).some((k) => !['trait', 'op', 'value'].includes(k)) ||
        !Object.hasOwn(ref.traits ?? {}, predicate.trait) ||
        !['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'present'].includes(predicate.op)
      )
        throw Error('INVALID_REF_PREDICATE');
    }
  });
  function substitute(
    schema: ContextSchema,
    parameters: Readonly<Record<string, ContextSchema>>,
  ): ContextSchema {
    if (Object.hasOwn(schema, '$refContract')) {
      const parameter = schema.$refContract;
      if (
        Object.keys(schema).length !== 1 ||
        typeof parameter !== 'string' ||
        !Object.hasOwn(parameters, parameter)
      )
        throw Error('UNBOUND_REF_PARAMETER');
      return parameters[parameter];
    }
    const result: Record<string, JsonValue> = { ...schema };
    if (
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
    ) {
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([name, child]) => [
          name,
          substitute(child as ContextSchema, parameters),
        ]),
      );
    }
    if (schema.items) result.items = substitute(schema.items as ContextSchema, parameters);
    return result;
  }
  const profiles = catalog(input.profiles ?? [], (profile) => {
    if (
      Object.keys(profile).some(
        (key) =>
          ![
            'id',
            'kind',
            'refParameters',
            'contextSchema',
            'payloadSchema',
            'allowedConstraints',
            'allowedPolicyDimensions',
          ].includes(key),
      )
    )
      throw Error('INVALID_PROFILE');
    if (!['route', 'navigation', 'action', 'tab', 'surface'].includes(profile.kind))
      throw Error('INVALID_PROFILE_KIND');
    validateConstraints(profile.allowedConstraints);
    validateApplicableConstraints(profile.kind, profile.allowedConstraints);
    const parameters = profile.refParameters ?? [];
    if (
      !Array.isArray(parameters) ||
      parameters.some((name) => typeof name !== 'string' || !name) ||
      new Set(parameters).size !== parameters.length
    )
      throw Error('INVALID_REF_PARAMETERS');
    const placeholders = Object.fromEntries(parameters.map((name) => [name, {}]));
    validateContextSchema(substitute(profile.contextSchema, placeholders));
    if (profile.payloadSchema)
      validateContextSchema(substitute(profile.payloadSchema, placeholders));
    if (
      profile.allowedPolicyDimensions !== undefined &&
      (!Array.isArray(profile.allowedPolicyDimensions) ||
        new Set(profile.allowedPolicyDimensions).size !== profile.allowedPolicyDimensions.length ||
        profile.allowedPolicyDimensions.some(
          (d) => !['selectionCount', 'capability', 'trait', 'predicate'].includes(d),
        ))
    )
      throw Error('INVALID_POLICY_DIMENSION');
  });
  return (point: ExtensionPointDefinition): CompiledExtensionPointDefinition => {
    assertPoint(point);
    const profile = point.profile ? profiles.get(point.profile) : undefined;
    if (point.profile && !profile) throw Error('PROFILE_MISSING');
    if (profile && profile.kind !== point.kind) throw Error('PROFILE_KIND_MISMATCH');
    const constraints = narrowConstraints(
      profile?.allowedConstraints,
      point.constraints,
      Boolean(profile),
    );
    validateApplicableConstraints(point.kind, constraints);
    const parameters = profile?.refParameters ?? [];
    const bindings = point.bindings ?? {};
    if (
      typeof bindings !== 'object' ||
      Array.isArray(bindings) ||
      Object.keys(bindings).some((name) => !parameters.includes(name))
    )
      throw Error('INVALID_REF_BINDING');
    const bound: Record<string, RefContract> = {};
    for (const name of parameters) {
      const ref = refs.get(bindings[name]);
      if (!ref) throw Error('REF_CONTRACT_MISSING');
      Object.defineProperty(bound, name, { value: ref, enumerable: true });
    }
    const schemas = Object.fromEntries(
      Object.entries(bound).map(([name, ref]) => [name, ref.schema]),
    );
    let contextSchema = profile ? substitute(profile.contextSchema, schemas) : point.contextSchema!;
    // Reference collection bounds are part of the frozen executable contract.
    const properties = contextSchema.properties as Record<string, ContextSchema> | undefined;
    if (properties?.selectedRefs) {
      const declaredMax = properties.selectedRefs.maxItems;
      contextSchema = {
        ...contextSchema,
        properties: {
          ...properties,
          selectedRefs: {
            ...properties.selectedRefs,
            maxItems: Math.min(100, typeof declaredMax === 'number' ? declaredMax : 100),
          },
        },
      };
    }
    const payloadSchema = profile?.payloadSchema
      ? substitute(profile.payloadSchema, schemas)
      : point.payloadSchema;
    validateContextSchema(contextSchema);
    if (payloadSchema) validateContextSchema(payloadSchema);
    return frozenCopy({
      ...point,
      ...(constraints ? { constraints } : {}),
      contextSchema,
      ...(payloadSchema ? { payloadSchema } : {}),
      allowedPolicyDimensions: profile?.allowedPolicyDimensions ?? [],
      refContracts: bound,
    });
  };
}

function validateConstraints(value?: PointConstraints) {
  if (value === undefined) return;
  assertUiJson(value);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !['cardinality', 'groups', 'order', 'sizing', 'presentations'].includes(key),
    )
  )
    throw Error('INVALID_POINT_CONSTRAINTS');
  for (const key of ['cardinality', 'order'] as const) {
    const range = value[key];
    if (
      range !== undefined &&
      (!range ||
        typeof range !== 'object' ||
        Array.isArray(range) ||
        Object.keys(range).some((k) => !['min', 'max'].includes(k)) ||
        !Number.isSafeInteger(range.min) ||
        !Number.isSafeInteger(range.max) ||
        range.min > range.max ||
        (key === 'cardinality' && range.min < 0))
    )
      throw Error('INVALID_CONSTRAINT_RANGE');
  }
  for (const key of ['groups', 'presentations'] as const) {
    const entries = value[key];
    if (
      entries !== undefined &&
      (!Array.isArray(entries) ||
        entries.length === 0 ||
        new Set(entries).size !== entries.length ||
        entries.some((v) => typeof v !== 'string' || !v))
    )
      throw Error('INVALID_CONSTRAINT_VALUES');
  }
  const sizing = value.sizing;
  if (sizing !== undefined) {
    if (
      !sizing ||
      typeof sizing !== 'object' ||
      Array.isArray(sizing) ||
      Object.keys(sizing).some(
        (k) => !['modes', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'].includes(k),
      ) ||
      !Array.isArray(sizing.modes) ||
      !sizing.modes.length ||
      sizing.modes.some((v) => !['content-sized', 'bounded'].includes(v))
    )
      throw Error('INVALID_SIZING_CONSTRAINT');
    for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const)
      if (sizing[name] !== undefined && (!Number.isFinite(sizing[name]) || sizing[name]! < 0))
        throw Error('INVALID_SIZING_CONSTRAINT');
    if (
      (sizing.minWidth ?? 0) > (sizing.maxWidth ?? Infinity) ||
      (sizing.minHeight ?? 0) > (sizing.maxHeight ?? Infinity)
    )
      throw Error('INVALID_SIZING_CONSTRAINT');
  }
}
function narrowConstraints(
  base: PointConstraints | undefined,
  point: PointConstraints | undefined,
  profiled: boolean,
): PointConstraints | undefined {
  validateConstraints(point);
  if (!point) return base;
  if (!profiled) return point;
  for (const key of Object.keys(point) as (keyof PointConstraints)[])
    if (!base?.[key]) throw Error('CONSTRAINT_NOT_ALLOWED');
  for (const key of ['cardinality', 'order'] as const)
    if (point[key] && (point[key]!.min < base![key]!.min || point[key]!.max > base![key]!.max))
      throw Error('CONSTRAINT_WIDENED');
  for (const key of ['groups', 'presentations'] as const)
    if (point[key]?.some((v) => !base![key]!.includes(v))) throw Error('CONSTRAINT_WIDENED');
  if (point.sizing) {
    const size = point.sizing,
      permitted = base!.sizing!;
    if (size.modes.some((mode) => !permitted.modes.includes(mode)))
      throw Error('CONSTRAINT_WIDENED');
    for (const axis of ['Width', 'Height'] as const)
      if (
        (size[`min${axis}`] ?? 0) < (permitted[`min${axis}`] ?? 0) ||
        (size[`max${axis}`] ?? Infinity) > (permitted[`max${axis}`] ?? Infinity)
      )
        throw Error('CONSTRAINT_WIDENED');
  }
  return { ...base, ...point };
}

/** Reject dimensions for which the Kind has no V1 execution/placement semantics. */
function validateApplicableConstraints(
  kind: import('./definitions').ExtensionKind,
  constraints?: PointConstraints,
): void {
  if (!constraints) return;
  if ((kind === 'route' || kind === 'navigation') && constraints.cardinality !== undefined)
    throw Error('CONSTRAINT_NOT_SUPPORTED');
  if (
    kind !== 'surface' &&
    kind !== 'tab' &&
    (constraints.sizing !== undefined || constraints.presentations !== undefined)
  )
    throw Error('CONSTRAINT_NOT_SUPPORTED');
  // Point-driven content is inline; Overlay's modal/drawer protocol is a separate placement.
  const mode = kind === 'tab' ? 'tab' : 'inline';
  if (constraints.presentations?.some((presentation) => presentation !== mode))
    throw Error('PRESENTATION_NOT_SUPPORTED');
}
