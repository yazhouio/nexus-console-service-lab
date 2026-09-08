import { Slot } from '@nexus/plugin-runtime/react';
import { SETTINGS_SECTIONS_POINT } from '@nexus/console-core-api';
import { PluginConfiguration } from './PluginConfiguration';
export function Settings() {
  return <div className="nexus-page"><div className="nexus-page-heading"><div><span className="nexus-kicker">WORKSPACE</span><h1>Settings</h1><p>Manage plugin installation and host-owned configuration sections.</p></div></div><PluginConfiguration /><section className="nexus-section-block" aria-label="Plugin settings"><div className="nexus-section-heading"><div><span className="nexus-kicker">PLUGIN SETTINGS</span><h2>Contributed sections</h2></div><span className="nexus-muted">Bounded surface slots</span></div><Slot id={SETTINGS_SECTIONS_POINT.id} contextKey="settings" context={{}} sizing={{ mode: 'bounded', minHeight: 100, maxHeight: 600 }} /></section></div>;
}
