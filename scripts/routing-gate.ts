import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface RoutingReleaseConfig {
  environment: string;
  origin: string;
  buildVersion: string;
  configRevision: string;
  contributionContractVersion: 2;
  deepLinks: { path: string; routeId: string; params: Record<string, string> }[];
  resources: { kind: 'api' | 'plugin' | 'javascript' | 'stylesheet'; missing: boolean; path: string; status: number; contentType: string }[];
  performancePaths: { initial: string; params: string; query: string; exit: string; routeId: string };
  performanceBudget: { minimumSamples: number; visibleP95Ms: number; loadingP95Ms: number };
}
export interface RoutingReleaseEvidence {
  schemaVersion: 1;
  passed: boolean;
  configDigest: string;
  environment: string;
  origin: string;
  buildVersion: string;
  configRevision: string;
  checkedAt: string;
  checks: { path: string; action?: string; kind?: string; missing?: boolean; passed: boolean }[];
  performance: { accepted: boolean; configDigest: string };
}
export function configDigest(config: RoutingReleaseConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}
function requireGate(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`Routing release gate: ${reason}`);
}
export function validateReleaseConfig(config: RoutingReleaseConfig): void {
  requireGate(config.environment && config.environment !== 'local-validation', 'a target environment is required');
  const origin = new URL(config.origin);
  requireGate(origin.origin === config.origin && origin.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname), 'a real HTTPS target origin is required');
  requireGate(config.buildVersion && config.configRevision && config.contributionContractVersion === 2, 'build/config/contract versions are required');
  requireGate(Array.isArray(config.deepLinks) && config.deepLinks.length > 0, 'a real nested deep link is required');
  for (const link of config.deepLinks) requireGate(link.path.startsWith('/') && !link.path.startsWith('//') && link.path.split('/').length >= 4 && link.routeId && Object.keys(link.params).length > 0, 'deep links must include a nested route and expected parameters');
  for (const kind of ['api', 'plugin', 'javascript', 'stylesheet']) for (const missing of [false, true]) {
    requireGate(config.resources?.some(r => r.kind === kind && r.missing === missing), `missing ${kind} ${missing ? '404' : 'success'} check`);
  }
  for (const resource of config.resources) requireGate(resource.path.startsWith('/') && !resource.path.startsWith('//') && resource.contentType && Number.isInteger(resource.status) && resource.status >= (resource.missing ? 400 : 200) && resource.status <= (resource.missing ? 599 : 299), 'invalid resource expectation');
  requireGate(config.performancePaths && ['initial', 'params', 'query', 'exit'].every(key => { const path = config.performancePaths[key as 'initial']; return typeof path === 'string' && new URL(path, config.origin).origin === config.origin && path.startsWith('/'); }) && config.performancePaths.routeId, 'performance workload paths are required');
  requireGate(config.performanceBudget?.minimumSamples >= 20 && Number.isFinite(config.performanceBudget.visibleP95Ms) && config.performanceBudget.visibleP95Ms > 0 && Number.isFinite(config.performanceBudget.loadingP95Ms) && config.performanceBudget.loadingP95Ms > 0, 'explicit performance budgets and at least 20 samples per scenario are required');
}
export function assertReleaseEvidence(config: RoutingReleaseConfig, evidence: RoutingReleaseEvidence): void {
  validateReleaseConfig(config);
  requireGate(evidence.schemaVersion === 1 && evidence.passed === true, 'target smoke did not pass');
  for (const field of ['environment', 'origin', 'buildVersion', 'configRevision'] as const) requireGate(config[field] === evidence[field], `${field} differs from target evidence`);
  requireGate(evidence.configDigest === configDigest(config), 'target config differs from evidence');
  const age = Date.now() - Date.parse(evidence.checkedAt);
  requireGate(Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000, 'evidence must be generated in the last 24 hours');
  requireGate(evidence.performance?.accepted === true && evidence.performance.configDigest === configDigest(config), 'target performance acceptance is missing');
  for (const link of config.deepLinks) for (const action of ['open', 'refresh']) requireGate(evidence.checks?.some(c => c.path === link.path && c.action === action && c.passed), `missing deep-link ${action} result`);
  for (const resource of config.resources) requireGate(evidence.checks?.some(c => c.path === resource.path && c.kind === resource.kind && c.missing === resource.missing && c.passed), 'missing resource response result');
}

export function routingBuildSettings(env: Record<string, string | undefined>) {
  const development = env.NODE_ENV !== 'production';
  const validation = !development && env.NEXUS_ROUTING_VALIDATION === 'true';
  let enabled = development || validation;
  let buildVersion = env.NEXUS_BUILD_VERSION ?? (development ? 'development' : 'routing-disabled');
  if (!development && !validation && env.NEXUS_ENABLE_ROUTING === 'true') {
    requireGate(env.NEXUS_ROUTING_CONFIG && env.NEXUS_ROUTING_EVIDENCE, 'target config and evidence files are required');
    const config = JSON.parse(readFileSync(env.NEXUS_ROUTING_CONFIG, 'utf8')) as RoutingReleaseConfig;
    const evidence = JSON.parse(readFileSync(env.NEXUS_ROUTING_EVIDENCE, 'utf8')) as RoutingReleaseEvidence;
    assertReleaseEvidence(config, evidence);
    requireGate(env.NEXUS_BUILD_VERSION === config.buildVersion, 'release build version must match tested candidate');
    enabled = true; buildVersion = config.buildVersion;
  }
  return { enabled, validation, output: validation ? 'dist-validation' : 'dist', buildVersion,
    fixtures: (development || validation) && env.NEXUS_TEST_FIXTURES === 'true' };
}
