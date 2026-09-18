import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const token = process.env.ASRBOX_DOCKER_TOKEN ?? '';
  await page.addInitScript((apiToken) => {
    localStorage.removeItem('asrbox-server');
    if (apiToken) sessionStorage.setItem('asrbox-api-token', apiToken);
  }, token);
});

test('container UI uses its own origin and keeps the token session-only', async ({ page }) => {
  const pageErrors: Error[] = [];
  const apiOrigins = new Set<string>();
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch') apiOrigins.add(new URL(request.url()).origin);
  });

  const healthResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/health'
      && response.ok()
  ));
  await page.goto('/');
  const healthResponse = await healthResponsePromise;
  await expect(page.getByRole('heading', { name: '新建转写', exact: true }).first()).toBeVisible({ timeout: 30_000 });
  expect((await healthResponse.json()).status).toBe('healthy');
  expect([...apiOrigins]).toEqual([new URL(page.url()).origin]);

  await page.goto('/settings');
  const tokenInput = page.getByLabel('API 令牌');
  await expect(tokenInput).toHaveValue(process.env.ASRBOX_DOCKER_TOKEN ?? '');
  expect(await page.evaluate(() => localStorage.getItem('asrbox-api-token'))).toBeNull();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(process.env.ASRBOX_DOCKER_TOKEN ?? '');
  expect(pageErrors).toEqual([]);
});

test('container UI remains usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ai');
  await expect(page.getByRole('heading', { name: 'AI 工作台', exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: '选择一份字幕', exact: true }).first()).toBeVisible();

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
});
