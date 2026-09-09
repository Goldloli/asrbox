import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('web About shows build identity and browser-only update fallback', async ({ page }) => {
  await page.goto('/settings?tab=about');

  await expect(page.getByRole('tab', { name: 'About' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Public beta', { exact: true })).toBeVisible();
  await expect(page.getByLabel('About').getByText('v0.1.8', { exact: true })).toBeVisible();
  await expect(page.getByLabel('About').getByText('Web', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /View Releases/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Check now/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Download update/ })).toHaveCount(0);
  await expect(page.getByText('Goldloli 小卡塔克', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report an issue' })).toBeVisible();
});

test('desktop About persists update preferences and includes them in settings transfer', async ({ page }) => {
  await page.addInitScript((url) => {
    const invoke = async (command: string) => {
      if (command === 'start_server') return { url, api_token: 'test-token' };
      if (command === 'get_app_version') return { version: '0.1.5', target: 'macOS Apple Silicon', installer_kind: 'dmg' };
      if (command === 'get_app_update_download_state') {
        return {
          status: 'idle',
          version: null,
          filename: null,
          path: null,
          downloaded_bytes: 0,
          total_bytes: null,
          progress: null,
          bytes_per_second: null,
          eta_seconds: null,
          error: null,
        };
      }
      if (command === 'check_app_update') {
        return {
          current_version: '0.1.5',
          update_available: false,
          checked_at_ms: Date.now(),
          release: {
            version: '0.1.5',
            tag_name: 'v0.1.5',
            name: 'ASRbox v0.1.5',
            notes: 'Current release.',
            published_at: '2026-07-01T00:00:00Z',
            html_url: 'https://github.com/Goldloli/asrbox/releases/tag/v0.1.5',
            asset_name: 'ASRbox_0.1.5_aarch64.dmg',
            asset_size: 1024,
          },
          releases_url: 'https://github.com/Goldloli/asrbox/releases',
        };
      }
      return null;
    };
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: { invoke },
        event: { listen: async () => () => undefined },
      },
    });
  }, serverUrl);

  await page.goto('/settings?tab=about');
  await expect(page.getByText('macOS Apple Silicon', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('combobox')).toContainText('Stable');
  const switches = page.getByRole('switch');
  await expect(switches).toHaveCount(2);
  await expect(switches.nth(0)).toBeChecked();
  await expect(switches.nth(1)).toBeChecked();

  await switches.nth(0).click();
  await expect(switches.nth(0)).not.toBeChecked();
  await expect(switches.nth(1)).toBeDisabled();

  await page.getByRole('tab', { name: 'General' }).click();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      ui: {
        updateChannel: 'prerelease',
        autoCheckUpdates: true,
        updateNotifications: false,
      },
    })),
  });
  await expect(page.getByText('Settings imported', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'About' }).click();
  await expect(page.getByRole('combobox')).toContainText('Prerelease');
  await expect(page.getByRole('switch').nth(0)).toBeChecked();
  await expect(page.getByRole('switch').nth(1)).not.toBeChecked();

  await page.getByRole('tab', { name: 'General' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export settings' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, 'utf8')) as {
    ui: { updateChannel: string; autoCheckUpdates: boolean; updateNotifications: boolean };
  };
  expect(exported.ui).toMatchObject({
    updateChannel: 'prerelease',
    autoCheckUpdates: true,
    updateNotifications: false,
  });
});
