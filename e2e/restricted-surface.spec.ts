import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('runtime-state')).toContainText('READY');
  await expect(page.getByTestId('plugin-state')).toHaveText('ACTIVE');
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
  await expect(page.getByTestId('surface-state')).toHaveText('FAILED');
  await expect(page.getByTestId('failure-stage')).toHaveText('artifact');
  await expect(page.getByTestId('plugin-state')).toHaveText('ACTIVE');
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
  await expect(page.getByTestId('surface-state')).toHaveText('FAILED');
  await expect(page.getByTestId('failure-stage')).toHaveText('render');
  await expect(page.getByTestId('plugin-state')).toHaveText('ACTIVE');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('wujie-app')).toHaveCount(0);
});
