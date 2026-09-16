import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePreparedBuiltins } from '../../packages/browser-host/src/prepare-builtins.ts';
const plugin = (id) => ({ id, version: '1.0.0', requires: [], provides: [], activate() {} });
const failure = {
  id: 'remote',
  version: '1.0.0',
  entry: 'https://cdn.test/v1/remoteEntry.js',
  stage: 'timeout',
  reason: 'timeout',
};
test('unloaded selections reserve IDs without becoming Runtime candidates', () => {
  const prepared = mergePreparedBuiltins(
    [plugin('core')],
    {},
    { builtins: [], builtinCss: {}, failures: [failure] },
  );
  assert.deepEqual(
    prepared.builtins.map((p) => p.id),
    ['core'],
  );
  const records = ['core', 'remote', 'other'].map((id) => ({ manifest: { id, version: '1.0.0' } }));
  const { installed, conflicts } = prepared.filterInstallations(records);
  assert.deepEqual(
    installed.map((r) => r.manifest.id),
    ['other'],
  );
  assert.deepEqual(
    conflicts.map((r) => r.id),
    ['core', 'remote'],
  );
  assert.ok(Object.isFrozen(prepared.failures[0]));
  assert.notEqual(prepared.failures[0], failure);
});
test('duplicates fail across local, loaded and unloaded Builtin selections', () => {
  for (const remote of [
    { builtins: [plugin('core')], failures: [] },
    { builtins: [], failures: [{ ...failure, id: 'core' }] },
  ]) {
    assert.throws(
      () => mergePreparedBuiltins([plugin('core')], {}, { ...remote, builtinCss: {} }),
      /Duplicate Builtin/,
    );
  }
});
