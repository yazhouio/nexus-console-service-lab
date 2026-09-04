import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredNodeRange, supportsNode } from '../check-node-version.mjs';

test('Node gate accepts supported Node 24 releases and rejects other majors or older patches', () => {
  for (const version of ['24.14.1', '24.14.2', '24.20.0']) assert.equal(supportsNode(version), true, version);
  for (const version of ['24.14.0', '23.14.1', '25.0.0', 'garbage', '24.14.1-rc.1']) assert.equal(supportsNode(version), false, version);
  assert.equal(requiredNodeRange, '>=24.14.1 <25');
});

test('CLI exits nonzero for an unsupported runtime and succeeds on the current supported runtime', async () => {
  const { spawnSync } = await import('node:child_process');
  const cli = new URL('../check-node-version.mjs', import.meta.url).pathname;
  assert.equal(spawnSync(process.execPath, [cli]).status, 0);
  // Simulate the runtime version at the process boundary; exercise the actual CLI exit path.
  const setup = 'data:text/javascript,' + encodeURIComponent('Object.defineProperty(process.versions, "node", {value: "25.0.0"});');
  const unsupported = spawnSync(process.execPath, ['--import', setup, cli], { encoding: 'utf8' });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /actual Node is 25.0.0/);
});
