import { expect, test } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('LLM provider form fetches model IDs and fills the default model from the list', async ({ page }) => {
  let requestBody: Record<string, unknown> | null = null;
  await page.route('**/llm-providers/models', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, items: ['deepseek-chat', 'deepseek-reasoner'], message: '2 models available', error_code: null }),
    });
  });

  await page.goto('/settings?tab=llm');
  await page.getByRole('button', { name: 'Add LLM provider' }).click();
  const dialog = page.getByRole('dialog');

  const modelInput = dialog.getByLabel('Default model');
  await expect(modelInput).toHaveValue('');
  await dialog.getByLabel('API key').fill('sk-e2e-test');
  await dialog.getByRole('button', { name: 'Fetch models' }).click();

  await expect.poll(() => requestBody).not.toBeNull();
  expect(requestBody).toMatchObject({ preset: 'deepseek', base_url: 'https://api.deepseek.com', api_key: 'sk-e2e-test' });

  const picker = dialog.getByRole('combobox').nth(1);
  await expect(picker).toBeVisible();
  await picker.click();
  await page.getByRole('option', { name: 'deepseek-reasoner' }).click();
  await expect(modelInput).toHaveValue('deepseek-reasoner');
});

test('LLM provider form surfaces fetch failures and keeps manual entry', async ({ page }) => {
  await page.route('**/llm-providers/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, items: [], message: 'LLM provider rejected credentials', error_code: 'LLM_PROVIDER_AUTH_FAILED' }),
    });
  });

  await page.goto('/settings?tab=llm');
  await page.getByRole('button', { name: 'Add LLM provider' }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByRole('button', { name: 'Fetch models' }).click();
  await expect(page.getByText('LLM provider rejected credentials')).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(1);

  await dialog.getByLabel('Default model').fill('typed-model-id');
  await expect(dialog.getByLabel('Default model')).toHaveValue('typed-model-id');
});
