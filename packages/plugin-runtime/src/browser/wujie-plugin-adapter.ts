import {
  validateBridgeBootstrapDescriptor,
  type BridgeBootstrapDescriptor,
} from '../bridge-bootstrap';
import type { JsonValue } from '../contribution';
import type { CapabilityId, PluginId } from '../identifiers';
import type { PermissionId } from '../manifest';
import type { PluginRuntime } from '../bootstrap';
import {
  BridgeHandshakeError,
  createWindowBridgeHandshakeCoordinator,
  type BridgeHandshakeAttempt,
  type BridgeHandshakeCoordinator,
} from './window-bridge-handshake';
import {
  loadWujieDriver,
  type WujieDriver,
  type WujieStartOptions,
} from './wujie-driver';

export type SurfaceFailureStage =
  | 'artifact'
  | 'wujie-bootstrap'
  | 'handshake'
  | 'render'
  | 'bridge';

export interface SurfaceInstanceIdentity {
  readonly pluginId: PluginId;
  readonly pluginVersion: string;
  readonly surfaceId: string;
  readonly surfaceInstanceId: string;
  readonly mountPointId: string;
}

export type SurfaceInstanceState =
  | Readonly<{ state: 'MOUNTING' }>
  | Readonly<{
      state: 'MOUNTED';
      bridgeSessionState: 'ACTIVE';
    }>
  | Readonly<{
      state: 'FAILED';
      stage: SurfaceFailureStage;
      error: unknown;
    }>;

export interface SurfaceInstanceRecord {
  readonly identity: SurfaceInstanceIdentity;
  readonly wujieName: string;
  readonly state: SurfaceInstanceState;
}

export type SurfaceMountErrorCode =
  | 'INVALID_SURFACE_MOUNT'
  | 'WUJIE_RESOURCE_FAILED'
  | 'BRIDGE_BOOTSTRAP_FAILED'
  | 'BRIDGE_PROTOCOL_MISMATCH'
  | 'BRIDGE_NONCE_INVALID';

export interface SurfaceMountIssue extends SurfaceInstanceIdentity {
  readonly code: SurfaceMountErrorCode;
  readonly stage: SurfaceFailureStage;
  readonly message: string;
  readonly cause?: unknown;
}

export class SurfaceMountError extends Error {
  readonly issue: SurfaceMountIssue;

  constructor(issue: SurfaceMountIssue) {
    super(issue.message);
    this.name = 'SurfaceMountError';
    this.issue = Object.freeze({ ...issue });
  }
}

export interface MountRestrictedSurfaceInput {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly mountPointId: string;
  readonly container: HTMLElement;
  readonly layout?: JsonValue;
  readonly initialParameters?: JsonValue;
}

export interface MountedSurface {
  readonly identity: SurfaceInstanceIdentity;
  readonly wujieName: string;
  unmount(): Promise<void>;
}

export interface WujiePluginAdapter {
  mount(input: MountRestrictedSurfaceInput): Promise<MountedSurface>;
  unmount(surfaceInstanceId: string): Promise<void>;
  getInstance(surfaceInstanceId: string): SurfaceInstanceRecord | undefined;
  listInstances(): readonly SurfaceInstanceRecord[];
}

export interface CreateWujiePluginAdapterOptions {
  readonly runtime: PluginRuntime;
  readonly protocolVersion?: number;
  readonly handshakeTimeoutMs?: number;
  readonly driver?: WujieDriver | (() => Promise<WujieDriver>);
  readonly handshake?: BridgeHandshakeCoordinator;
  readonly hostWindow?: Window;
  readonly createSurfaceInstanceId?: () => string;
  readonly createNonce?: () => string;
}

interface BridgeSessionIdentity extends SurfaceInstanceIdentity {
  readonly protocolVersion: number;
  readonly requires: readonly CapabilityId[];
  readonly grantedPermissions: readonly PermissionId[];
}

interface OwnedBridgeSession {
  readonly identity: BridgeSessionIdentity;
  readonly state: 'ACTIVE' | 'DISPOSED';
  dispose(): void;
}

interface InternalSurfaceInstance {
  readonly identity: SurfaceInstanceIdentity;
  readonly wujieName: string;
  state: SurfaceInstanceState;
  handshake?: BridgeHandshakeAttempt;
  session?: OwnedBridgeSession;
  destroyWujie?: () => Promise<void>;
  wujieStarted: boolean;
  cleaned: boolean;
}

function freezeIdentity(identity: SurfaceInstanceIdentity): SurfaceInstanceIdentity {
  return Object.freeze({ ...identity });
}

function snapshot(instance: InternalSurfaceInstance): SurfaceInstanceRecord {
  return Object.freeze({
    identity: instance.identity,
    wujieName: instance.wujieName,
    state: instance.state,
  });
}

function randomId(): string {
  return crypto.randomUUID();
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function createBridgeSession(
  identity: BridgeSessionIdentity,
  port: MessagePort,
): OwnedBridgeSession {
  let state: 'ACTIVE' | 'DISPOSED' = 'ACTIVE';
  return {
    identity: Object.freeze({
      ...identity,
      requires: Object.freeze([...identity.requires]),
      grantedPermissions: Object.freeze([...identity.grantedPermissions]),
    }),
    get state() {
      return state;
    },
    dispose() {
      if (state === 'DISPOSED') {
        return;
      }
      state = 'DISPOSED';
      port.close();
    },
  };
}

function handshakeMountError(
  identity: SurfaceInstanceIdentity,
  error: unknown,
): SurfaceMountError {
  const code =
    error instanceof BridgeHandshakeError
      ? error.code
      : 'BRIDGE_BOOTSTRAP_FAILED';
  return new SurfaceMountError({
    ...identity,
    code,
    stage: 'handshake',
    message:
      error instanceof Error ? error.message : 'Bridge handshake failed.',
    cause: error,
  });
}

export function createWujiePluginAdapter(
  options: CreateWujiePluginAdapterOptions,
): WujiePluginAdapter {
  const protocolVersion = options.protocolVersion ?? 1;
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
  const hostWindow = options.hostWindow ?? window;
  const handshake =
    options.handshake ?? createWindowBridgeHandshakeCoordinator(hostWindow);
  const createSurfaceInstanceId = options.createSurfaceInstanceId ?? randomId;
  const createNonce = options.createNonce ?? randomId;
  const instances = new Map<string, InternalSurfaceInstance>();
  const issuedNonces = new Set<string>();

  const resolveDriver = async (): Promise<WujieDriver> => {
    if (options.driver === undefined) {
      return loadWujieDriver();
    }
    return typeof options.driver === 'function'
      ? options.driver()
      : options.driver;
  };

  const cleanup = async (instance: InternalSurfaceInstance): Promise<void> => {
    if (instance.cleaned) {
      return;
    }
    instance.cleaned = true;
    instance.handshake?.cancel();
    instance.handshake = undefined;
    instance.session?.dispose();

    try {
      if (instance.destroyWujie !== undefined) {
        await instance.destroyWujie();
      } else if (instance.wujieStarted) {
        const driver = await resolveDriver();
        await driver.destroyApp(instance.wujieName);
      }
    } finally {
      instance.destroyWujie = undefined;
    }
  };

  const adapter: WujiePluginAdapter = {
    async mount(input: MountRestrictedSurfaceInput): Promise<MountedSurface> {
      const record = options.runtime.restrictedPlugins.get(input.pluginId);
      const pluginState = options.runtime.plugins.get(input.pluginId);
      const surface = options.runtime.surfaces.get(
        input.pluginId,
        input.surfaceId,
      );
      requireNonEmpty(input.mountPointId, 'mountPointId');

      if (
        record === undefined ||
        pluginState?.state !== 'ACTIVE' ||
        surface === undefined
      ) {
        throw new Error(
          `Restricted Surface ${input.pluginId}/${input.surfaceId} is not ACTIVE.`,
        );
      }

      const surfaceInstanceId = createSurfaceInstanceId();
      requireNonEmpty(surfaceInstanceId, 'surfaceInstanceId');
      if (instances.has(surfaceInstanceId)) {
        throw new Error(`Surface Instance ${surfaceInstanceId} already exists.`);
      }
      const nonce = createNonce();
      requireNonEmpty(nonce, 'Bridge nonce');
      if (issuedNonces.has(nonce)) {
        throw new Error('Bridge nonce factory returned a reused value.');
      }
      issuedNonces.add(nonce);

      const identity = freezeIdentity({
        pluginId: input.pluginId,
        pluginVersion: surface.pluginVersion,
        surfaceId: input.surfaceId,
        surfaceInstanceId,
        mountPointId: input.mountPointId,
      });
      const instance: InternalSurfaceInstance = {
        identity,
        wujieName: `nexus-surface-${surfaceInstanceId}`,
        state: Object.freeze({ state: 'MOUNTING' }),
        wujieStarted: false,
        cleaned: false,
      };
      instances.set(surfaceInstanceId, instance);

      const descriptor: BridgeBootstrapDescriptor =
        validateBridgeBootstrapDescriptor({
          protocolVersion,
          surfaceInstanceId,
          nonce,
        });
      const entryUrl = new URL(record.manifest.entry, hostWindow.location.href);
      let startFailureStage: SurfaceFailureStage = 'wujie-bootstrap';
      let artifactError: unknown;

      try {
        instance.handshake = handshake.begin({
          descriptor,
          expectedOrigin: entryUrl.origin,
          timeoutMs: handshakeTimeoutMs,
        });
        void instance.handshake.result.catch(() => undefined);

        const driver = await resolveDriver();
        const startOptions: WujieStartOptions = {
          name: instance.wujieName,
          url: entryUrl.href,
          el: input.container,
          sync: false,
          alive: false,
          fiber: true,
          degrade: false,
          props: Object.freeze({
            plugin: Object.freeze({
              id: record.manifest.id,
              version: record.manifest.version,
            }),
            surface: Object.freeze({
              id: input.surfaceId,
              ...(input.layout === undefined ? {} : { layout: input.layout }),
              ...(input.initialParameters === undefined
                ? {}
                : { initialParameters: input.initialParameters }),
            }),
            bridge: descriptor,
          }),
          loadError(_url, error) {
            artifactError = error;
          },
          beforeMount() {
            startFailureStage = 'render';
          },
        };

        instance.wujieStarted = true;
        const destroy = await driver.startApp(startOptions);
        if (typeof destroy === 'function') {
          instance.destroyWujie = async () => {
            await destroy();
          };
        }
        if (artifactError !== undefined) {
          throw new SurfaceMountError({
            ...identity,
            code: 'WUJIE_RESOURCE_FAILED',
            stage: 'artifact',
            message: 'Restricted Plugin artifact failed to load.',
            cause: artifactError,
          });
        }

        const port = await instance.handshake.result.catch(error => {
          throw handshakeMountError(identity, error);
        });
        instance.handshake = undefined;
        instance.session = createBridgeSession(
          {
            ...identity,
            protocolVersion,
            requires: record.manifest.requires,
            grantedPermissions: record.config.grantedPermissions,
          },
          port,
        );
        instance.state = Object.freeze({
          state: 'MOUNTED',
          bridgeSessionState: 'ACTIVE',
        });

        return Object.freeze({
          identity,
          wujieName: instance.wujieName,
          unmount: () => adapter.unmount(surfaceInstanceId),
        });
      } catch (error) {
        const mountError =
          error instanceof SurfaceMountError
            ? error
            : new SurfaceMountError({
                ...identity,
                code: 'WUJIE_RESOURCE_FAILED',
                stage: artifactError === undefined ? startFailureStage : 'artifact',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Wujie Surface mount failed.',
                cause: error,
              });
        instance.state = Object.freeze({
          state: 'FAILED',
          stage: mountError.issue.stage,
          error: mountError,
        });
        await cleanup(instance).catch(() => undefined);
        throw mountError;
      }
    },

    async unmount(surfaceInstanceId: string): Promise<void> {
      const instance = instances.get(surfaceInstanceId);
      if (instance === undefined) {
        return;
      }
      try {
        await cleanup(instance);
      } finally {
        instances.delete(surfaceInstanceId);
      }
    },

    getInstance(surfaceInstanceId: string) {
      const instance = instances.get(surfaceInstanceId);
      return instance === undefined ? undefined : snapshot(instance);
    },

    listInstances() {
      return Object.freeze(
        [...instances.values()]
          .sort((left, right) =>
            left.identity.surfaceInstanceId.localeCompare(
              right.identity.surfaceInstanceId,
            ),
          )
          .map(snapshot),
      );
    },
  };

  return Object.freeze(adapter);
}
