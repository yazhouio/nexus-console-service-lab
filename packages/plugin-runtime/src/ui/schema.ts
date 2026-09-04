import type { JsonValue } from '../contribution';

export type ContextSchema = { readonly [key: string]: JsonValue };
export const UI_JSON_LIMITS = Object.freeze({ bytes: 65_536, depth: 32, nodes: 10_000 });
const schemaKeywords = new Set(['$schema', 'title', 'description', 'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties']);
const types = new Set(['null', 'boolean', 'string', 'number', 'integer', 'object', 'array']);
const counts = ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'];
const ranges = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'];
export function assertUiJson(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > UI_JSON_LIMITS.nodes || depth > UI_JSON_LIMITS.depth) throw Error('JSON resource limit exceeded.');
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object') throw Error('Expected JSON values.');
    if (v && typeof v === 'object') {
      if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw Error('Expected plain JSON objects.');
      if (ancestors.has(v)) throw Error('Cyclic JSON.');
      ancestors.add(v);
      for (const child of Array.isArray(v) ? v : Object.values(v)) visit(child, depth + 1);
      ancestors.delete(v);
    }
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > UI_JSON_LIMITS.bytes) throw Error('Expected bounded JSON.');
}
export function validateContextSchema(value: unknown): asserts value is ContextSchema {
  assertUiJson(value);
  let nodes = 0;
  function visit(schema: unknown, depth: number): void {
    if (++nodes > 512 || depth > 16 || !schema || typeof schema !== 'object' || Array.isArray(schema)) throw Error('Expected an inline Context Schema object.');
    const s = schema as Record<string, unknown>;
    if (Object.keys(s).some(k => !schemaKeywords.has(k))) throw Error('Unsupported Context Schema keyword.');
    if (s.$schema !== undefined && s.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw Error('Expected JSON Schema 2020-12.');
    if (s.type !== undefined && (typeof s.type !== 'string' || !types.has(s.type))) throw Error('Unsupported schema type.');
    for (const k of ['title', 'description']) if (s[k] !== undefined && typeof s[k] !== 'string') throw Error(`Invalid ${k}.`);
    for (const k of counts) if (s[k] !== undefined && (!Number.isSafeInteger(s[k]) || (s[k] as number) < 0)) throw Error(`Invalid ${k}.`);
    for (const k of ranges) if (s[k] !== undefined && (typeof s[k] !== 'number' || !Number.isFinite(s[k]))) throw Error(`Invalid ${k}.`);
    if (s.additionalProperties !== undefined && typeof s.additionalProperties !== 'boolean') throw Error('additionalProperties must be boolean.');
    if (s.required !== undefined && (!Array.isArray(s.required) || s.required.some(k => typeof k !== 'string') || new Set(s.required).size !== s.required.length)) throw Error('Invalid required keys.');
    if (s.enum !== undefined && (!Array.isArray(s.enum) || s.enum.length === 0 || new Set(s.enum.map(canonicalJson)).size !== s.enum.length)) throw Error('Invalid enum.');
    if (s.properties !== undefined) {
      if (!s.properties || typeof s.properties !== 'object' || Array.isArray(s.properties)) throw Error('Invalid properties.');
      for (const child of Object.values(s.properties)) visit(child, depth + 1);
    }
    if (s.items !== undefined) visit(s.items, depth + 1);
  }
  visit(value, 0);
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function matchesContext(schema: ContextSchema, value: JsonValue): boolean {
  const s = schema;
  if (s.type !== undefined) {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (s.type === 'integer' ? typeof value !== 'number' || !Number.isInteger(value) : type !== s.type) return false;
  }
  if (s.const !== undefined && canonicalJson(s.const) !== canonicalJson(value)) return false;
  if (Array.isArray(s.enum) && !s.enum.some(v => canonicalJson(v) === canonicalJson(value))) return false;
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum || typeof s.maximum === 'number' && value > s.maximum || typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum || typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) return false;
  }
  const length = typeof value === 'string' ? [...value].length : Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : undefined;
  const suffix = typeof value === 'string' ? 'Length' : Array.isArray(value) ? 'Items' : 'Properties';
  if (length !== undefined && (typeof s[`min${suffix}`] === 'number' && length < (s[`min${suffix}`] as number) || typeof s[`max${suffix}`] === 'number' && length > (s[`max${suffix}`] as number))) return false;
  if (Array.isArray(value) && s.items) return value.every(v => matchesContext(s.items as ContextSchema, v));
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(s.required) && s.required.some(k => !Object.hasOwn(value, k as string))) return false;
    const props = (s.properties ?? {}) as Record<string, ContextSchema>;
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k) ? !matchesContext(props[k], v) : s.additionalProperties === false) return false;
    }
  }
  return true;
}
