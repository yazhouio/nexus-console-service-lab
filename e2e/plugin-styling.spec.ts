import { expect, test } from '@playwright/test';

const localCss = 'link[data-nexus-artifact-css][href*="/ui-local."]';
const first = '[data-managed-presentation="style-first"]';
const second = '[data-managed-presentation="style-second"]';

test('concurrent Surfaces, hidden UI and Overlay share a link until their final DOM is removed', async ({
  page,
}) => {
  await page.goto('/__fixtures__/styling');
  await expect(page.getByTestId('ui-local')).toHaveCount(2);
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Hide first', exact: true }).click();
  await expect(page.locator(first)).toBeHidden();
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Hide first', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle second', exact: true }).click();
  await expect(page.locator(second)).toHaveCount(0);
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.locator(first).getByRole('button', { name: 'Open Local overlay' }).click();
  await expect(page.getByRole('dialog').getByTestId('ui-local')).toBeVisible();
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Toggle first', exact: true }).click();
  await expect(page.getByTestId('ui-local')).toHaveCount(0);
  await expect(page.locator(`head ${localCss}`)).toHaveCount(0);
  await expect(page.locator('head link[data-nexus-artifact-css][href*="/core."]')).toHaveCount(1);
});

test('Builtin in a Restricted anchor loads the same URL separately in the existing physical ShadowRoot', async ({
  page,
}) => {
  await page.goto('/__fixtures__/styling');
  await expect(page.getByTestId('ui-local')).toHaveCount(2);
  await page.getByRole('button', { name: 'Toggle Restricted parent' }).click();
  const restricted = page.getByTestId('style-restricted-container');
  await expect(restricted.getByTestId('ui-local')).toBeVisible();
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await expect(restricted.locator(localCss)).toHaveCount(1);
  expect(await restricted.locator(localCss).getAttribute('href')).toBe(
    await page.locator(`head ${localCss}`).getAttribute('href'),
  );
  await expect(restricted.getByTestId('ui-local')).toHaveCSS('padding', '16px');
  await page.getByRole('button', { name: 'Toggle Restricted parent' }).click();
  await expect(restricted).toHaveCount(0);
  await expect(page.locator(localCss)).toHaveCount(1);
});

test('Host theme attribute updates CSS Modules in Document, ShadowRoot and Overlay without remounting', async ({
  page,
}) => {
  await page.goto('/__fixtures__/styling');
  await expect(page.getByTestId('ui-local')).toHaveCount(2);
  await page.getByRole('button', { name: 'Toggle Restricted parent' }).click();
  await expect(
    page.getByTestId('style-restricted-container').getByTestId('ui-local'),
  ).toBeVisible();
  await page.locator(first).getByRole('button', { name: 'Open Local overlay' }).click();
  await expect(page.getByRole('dialog').getByTestId('ui-local')).toBeVisible();
  const scope = await page.locator(first).getAttribute('data-execution-scope');
  await page.addStyleTag({
    content:
      ':root[data-nexus-theme="acceptance"] { --nexus-color-text-primary: rgb(80, 30, 110); --nexus-color-surface: rgb(237, 232, 248); --nexus-space-4: 21px; }',
  });
  await page.evaluate(() => {
    document.documentElement.dataset.nexusTheme = 'acceptance';
  });
  for (const local of await page.getByTestId('ui-local').all()) {
    await expect(local).toHaveCSS('color', 'rgb(80, 30, 110)');
    await expect(local).toHaveCSS('background-color', 'rgb(237, 232, 248)');
    await expect(local).toHaveCSS('padding', '21px');
  }
  await expect(page.locator(first)).toHaveAttribute('data-execution-scope', scope!);
  await expect(page.locator(localCss)).toHaveCount(2);
});

test('CSS error is an artifact failure, renders no business DOM and explicitly retries a new load', async ({
  page,
}) => {
  let fail = true,
    requests = 0;
  await page.route('**/static/plugin-css/ui-local.*.css', (route) => {
    requests++;
    return fail ? route.abort() : route.continue();
  });
  await page.goto('/__fixtures__/styling');
  await expect(page.locator(first)).toHaveAttribute('data-execution-phase', 'failed');
  await expect(page.locator(second)).toHaveAttribute('data-execution-phase', 'failed');
  await expect(page.getByTestId('ui-local')).toHaveCount(0);
  await expect(page.getByTestId('style-inspection')).toContainText('"stage":"artifact"');
  await expect(page.locator(localCss)).toHaveCount(0);
  expect(requests).toBe(1);
  fail = false;
  await page.locator(first).getByRole('button', { name: 'Retry view' }).click();
  await expect(page.locator(first).getByTestId('ui-local')).toBeVisible();
  expect(requests).toBe(2);
  await page.locator(second).getByRole('button', { name: 'Retry view' }).click();
  await expect(page.getByTestId('ui-local')).toHaveCount(2);
  expect(requests).toBe(2);
});

test('CSS waiting does not consume the UI-ready timeout and cancellation preserves the other waiter', async ({
  page,
}) => {
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route('**/static/plugin-css/ui-local.*.css', async (route) => {
    await gate;
    await route.continue();
  });
  await page.clock.install();
  await page.goto('/__fixtures__/styling');
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.clock.runFor(10_100);
  await expect(page.locator(first)).toHaveAttribute('data-execution-phase', 'starting');
  await expect(page.getByTestId('ui-local')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle first', exact: true }).click();
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  resume();
  await expect(page.locator(second)).toHaveAttribute('data-execution-phase', 'ready');
});

test('CSS deadline reports artifact failure and Core CSS failure keeps independent recovery usable', async ({
  page,
}) => {
  await page.route('**/static/plugin-css/core.*.css', () => undefined);
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('link[data-nexus-artifact-css][href*="/core."]')).toHaveCount(1);
  await page.clock.runFor(15_100);
  await expect(page.getByRole('heading', { name: 'Console presentation failed' })).toBeVisible();
  await expect(page.getByTestId('runtime-state')).toHaveText('READY');
  await expect(page.getByTestId('runtime-snapshot')).toContainText('CSS_LOAD_TIMEOUT');
  await expect(page.getByTestId('runtime-snapshot')).toContainText('"stage": "artifact"');
  await expect(page.getByRole('button', { name: 'Export diagnostics' })).toBeEnabled();
  await expect(page.locator('link[data-nexus-artifact-css]')).toHaveCount(0);
});

test('compiled production HTML owns only platform CSS; route departure releases business assets', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/')).text();
  expect(html).not.toContain('/plugin-css/');
  await page.goto('/deployments');
  await expect(page.getByRole('heading', { name: 'Deployments', exact: true })).toBeVisible();
  await expect(page.locator('head link[href*="/deployment-ui."]')).toHaveCount(1);
  await page.getByRole('link', { name: 'Settings', exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('head link[href*="/deployment-ui."]')).toHaveCount(0);
});

test('Restricted CSS 404 retries the same URL, inherits Host tokens and is destroyed with its Wujie instance', async ({
  page,
}) => {
  let fail = true,
    requests = 0;
  await page.route('**/plugins/kubeeye/1.0.0/main.css', async (route) => {
    requests++;
    if (fail) return route.fulfill({ status: 404, body: 'missing CSS' });
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        ':root{--kubeeye-private-probe:7px}@font-face{font-family:kubeeye-probe;src:local("Arial")}',
    });
  });
  await page.goto('/__fixtures__/surfaces');
  await page.getByRole('button', { name: 'Open KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('ERROR');
  await expect(page.getByTestId('failure-stage')).toHaveText('artifact');
  await expect(page.getByTestId('restricted-surface')).toHaveCount(0);
  await expect(page.getByTestId('runtime-state')).toContainText('READY');
  fail = false;
  await page.getByRole('button', { name: 'Retry KubeEye Surface' }).click();
  await expect(page.getByTestId('surface-state')).toHaveText('MOUNTED');
  expect(requests).toBe(2);
  await expect
    .poll(() =>
      page
        .getByTestId('restricted-surface')
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue('--kubeeye-private-probe').trim(),
        ),
    )
    .toBe('7px');
  const fonts = () =>
    page.evaluate(
      () =>
        [...document.head.querySelectorAll('style')].filter((style) =>
          style.textContent?.includes('kubeeye-probe'),
        ).length,
    );
  await expect.poll(fonts).toBeGreaterThan(0);
  await expect(page.getByTestId('restricted-surface')).toHaveCSS('padding', '24px');
  const instance = await page.locator('wujie-app').getAttribute('data-wujie-id');
  await page.addStyleTag({
    content:
      ':root[data-nexus-theme="restricted-test"] { --nexus-color-text-primary: rgb(80, 30, 110); --nexus-color-surface: rgb(237, 232, 248); }',
  });
  await page.evaluate(() => {
    document.documentElement.dataset.nexusTheme = 'restricted-test';
  });
  await expect(page.getByTestId('restricted-surface')).toHaveCSS('color', 'rgb(80, 30, 110)');
  await expect(page.getByTestId('restricted-surface')).toHaveCSS(
    'background-color',
    'rgb(237, 232, 248)',
  );
  await expect(page.locator('wujie-app')).toHaveAttribute('data-wujie-id', instance!);
  await expect(page.locator('head link[href*="/kubeeye/"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close KubeEye Surface' }).click();
  await expect(page.locator('wujie-app')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect.poll(fonts).toBe(0);
});

test('CSS completion rejects a container moved into an unmanaged physical root despite patched DOM accessors', async ({
  page,
}) => {
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route('**/static/plugin-css/ui-local.*.css', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/__fixtures__/styling');
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.evaluate(() => {
    const container = document.querySelector('[data-managed-presentation="style-first"]')!;
    Object.defineProperty(container, 'getRootNode', { value: () => document });
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).append(container);
  });
  resume();
  await expect(page.locator(first)).toHaveAttribute('data-execution-phase', 'failed');
  await expect(page.locator(first).getByTestId('ui-local')).toHaveCount(0);
  await expect(page.locator(second)).toHaveAttribute('data-execution-phase', 'ready');
  await expect(page.locator(`head ${localCss}`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Toggle second', exact: true }).click();
  await expect(page.locator(localCss)).toHaveCount(0);
});
