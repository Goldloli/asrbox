import { expect, test } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

test('web acceleration tab explains Windows-only support and keeps the switch disabled', async ({ page }) => {
  await page.goto('/settings?tab=acceleration');

  await expect(page.getByRole('tab', { name: 'GPU Acceleration' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('CUDA acceleration is only available in the Windows desktop app with an NVIDIA GPU.')).toBeVisible();
  await expect(page.getByRole('switch')).toBeDisabled();
  await expect(page.getByText('About CUDA acceleration', { exact: true })).toBeVisible();
  await expect(page.getByText('Acceleration kit', { exact: true })).toBeVisible();
});

test('desktop acceleration tab shows GPU, kit and probe details', async ({ page }) => {
  await page.addInitScript((url) => {
    const invoke = async (command: string) => {
      if (command === 'start_server') return { url, api_token: 'test-token' };
      if (command === 'get_app_version') return { version: '0.1.9', target: 'Windows x64', installer_kind: 'nsis' };
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

  await page.route('**/settings/cuda-acceleration', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: true,
        status: 'enabled',
        reason: null,
        supported: true,
        gpu_detected: true,
        kit: { kit_version: '0.1.9', torch_version: '2.11.0+cu128', total_bytes: 4331692019 },
        probe: {
          state: 'ok',
          torch_cuda_available: true,
          cuda_device_name: 'NVIDIA GeForce RTX 3080 Ti',
          torch_file: 'C:\\Users\\test\\AppData\\Roaming\\com.goldloli.asrbox\\runtime\\cuda-kit\\kit\\torch\\__init__.py',
        },
        job: null,
      }),
    });
  });

  // The real endpoint runs a torch probe subprocess on first call; stub it so
  // the kit install location row renders deterministically.
  await page.route('**/runtime/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data_dir: 'C:\\Users\\test\\AppData\\Roaming\\com.goldloli.asrbox',
        models_dir: 'C:\\Users\\test\\AppData\\Roaming\\com.goldloli.asrbox\\models',
        free_disk_bytes: 1_000_000_000_000,
        warnings: [],
      }),
    });
  });

  await page.goto('/settings?tab=acceleration');

  await expect(page.getByRole('tab', { name: 'GPU Acceleration' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Enabled', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch')).toBeChecked();
  await expect(page.getByText('NVIDIA GeForce RTX 3080 Ti', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('CUDA available', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('0.1.9 · torch 2.11.0+cu128', { exact: true })).toBeVisible();
  await expect(page.getByText(/cuda-kit[\\/]kit/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove kit' })).toBeVisible();
});
