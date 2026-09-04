import { useEffect, useState } from 'react';
import { validateRestrictedInstallRecord, UI_OVERLAY_CAPABILITY, type PluginDefinition } from '@nexus/plugin-runtime';
import { useSurfaceContext } from '@nexus/plugin-runtime/react';
import { useHostServices } from './HostContext';
import { SurfaceMount } from './SurfaceMount';
const schema = { type: 'object', properties: { node: { type: 'string' }, value: { type: 'integer' } }, required: ['node','value'], additionalProperties: false };
export const uiFixtureInstallations = ['ui-a','ui-b','ui-c'].map(owner => validateRestrictedInstallRecord({
  manifest: { id: owner, version: '1.0.0', entry: `/plugins/${owner}/1.0.0/`, hostApi: 'kubesphere.console@1', requires: [UI_OVERLAY_CAPABILITY], provides: [], permissions: ['ui.overlay'], surfaces: [{ id: 'main' }, { id: 'dialog' }],
    extensionPoints: owner === 'ui-c' ? [] : [{ id: owner === 'ui-a' ? 'details' : 'children', kind: 'surface', contractMajor: 1, contextSchema: schema }],
    contributions: { extensions: owner === 'ui-a' ? [] : [{ id: `${owner}-card`, kind: 'surface', surfaceId: 'main', order: 0, point: { ownerPluginId: owner === 'ui-b' ? 'ui-a' : 'ui-b', id: owner === 'ui-b' ? 'details' : 'children', contractMajor: 1 } }] },
  }, config: { id: owner, version: '1.0.0', enabled: true, grantedPermissions: ['ui.overlay'] },
}, { isEntryAllowed: entry => entry.startsWith('/plugins/') }));
function LocalCard() {
  const context = useSurfaceContext(); const [failed, setFailed] = useState(false);
  if (failed) throw Error('Builtin fixture render failure');
  return <section data-testid="ui-local">Local card: {JSON.stringify(context?.value)}<button onClick={() => setFailed(true)}>Crash Local</button></section>;
}
export const uiFixtureBuiltin: PluginDefinition = { id: 'ui-local', version: '1.0.0', requires: [], provides: [], activate(context) {
  context.contributions.registerSurface({ id: 'card', target: { kind: 'builtin', render: LocalCard } });
  context.contributions.registerExtension({ id: 'local-card', kind: 'surface', surfaceId: 'card', order: 10, point: { ownerPluginId: 'ui-a', id: 'details', contractMajor: 1 } });
} };
export function UiCompositionFixture() {
  const { ui, adapter } = useHostServices(); const [snapshot, setSnapshot] = useState(() => ui.core.inspect());
  useEffect(() => ui.core.subscribe(() => setSnapshot(ui.core.inspect())), [ui]);
  const [shown, setShown] = useState(true);
  return <><h1>UI composition acceptance</h1><button onClick={() => setShown(value => !value)}>Toggle A page</button>{shown && <SurfaceMount adapter={adapter} pluginId="ui-a" target={{ kind: 'sandbox-surface', surfaceId: 'main' }} mountPointId="ui-fixture-root" testId="ui-root" label="A page" autoMount />}<pre data-testid="ui-inspection">{JSON.stringify(snapshot)}</pre><pre data-testid="ui-instances">{JSON.stringify(adapter.listInstances().map(i => ({ ...i.identity, state: i.state.state, session: i.bridgeSession })))}</pre></>;
}
