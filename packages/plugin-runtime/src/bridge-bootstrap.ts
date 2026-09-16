export interface BridgeBootstrapDescriptor {
  readonly protocolVersion: number;
  readonly surfaceInstanceId: string;
  readonly nonce: string;
}

export interface BridgeBootstrapValidationIssue {
  readonly code: 'INVALID_BRIDGE_BOOTSTRAP_DESCRIPTOR';
  readonly validationStage: 'manifest';
  readonly message: string;
}

export class BridgeBootstrapValidationError extends Error {
  readonly issue: BridgeBootstrapValidationIssue;

  constructor(message: string) {
    super(message);
    this.name = 'BridgeBootstrapValidationError';
    this.issue = Object.freeze({
      code: 'INVALID_BRIDGE_BOOTSTRAP_DESCRIPTOR',
      validationStage: 'manifest',
      message,
    });
  }
}

export function validateBridgeBootstrapDescriptor(value: unknown): BridgeBootstrapDescriptor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BridgeBootstrapValidationError('Bridge Bootstrap Descriptor must be an object.');
  }

  const descriptor = value as Record<string, unknown>;
  const allowed = new Set(['protocolVersion', 'surfaceInstanceId', 'nonce']);
  const unknownField = Object.keys(descriptor).find((field) => !allowed.has(field));
  if (unknownField !== undefined) {
    throw new BridgeBootstrapValidationError(
      `Bridge Bootstrap Descriptor contains unknown field ${unknownField}.`,
    );
  }

  if (
    typeof descriptor.protocolVersion !== 'number' ||
    !Number.isInteger(descriptor.protocolVersion) ||
    descriptor.protocolVersion < 1
  ) {
    throw new BridgeBootstrapValidationError('Bridge protocolVersion must be a positive integer.');
  }
  if (
    typeof descriptor.surfaceInstanceId !== 'string' ||
    descriptor.surfaceInstanceId.length === 0
  ) {
    throw new BridgeBootstrapValidationError(
      'Bridge surfaceInstanceId must be a non-empty string.',
    );
  }
  if (typeof descriptor.nonce !== 'string' || descriptor.nonce.length === 0) {
    throw new BridgeBootstrapValidationError('Bridge nonce must be a non-empty string.');
  }

  return Object.freeze({
    protocolVersion: descriptor.protocolVersion,
    surfaceInstanceId: descriptor.surfaceInstanceId,
    nonce: descriptor.nonce,
  });
}
