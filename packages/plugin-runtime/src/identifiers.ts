export type PluginId = string;

export type CapabilityId = `${string}@${number}`;

export type HostApiId = `${string}@${number}`;

const VERSIONED_ID_PATTERN = /^[^@\s]+@[0-9]+$/u;

export function isCapabilityId(value: unknown): value is CapabilityId {
  return typeof value === 'string' && VERSIONED_ID_PATTERN.test(value);
}

export function isHostApiId(value: unknown): value is HostApiId {
  return typeof value === 'string' && VERSIONED_ID_PATTERN.test(value);
}
