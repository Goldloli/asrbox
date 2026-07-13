import { expect, test } from '@playwright/test';

test('public beta shell reaches the local backend and core routes', async ({ page, request }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.addInitScript(() => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: 'http://127.0.0.1:17496' }, version: 0 }));
  });

  const health = await request.get('http://127.0.0.1:17496/health');
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: 'healthy', version: '0.1.0-beta.1' });

  await page.goto('/');
  await expect(page.getByText('Backend online', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Transcribe', exact: true }).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);

  for (const [route, heading] of [
    ['/tasks', 'Tasks'],
    ['/models', 'Models'],
    ['/settings', 'Settings'],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }

  await page.goto('/providers');
  await expect(page).toHaveURL(/\/settings\?tab=providers$/);
  await expect(page.getByRole('tab', { name: 'Online providers' })).toHaveAttribute('data-state', 'active');
  expect(pageErrors).toEqual([]);
});
