import { useEffect, useState } from 'react';
import {
  validateRestrictedInstallRecord,
  UI_OVERLAY_CAPABILITY,
  type PluginDefinition,
} from '@feforgejs/plugin-runtime';
import classes from './ui-local.module.css?artifact';
import { useSurfaceContext, useUiClient } from '@feforgejs/plugin-runtime/react';
import {
  useHostTestServices as useHostServices,
  TestSurfaceMount as SurfaceMount,
  TestBuiltinMount,
} from '@feforgejs/browser-host/testing';

const schema = {
  type: 'object',
  properties: { node: { type: 'string' }, value: { type: 'integer' } },
  required: ['node', 'value'],
  additionalProperties: false,
};
export const uiFixtureInstallations = ['ui-a', 'ui-b', 'ui-c'].map((owner) =>
  validateRestrictedInstallRecord(
    {
      manifest: {
        id: owner,
        version: '1.0.0',
        entry: `/plugins/${owner}/1.0.0/`,
        hostApi: 'kubesphere.console@1',
        requires: [UI_OVERLAY_CAPABILITY],
        provides: [],
        permissions: ['ui.overlay'],
        surfaces: [{ id: 'main' }, { id: 'dialog' }],
        extensionPoints:
          owner === 'ui-c'
            ? []
            : [
                {
                  id: owner === 'ui-a' ? 'details' : 'children',
                  kind: 'surface',
                  contractMajor: 1,
                  contextSchema: schema,
                },
              ],
        contributions: {
          extensions:
            owner === 'ui-a'
              ? []
              : [
                  ...(owner === 'ui-c'
                    ? [
                        {
                          kind: 'tab',
                          id: 'node-chart',
                          tabId: 'chart',
                          label: 'Node chart',
                          surfaceId: 'main',
                          point: { ownerPluginId: 'cluster', id: 'node.tabs', contractMajor: 1 },
                        },
                      ]
                    : []),
                  {
                    id: `${owner}-card`,
                    kind: 'surface',
                    surfaceId: 'main',
                    order: 0,
                    point: {
                      ownerPluginId: owner === 'ui-b' ? 'ui-a' : 'ui-b',
                      id: owner === 'ui-b' ? 'details' : 'children',
                      contractMajor: 1,
                    },
                  },
                ],
        },
      },
      config: { id: owner, version: '1.0.0', enabled: true, grantedPermissions: ['ui.overlay'] },
    },
    { isEntryAllowed: (entry) => entry.startsWith('/plugins/') },
  ),
);
function LocalCard() {
  const client = useUiClient();
  const context = useSurfaceContext();
  const [failed, setFailed] = useState(false);
  if (failed) throw Error('Builtin fixture render failure');
  return (
    <section className={classes.card} data-testid="ui-local">
      Local card: {JSON.stringify(context?.value)}
      <button className={classes.button} onClick={() => setFailed(true)}>
        Crash Local
      </button>
      <button
        className={classes.button}
        onClick={() => {
          void client.overlay.open('card', null);
        }}
      >
        Open Local overlay
      </button>
    </section>
  );
}
export const uiFixtureBuiltin: PluginDefinition = {
  id: 'ui-local',
  version: '1.0.0',
  requires: [UI_OVERLAY_CAPABILITY],
  provides: [],
  activate(context) {
    context.contributions.registerSurface({
      id: 'card',
      target: { kind: 'builtin', render: LocalCard },
    });
    context.contributions.registerExtension({
      id: 'local-card',
      kind: 'surface',
      surfaceId: 'card',
      order: 10,
      point: { ownerPluginId: 'ui-a', id: 'details', contractMajor: 1 },
    });
  },
};
export function UiCompositionFixture() {
  const { ui, adapter } = useHostServices();
  const [snapshot, setSnapshot] = useState(() => ui.core.inspect());
  useEffect(() => ui.core.subscribe(() => setSnapshot(ui.core.inspect())), [ui]);
  const [shown, setShown] = useState(true);
  return (
    <>
      <h1>UI composition acceptance</h1>
      <button onClick={() => setShown((value) => !value)}>Toggle A page</button>
      {shown && (
        <SurfaceMount
          pluginId="ui-a"
          target={{ kind: 'sandbox-surface', surfaceId: 'main' }}
          mountPointId="ui-fixture-root"
          testId="ui-root"
          label="A page"
          autoMount
        />
      )}
      <pre data-testid="ui-inspection">{JSON.stringify(snapshot)}</pre>
      <pre data-testid="ui-instances">
        {JSON.stringify(
          adapter
            .listInstances()
            .map((i) => ({ ...i.identity, state: i.state.state, session: i.bridgeSession })),
        )}
      </pre>
    </>
  );
}

uiFixtureInstallations.push(
  validateRestrictedInstallRecord(
    {
      manifest: {
        id: 'ui-action',
        version: '1.0.0',
        entry: '/plugins/ui-action/1.0.0/',
        hostApi: 'kubesphere.console@1',
        requires: ['routes.query@1'],
        provides: [],
        permissions: ['routes.query'],
        surfaces: [],
        actions: [{ id: 'check' }, { id: 'slow' }],
        contributions: {
          extensions: [
            {
              kind: 'action',
              id: 'check',
              actionId: 'check',
              label: 'Check node context',
              point: { ownerPluginId: 'cluster', id: 'node.actions', contractMajor: 1 },
              expectedProfile: 'detail.actions@1',
              expectedRefContract: 'cluster.resource-ref@1',
            },
            {
              kind: 'action',
              id: 'slow',
              actionId: 'slow',
              label: 'Start slow node check',
              point: { ownerPluginId: 'cluster', id: 'node.actions', contractMajor: 1 },
            },
          ],
        },
      },
      config: {
        id: 'ui-action',
        version: '1.0.0',
        enabled: true,
        grantedPermissions: ['routes.query'],
      },
    },
    { isEntryAllowed: (entry) => entry.startsWith('/plugins/') },
  ),
);

const localTarget = { kind: 'builtin', render: LocalCard } as const;
export function BuiltinStylingFixture() {
  const { ui } = useHostServices();
  const [first, setFirst] = useState(true),
    [second, setSecond] = useState(true),
    [hidden, setHidden] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [snapshot, setSnapshot] = useState(() => ui.core.inspect());
  useEffect(() => ui.core.subscribe(() => setSnapshot(ui.core.inspect())), [ui]);
  return (
    <>
      <h1>Builtin styling acceptance</h1>
      <button onClick={() => setRestricted((value) => !value)}>Toggle Restricted parent</button>
      {restricted && (
        <SurfaceMount
          pluginId="ui-a"
          target={{ kind: 'sandbox-surface', surfaceId: 'main' }}
          mountPointId="style-restricted"
          testId="style-restricted"
          label="Style Restricted parent"
          autoMount
        />
      )}
      <pre data-testid="style-inspection">{JSON.stringify(snapshot)}</pre>
      <button onClick={() => setFirst((value) => !value)}>Toggle first</button>
      <button onClick={() => setSecond((value) => !value)}>Toggle second</button>
      <button onClick={() => setHidden((value) => !value)}>Hide first</button>
      <div hidden={hidden}>
        {first && (
          <TestBuiltinMount
            ui={ui}
            ownerPluginId="ui-local"
            surfaceId="card"
            target={localTarget}
            mountPointId="style-first"
          />
        )}
      </div>
      {second && (
        <TestBuiltinMount
          ui={ui}
          ownerPluginId="ui-local"
          surfaceId="card"
          target={localTarget}
          mountPointId="style-second"
        />
      )}
    </>
  );
}
