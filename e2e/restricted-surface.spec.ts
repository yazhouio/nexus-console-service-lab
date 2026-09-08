import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/__fixtures__/surfaces');
  await expect(page.getByTestId('runtime-state')).toContainText('READY');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
}

async function mount(page: Page) {
  await page.getByRole('button', { name: 'Open KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  await expect(page.getByTestId('restricted-surface')).toHaveAttribute('data-bridge-state', 'CONNECTED');
}

test('loads on demand, calls Unary Bridge, documents cooperative isolation, and cleans up', async ({ page }) => {
  const pluginRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/plugins/kubeeye/')) pluginRequests.push(request.url());
  });
  await ready(page);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('wujie-app')).toHaveCount(0);
  expect(pluginRequests).toEqual([]);

  await mount(page);
  expect(pluginRequests.length).toBeGreaterThan(0);
  await expect(page.locator('iframe')).toHaveCount(1);
  // This is explicitly cooperative isolation, not a hostile-code boundary.
  await expect(page.getByTestId('restricted-surface')).toHaveAttribute('data-parent-accessible', 'true');
  await page.getByRole('button', { name: 'Read current cluster' }).click();
  await expect(page.getByTestId('current-cluster')).toHaveText('demo-cluster');

  const firstName = await page.locator('wujie-app').getAttribute('data-wujie-id');
  const props = await page.evaluate(() => {
    const child = document.querySelector('iframe')?.contentWindow as (Window & {
      $wujie?: { props?: Record<string, unknown> };
    }) | null;
    return child?.$wujie?.props;
  });
  expect(Object.keys(props ?? {}).sort()).toEqual(['bridge', 'plugin', 'surface']);
  expect(Object.keys((props?.bridge ?? {}) as object).sort()).toEqual(['nonce', 'protocolVersion', 'surfaceInstanceId']);

  await page.getByRole('button', { name: 'Close KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('UNMOUNTED');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('wujie-app')).toHaveCount(0);

  await mount(page);
  expect(await page.locator('wujie-app').getAttribute('data-wujie-id')).not.toBe(firstName);
  await page.getByRole('button', { name: 'Read current cluster' }).click();
  await expect(page.getByTestId('current-cluster')).toHaveText('demo-cluster');
});

test('artifact failure affects the Surface only', async ({ page }) => {
  await ready(page);
  await page.route('**/plugins/kubeeye/1.0.0/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.getByRole('button', { name: 'Open KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await expect(page.getByTestId('failure-stage')).toHaveText('artifact');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await expect(page.getByTestId('runtime-state')).toContainText('READY');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('UNMOUNTED');
});

test('closing during artifact loading cannot resurrect a late instance', async ({ page }) => {
  await ready(page);
  let release: () => void = () => undefined;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/plugins/kubeeye/1.0.0/', async route => {
    await delayed;
    await route.continue().catch(() => undefined);
  });
  await page.getByRole('button', { name: 'Open KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTING');
  await expect(page.locator('iframe')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close KubeEye Surface' }).click();
  release();
  await expect(page.getByTestId('surface-state')).toHaveText('UNMOUNTED');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('wujie-app')).toHaveCount(0);
});

test('runtime rendering errors are local and dispose the Surface resources', async ({ page }) => {
  await ready(page);
  await mount(page);
  await page.evaluate(() => {
    const child = document.querySelector('iframe')?.contentWindow;
    child?.dispatchEvent(new ErrorEvent('error', { message: 'fixture render failure' }));
  });
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await expect(page.getByTestId('failure-stage')).toHaveText('render');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('wujie-app')).toHaveCount(0);
});

test('mounts Route and Extension independently, isolates failure, and unmounts in reverse order', async ({ page }) => {
  await ready(page);
  await mount(page);
  await page.getByRole('button', { name: 'Open KubeEye Card' }).click();
  await expect(page.getByTestId('extension-state-kubeeye')).toHaveText('MOUNTED');
  const route = page.getByTestId('surface-container');
  const card = page.getByTestId('extension-container');
  await expect(page.locator('iframe')).toHaveCount(2);
  await expect(page.locator('wujie-app')).toHaveCount(2);
  await route.getByRole('button', { name: 'Read current cluster' }).click();
  await card.getByRole('button', { name: 'Read current cluster' }).click();
  await expect(route.getByTestId('current-cluster')).toHaveText('demo-cluster');
  await expect(card.getByTestId('current-cluster')).toHaveText('demo-cluster');
  const props = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(iframe => {
    const child = iframe.contentWindow as Window & { $wujie?: { props: { bridge: { surfaceInstanceId: string }; surface: { initialParameters: unknown; layout: unknown } } } };
    return child.$wujie?.props;
  }));
  expect(new Set(props.map(props => props?.bridge.surfaceInstanceId)).size).toBe(2);
  expect(props.map(props => props?.surface.initialParameters)).toEqual([{ view: 'route' }, undefined]);
  expect(props.map(props => props?.surface.layout)).toEqual([{ width: 'full' }, undefined]);

  await page.evaluate(() => document.querySelector('iframe')?.contentWindow?.dispatchEvent(new ErrorEvent('error', { message: 'route failed' })));
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await expect(page.getByTestId('extension-state-kubeeye')).toHaveText('MOUNTED');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await card.getByRole('button', { name: 'Read current cluster' }).click();
  await expect(card.getByTestId('current-cluster')).toHaveText('demo-cluster');
  await page.getByRole('button', { name: 'Close KubeEye Card' }).click();
  await expect(page.getByTestId('extension-state-kubeeye')).toHaveText('UNMOUNTED');
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await page.getByRole('button', { name: 'Close KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('UNMOUNTED');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('streams Host cluster changes to independent sessions and exposes safe Runtime facts', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('runtime-snapshot')).toBeAttached();
  await mount(page);
  await page.getByRole('button', { name: 'Open KubeEye Card' }).click();
  await expect(page.getByTestId('extension-state-kubeeye')).toHaveText('MOUNTED');
  const route = page.getByTestId('surface-container');
  const card = page.getByTestId('extension-container');
  await route.getByRole('button', { name: 'Watch current cluster' }).click();
  await card.getByRole('button', { name: 'Watch current cluster' }).click();
  await expect(route.getByTestId('watched-cluster')).toHaveText('demo-cluster');
  await expect(card.getByTestId('watched-cluster')).toHaveText('demo-cluster');
  const snapshot = async () => JSON.parse(await page.getByTestId('runtime-snapshot').textContent() ?? '{}');
  await expect.poll(async () => (await snapshot()).plugins.find((plugin: { id: string }) => plugin.id === 'kubeeye').surfaces[0].instances.map((instance: { bridgeSession?: { subscriptionCount: number } }) => instance.bridgeSession?.subscriptionCount ?? 0)).toEqual([1, 1]);
  await page.getByRole('button', { name: 'Switch Host cluster' }).click();
  await expect(route.getByTestId('watched-cluster')).toHaveText('second-cluster');
  await expect(card.getByTestId('watched-cluster')).toHaveText('second-cluster');
  await route.getByRole('button', { name: 'Stop watching' }).click();
  await page.getByRole('button', { name: 'Switch Host cluster' }).click();
  await expect(card.getByTestId('watched-cluster')).toHaveText('demo-cluster');
  await expect(route.getByTestId('watched-cluster')).toHaveText('second-cluster');
  await page.evaluate(() => document.querySelector('iframe')?.contentWindow?.dispatchEvent(new ErrorEvent('error', { message: 'Bearer secret-token' })));
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await expect.poll(async () => (await snapshot()).plugins.find((plugin: { id: string }) => plugin.id === 'kubeeye').surfaces[0].instances.length).toBe(1);
  await expect.poll(async () => (await snapshot()).ui.scopes.find((scope: { owner: string; kind: string }) => scope.owner === 'kubeeye' && scope.kind === 'root')?.execution.phase).toBe('failed');
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(JSON.stringify(await snapshot())).not.toContain('secret-token');
  const audit = await page.getByTestId('bridge-audit').textContent();
  expect(audit).toContain('unsubscribe');
  expect(audit).not.toContain('payload');
});

test('keeps mounted runtime unchanged until configuration Reload', async ({ page }) => {
  await ready(page);
  await mount(page);
  await expect(page.getByRole('button', { name: 'Install KubeEye 2.0.0' })).toBeVisible();
  await page.getByRole('button', { name: 'Install KubeEye 2.0.0' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await expect(page.getByTestId('runtime-plugin-version-kubeeye')).toHaveText('1.0.0');
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByTestId('runtime-plugin-version-kubeeye')).toHaveText('2.0.0');
  await mount(page);
  await page.getByRole('button', { name: 'Roll back to 1.0.0' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await expect(page.getByTestId('runtime-plugin-version-kubeeye')).toHaveText('2.0.0');
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByTestId('runtime-plugin-version-kubeeye')).toHaveText('1.0.0');
  await page.getByRole('button', { name: 'Disable KubeEye' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('MISSING');
  await page.getByRole('button', { name: 'Enable KubeEye' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('MISSING');
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await page.getByRole('button', { name: 'Uninstall KubeEye' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('MISSING');
  await page.getByRole('button', { name: 'Install KubeEye 1.0.0' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('MISSING');
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
});

test('Bridge grants do not authorize same-origin network access; the Backend enforces its own permissions', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'fixture-session', value: 'reader', url: baseURL! }]);
  await ready(page);
  await page.getByRole('button', { name: 'Disable KubeEye' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await page.getByRole('button', { name: 'Enable KubeEye' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await page.evaluate(() => {
    const key = 'nexus.plugin-installations.v1';
    const saved = JSON.parse(localStorage.getItem(key)!);
    for (const record of saved.records) record.config.grantedPermissions = [];
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await mount(page);
  await page.getByRole('button', { name: 'Read current cluster' }).click();
  await expect(page.getByTestId('current-cluster')).toHaveText('PERMISSION_DENIED');
  const network = await page.evaluate(async () => {
    const child = document.querySelector('iframe')!.contentWindow!;
    const allowed = await child.fetch('/api/clusters/current', { credentials: 'include' });
    const denied = await child.fetch('/api/admin/clusters', { credentials: 'include' });
    return { allowed: allowed.status, denied: denied.status, body: await denied.json() };
  });
  expect(network).toEqual({ allowed: 200, denied: 403, body: { code: 'BACKEND_PERMISSION_DENIED' } });
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
});
