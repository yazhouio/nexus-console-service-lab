import { chromium } from '@playwright/test';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { platform, release, arch, cpus } from 'node:os';
import { pathToFileURL } from 'node:url';
import { configDigest, validateReleaseConfig } from './routing-gate.ts';

export async function measureRouting({
  origin,
  paths,
  samples = 20,
  prepareLocalFixture = false,
  budget,
  digest,
}) {
  const browser = await chromium.launch();
  const raw = [];
  let buildVersion;
  let validationBuild;
  try {
    for (let i = 0; i < samples; i++) {
      const context = await browser.newContext({
        storageState: process.env.ROUTING_STORAGE_STATE,
        viewport: { width: 1440, height: 1100 },
      });
      try {
        const page = await context.newPage();
        await page.goto(origin + '/');
        await page.getByTestId('runtime-state').filter({ hasText: 'READY' }).waitFor();
        buildVersion = await page.locator('meta[name="nexus-build"]').getAttribute('content');
        validationBuild = await page
          .locator('meta[name="nexus-validation"]')
          .getAttribute('content');
        if (prepareLocalFixture) {
          if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
            throw new Error('Fixture preparation is limited to localhost.');
          await page.getByRole('button', { name: 'Install KubeEye 2.0.0' }).click();
          await page.reload();
          await page.getByTestId('runtime-state').filter({ hasText: 'READY' }).waitFor();
        }
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        const measure = async (scenario, path) => {
          const sample = await page.evaluate(
            async ({ path, routeId }) => {
              const previous = document.querySelector('wujie-app')?.getAttribute('data-wujie-id');
              for (const phase of ['mount-requested', 'bridge-ready', 'cleanup-complete'])
                performance.clearMarks(`nexus:surface:${phase}`);
              const triggerAt = performance.now();
              history.pushState(null, '', path);
              dispatchEvent(new PopStateEvent('popstate'));
              let loadingAt = null,
                blankFrames = 0,
                loadingFrames = 0;
              return await new Promise((resolve) => {
                const tick = () => {
                  const now = performance.now();
                  const state = document.querySelector(
                    '[data-testid="surface-state"]',
                  )?.textContent;
                  if (state === 'MOUNTING') {
                    loadingAt ??= now;
                    loadingFrames++;
                  }
                  const app = document.querySelector('wujie-app');
                  const content = app?.shadowRoot?.querySelector(
                    '[data-testid="restricted-surface"][data-bridge-state="CONNECTED"]',
                  );
                  const rect = content?.getBoundingClientRect();
                  const visible =
                    rect &&
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.top < innerHeight &&
                    rect.bottom > 0;
                  const changed = app?.getAttribute('data-wujie-id') !== previous;
                  if (
                    state === 'ERROR' ||
                    now - triggerAt > 15000 ||
                    (visible && changed && state === 'MOUNTED')
                  ) {
                    const events = ['mount-requested', 'bridge-ready', 'cleanup-complete'].flatMap(
                      (phase) =>
                        performance
                          .getEntriesByName(`nexus:surface:${phase}`)
                          .filter((e) => e.detail.mountPointId === `route:${routeId}`)
                          .map((e) => ({
                            phase,
                            at: e.startTime,
                            instanceId: e.detail.surfaceInstanceId,
                          })),
                    );
                    resolve({
                      triggerAt,
                      loadingAt,
                      firstVisibleAt: visible && changed ? now : null,
                      visibleMs: visible && changed ? now - triggerAt : null,
                      loadingMs: loadingAt === null ? null : loadingAt - triggerAt,
                      loadingDurationMs: loadingAt === null ? null : now - loadingAt,
                      blankFrames,
                      loadingFrames,
                      events,
                      failed: state === 'ERROR' || !visible,
                      cancelled: false,
                    });
                    return;
                  }
                  if (state && state !== 'MOUNTING' && !visible) blankFrames++;
                  requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
              });
            },
            { path, routeId: paths.routeId },
          );
          raw.push({ scenario, iteration: i + 1, ...sample });
        };
        await measure('first-cold', paths.initial);
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
        await page.evaluate((path) => {
          history.pushState(null, '', path);
          dispatchEvent(new PopStateEvent('popstate'));
        }, paths.exit);
        await page.locator('wujie-app').waitFor({ state: 'detached' });
        await measure('repeat', paths.initial);
        await measure('params', paths.params);
        await measure('query', paths.query);
      } finally {
        await context.close();
      }
    }
    const quantile = (values, p) =>
      values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
    const scenarios = Object.fromEntries(
      ['first-cold', 'repeat', 'params', 'query'].map((name) => {
        const values = raw.filter((s) => s.scenario === name);
        return [
          name,
          {
            samples: values.length,
            failed: values.filter((s) => s.failed).length,
            cancelled: values.filter((s) => s.cancelled).length,
            visibleP50Ms: quantile(
              values.filter((s) => !s.failed).map((s) => s.visibleMs),
              0.5,
            ),
            visibleP95Ms: quantile(
              values.filter((s) => !s.failed).map((s) => s.visibleMs),
              0.95,
            ),
            loadingP95Ms: quantile(
              values.filter((s) => s.loadingMs !== null).map((s) => s.loadingMs),
              0.95,
            ),
            blankFrames: values.reduce((n, s) => n + s.blankFrames, 0),
          },
        ];
      }),
    );
    const accepted = Boolean(
      budget &&
      samples >= budget.minimumSamples &&
      Object.values(scenarios).every(
        (s) =>
          !s.failed &&
          !s.cancelled &&
          s.visibleP95Ms !== null &&
          s.visibleP95Ms <= budget.visibleP95Ms &&
          s.loadingP95Ms !== null &&
          s.loadingP95Ms <= budget.loadingP95Ms &&
          s.blankFrames === 0,
      ),
    );
    return {
      schemaVersion: 1,
      measuredAt: new Date().toISOString(),
      origin,
      buildVersion,
      validationBuild,
      configDigest: digest,
      accepted,
      budget: budget ?? null,
      interpretation: budget
        ? 'Empirical p50/p95 for the recorded workload; acceptance is limited to this environment and budget.'
        : 'Local characterization only. No production experience budget has been approved; empirical percentiles are not stable population estimates.',
      environment: {
        platform: platform(),
        osRelease: release(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        browser: await browser.version(),
        viewport: '1440x1100',
        network: 'No browser throttling; transport to the recorded origin',
        cache:
          'Fresh browser context per iteration, cold phase with browser cache disabled; repeated/params/query phases with browser cache enabled and warm Wujie script cache.',
      },
      scenarios,
      raw,
    };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [configPath, output = 'routing-performance.json'] = process.argv.slice(2);
  let options;
  if (configPath === '--local')
    options = {
      origin: 'http://127.0.0.1:3200',
      prepareLocalFixture: true,
      paths: {
        initial: '/clusters/demo/nodes/n1/alert-messages',
        params: '/clusters/demo/nodes/n2/alert-messages',
        query: '/clusters/demo/nodes/n2/alert-messages?severity=high',
        exit: '/clusters/current',
        routeId: 'node-alert-messages',
      },
    };
  else {
    if (!configPath)
      throw new Error('Usage: pnpm routing:measure <target-config.json|--local> <output.json>');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    validateReleaseConfig(config);
    options = {
      origin: config.origin,
      paths: config.performancePaths,
      samples: config.performanceBudget.minimumSamples,
      budget: config.performanceBudget,
      digest: configDigest(config),
    };
  }
  const report = await measureRouting(options);
  if (configPath === '--local') {
    const hash = createHash('sha256');
    for (const root of ['apps/console/dist-validation', 'apps/example-restricted-plugin/dist']) {
      for (const file of (await readdir(root, { recursive: true, withFileTypes: true }))
        .filter((file) => file.isFile())
        .sort((a, b) => (a.parentPath + a.name).localeCompare(b.parentPath + b.name))) {
        hash.update(file.parentPath + '/' + file.name);
        hash.update(await readFile(file.parentPath + '/' + file.name));
      }
    }
    report.provenance = {
      baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      worktreeChanges: Boolean(
        execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      ),
      artifactSha256: hash.digest('hex'),
    };
  }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ output, accepted: report.accepted, scenarios: report.scenarios }, null, 2),
  );
  if (report.raw.some((sample) => sample.failed) || (options.budget && !report.accepted))
    process.exitCode = 1;
}
