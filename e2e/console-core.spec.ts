import { expect, test } from '@playwright/test';

test('Builtin layouts execute in managed scopes and retain their scope and state across child routes', async ({ page }) => {
  await page.goto('/clusters/demo/nodes/n1/events');
  await expect(page.getByRole('heading', { name: 'Node events' })).toBeVisible();
  const layout = page.locator('[data-managed-presentation="route:node-detail"]');
  await expect(layout).toHaveAttribute('data-execution-phase', 'ready');
  const scope = await layout.getAttribute('data-execution-scope');
  expect(scope).toBeTruthy();
  await page.getByRole('button', { name: 'Toggle node details' }).click();
  await page.evaluate(() => { history.pushState(null, '', '/clusters/demo/nodes/n1'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByTestId('node-details')).toHaveText('Cluster: demo');
  await expect(page.getByRole('heading', { name: 'Node events' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Node tabs' }).getByRole('link', { name: 'Events' }).click();
  await expect(page.getByRole('heading', { name: 'Node events' })).toBeVisible();
  await expect(layout).toHaveAttribute('data-execution-scope', scope!);
  await expect(page.getByTestId('node-details')).toHaveText('Cluster: demo');
});

test('a Console root render failure enters independent recovery without reversing Ready', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-managed-presentation="root-presentation"]')).toHaveAttribute('data-execution-phase', 'ready');
  await page.getByRole('button', { name: 'Crash Console presentation' }).click();
  await expect(page.getByRole('heading', { name: 'Console presentation failed' })).toBeVisible();
  await expect(page.getByTestId('runtime-state')).toHaveText('READY');
  await expect(page.getByRole('button', { name: 'Export diagnostics' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
});

test('independent recovery restores the previous Restricted configuration after an uninstall', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Uninstall KubeEye', exact: true }).click();
  await expect(page.getByTestId('configuration-status')).toContainText('Reload Required');
  await page.getByRole('button', { name: 'Crash Console presentation' }).click();
  await expect(page.getByRole('heading', { name: 'Console presentation failed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable kubeeye and reload', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Roll back kubeeye and reload', exact: true }).click();
  await expect(page.getByTestId('plugin-state-kubeeye')).toHaveText('ACTIVE');
  await expect(page.getByRole('button', { name: 'Uninstall KubeEye', exact: true })).toBeVisible();
});
