import { expect, test } from '@playwright/test';

test('navigates uniformly through history, deep links, refresh and 404', async ({ page }) => {
  await page.goto('/clusters/current');
  await expect(page.getByRole('heading', { name: 'Cluster Overview', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cluster Overview', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'KubeEye', exact: true }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Cluster Overview', exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  await page.goto('/unknown-page');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Frontend Plugin Runtime' })).toBeVisible();
});

async function navigate(page: import('@playwright/test').Page, path: string) {
  await page.evaluate(path => { window.history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
}
async function instance(page: import('@playwright/test').Page) {
  return page.locator('wujie-app').getAttribute('data-wujie-id');
}

test('preserves parent Layout state while changing siblings and remounting only the leaf context', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Install KubeEye 2.0.0' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await page.reload();
  await page.goto('/clusters/demo/nodes/n1/alert-messages');
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  await page.getByRole('button', { name: 'Toggle node details' }).click();
  const first = await instance(page);
  const context = () => page.evaluate(() => (document.querySelector('iframe')?.contentWindow as Window & { $wujie: { props: { routeContext: unknown } } }).$wujie.props.routeContext);
  expect(await context()).toEqual({ routeId: 'node-alert-messages', pathname: '/clusters/demo/nodes/n1/alert-messages', params: { cluster: 'demo', node: 'n1' }, search: '' });
  await page.getByRole('navigation', { name: 'Node tabs' }).getByRole('link', { name: 'Events' }).click();
  await expect(page.getByRole('heading', { name: 'Node events' })).toBeVisible();
  await expect(page.getByTestId('node-details')).toHaveText('Cluster: demo');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Node tabs' }).getByRole('link', { name: 'Alerts' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  expect(await instance(page)).not.toBe(first);
  const beforeHash = await instance(page);
  await navigate(page, '/clusters/demo/nodes/n1/alert-messages#detail');
  await expect.poll(() => instance(page)).toBe(beforeHash);
  await page.getByRole('button', { name: 'Read current cluster' }).click();
  expect(await instance(page)).toBe(beforeHash);
  await navigate(page, '/clusters/demo/nodes/n1/alert-messages?severity=high');
  await expect.poll(() => instance(page)).not.toBe(beforeHash);
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  expect(await context()).toMatchObject({ search: '?severity=high' });
  const beforeParams = await instance(page);
  await navigate(page, '/clusters/second/nodes/n2/alert-messages?severity=high');
  await expect(page.getByTestId('node-details')).toHaveText('Cluster: second');
  await expect.poll(() => instance(page)).not.toBe(beforeParams);
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  expect(await context()).toMatchObject({ params: { cluster: 'second', node: 'n2' } });
});

test('shows a retryable Surface error without redirecting or failing plugin bootstrap', async ({ page }) => {
  await page.route('**/plugins/kubeeye/1.0.0/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/kubeeye');
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await expect(page).toHaveURL(/\/kubeeye$/);
  await page.unroute('**/plugins/kubeeye/1.0.0/**');
  await page.getByRole('button', { name: 'Retry Plugin view' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
});

test('leaving during artifact loading cannot resurrect a late Route Surface', async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/plugins/kubeeye/1.0.0/', async route => { await pending; await route.continue().catch(() => {}); });
  await page.goto('/kubeeye');
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTING');
  await page.getByRole('link', { name: 'Cluster Overview', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'Cluster Overview', exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('wujie-app')).toHaveCount(0);
});

test('conflicting child diagnostics preserve the parent, siblings, and ACTIVE inspection axis', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Install KubeEye 2.0.0' }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await page.evaluate(() => {
    const key = 'nexus.plugin-installations.v1';
    const snapshot = JSON.parse(localStorage.getItem(key)!);
    const record = snapshot.records.find((r: { manifest: { version: string } }) => r.manifest.version === '2.0.0');
    record.manifest.contributions.routes.push({ id: 'conflicting-alerts', parentRouteId: 'node-detail', point: { ownerPluginId: 'cluster', id: 'node.children', contractMajor: 1 }, path: 'alert-messages', surfaceId: 'overview' });
    localStorage.setItem(key, JSON.stringify(snapshot));
  });
  await page.goto('/clusters/demo/nodes/n1/alert-messages');
  await expect(page.getByRole('heading', { name: 'Node n1', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Route unavailable' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Node tabs' }).getByRole('link', { name: 'Events' }).click();
  await expect(page.getByRole('heading', { name: 'Node events' })).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  const snapshot = JSON.parse(await page.getByTestId('runtime-snapshot').textContent() ?? '{}');
  expect(snapshot.plugins.find((p: { id: string }) => p.id === 'kubeeye').state).toBe('ACTIVE');
  expect(snapshot.contributions.routes.find((r: { id: string }) => r.id === 'node-alert-messages').host).toMatchObject({ state: 'QUARANTINED', diagnostics: [{ code: 'ROUTE_CONFLICT' }] });
});

test('startup failure is distinct from an unmatched URL', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nexus.plugin-installations.v1', 'invalid-json'));
  await page.goto('/not-found');
  await expect(page.getByTestId('runtime-state')).toHaveText('FAILED');
  await expect(page.getByRole('heading', { name: 'Runtime startup failed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0);
});
