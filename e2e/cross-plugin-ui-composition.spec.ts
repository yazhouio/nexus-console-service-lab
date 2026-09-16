import { expect, test, type Page } from '@playwright/test';

const inspect = async (page: Page) => {
  const snapshot = JSON.parse(await page.getByTestId('ui-inspection').innerText());
  // Fixture lifetime assertions exclude the persistent Console root and its Route Scope.
  return {
    ...snapshot,
    scopes: snapshot.scopes.filter((scope: { owner: string }) => scope.owner !== 'console-core'),
  };
};
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function visit(page: Page) {
  await page.goto('/__fixtures__/ui-composition');
  await expect(page.getByTestId('ui-c')).toBeVisible();
  await expect(page.getByTestId('ui-local')).toBeVisible();
}

test('Host mounts the independently declared A → B → C chain and updates same-key Context', async ({
  page,
}) => {
  await page.goto('/__fixtures__/ui-composition');
  await expect(page.getByTestId('ui-a')).toBeVisible();
  await expect(page.getByTestId('ui-b')).toBeVisible();
  await expect(page.getByTestId('ui-c')).toBeVisible();
  await expect(page.getByTestId('ui-local')).toBeVisible();
  const b = await page.getByTestId('b-instance').innerText();
  const c = await page.getByTestId('c-instance').innerText();
  await expect(page.getByTestId('c-context')).toContainText('"value":1');
  await page.getByRole('button', { name: 'Update context', exact: true }).click();
  await expect(page.getByTestId('c-context')).toContainText('"value":2');
  await expect(page.getByTestId('b-instance')).toHaveText(b);
  await expect(page.getByTestId('c-instance')).toHaveText(c);
  await expect(page.locator('wujie-app wujie-app wujie-app')).toHaveCount(1);
});

test('hidden retains execution, unmount rebuilds, and A → B → A creates a fresh Scope A₂', async ({
  page,
}) => {
  await visit(page);
  const original = await page.getByTestId('b-instance').innerText();
  const scopeA1 = (await inspect(page)).scopes.find((s: any) => s.owner === 'ui-b').id;
  await button(page, 'Toggle hidden').click();
  await expect(page.getByTestId('ui-b')).toBeHidden();
  await button(page, 'Update context').click();
  await button(page, 'Toggle hidden').click();
  await expect(page.getByTestId('b-instance')).toHaveText(original);
  await expect(page.getByTestId('c-context')).toContainText('"value":2');
  await button(page, 'Visit B').click();
  await expect(page.getByTestId('b-context')).toContainText('"contextKey":"B"');
  await expect(page.getByTestId('b-instance')).not.toHaveText(original);
  await button(page, 'Visit A').click();
  await expect(page.getByTestId('b-context')).toContainText('"contextKey":"A"');
  expect((await inspect(page)).scopes.find((s: any) => s.owner === 'ui-b').id).not.toBe(scopeA1);
  const beforeUnmount = await page.getByTestId('b-instance').innerText();
  await button(page, 'Toggle Slot').click();
  await expect(page.getByTestId('ui-b')).toHaveCount(0);
  await expect.poll(async () => (await inspect(page)).scopes.length).toBe(1);
  await button(page, 'Toggle Slot').click();
  await expect(page.getByTestId('b-instance')).not.toHaveText(beforeUnmount);
});

test('invalid Context is independent from execution; a rejected new key removes the old object', async ({
  page,
}) => {
  await visit(page);
  const original = await page.getByTestId('b-instance').innerText();
  await button(page, 'Invalid same key').click();
  await expect(page.getByRole('alert')).toHaveText('Context rejected');
  await expect(page.getByTestId('b-instance')).toHaveText(original);
  await expect(page.getByTestId('c-context')).toContainText('"value":1');
  await button(page, 'Invalid next key').click();
  await expect(page.getByTestId('ui-b')).toHaveCount(0);
  await expect(page.getByTestId('a-observation')).toContainText('"effective":null');
  await button(page, 'Toggle Slot').click();
  await button(page, 'Toggle Slot').click();
  await expect(page.getByTestId('a-observation')).toContainText('"lastAccepted":null');
  await expect(page.getByTestId('ui-b')).toHaveCount(0);
  await button(page, 'Visit A').click();
  await expect(page.getByTestId('ui-c')).toBeVisible();
  await expect(page.getByTestId('b-instance')).not.toHaveText(original);
});

test('occurrences are independent and filtering rebuilds only the removed contribution', async ({
  page,
}) => {
  await visit(page);
  const first = await page.getByTestId('b-instance').innerText();
  await button(page, 'Toggle second Slot').click();
  await expect(page.getByTestId('b-instance')).toHaveCount(2);
  const second = await page.getByTestId('b-instance').nth(1).innerText();
  expect(first).not.toBe(second);
  await expect(page.getByTestId('c-context').nth(1)).toContainText('"value":99');
  await button(page, 'Toggle filter').click();
  await expect(page.getByTestId('b-instance')).toHaveCount(1);
  await expect(page.getByTestId('b-instance')).toHaveText(second);
  await expect(page.getByTestId('ui-local')).toHaveCount(2);
  await button(page, 'Toggle filter').click();
  await expect(page.getByTestId('b-instance')).toHaveCount(2);
  await expect(page.getByTestId('b-instance').first()).not.toHaveText(first);
  await expect(page.getByTestId('b-instance').nth(1)).toHaveText(second);
});

test('a failed B Attempt preserves its Overlay in the same Scope and retry recovers it', async ({
  page,
}) => {
  await visit(page);
  const before = (await inspect(page)).scopes.find((s: any) => s.owner === 'ui-b');
  await button(page, 'Open B overlay').click();
  await expect(page.getByTestId('b-dialog')).toBeVisible();
  const handle = await page.locator('dialog').getAttribute('data-nexus-overlay');
  // Trigger the real plugin error even while the Host modal makes the page inert.
  await button(page, 'Crash B').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId('ui-b')).toHaveCount(0);
  await expect(page.getByTestId('ui-local')).toBeVisible();
  await expect(page.getByTestId('b-dialog')).toBeVisible();
  await button(page, 'Update context').evaluate((el) => (el as HTMLButtonElement).click());
  await button(page, 'Retry ui-b-card').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId('b-overlays')).toContainText(handle!);
  await expect(page.getByTestId('c-context')).toContainText('"value":2');
  const after = (await inspect(page)).scopes.find(
    (s: any) => s.owner === 'ui-b' && s.kind === 'contribution',
  );
  expect(after.id).toBe(before.id);
  expect(after.attemptId).not.toBe(before.attemptId);
  await button(page, 'Complete B').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByTestId('b-overlays')).toContainText('"state":"completed"');
  await button(page, 'Visit B').click();
  await expect(page.getByTestId('b-overlays')).not.toContainText(handle!);
  await expect.poll(async () => (await inspect(page)).overlays).toBe(0);
});

test('parent Attempt failure ends child scopes but preserves its own Overlay; ending Scope clears everything', async ({
  page,
}) => {
  await visit(page);
  const before = (await inspect(page)).scopes.find((s: any) => s.owner === 'ui-a');
  await button(page, 'Open A overlay').click();
  await expect(page.getByTestId('a-dialog')).toBeVisible();
  const aHandle = await page.locator('dialog').getAttribute('data-nexus-overlay');
  await button(page, 'Open B overlay').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId('b-dialog')).toBeVisible();
  await button(page, 'Crash A').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId('ui-root-state')).toHaveText('ERROR');
  await expect(page.getByTestId('b-dialog')).toHaveCount(0);
  await expect(page.getByTestId('a-dialog')).toBeVisible();
  await button(page, 'Retry A page').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId('a-overlays')).toContainText(aHandle!);
  const after = (await inspect(page)).scopes.find(
    (s: any) => s.owner === 'ui-a' && s.kind === 'root',
  );
  expect(after.id).toBe(before.id);
  expect(after.attemptId).not.toBe(before.attemptId);
  await button(page, 'Toggle A page').evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect.poll(async () => (await inspect(page)).scopes.length).toBe(0);
  await expect(page.getByTestId('ui-instances')).toHaveText('[]');
});

test('real containers coordinate content-sized and bounded dimensions without changing Context revision', async ({
  page,
}) => {
  await visit(page);
  const observation = async () => JSON.parse(await page.getByTestId('a-observation').innerText());
  const revision = (await observation()).input.effective.revision;
  const cell = page.locator('[data-nexus-contribution]').first();
  const original = await cell.boundingBox();
  expect(original!.height).toBeGreaterThan(80);
  expect(original!.height).toBeLessThanOrEqual(500);
  await button(page, 'Toggle sizing').click();
  await expect(cell).toHaveAttribute('data-nexus-sizing', 'bounded');
  await expect.poll(async () => (await cell.boundingBox())?.height).toBe(320);
  await page.setViewportSize({ width: 800, height: 700 });
  const container = await page.getByTestId('ui-root-container').boundingBox();
  const box = await cell.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(container!.width);
  expect((await observation()).input.effective.revision).toBe(revision);
});

test('Builtin render failure uses the same retry core and independent observation dimensions', async ({
  page,
}) => {
  await visit(page);
  const b = await page.getByTestId('b-instance').innerText();
  await button(page, 'Crash Local').click();
  await expect(page.getByTestId('ui-local')).toHaveCount(0);
  await button(page, 'Invalid same key').click();
  await expect(page.getByTestId('a-observation')).toContainText('"acceptance":"rejected"');
  const observation = JSON.parse(await page.getByTestId('a-observation').innerText());
  expect(observation.input.acceptance).toBe('rejected');
  expect(
    observation.contributions.find((c: any) => c.ref.ownerPluginId === 'ui-b').execution.phase,
  ).toBe('ready');
  expect(
    observation.contributions.find((c: any) => c.ref.ownerPluginId === 'ui-local').execution.phase,
  ).toBe('failed');
  await button(page, 'Retry local-card').click();
  await expect(page.getByTestId('ui-local')).toBeVisible();
  await expect(page.getByTestId('b-instance')).toHaveText(b);
});

test('Overlay presentation failure remains pending, retries independently, and Escape cancels once', async ({
  page,
}) => {
  await visit(page);
  await page.route('**/plugins/ui-b/1.0.0/', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await button(page, 'Open B overlay').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toHaveText('Unable to display this view.');
  await expect(page.getByTestId('b-overlays')).toContainText('"state":"pending"');
  await expect(page.getByTestId('b-overlays')).toContainText('"phase":"failed"');
  await page.unroute('**/plugins/ui-b/1.0.0/');
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByTestId('b-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('b-overlays')).toContainText('"state":"cancelled"');
});

test('removing a physical Anchor invalidates its subtree and a late artifact cannot revive it', async ({
  page,
}) => {
  let requested = false;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/plugins/ui-b/1.0.0/', async (route) => {
    requested = true;
    await delayed;
    await route.continue().catch(() => undefined);
  });
  await page.goto('/__fixtures__/ui-composition');
  await expect(page.getByTestId('ui-a')).toBeVisible();
  await expect.poll(() => requested).toBe(true);
  await page
    .getByTestId('ui-a')
    .locator('[data-nexus-slot-anchor]')
    .first()
    .evaluate((el) => el.remove());
  await expect.poll(async () => (await inspect(page)).scopes.length).toBe(1);
  release();
  await expect
    .poll(async () => JSON.parse(await page.getByTestId('ui-instances').innerText()).length)
    .toBe(1);
  await expect(page.getByTestId('ui-b')).toHaveCount(0);
  await page.unroute('**/plugins/ui-b/1.0.0/');
  await button(page, 'Toggle Slot').click();
  await button(page, 'Toggle Slot').click();
  await expect(page.getByTestId('ui-c')).toBeVisible();
  await button(page, 'Toggle A page').click();
  await expect(page.getByTestId('ui-instances')).toHaveText('[]');
  expect(errors).toEqual([]);
});
