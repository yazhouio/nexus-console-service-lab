import {
  validateBridgeBootstrapDescriptor,
  type BridgeBootstrapDescriptor,
} from '../bridge-bootstrap';
import { isJsonValue, type JsonValue } from '../contribution';
import type { PluginId } from '../identifiers';
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
import {
  createPluginBridgeSession,
  type BridgeHostError,
  type BridgeLimits,
  type BridgeAuditEntry,
  type PluginBridgeSession,
} from './plugin-bridge';

let nextWujieName = 0;

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
  readonly bridgeSession?: Readonly<{ state: 'ACTIVE' | 'DISPOSED'; subscriptionCount: number }>;
}

export type SurfaceMountErrorCode =
  | 'BRIDGE_SESSION_FAILED'
  | 'INVALID_SURFACE_MOUNT'
  | 'SURFACE_MOUNT_CANCELLED'
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
  readonly signal?: AbortSignal;
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
  readonly onSurfaceError?: (error: SurfaceMountError) => void;
  readonly onHostError?: (error: BridgeHostError) => void;
  readonly bridgeLimits?: Partial<BridgeLimits>;
  readonly onAudit?: (entry: BridgeAuditEntry) => void;
}

interface InternalSurfaceInstance {
  readonly identity: SurfaceInstanceIdentity;
  readonly wujieName: string;
  state: SurfaceInstanceState;
  handshake?: BridgeHandshakeAttempt;
  session?: PluginBridgeSession;
  destroyWujie?: () => Promise<void>;
  driver?: WujieDriver;
  startTask: Promise<void>;
  cleanupTask?: Promise<void>;
  readonly abortController: AbortController;
  removeListeners(): void;
  interrupt(error: SurfaceMountError): void;
  wujieStarted: boolean;
  stopped: boolean;
  unmountRequested: boolean;
}

function freezeIdentity(identity: SurfaceInstanceIdentity): SurfaceInstanceIdentity {
  return Object.freeze({ ...identity });
}

function snapshot(instance: InternalSurfaceInstance): SurfaceInstanceRecord {
  return Object.freeze({
    identity: instance.identity,
    wujieName: instance.wujieName,
    state: instance.state,
    ...(instance.session ? { bridgeSession: Object.freeze({ state: instance.session.state, subscriptionCount: instance.session.subscriptionCount }) } : {}),
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
  if (!Number.isInteger(protocolVersion) || protocolVersion < 1 ||
      !Number.isFinite(handshakeTimeoutMs) || handshakeTimeoutMs <= 0) {
    throw new Error('Bridge protocol and handshake timeout must be positive.');
  }
  const hostWindow = options.hostWindow ?? window;
  const handshake =
    options.handshake ?? createWindowBridgeHandshakeCoordinator(hostWindow);
  const createSurfaceInstanceId = options.createSurfaceInstanceId ?? randomId;
  const createNonce = options.createNonce ?? randomId;
  const instances = new Map<string, InternalSurfaceInstance>();
  const issuedInstanceIds = new Set<string>();
  const issuedNonces = new Set<string>();

  const resolveDriver = async (): Promise<WujieDriver> => {
    if (options.driver === undefined) {
      return loadWujieDriver();
    }
    return typeof options.driver === 'function'
      ? options.driver()
      : options.driver;
  };

  const cleanup = (instance: InternalSurfaceInstance): Promise<void> => {
    if (instance.cleanupTask !== undefined) return instance.cleanupTask;
    instance.stopped = true;
    // Invalidate communication before touching browser resources.
    instance.session?.dispose();
    instance.handshake?.cancel();
    instance.handshake = undefined;
    instance.abortController.abort();
    instance.removeListeners();
    instance.cleanupTask = (async () => {
      // Wujie has no cancellable start API. Abort fetches, then destroy the
      // eventual instance instead of allowing a late start to resurrect it.
      await instance.startTask.catch(() => undefined);
      try {
        if (instance.destroyWujie !== undefined) {
          await instance.destroyWujie();
        } else if (instance.wujieStarted) {
          await instance.driver?.destroyApp(instance.wujieName);
        }
      } finally {
        instance.destroyWujie = undefined;
      }
    })();
    return instance.cleanupTask;
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
      if (input.signal?.aborted) throw new DOMException('Mount was cancelled.', 'AbortError');
      for (const value of [input.layout, input.initialParameters]) {
        if (value !== undefined && !isJsonValue(value)) {
          throw new Error('Surface metadata must contain JSON values only.');
        }
      }

      if (
        record === undefined ||
        pluginState?.state !== 'ACTIVE' ||
        surface === undefined
      ) {
        throw new Error(
          `Restricted Surface ${input.pluginId}/${input.surfaceId} is not ACTIVE.`,
        );
      }

      const entryUrl = new URL(record.manifest.entry, hostWindow.location.href);
      if (entryUrl.origin !== hostWindow.location.origin ||
          !['http:', 'https:'].includes(entryUrl.protocol)) {
        throw new Error('Restricted Plugin entry must use the same Host origin.');
      }

      const surfaceInstanceId = createSurfaceInstanceId();
      requireNonEmpty(surfaceInstanceId, 'surfaceInstanceId');
      if (issuedInstanceIds.has(surfaceInstanceId)) {
        throw new Error(`Surface Instance ${surfaceInstanceId} was already used.`);
      }
      const nonce = createNonce();
      requireNonEmpty(nonce, 'Bridge nonce');
      if (issuedNonces.has(nonce)) {
        throw new Error('Bridge nonce factory returned a reused value.');
      }
      issuedNonces.add(nonce);
      issuedInstanceIds.add(surfaceInstanceId);

      const identity = freezeIdentity({
        pluginId: input.pluginId,
        pluginVersion: surface.pluginVersion,
        surfaceId: input.surfaceId,
        surfaceInstanceId,
        mountPointId: input.mountPointId,
      });
      const instance: InternalSurfaceInstance = {
        identity,
        wujieName: `nexus-surface-${surfaceInstanceId}-${++nextWujieName}`,
        state: Object.freeze({ state: 'MOUNTING' }),
        wujieStarted: false,
        stopped: false,
        unmountRequested: false,
        startTask: Promise.resolve(),
        abortController: new AbortController(),
        removeListeners() {},
        interrupt() {},
      };
      instances.set(surfaceInstanceId, instance);

      const descriptor: BridgeBootstrapDescriptor =
        validateBridgeBootstrapDescriptor({
          protocolVersion,
          surfaceInstanceId,
          nonce,
        });
      let startFailureStage: SurfaceFailureStage = 'wujie-bootstrap';
      let artifactError: unknown;
      let rejectInterrupted: (error: SurfaceMountError) => void = () => undefined;
      const interrupted = new Promise<never>((_resolve, reject) => {
        rejectInterrupted = reject;
      });
      // An error may arrive after the initial mount has already resolved.
      void interrupted.catch(() => undefined);
      instance.interrupt = rejectInterrupted;
      const reportFailure = (stage: SurfaceFailureStage, cause: unknown): void => {
        if (instance.stopped) return;
        const error = new SurfaceMountError({
          ...identity, code: stage === 'bridge' ? 'BRIDGE_SESSION_FAILED' : 'WUJIE_RESOURCE_FAILED', stage,
          message: 'Restricted Surface execution failed.', cause,
        });
        instance.state = Object.freeze({ state: 'FAILED', stage, error });
        rejectInterrupted(error);
        void cleanup(instance).catch(() => undefined);
        try { options.onSurfaceError?.(error); } catch { /* Host diagnostics only. */ }
      };
      let iframeWindow: Window | undefined;
      const onError = (event: ErrorEvent): void => reportFailure('render', event.error ?? event.message);
      const onRejection = (event: PromiseRejectionEvent): void => reportFailure('render', event.reason);
      const onAbort = (): void => {
        void adapter.unmount(surfaceInstanceId).catch(() => undefined);
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });
      instance.removeListeners = () => {
        input.signal?.removeEventListener('abort', onAbort);
        iframeWindow?.removeEventListener('error', onError);
        iframeWindow?.removeEventListener('unhandledrejection', onRejection);
      };

      try {
        const attempt = handshake.begin({
          descriptor,
          expectedOrigin: entryUrl.origin,
          timeoutMs: handshakeTimeoutMs,
        });
        instance.handshake = attempt;
        const sessionTask = attempt.result.then(port => {
          if (instance.stopped) {
            port.close();
            throw new Error('Surface was disposed before handshake completed.');
          }
          instance.session = createPluginBridgeSession({
            runtime: options.runtime,
            identity: {
              ...identity, protocolVersion,
              requires: record.manifest.requires,
              grantedPermissions: record.config.grantedPermissions,
            },
            port,
            onHostError: options.onHostError,
            limits: options.bridgeLimits,
            onAudit: options.onAudit,
            onSessionFailure: code => reportFailure('bridge', code),
          });
          instance.handshake = undefined;
        }).catch(error => { throw handshakeMountError(identity, error); });
        void sessionTask.catch(() => undefined);

        const startOptions: WujieStartOptions = {
          name: instance.wujieName,
          url: entryUrl.href,
          el: input.container,
          sync: false,
          alive: false,
          fiber: true,
          degrade: false,
          props: JSON.parse(JSON.stringify({
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
          })),
          fetch: async (resource, init) => {
            const signal = init?.signal
              ? AbortSignal.any([init.signal, instance.abortController.signal])
              : instance.abortController.signal;
            // Wujie also installs this fetch in the child window. Preserve native
            // HTTP semantics; only its artifact loader's loadError is a mount failure.
            return hostWindow.fetch(resource, { ...init, signal });
          },
          loadError(_url, error) {
            artifactError = error;
            reportFailure('artifact', error);
          },
          beforeMount() {
            startFailureStage = 'render';
          },
          plugins: [{
            // beforeLoad runs before iframe navigation/document.open(), which
            // clears listeners. This callback runs after iframe initialization
            // and before the first Plugin script instead.
            jsBeforeLoaders: [{ callback(appWindow) {
              if (instance.stopped) return;
              iframeWindow = appWindow;
              appWindow.addEventListener('error', onError);
              appWindow.addEventListener('unhandledrejection', onRejection);
            } }],
          }],
        };

        instance.startTask = (async () => {
          instance.driver = await resolveDriver();
          if (instance.stopped) return;
          instance.wujieStarted = true;
          const destroy = await instance.driver.startApp(startOptions);
          if (typeof destroy === 'function') {
            instance.destroyWujie = async () => { await destroy(); };
          }
          if (artifactError !== undefined) {
            throw new SurfaceMountError({
              ...identity, code: 'WUJIE_RESOURCE_FAILED', stage: 'artifact',
              message: 'Restricted Plugin artifact failed to load.', cause: artifactError,
            });
          }
        })();
        await Promise.race([Promise.all([instance.startTask, sessionTask]), interrupted]);
        if (instance.stopped) throw new Error('Surface was disposed during mount.');
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
        if (!instance.unmountRequested) {
          instance.state = Object.freeze({
            state: 'FAILED', stage: mountError.issue.stage, error: mountError,
          });
        }
        await cleanup(instance).catch(() => undefined);
        throw mountError;
      }
    },

    async unmount(surfaceInstanceId: string): Promise<void> {
      const instance = instances.get(surfaceInstanceId);
      if (instance === undefined) {
        return;
      }
      instance.unmountRequested = true;
      instance.interrupt(new SurfaceMountError({
        ...instance.identity,
        code: 'SURFACE_MOUNT_CANCELLED', stage: 'wujie-bootstrap',
        message: 'Surface mount was cancelled by the Host.',
      }));
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
