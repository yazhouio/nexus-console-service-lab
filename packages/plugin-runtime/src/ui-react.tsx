import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { UiClient, SlotInput, SlotObservation, ContextSnapshot } from './ui-client.js';
const ClientContext = createContext<UiClient | undefined>(undefined);
export function UiProvider({ client, children }: { client: UiClient; children: ReactNode }) {
  return <ClientContext value={client}>{children}</ClientContext>;
}
export function useUiClient(): UiClient {
  const client = useContext(ClientContext);
  if (!client) throw Error('A Host-bound UiProvider is required.');
  return client;
}
export function useSurfaceContext(): ContextSnapshot | null {
  const client = useUiClient();
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  useEffect(() => client.watchContext(setContext), [client]);
  return context;
}
export function useUiObservation() {
  const client = useUiClient();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}
export interface SlotProps extends SlotInput {
  readonly panel?: { id: string; label: string };
  readonly feedback?: (
    state: SlotObservation | undefined,
    retry: (target: string) => Promise<void>,
    error?: string,
  ) => ReactNode;
}
export function Slot({ feedback, panel, ...input }: SlotProps) {
  const client = useUiClient();
  const observation = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const [occurrenceId, setOccurrenceId] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const current = useRef(input);
  current.current = input;
  const serialized = JSON.stringify(input);
  const latest = useRef<Promise<string | undefined> | undefined>(undefined);
  const teardown = useRef<Promise<void>>(Promise.resolve());
  useLayoutEffect(() => {
    const element = anchorRef.current;
    if (!element) return;
    let active = true;
    // Serialize reuse of the physical anchor, including React StrictMode effect replay.
    const mounting = teardown.current.then(() => {
      if (!active) return undefined;
      const token = crypto.randomUUID();
      element.setAttribute('data-nexus-slot-anchor', token);
      return client.mountSlot(token, current.current);
    });
    latest.current = mounting;
    void mounting
      .then((id) => {
        if (!active || !id) return;
        setOccurrenceId(id);
        setFailure(undefined);
      })
      .catch((error) => {
        if (active) setFailure(error.message);
      });
    return () => {
      active = false;
      latest.current = undefined;
      teardown.current = mounting
        .then((id) => (id ? client.unmountSlot(id) : undefined))
        .catch(() => undefined);
    };
  }, [client, input.id]);
  useEffect(() => {
    let active = true;
    const value = JSON.parse(serialized) as SlotInput;
    void latest.current
      ?.then((id) => {
        if (active && id) return client.updateSlot(id, value);
      })
      .catch((error) => {
        if (active) setFailure(error.message);
      });
    return () => {
      active = false;
    };
  }, [client, serialized]);
  const state = observation?.occurrences.find((o) => o.occurrenceId === occurrenceId);
  const retry = async (target: string) => {
    if (occurrenceId) await client.retry(occurrenceId, target);
  };
  return (
    <section data-nexus-slot={input.id} hidden={input.hidden}>
      {feedback ? (
        feedback(state, retry, failure)
      ) : (
        <>
          {failure && <p role="alert">{failure}</p>}
          {state?.input.acceptance === 'rejected' && <p role="alert">Context rejected</p>}
          {state?.runtimeError && <p role="alert">{state.runtimeError}</p>}
          {state?.contributions.map(
            (c) =>
              c.execution?.phase === 'failed' && (
                <p key={`${c.ref.ownerPluginId}/${c.ref.id}`} role="alert">
                  Unable to display {c.ref.id}.{' '}
                  {c.execution.retryTarget && (
                    <button
                      onClick={() => {
                        void retry(c.execution!.retryTarget!).catch((error) =>
                          setFailure(error.message),
                        );
                      }}
                    >
                      Retry {c.ref.id}
                    </button>
                  )}
                </p>
              ),
          )}
        </>
      )}
      <div
        ref={anchorRef}
        id={panel?.id}
        role={panel ? 'tabpanel' : undefined}
        aria-label={panel?.label}
        tabIndex={panel ? 0 : undefined}
      />
    </section>
  );
}

const RoutePresentation = createContext<
  { context?: import('./contribution.js').RouteContext; outlet: ReactNode } | undefined
>(undefined);
/** Host adapter boundary. Plugins consume RouteOutlet/useRouteContext without importing the Host. */
export function RoutePresentationProvider({
  context,
  outlet,
  children,
}: {
  context?: import('./contribution.js').RouteContext;
  outlet: ReactNode;
  children: ReactNode;
}) {
  return <RoutePresentation value={{ context, outlet }}>{children}</RoutePresentation>;
}
export function RouteOutlet() {
  return useContext(RoutePresentation)?.outlet ?? null;
}
export function useRouteContext() {
  const context = useContext(RoutePresentation)?.context;
  if (!context) throw Error('No active Route Context.');
  return context;
}

interface RouteLinkProps {
  readonly className?: string;
  readonly routeId: string;
  readonly params: Readonly<Record<string, string>>;
  readonly children: ReactNode;
  readonly current?: boolean;
}
const RouteLinks = createContext<
  ((props: RouteLinkProps, client: UiClient) => ReactNode) | undefined
>(undefined);
export function RouteLinkProvider({
  renderLink,
  children,
}: {
  renderLink: (props: RouteLinkProps, client: UiClient) => ReactNode;
  children: ReactNode;
}) {
  return <RouteLinks value={renderLink}>{children}</RouteLinks>;
}
/** The browser adapter resolves href internally; the plugin supplies only Route identity and params. */
export function RouteLink(props: RouteLinkProps) {
  const render = useContext(RouteLinks),
    client = useUiClient();
  if (!render) throw Error('No Route Link adapter.');
  return render(props, client);
}

export function useCapabilitySubscription<T>(
  capability: `${string}@${number}`,
  action: string,
  payload: import('./contribution.js').JsonValue = null,
): { value: T | undefined; error: Error | undefined } {
  const client = useUiClient(),
    key = JSON.stringify(payload);
  const [state, setState] = useState<{ value: T | undefined; error: Error | undefined }>({
    value: undefined,
    error: undefined,
  });
  useEffect(() => {
    let active = true,
      stop: (() => void) | undefined;
    setState({ value: undefined, error: undefined });
    void client
      .observe<T>(capability, action, JSON.parse(key), (value) => {
        if (active) setState({ value, error: undefined });
      })
      .then((dispose) => {
        if (active) stop = dispose;
        else dispose();
      })
      .catch((error) => {
        if (active) setState({ value: undefined, error });
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [client, capability, action, key]);
  return state;
}

/** Page-owned Action placement; admission and execution stay behind the bound client. */
interface ControlClassNames {
  root?: string;
  button?: string;
  status?: string;
  result?: string;
}
export function ActionMenu({
  point,
  context,
  classNames,
}: {
  classNames?: ControlClassNames;
  point: import('./ui/definitions.js').ExtensionPointRef;
  context: import('./contribution.js').JsonValue;
}) {
  const client = useUiClient(),
    key = JSON.stringify({ point, context });
  const [choices, setChoices] = useState<Awaited<ReturnType<UiClient['actions']['query']>>>([]);
  const [pending, setPending] = useState<Awaited<ReturnType<UiClient['actions']['start']>>>();
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<import('./contribution.js').JsonValue>();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    const input = JSON.parse(key);
    void client.actions
      .query(input.point, input.context)
      .then((value) => {
        if (current) setChoices(value);
      })
      .catch(() => {
        if (current) setStatus('Actions unavailable');
      });
    return () => {
      current = false;
    };
  }, [client, key, status]);
  const run = async (ref: import('./ui/definitions.js').ContributionRef) => {
    setStatus('Starting action…');
    setResult(undefined);
    try {
      const invocation = await client.actions.start(point, ref, context);
      if (active.current) setPending(invocation);
      const result = await invocation.result;
      if (active.current) {
        setStatus(`Action ${result.state}`);
        if (result.state === 'succeeded') setResult(result.result);
      }
    } catch {
      if (active.current) setStatus('Action failed');
    } finally {
      if (active.current) setPending(undefined);
    }
  };
  return (
    <div className={classNames?.root} aria-label="Actions">
      {choices
        .filter((choice) => !choice.reason && choice.visible)
        .map((choice) => (
          <button
            className={classNames?.button}
            key={`${choice.ownerPluginId}/${choice.contribution.id}`}
            disabled={!!pending || status === 'Starting action…' || choice.disabled}
            onClick={() => {
              void run({ ownerPluginId: choice.ownerPluginId, id: choice.contribution.id });
            }}
          >
            {choice.contribution.label}
          </button>
        ))}
      {pending && (
        <button
          className={classNames?.button}
          onClick={() => {
            void pending.cancel().catch(() => undefined);
          }}
        >
          Cancel action
        </button>
      )}
      <span className={classNames?.status} role="status">
        {status}
      </span>
      {result !== undefined && (
        <pre className={classNames?.result} aria-label="Action result">
          {JSON.stringify(result)}
        </pre>
      )}
    </div>
  );
}

/** Manual activation: arrow keys move focus; Enter/Space select a fresh Surface execution. */
export function Tabs({
  label,
  classNames,
  ...input
}: Omit<SlotInput, 'selected'> & { label: string; classNames?: ControlClassNames }) {
  const [selected, setSelected] = useState<import('./ui/definitions.js').ContributionRef>();
  const prefix = useRef(`tabs-${crypto.randomUUID()}`).current;
  const panel = `${prefix}-panel`;
  return (
    <Slot
      {...input}
      selected={selected ? [selected] : []}
      feedback={(state, retry, error) => (
        <>
          <div className={classNames?.root} role="tablist" aria-label={label}>
            {state?.contributions.map((tab, index) => {
              const chosen =
                selected?.ownerPluginId === tab.ref.ownerPluginId && selected?.id === tab.ref.id;
              return (
                <button
                  className={classNames?.button}
                  role="tab"
                  key={`${tab.ref.ownerPluginId}/${tab.ref.id}`}
                  id={`${prefix}-${index}`}
                  aria-controls={panel}
                  aria-selected={chosen}
                  disabled={tab.availability !== 'available'}
                  tabIndex={chosen || (!selected && index === 0) ? 0 : -1}
                  onClick={() => setSelected(tab.ref)}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const buttons = [
                      ...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                        '[role=tab]:not(:disabled)',
                      ),
                    ];
                    const position = buttons.indexOf(event.currentTarget);
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? buttons.length - 1
                          : (position + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
                            buttons.length;
                    buttons[next]?.focus();
                  }}
                >
                  {tab.label ?? tab.tabId}
                </button>
              );
            })}
          </div>
          {error && <p role="alert">{error}</p>}
          {state?.contributions
            .filter((tab) => tab.selected && tab.execution?.phase === 'failed')
            .map((tab) => (
              <button
                className={classNames?.button}
                key={tab.ref.id}
                onClick={() => {
                  if (tab.execution?.retryTarget) void retry(tab.execution.retryTarget);
                }}
              >
                Retry {tab.label}
              </button>
            ))}
        </>
      )}
      panel={{ id: panel, label }}
    />
  );
}
