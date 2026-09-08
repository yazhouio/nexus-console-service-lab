import { Slot } from '@nexus/plugin-runtime/react';
import { SETTINGS_SECTIONS_POINT } from '@nexus/console-core-api';
import { PluginConfiguration } from './PluginConfiguration';
export function Settings() {
  return <><h1>Settings</h1><PluginConfiguration /><section aria-label="Plugin settings"><Slot id={SETTINGS_SECTIONS_POINT.id} contextKey="settings" context={{}} sizing={{ mode: 'bounded', minHeight: 100, maxHeight: 600 }} /></section></>;
}
