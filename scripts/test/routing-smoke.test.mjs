import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertResourceResponse } from '../routing-smoke.mjs';

test('detects fallback rewrites even for a plugin artifact expecting HTML', () => {
  const expected = { kind: 'plugin', status: 200, contentType: 'text/html' };
  assert.doesNotThrow(() => assertResourceResponse(expected, { status: 200, contentType: 'text/html; charset=utf-8', body: '<html><div>plugin</div></html>' }));
  assert.throws(() => assertResourceResponse(expected, { status: 200, contentType: 'text/html', body: '<html><head><meta name="nexus-host" content="true"></head></html>' }), /rewritten/);
  assert.throws(() => assertResourceResponse({ kind: 'javascript', status: 404, contentType: 'text/plain' }, { status: 200, contentType: 'text/html', body: '<html>Fallback</html>' }), /status/);
});
