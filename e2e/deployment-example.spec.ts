import { expect, test } from '@playwright/test';

test('Deployment mock journey composes independent extensions and keeps resource data isolated', async ({
  page,
}) => {
  await page.goto('/deployments');
  await expect(page.getByRole('heading', { name: 'Deployments', exact: true })).toBeVisible();
  await page.getByLabel('命名空间', { exact: true }).selectOption('staging');
  await expect(page.getByRole('link', { name: 'catalog', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'checkout', exact: true })).toHaveCount(0);
  await page.getByLabel('命名空间', { exact: true }).selectOption('all');
  await page.getByLabel('搜索应用').fill('checkout');
  await page.getByRole('link', { name: 'checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'checkout 监控' })).toBeVisible();
  await page.getByLabel('最小副本').fill('4');
  await page.getByLabel('最大副本').fill('10');
  await page.getByRole('button', { name: '保存伸缩配置' }).click();
  await expect(page.getByText('HPA 范围更新为 4–10')).toBeVisible();
  await page.getByRole('button', { name: '应用 VPA 建议' }).click();
  await expect(page.getByText('当前请求：500m CPU / 768 MiB 内存')).toBeVisible();
  await page.getByRole('tab', { name: '网络', exact: true }).click();
  await expect(page.getByText('checkout.production.svc.cluster.local:8080')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: '网络', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('checkout.production.svc.cluster.local:8080')).toBeVisible();
  await page.getByRole('link', { name: '← Deployments' }).click();
  await page.getByRole('link', { name: 'payments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'payments 监控' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '自动伸缩未启用' })).toBeVisible();
  await expect(page.getByText('当前请求：250m CPU / 512 MiB 内存')).toBeVisible();
});

test('unknown Deployment has a recovery link', async ({ page }) => {
  await page.goto('/clusters/demo-cluster/namespaces/production/deployments/missing');
  await expect(page.getByRole('heading', { name: 'Deployment 不存在' })).toBeVisible();
  await page.getByRole('link', { name: '返回 Deployments' }).click();
  await expect(page.getByRole('heading', { name: 'Deployments', exact: true })).toBeVisible();
});
