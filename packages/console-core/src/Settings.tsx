import { Slot } from '@nexus/plugin-runtime/react';
import { SETTINGS_SECTIONS_POINT } from '@nexus/console-core-api';
import { PluginConfiguration } from './PluginConfiguration';
export function Settings() {
  return (
    <div className="core-el-div core-page">
      <div className="core-el-div core-page-heading">
        <div className="core-el-div">
          <span className="core-el-span core-kicker">WORKSPACE</span>
          <h1 className="core-el-h1">Settings</h1>
          <p className="core-el-p">
            Manage plugin installation and host-owned configuration sections.
          </p>
        </div>
      </div>
      <PluginConfiguration />
      <section className="core-el-section core-section-block" aria-label="Plugin settings">
        <div className="core-el-div core-section-heading">
          <div className="core-el-div">
            <span className="core-el-span core-kicker">PLUGIN SETTINGS</span>
            <h2 className="core-el-h2">Contributed sections</h2>
          </div>
          <span className="core-el-span core-muted">Bounded surface slots</span>
        </div>
        <Slot
          id={SETTINGS_SECTIONS_POINT.id}
          contextKey="settings"
          context={{}}
          sizing={{ mode: 'bounded', minHeight: 100, maxHeight: 600 }}
        />
      </section>
    </div>
  );
}
