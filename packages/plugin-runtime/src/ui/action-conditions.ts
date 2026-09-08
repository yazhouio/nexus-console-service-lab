import type { JsonValue } from '../contribution';
import { canonicalJson } from './schema';
import type { ActionCondition, ActionContributionDefinition, ComparisonOperator, CompiledExtensionPointDefinition, ContractId } from './definitions';

export function conditionError(point: CompiledExtensionPointDefinition, action: ActionContributionDefinition): string | undefined {
  const ref = point.refContracts.itemRefContract;
  for (const condition of [...action.visibleWhen ?? [], ...action.disabledWhen ?? []]) {
    if (!point.allowedPolicyDimensions.includes(condition.source)) return 'CONDITION_NOT_ALLOWED';
    if (condition.source === 'trait' && !Object.hasOwn(ref?.traits ?? {}, condition.name) || condition.source === 'predicate' && !Object.hasOwn(ref?.predicates ?? {}, condition.name)) return 'REF_CONDITION_UNKNOWN';
  }
}
function compare(actual: JsonValue | undefined, op: ComparisonOperator, expected?: JsonValue): boolean {
  if (op === 'present') return actual !== undefined && actual !== null;
  if (actual === undefined) return false;
  if (op === 'eq') return canonicalJson(actual) === canonicalJson(expected);
  if (op === 'ne') return canonicalJson(actual) !== canonicalJson(expected);
  if (op === 'in') return Array.isArray(expected) && expected.some(value => canonicalJson(actual) === canonicalJson(value));
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (op === 'gt') return actual > expected;
  if (op === 'gte') return actual >= expected;
  if (op === 'lt') return actual < expected;
  return actual <= expected;
}

export function actionAvailability(point: CompiledExtensionPointDefinition, action: ActionContributionDefinition, context: JsonValue, canUse: (id: ContractId) => boolean) {
  const value = context && typeof context === 'object' && !Array.isArray(context) ? context as Record<string, JsonValue> : {};
  const selected = Array.isArray(value.selectedRefs) ? value.selectedRefs : value.itemRef === undefined ? [] : [value.itemRef];
  const ref = point.refContracts.itemRefContract;
  function matches(condition: ActionCondition): boolean {
    if (condition.source === 'selectionCount') return compare(selected.length, condition.op, condition.value);
    if (condition.source === 'capability') { try { return canUse(condition.id) === condition.available; } catch { return false; } }
    const test = (item: JsonValue) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const predicate = condition.source === 'predicate' ? ref?.predicates?.[condition.name] : undefined;
      const trait = ref?.traits?.[predicate?.trait ?? condition.name];
      if (!trait) return false;
      const actual = Object.hasOwn(item, trait.field) ? (item as Record<string, JsonValue>)[trait.field] : undefined;
      return condition.source === 'predicate' ? Boolean(predicate && compare(actual, predicate.op, predicate.value)) === condition.value : compare(actual, condition.op, condition.value);
    };
    return condition.match === 'all' ? selected.length > 0 && selected.every(test) : selected.some(test);
  }
  return { visible: (action.visibleWhen ?? []).every(matches), disabled: Boolean(action.disabledWhen?.length && action.disabledWhen.every(matches)) };
}
