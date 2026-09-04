import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsNode } from '../check-node-version.mjs';

test('Node gate accepts the exact minimum and later releases, rejects unsupported actual versions', () => {
  for (const version of ['22.22.0', '22.22.1', '24.14.1']) assert.equal(supportsNode(version), true, version);
  for (const version of ['22.21.9', '22.12.0', '20.20.0', 'garbage', '22.22.0-rc.1']) assert.equal(supportsNode(version), false, version);
});

test('CLI exits nonzero for an unsupported runtime and succeeds on the current supported runtime', async () => {
  const { spawnSync } = await import('node:child_process');
  const cli = new URL('../check-node-version.mjs', import.meta.url).pathname;
  assert.equal(spawnSync(process.execPath, [cli]).status, 0);
  // Simulate the runtime version at the process boundary; exercise the actual CLI exit path.
  const setup = 'data:text/javascript,' + encodeURIComponent('Object.defineProperty(process.versions, "node", {value: "22.21.0"});');
  const unsupported = spawnSync(process.execPath, ['--import', setup, cli], { encoding: 'utf8' });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /actual Node is 22.21.0/);
});
