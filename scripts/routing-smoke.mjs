import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertReleaseEvidence, configDigest, validateReleaseConfig } from './routing-gate.ts';
import { measureRouting } from './measure-routing.mjs';

export function assertResourceResponse(expected, response) {
  if (response.status !== expected.status)
    throw new Error(`Unexpected resource status for ${expected.kind}: ${response.status}`);
  if (
    response.contentType.split(';')[0].trim().toLowerCase() !== expected.contentType.toLowerCase()
  )
    throw new Error(`Unexpected content type for ${expected.kind}`);
  if (/<meta\b[^>]*name=["']nexus-host["']/i.test(response.body))
    throw new Error(`${expected.kind} was rewritten to Host HTML`);
}

export async function verifyTarget(config) {
  validateReleaseConfig(config);
  const evidence = {
    schemaVersion: 1,
    passed: false,
    configDigest: configDigest(config),
    environment: config.environment,
    origin: config.origin,
    buildVersion: config.buildVersion,
    configRevision: config.configRevision,
    checkedAt: new Date().toISOString(),
    checks: [],
    performance: { accepted: false, configDigest: configDigest(config) },
  };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ storageState: process.env.ROUTING_STORAGE_STATE });
    for (const link of config.deepLinks) {
      for (const action of ['open', 'refresh']) {
        const response =
          action === 'open' ? await page.goto(config.origin + link.path) : await page.reload();
        if (
          !response ||
          response.status() !== 200 ||
          !response.headers()['content-type']?.includes('text/html')
        )
          throw new Error('Deep link did not return the Host entry');
        await page.getByTestId('runtime-state').filter({ hasText: 'READY' }).waitFor();
        if (
          (await page.locator('meta[name="nexus-build"]').getAttribute('content')) !==
          config.buildVersion
        )
          throw new Error('Target is running a different build');
        const route = page.locator('[data-route-id]').filter({ visible: true });
        await route.first().waitFor();
        const matched = await route.evaluateAll((elements) =>
          elements.map((element) => ({
            routeId: element.getAttribute('data-route-id'),
            params: JSON.parse(element.getAttribute('data-route-params') ?? '{}'),
          })),
        );
        if (
          !matched.some(
            (m) =>
              m.routeId === link.routeId &&
              Object.entries(link.params).every(([name, value]) => m.params[name] === value),
          )
        )
          throw new Error('Deep link matched the wrong route or parameters');
        if (await page.getByTestId('surface-state').count())
          await page.getByTestId('surface-state').filter({ hasText: 'MOUNTED' }).waitFor();
        evidence.checks.push({ path: link.path, action, passed: true });
      }
    }
    for (const resource of config.resources) {
      const response = await page.request.get(new URL(resource.path, config.origin).href, {
        maxRedirects: 0,
        headers: { accept: resource.contentType },
        timeout: 15000,
      });
      assertResourceResponse(resource, {
        status: response.status(),
        contentType: response.headers()['content-type'] ?? '',
        body: await response.text(),
      });
      evidence.checks.push({
        path: resource.path,
        kind: resource.kind,
        missing: resource.missing,
        passed: true,
      });
    }
  } finally {
    await browser.close();
  }
  const performance = await measureRouting({
    origin: config.origin,
    paths: config.performancePaths,
    samples: config.performanceBudget.minimumSamples,
    budget: config.performanceBudget,
    digest: configDigest(config),
  });
  if (performance.buildVersion !== config.buildVersion)
    throw new Error('Measured a different build');
  evidence.performance = performance;
  evidence.passed = true;
  evidence.checkedAt = new Date().toISOString();
  assertReleaseEvidence(config, evidence);
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, output = 'routing-release-evidence.json'] = process.argv.slice(2);
  if (!file) throw new Error('Usage: pnpm routing:smoke <target-config.json> <evidence.json>');
  // A failure exits nonzero and never writes a passing evidence file.
  const evidence = await verifyTarget(JSON.parse(await readFile(file, 'utf8')));
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Target routing gate passed; evidence: ${output}`);
}
