import type { CapabilityId, PluginId } from './identifiers';
import type { JsonValue } from './contribution';
import type { PermissionId } from './manifest';

export interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

export interface BridgeInvocationContext {
  readonly execution?: import('./browser/wujie-plugin-adapter').ExecutionReference;
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly surfaceInstanceId: string;
  readonly mountPointId: string;
  readonly signal: AbortSignal;
}

export interface BridgeUnaryActionContract<
  Request extends JsonValue = JsonValue,
  Result extends JsonValue = JsonValue,
> {
  readonly kind: 'request';
  readonly requestSchema: RuntimeSchema<Request>;
  readonly resultSchema: RuntimeSchema<Result>;
  readonly requiredPermissions: readonly PermissionId[];
  invoke(
    capability: unknown,
    payload: Request,
    context: BridgeInvocationContext,
  ): Result | Promise<Result>;
}

export interface OpenedBridgeSubscription<Snapshot extends JsonValue = JsonValue> {
  readonly snapshot: Snapshot;
  dispose(): void | Promise<void>;
}

export interface BridgeSubscriptionActionContract<
  Request extends JsonValue = JsonValue,
  Snapshot extends JsonValue = JsonValue,
  Event extends JsonValue = JsonValue,
> {
  readonly kind: 'subscription';
  readonly requestSchema: RuntimeSchema<Request>;
  readonly snapshotSchema: RuntimeSchema<Snapshot>;
  readonly eventSchema: RuntimeSchema<Event>;
  readonly requiredPermissions: readonly PermissionId[];
  open(
    capability: unknown,
    payload: Request,
    context: BridgeInvocationContext,
    emit: (event: Event) => void,
  ): OpenedBridgeSubscription<Snapshot> | Promise<OpenedBridgeSubscription<Snapshot>>;
}

export type BridgeActionContract = BridgeUnaryActionContract | BridgeSubscriptionActionContract;

export interface BridgeCapabilityContract {
  readonly id: CapabilityId;
  readonly actions: Readonly<Record<string, BridgeActionContract>>;
}
