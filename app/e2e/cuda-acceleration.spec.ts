import { expect, test } from '@playwright/test';

const serverUrl = 'http://127.0.0.1:17496';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((url) => {
    localStorage.setItem('asrbox-server', JSON.stringify({ state: { serverUrl: url }, version: 0 }));
  }, serverUrl);
});

function mockDesktop(page: import('@playwright/test').Page, target: string) {
  return page.addInitScript(({ url, target }) => {
    const invoke = async (command: string) => {
      if (command === 'start_server') return { url, api_token: 'test-token' };
      if (command === 'get_app_version') return { version: '0.1.9', target, installer_kind: 'nsis' };
      return null;
    };
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: { invoke },
        event: { listen: async () => () => undefined },
      },
    });
  }, { url: serverUrl, target });
}

const cudaStatusBody = {
  enabled: true,
  status: 'enabled',
  reason: null,
  reason_code: null,
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
};

test('web acceleration tab shows the desktop-only explanation without controls', async ({ page }) => {
  await page.goto('/settings?tab=acceleration');

  await expect(page.getByRole('tab', { name: 'GPU Acceleration' })).toHaveAttribute('data-state', 'active');
  await expect(
    page.getByText('GPU acceleration settings are only available in the desktop app.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByText('CUDA acceleration (Windows / NVIDIA)', { exact: true })).toHaveCount(0);
});

test('Windows desktop acceleration tab shows the compact CUDA panel and redetects on demand', async ({ page }) => {
  await mockDesktop(page, 'Windows x64');

  await page.route('**/settings/cuda-acceleration', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(cudaStatusBody),
    });
  });

  let redetectCalls = 0;
  await page.route('**/settings/cuda-acceleration/redetect', async (route) => {
    redetectCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...cudaStatusBody, gpu_detected: null }),
    });
  });

  // The real endpoint runs a torch probe subprocess on first call; stub it so
  // the kit install location row renders deterministically.
  await page.route('**/runtime/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'Windows-10-10.0.22631-SP0',
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
  await expect(page.getByText('Details', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove kit' })).toBeVisible();

  await page.getByRole('button', { name: 'Detect again' }).click();
  await expect.poll(() => redetectCalls).toBe(1);
});

test('macOS desktop acceleration tab shows the Apple GPU panel without CUDA controls', async ({ page }) => {
  await mockDesktop(page, 'macOS Apple Silicon');

  await page.route('**/runtime/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'macOS-15.5-arm64-arm-64bit',
        torch_mps_available: true,
        mlx_available: true,
        mlx_whisper_available: true,
        data_dir: '/Users/test/Library/Application Support/com.goldloli.asrbox',
        models_dir: '/Users/test/Library/Application Support/com.goldloli.asrbox/models',
        free_disk_bytes: 1_000_000_000_000,
        warnings: [],
      }),
    });
  });

  await page.route('**/models/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          {
            model_name: 'funasr-paraformer',
            display_name: 'Paraformer 中文',
            supported_devices: ['cpu', 'mps'],
            downloaded: true,
          },
          {
            model_name: 'whisper-large-v3',
            display_name: 'Whisper Large v3',
            supported_devices: ['cpu', 'cuda'],
            downloaded: false,
          },
        ],
      }),
    });
  });

  await page.goto('/settings?tab=acceleration');

  await expect(page.getByRole('tab', { name: 'GPU Acceleration' })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Apple GPU acceleration', { exact: true })).toBeVisible();
  await expect(page.getByText('Metal (MPS)', { exact: true })).toBeVisible();
  await expect(page.getByText('MLX (Apple silicon)', { exact: true })).toBeVisible();
  await expect(page.getByText('Available', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Paraformer 中文', { exact: true })).toBeVisible();
  await expect(page.getByText('Whisper Large v3', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByText('CUDA acceleration (Windows / NVIDIA)', { exact: true })).toHaveCount(0);
});
