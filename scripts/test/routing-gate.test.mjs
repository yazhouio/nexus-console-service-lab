import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routingBuildSettings, assertReleaseEvidence, configDigest } from '../routing-gate.ts';

const config = { environment: 'production', origin: 'https://console.example.test', buildVersion: 'build-1', configRevision: 'fallback-2', contributionContractVersion: 2,
  deepLinks: [{ path: '/clusters/demo/nodes/n1', routeId: 'node-detail', params: { cluster: 'demo', node: 'n1' } }],
  resources: ['api', 'plugin', 'javascript', 'stylesheet'].flatMap(kind => [false, true].map(missing => ({ kind, missing, path: `/${kind}/${missing}`, status: missing ? 404 : 200, contentType: kind === 'api' ? 'application/json' : 'text/plain' }))),
  performancePaths: { initial: '/clusters/demo/nodes/n1', params: '/clusters/demo/nodes/n2', query: '/clusters/demo/nodes/n2?q=1', exit: '/', routeId: 'node-detail' },
  performanceBudget: { minimumSamples: 20, visibleP95Ms: 2000, loadingP95Ms: 100, },
};
const evidence = () => ({ schemaVersion: 1, passed: true, configDigest: configDigest(config), environment: config.environment, origin: config.origin, buildVersion: config.buildVersion, configRevision: config.configRevision, checkedAt: new Date().toISOString(), checks: [...config.deepLinks.flatMap(d => ['open', 'refresh'].map(action => ({ path: d.path, action, passed: true }))), ...config.resources.map(r => ({ path: r.path, kind: r.kind, missing: r.missing, passed: true }))], performance: { accepted: true, configDigest: configDigest(config) } });

test('production routing is enabled by default while release evidence remains enforceable', () => {
  const production = routingBuildSettings({ NODE_ENV: 'production' });
  assert.equal(production.enabled, true);
  assert.equal(production.buildVersion, 'production');
  assert.throws(() => routingBuildSettings({ NODE_ENV: 'production', NEXUS_REQUIRE_ROUTING_EVIDENCE: 'true' }), /evidence|config/i);
  assert.doesNotThrow(() => assertReleaseEvidence(config, evidence()));
  for (const change of [{ passed: false }, { buildVersion: 'old-build' }, { configRevision: 'old-config' }, { configDigest: 'different' }, { checks: [] }, { performance: { accepted: false } }, { checkedAt: '2000-01-01' }]) {
    assert.throws(() => assertReleaseEvidence(config, { ...evidence(), ...change }));
  }
});

test('validation builds are explicitly separated from release output', () => {
  const settings = routingBuildSettings({ NODE_ENV: 'production', NEXUS_ROUTING_VALIDATION: 'true' });
  assert.equal(settings.enabled, true);
  assert.equal(settings.output, 'dist-validation');
  assert.equal(settings.validation, true);
});
