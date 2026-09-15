import { expect, test, type Page } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

const primaryRoutes = ['/', '/tasks', '/ai', '/models', '/settings'] as const;

const settingsTabs = ['general', 'transcription', 'acceleration', 'providers', 'llm', 'storage', 'about'] as const;

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  filename: 'interview.m4a',
  source: '/tmp/asrbox-e2e/interview.m4a',
  audio_path: '/tmp/asrbox-e2e/interview.m4a',
  source_kind: 'managed',
  status: 'completed',
  progress: 1,
  language: 'zh',
  model_name: 'whisper-base',
  provider_id: null,
  duration_ms: 42_160,
  text: 'Hello and welcome. Local processing keeps data private.',
  error: null,
  error_code: null,
  options: {},
  segments: [
    { id: 1, start: 0, end: 15_000, text: 'Hello and welcome.', speaker: '1' },
    { id: 2, start: 15_000, end: 30_000, text: 'Local processing keeps data private.', speaker: '2' },
  ],
  created_at: '2026-09-14T10:28:00Z',
  updated_at: '2026-09-14T10:30:00Z',
  completed_at: '2026-09-14T10:30:00Z',
  batch_id: null,
  ...overrides,
});

const stubTasks = (page: Page, items: unknown[]) =>
  page.route('**/tasks', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: { items, total: items.length } });
  });

const stubTaskWorkspaces = (page: Page, taskId: string) => {
  void page.route(`**/tasks/${taskId}/diagnostics`, (route) => route.fulfill({ json: [] }));
  void page.route(`**/tasks/${taskId}/logs`, (route) => route.fulfill({ json: [] }));
  void page.route(`**/tasks/${taskId}/versions`, (route) => route.fulfill({ json: [] }));
  void page.route(`**/tasks/${taskId}/quality`, (route) =>
    route.fulfill({ json: { task_id: taskId, warnings: [], metrics: {} } }));
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('desktop shell defaults to the expanded sidebar with text labels for new users', async ({ page }) => {
  await page.goto('/');

  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-mode', 'expanded');
  await expect(sidebar.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Task center' })).toBeVisible();
});

test('primary routes share the page shell without page-level horizontal overflow', async ({ page }) => {
  for (const route of primaryRoutes) {
    await page.goto(route);
    const pageTitle = page.getByTestId('page-title');
    await expect(pageTitle).toBeVisible();
    await expect.poll(async () => {
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      return scrollWidth - clientWidth;
    }, { message: `route ${route} must not overflow horizontally` }).toBeLessThanOrEqual(0);
  }
});

test('primary routes keep main actions reachable on a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of primaryRoutes) {
    await page.goto(route);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect.poll(async () => {
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      return scrollWidth - clientWidth;
    }, { message: `route ${route} must not overflow horizontally at 390px` }).toBeLessThanOrEqual(0);
  }
});

test('light and dark preferences keep the same shell structure', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 5_000 });
  await expect(page.getByTestId('app-sidebar')).toBeVisible();
  await expect(page.getByTestId('page-title')).toBeVisible();
});

test('task center renders a persistent three-region workspace on selection', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  stubTaskWorkspaces(page, item.id as string);

  await page.goto('/tasks');
  await page.getByText('interview.m4a').first().click();

  const listRegion = page.getByTestId('task-center-list');
  const detailRegion = page.getByTestId('task-center-detail');
  const inspectorRegion = page.getByTestId('task-center-inspector');
  await expect(listRegion).toBeVisible();
  await expect(detailRegion).toBeVisible();
  await expect(inspectorRegion).toBeVisible();

  await expect(listRegion.getByRole('button', { name: /import/i })).toHaveCount(0);
  await expect(detailRegion.getByText('interview.m4a').first()).toBeVisible();
});

test('transcript segments expose the active segment for playback linkage', async ({ page }) => {
  const item = task();
  await stubTasks(page, [item]);
  stubTaskWorkspaces(page, item.id as string);

  await page.goto('/tasks');
  await page.getByText('interview.m4a').first().click();

  const segments = page.getByTestId('transcript-segments');
  await expect(segments).toBeVisible();
  const rows = segments.getByTestId('segment-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-active', 'true');
});

test('general settings exposes the accent color palette', async ({ page }) => {
  await page.goto('/settings?tab=general');

  const picker = page.getByTestId('accent-color-picker');
  await expect(picker).toBeVisible();
  for (const accent of ['orange', 'blue', 'purple', 'pink', 'red', 'green', 'cyan', 'gray']) {
    await expect(picker.getByRole('radio', { name: accent })).toHaveCount(1);
  }
});

test('every maintained settings tab renders through the shared shell', async ({ page }) => {
  for (const tab of settingsTabs) {
    await page.goto(`/settings?tab=${tab}`);
    await expect(page.getByTestId('page-title')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
      message: `settings tab ${tab} must not overflow horizontally`,
    }).toBeLessThanOrEqual(0);
  }
});
