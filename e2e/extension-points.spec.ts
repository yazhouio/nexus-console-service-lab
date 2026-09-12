import { expect, test } from '@playwright/test';

test('host-owned extension points are discoverable and the demo plugin registers against them', async ({ page }) => {
  await page.goto('/extensions');
  await expect(page.getByRole('heading', { name: 'Extension points', exact: true })).toBeVisible();
  await expect(page.getByText('9 fixed points')).toBeVisible();
  await expect(page.getByText('6 examples')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy console-core/routes' })).toBeVisible();
  await expect(page.getByText('The host publishes a finite set of typed points.')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Open Extension Demo' }).click();
  await expect(page.getByRole('heading', { name: 'Extension Demo', exact: true })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Demo preferences', exact: true })).toBeVisible();

  await page.goto('/clusters/demo/nodes/n1/events');
  await expect(page.getByRole('button', { name: 'Check node health', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Node health checks', exact: true })).toBeVisible();
  await expect(page.getByText('ResourceRef accepted', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo tab mounted for n1 through the typed ResourceRef context.')).toBeVisible();
});
