import type { BridgeInvocationContext } from './bridge-contract.js';
import type { CapabilityId } from './identifiers.js';

const invocations = new WeakMap<object, { capability: CapabilityId; action: string }>();
/** Internal execution adapter boundary; never exported by the author SDK. */
export function bindInvocationContext(
  context: BridgeInvocationContext,
  capability: CapabilityId,
  action: string,
): BridgeInvocationContext {
  const value = Object.freeze({ ...context });
  invocations.set(value, { capability, action });
  return value;
}
export function requireInvocationContext(
  context: BridgeInvocationContext,
  capability: CapabilityId,
  action: string,
): void {
  const binding = invocations.get(context);
  if (
    !binding ||
    binding.capability !== capability ||
    binding.action !== action ||
    context.signal.aborted
  )
    throw Error('PLATFORM_INVOCATION_UNBOUND');
}
