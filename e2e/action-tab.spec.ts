import { expect, test } from '@playwright/test';

test('Action-only Restricted execution uses the authorized capability session and cleans up after completion and cancel', async ({
  page,
}) => {
  await page.goto('/clusters/demo/nodes/n1/events');
  await page.getByRole('button', { name: 'Check node context' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Action succeeded' })).toBeVisible();
  const result = JSON.parse(await page.getByLabel('Action result').innerText());
  expect(result.context.itemRef).toEqual({
    clusterId: 'demo',
    apiVersion: 'v1',
    kind: 'Node',
    name: 'n1',
  });
  expect(result.current.routeId).toBe('node-events');
  expect(result.current.pathname).toBeUndefined();
  await expect(page.locator('[data-nexus-action]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start slow node check' }).click();
  await expect(page.locator('[data-nexus-action]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cancel action', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Action cancelled' })).toBeVisible();
  await expect(page.locator('[data-nexus-action]')).toHaveCount(0);
});

test('Tabs load on selection, unmount on switch, and enter a new execution on return', async ({
  page,
}) => {
  await page.goto('/clusters/demo/nodes/n1/events');
  await expect(page.getByRole('tab', { name: 'Node chart' })).toBeVisible();
  await expect(page.getByTestId('ui-c')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Node chart' }).click();
  const first = await page.getByTestId('c-instance').innerText();
  await expect(page.getByTestId('c-context')).toContainText('n1');
  await page.getByRole('tab', { name: 'Resource summary' }).click();
  await expect(page.getByTestId('ui-c')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Resource summary' }).press('End');
  await expect(page.getByRole('tab', { name: 'Node chart' })).toBeFocused();
  await page.getByRole('tab', { name: 'Node chart' }).press('Enter');
  await expect(page.getByTestId('c-instance')).not.toHaveText(first);
});

test('Core plugin actions use PluginRef and the same Builtin execution protocol', async ({
  page,
}) => {
  await page.goto('/');
  // Labels are catalog-independent: inspect the first read-only Builtin entry.
  const button = page.getByRole('button', { name: 'Check plugin status' }).first();
  await button.click();
  await expect(page.getByLabel('Action result')).toContainText('ACTIVE');
  await expect(page.locator('[data-nexus-action]')).toHaveCount(0);
});

test('Restricted navigation uses the granted Route ID protocol and leaves an owner-attributed audit', async ({
  page,
}) => {
  await page.goto('/kubeeye');
  await page.getByRole('button', { name: 'Open example node' }).click();
  await expect(page).toHaveURL(/\/clusters\/demo\/nodes\/n1$/);
  await expect(page.getByRole('heading', { name: 'Node n1', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByTestId('bridge-audit')).toContainText('"pluginId": "kubeeye"');
  await expect(page.getByTestId('bridge-audit')).toContainText('"routeId": "node-detail"');
});
