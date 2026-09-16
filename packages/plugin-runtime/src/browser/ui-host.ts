import { createArtifactAssets } from './artifact-assets';
import { frozenCopy } from '../immutable';
import { createActionRuntime } from '../action-runtime';
import { createBrowserActionDriver } from './action-driver';
import type { PluginRuntime } from '../bootstrap';
import type { HostRenderTarget, JsonValue, RouteContext } from '../contribution';
import { createUiRuntime, UiError, type UiMounted, type UiSizing } from '../ui/runtime';
import type { HostContributionPolicy } from '../ui/definitions';
import {
  UI_OVERLAY_CAPABILITY,
  UI_OVERLAY_PERMISSION,
  type UiOverlayCapability,
} from '../ui/overlay-capability';
import { createUiClient, type UiClient } from '../ui-client';
import { createUiControl } from './ui-control';
import { createPluginBridgeSession } from './plugin-bridge';
import type { WujiePluginAdapter } from './wujie-plugin-adapter';

export interface UiHostOptions {
  onAudit?: (entry: import('./plugin-bridge').BridgeAuditEntry) => void;
  onError?: (cause: unknown, attemptId: string) => void;
  runtime: PluginRuntime;
  restrictedAdapter: WujiePluginAdapter;
  policy: HostContributionPolicy;
  builtinCss?: Readonly<Record<string, readonly string[]>>;
  builtinPermissions?: Readonly<Record<string, readonly string[]>>;
  renderBuiltin(
    render: unknown,
    container: HTMLElement,
    client: UiClient,
    onFailure: (error: unknown) => void,
  ): UiMounted | Promise<UiMounted>;
}
export function createUiHost(options: UiHostOptions) {
  options = {
    ...options,
    builtinCss: frozenCopy(options.builtinCss ?? {}),
    builtinPermissions: frozenCopy(options.builtinPermissions ?? {}),
  };
  // Wujie virtualizes HTML.parentNode; anchor ownership follows the physical Host DOM.
  const physicalParent = Object.getOwnPropertyDescriptor(window.Node.prototype, 'parentNode')!.get!;
  const hostDocument = window.document;
  const connected = Object.getOwnPropertyDescriptor(window.Node.prototype, 'isConnected')!.get!;
  const assets = createArtifactAssets();
  const bindings = new Map<string, string>();
  const localCleanups = new Set<Promise<void>>();
  const roots = new Map<string, () => ParentNode | undefined>();
  const rootOwners = new WeakMap<object, string>();
  const anchors = new Map<string, Map<string, HTMLElement>>();
  const readyCallbacks = new Map<string, () => void>();
  function controlReady(attemptId: string, signal: AbortSignal) {
    const promise = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        readyCallbacks.delete(attemptId);
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(new UiError('STALE_EXECUTION'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new UiError('UI_READY_TIMEOUT'));
      }, 10_000);
      readyCallbacks.set(attemptId, () => {
        cleanup();
        resolve();
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    void promise.catch(() => undefined);
    return promise;
  }
  const metadata = new WeakMap<
    HTMLElement,
    { mountPointId: string; routeContext?: RouteContext }
  >();
  const rootCleanups = new Map<string, Promise<void>>();
  const permissions = (owner: string) =>
    options.runtime.restrictedPlugins.get(owner)?.config.grantedPermissions ??
    options.builtinPermissions?.[owner] ??
    [];
  const actions = createActionRuntime({
    registry: options.runtime.contributions,
    policy: options.policy,
    driver: createBrowserActionDriver(options),
    canUseCapability(owner, id) {
      const descriptor = options.runtime.candidates.find(
        (p) => p.descriptor.id === owner,
      )?.descriptor;
      const contract = options.runtime.bridgeContracts.get(id);
      return (
        !!descriptor?.requires.includes(id) &&
        !!contract &&
        Object.values(contract.actions).some((action) =>
          action.requiredPermissions.every((permission) => permissions(owner).includes(permission)),
        )
      );
    },
  });
  const candidate = (owner: string) =>
    options.runtime.candidates.find((p) => p.descriptor.id === owner)?.descriptor;
  const getRoot = (attemptId: string) => {
    const root = roots.get(attemptId)?.();
    if (root) rootOwners.set(root, attemptId);
    return root;
  };
  function belongs(element: Node, root: ParentNode, attemptId: string) {
    for (let node: Node | null = element; node; node = physicalParent.call(node)) {
      const owner = rootOwners.get(node);
      if (owner && owner !== attemptId) return false;
      if (node === root) return true;
    }
    return false;
  }
  function actualStyleRoot(
    container: HTMLElement,
    attemptId: string,
  ): { root: Document | ShadowRoot; lineage: Node[] } {
    core.identity(attemptId);
    if (!connected.call(container)) throw new UiError('ANCHOR_NOT_IN_ROOT');
    const lineage: Node[] = [];
    for (let node: Node | null = container; node; node = physicalParent.call(node)) {
      lineage.push(node);
      const owner = rootOwners.get(node);
      if (owner) core.identity(owner);
      if (node === hostDocument) return { root: hostDocument, lineage };
      if (node instanceof window.ShadowRoot) {
        // Only an existing, active Restricted presentation can own this physical root.
        for (const [id, read] of roots)
          if (read() === node) {
            core.identity(id);
            return { root: node, lineage };
          }
        throw new UiError('PRESENTATION_ROOT_MISSING');
      }
    }
    throw new UiError('PRESENTATION_ROOT_MISSING');
  }
  function resolveAnchor(attemptId: string, token: string): HTMLElement {
    const root = getRoot(attemptId);
    if (!root) throw new UiError('PRESENTATION_ROOT_MISSING');
    const matches = [...root.querySelectorAll<HTMLElement>('[data-nexus-slot-anchor]')].filter(
      (el) => el.getAttribute('data-nexus-slot-anchor') === token && belongs(el, root, attemptId),
    );
    if (matches.length !== 1 || !matches[0].isConnected) throw new UiError('ANCHOR_NOT_IN_ROOT');
    const map = anchors.get(attemptId) ?? new Map();
    if ([...map.values()].includes(matches[0])) throw new UiError('ANCHOR_ALREADY_BOUND');
    // Occurrence identity comes from the core, never from this physical marker.
    return matches[0];
  }
  function channel(attemptId: string) {
    return (send: (value: unknown) => void) => {
      const owned = new Map<string, HTMLElement>();
      anchors.set(attemptId, owned);
      let resolved: HTMLElement | undefined;
      const observer = new MutationObserver(() => {
        const root = getRoot(attemptId);
        for (const [occurrenceId, element] of owned)
          if (!root || !element.isConnected || !belongs(element, root, attemptId)) {
            try {
              core.unmountSlot(attemptId, occurrenceId);
            } catch {
              /* Already invalidated. */
            }
            owned.delete(occurrenceId);
          }
      });
      const delegate = createUiControl(
        core,
        attemptId,
        (token) => {
          resolved = resolveAnchor(attemptId, token);
          return resolved;
        },
        () => readyCallbacks.get(attemptId)?.(),
        actions,
      );
      const ingress = delegate((value) => {
        const reply = value as { type?: string; ok?: boolean; result?: unknown };
        if (
          reply.type === 'ui:response' &&
          reply.ok &&
          typeof reply.result === 'string' &&
          resolved
        ) {
          owned.set(reply.result, resolved);
          const root = getRoot(attemptId);
          if (root) observer.observe(root, { childList: true, subtree: true });
        }
        send(value);
        try {
          const snapshot = core.snapshot(attemptId);
          for (const key of owned.keys())
            if (!snapshot.occurrences.some((o) => o.occurrenceId === key)) owned.delete(key);
        } catch {
          /* Ended Attempt. */
        }
      });
      return {
        dispatch(value: unknown) {
          resolved = undefined;
          ingress.dispatch(value);
          resolved = undefined;
        },
        dispose() {
          observer.disconnect();
          ingress.dispose();
          anchors.delete(attemptId);
        },
      };
    };
  }
  function localClient(attemptId: string): {
    client: UiClient;
    dispose(): void;
    settled(): Promise<void>;
  } {
    const identity = core.identity(attemptId),
      owner = identity.ownerPluginId,
      descriptor = candidate(owner);
    const ports = new MessageChannel();
    bindings.set(attemptId, attemptId);
    const session = createPluginBridgeSession({
      runtime: options.runtime,
      port: ports.port1,
      onAudit: options.onAudit,
      identity: {
        pluginId: owner,
        pluginVersion: descriptor?.version ?? '1',
        surfaceId: 'builtin-presentation',
        surfaceInstanceId: attemptId,
        mountPointId: attemptId,
        protocolVersion: 1,
        requires: descriptor?.requires ?? [],
        grantedPermissions: permissions(owner),
      },
      createUiControl: channel(attemptId),
      onSessionFailure: () => core.failAttempt(attemptId),
    });
    const client = createUiClient(ports.port2);
    void client.refresh().catch(() => undefined);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      client.dispose();
      session.dispose();
      ports.port2.close();
      bindings.delete(attemptId);
      const cleanup = session.settled();
      localCleanups.add(cleanup);
      void cleanup.finally(() => localCleanups.delete(cleanup));
    };
    identity.signal.addEventListener('abort', dispose, { once: true });
    return { client, dispose, settled: () => session.settled() };
  }
  function applyLayout(element: HTMLElement, sizing: UiSizing, order: number) {
    Object.assign(element.style, {
      position: 'relative',
      isolation: 'isolate',
      contain: 'layout paint',
      overflow: 'auto',
      flex: 'none',
      order: String(order),
      width: '100%',
      minWidth: `${sizing.minWidth ?? 0}px`,
      maxWidth: sizing.maxWidth === undefined ? '100%' : `${sizing.maxWidth}px`,
      minHeight: `${sizing.minHeight ?? 0}px`,
      maxHeight: sizing.maxHeight === undefined ? 'none' : `${sizing.maxHeight}px`,
      height:
        sizing.mode === 'bounded'
          ? `${Math.min(sizing.maxHeight ?? 320, Math.max(sizing.minHeight ?? 0, 320))}px`
          : 'auto',
    });
    element.dataset.nexusSizing = sizing.mode;
  }
  const core = createUiRuntime({
    registry: options.runtime.contributions,
    policy: options.policy,
    onError: options.onError,
    canOverlay: (owner) =>
      permissions(owner).includes(UI_OVERLAY_PERMISSION) &&
      (candidate(owner)?.requires.includes(UI_OVERLAY_CAPABILITY) ?? false),
    driver: {
      allocate(anchor, id, sizing) {
        const parent = anchor as HTMLElement;
        Object.assign(parent.style, {
          display: 'flex',
          flexDirection: 'column',
          minWidth: '0',
          maxWidth: '100%',
          overflow: 'auto',
          contain: 'layout paint',
        });
        const element = document.createElement('div');
        element.dataset.nexusContribution = id;
        applyLayout(element, sizing, 0);
        parent.append(element);
        return { placement: element, dispose: () => element.remove() };
      },
      layout(placement, sizing, order) {
        applyLayout(placement as HTMLElement, sizing, order);
      },
      visibility(anchor, hidden) {
        (anchor as HTMLElement).hidden = hidden;
      },
      async mount(input) {
        const container = input.placement as HTMLElement;
        const disposeBindings = () => {
          roots.delete(input.attemptId);
          anchors.delete(input.attemptId);
        };
        input.signal.addEventListener('abort', disposeBindings, { once: true });
        if (input.target.kind === 'builtin') {
          roots.set(input.attemptId, () => container);
          rootOwners.set(container, input.attemptId);
          let css: { release(): void } | undefined;
          try {
            const location = actualStyleRoot(container, input.attemptId);
            css = await assets.acquire(
              options.builtinCss?.[input.ownerPluginId] ?? [],
              location.root,
              input.signal,
            );
            const current = actualStyleRoot(container, input.attemptId);
            if (
              input.signal.aborted ||
              current.root !== location.root ||
              current.lineage.length !== location.lineage.length ||
              current.lineage.some((node, index) => node !== location.lineage[index])
            )
              throw new UiError('STALE_EXECUTION');
          } catch (cause) {
            css?.release();
            const descriptor = candidate(input.ownerPluginId);
            const error = new UiError('CSS_ARTIFACT_FAILED', 'artifact');
            error.message = `CSS artifact failed: owner=${input.ownerPluginId} version=${descriptor?.version ?? 'unknown'} attemptId=${input.attemptId}: ${String(cause)}`;
            throw error;
          }
          // CSS waiting has its own timeout; only rendering starts the UI-ready clock.
          const ready = controlReady(input.attemptId, input.signal);
          let local: ReturnType<typeof localClient> | undefined;
          let mounted: UiMounted | undefined;
          const cleanup = async () => {
            disposeBindings();
            local?.dispose();
            try {
              const results = await Promise.allSettled([
                Promise.resolve().then(() => mounted?.dispose()),
                local?.settled(),
              ]);
              const failure = results.find((result) => result.status === 'rejected');
              if (failure?.status === 'rejected') throw failure.reason;
            } finally {
              css?.release();
            }
          };
          try {
            local = localClient(input.attemptId);
            mounted = await options.renderBuiltin(
              input.target.render,
              container,
              local.client,
              () => core.failAttempt(input.attemptId),
            );
            await ready;
          } catch (error) {
            await cleanup();
            throw error;
          }
          return { dispose: cleanup };
        }
        const ready = controlReady(input.attemptId, input.signal);
        roots.set(
          input.attemptId,
          () => container.querySelector('wujie-app')?.shadowRoot ?? undefined,
        );
        const meta = metadata.get(container);
        const mounting = options.restrictedAdapter.mount({
          pluginId: input.ownerPluginId,
          surfaceId: input.surfaceId,
          container,
          mountPointId: meta?.mountPointId ?? input.attemptId,
          routeContext: meta?.routeContext,
          layout: input.target.layout,
          initialParameters: input.target.initialParameters,
          signal: input.signal,
          createUiControl: channel(input.attemptId),
          onExecutionFailure: (issue) => core.failAttempt(input.attemptId, issue.code, issue.stage),
        });
        const record = options.restrictedAdapter
          .listInstances()
          .find((i) => i.identity.mountPointId === (meta?.mountPointId ?? input.attemptId));
        if (record) bindings.set(record.identity.surfaceInstanceId, input.attemptId);
        input.signal.addEventListener(
          'abort',
          () => {
            if (record) bindings.delete(record.identity.surfaceInstanceId);
          },
          { once: true },
        );
        let mounted;
        try {
          mounted = await mounting;
          await ready;
        } catch (error) {
          if (record) {
            bindings.delete(record.identity.surfaceInstanceId);
            await options.restrictedAdapter.unmount(record.identity.surfaceInstanceId);
          }
          throw error;
        }
        const root = getRoot(input.attemptId);
        const style = document.createElement('style');
        style.textContent =
          'html,body{min-height:0!important;margin:0!important;width:100%!important}';
        root?.appendChild(style);
        // Measure the explicit business content wrapper, not Wujie's patched document viewport.
        const content = root?.querySelector<HTMLElement>('[data-nexus-surface-content]');
        const resize = new ResizeObserver(() => {
          if (
            !input.signal.aborted &&
            content &&
            container.dataset.nexusSizing === 'content-sized'
          ) {
            const app = container.querySelector<HTMLElement>('wujie-app');
            if (app) app.style.height = `${content.getBoundingClientRect().height}px`;
          }
        });
        if (content) resize.observe(content);
        return {
          async dispose() {
            resize.disconnect();
            disposeBindings();
            bindings.delete(mounted.identity.surfaceInstanceId);
            await mounted.unmount();
          },
        };
      },
      overlay(handle, presentation, close) {
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.createElement('dialog');
        dialog.dataset.nexusOverlay = handle;
        dialog.setAttribute(
          'aria-label',
          presentation === 'drawer' ? 'Plugin drawer' : 'Plugin dialog',
        );
        Object.assign(dialog.style, {
          padding: '20px',
          maxWidth: '90vw',
          width: '640px',
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid var(--nexus-color-border-default)',
          borderRadius: 'var(--nexus-radius-md)',
          color: 'var(--nexus-color-text-primary)',
          background: 'var(--nexus-color-surface)',
          fontFamily: 'var(--nexus-font-family-body)',
        });
        if (presentation === 'drawer')
          Object.assign(dialog.style, {
            marginRight: '0',
            marginTop: '0',
            height: '100vh',
            maxHeight: '100vh',
          });
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.onclick = close;
        const feedback = document.createElement('div'),
          container = document.createElement('div');
        dialog.append(closeButton, feedback, container);
        document.body.append(dialog);
        dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          close();
        });
        dialog.showModal();
        return {
          placement: container,
          dispose() {
            if (!dialog.isConnected) return;
            dialog.close();
            dialog.remove();
            if (previous?.isConnected) previous.focus();
          },
          error(execution, retry) {
            feedback.replaceChildren();
            if (execution.phase === 'failed') {
              const message = document.createElement('p');
              message.setAttribute('role', 'alert');
              message.textContent = 'Unable to display this view.';
              const button = document.createElement('button');
              button.textContent = 'Retry';
              button.onclick = retry;
              feedback.append(message, button);
            }
          },
        };
      },
    },
  });
  const overlayCapability: UiOverlayCapability = {
    invoke(action, payload, context) {
      const attemptId = bindings.get(context.surfaceInstanceId);
      if (!attemptId) throw new UiError('STALE_EXECUTION');
      const p = payload as any;
      if (action === 'open')
        return core.openOverlay(attemptId, p?.surfaceId, p?.input, p?.presentation);
      if (action === 'complete') {
        core.completeOverlay(attemptId, payload);
        return null;
      }
      core.cancelOverlay(attemptId, p?.handle);
      return null;
    },
    observe(payload, context, emit) {
      const attemptId = bindings.get(context.surfaceInstanceId);
      if (!attemptId) throw new UiError('STALE_EXECUTION');
      const handle = payload === null ? undefined : (payload as any).handle;
      const read = () =>
        JSON.parse(JSON.stringify(core.overlaySnapshot(attemptId, handle))) as JsonValue;
      const snapshot = read();
      const dispose = core.subscribe(() => {
        try {
          emit(read());
        } catch {
          /* Scope invalidation ends this observer. */
        }
      });
      return { snapshot, dispose };
    },
  };
  return {
    core,
    actions,
    overlayCapability,
    attachOwner(owner: string, container: HTMLElement) {
      const root = core.attachOwner(owner, container);
      roots.set(root.attemptId, () => container);
      rootOwners.set(container, root.attemptId);
      const local = localClient(root.attemptId);
      return {
        client: local.client,
        dispose() {
          root.dispose();
          local.dispose();
          roots.delete(root.attemptId);
        },
      };
    },
    mountRoot(
      owner: string,
      surfaceId: string,
      target: HostRenderTarget,
      container: HTMLElement,
      mountPointId: string,
      routeContext?: RouteContext,
    ) {
      metadata.set(container, { mountPointId, routeContext });
      const root = core.mountRoot(
        owner,
        surfaceId,
        target,
        container,
        rootCleanups.get(mountPointId),
      );
      return {
        scopeId: root.scopeId,
        get attemptId() {
          return root.attemptId;
        },
        get execution() {
          return root.execution;
        },
        retry: root.retry,
        dispose() {
          root.dispose();
          const cleanup = core.settled();
          rootCleanups.set(mountPointId, cleanup);
          void cleanup.then(() => {
            if (rootCleanups.get(mountPointId) === cleanup) rootCleanups.delete(mountPointId);
          });
        },
      };
    },
    async dispose() {
      assets.close();
      try {
        await actions.dispose();
      } finally {
        try {
          await core.dispose();
          while (localCleanups.size) await Promise.allSettled([...localCleanups]);
        } finally {
          assets.dispose();
        }
      }
    },
  };
}
export type UiHost = ReturnType<typeof createUiHost>;
