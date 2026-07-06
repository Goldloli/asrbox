import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.ASRBOX_AUDIT_URL ?? 'http://127.0.0.1:5173';
const outputDir = process.env.ASRBOX_AUDIT_DIR ?? 'frontend-audit-screenshots/95-gate';
const shouldStartServer = !process.argv.includes('--no-server');

const routes = [
  { name: 'transcribe', path: '/' },
  { name: 'tasks', path: '/tasks' },
  { name: 'models', path: '/models' },
  { name: 'settings', path: '/settings' },
];

const viewports = [
  { name: 'desktop-default', width: 1280, height: 820 },
  { name: 'desktop-wide', width: 1440, height: 900 },
  { name: 'mobile-narrow', width: 390, height: 844 },
];

const states = [
  { name: 'light-comfortable-icons', theme: 'light', density: 'comfortable', sidebarMode: 'icons' },
  { name: 'dark-comfortable-icons', theme: 'dark', density: 'comfortable', sidebarMode: 'icons' },
  { name: 'light-compact-expanded', theme: 'light', density: 'compact', sidebarMode: 'expanded' },
];

function startServer() {
  if (!shouldStartServer) return undefined;
  const server = spawn('npm', ['run', 'dev:web'], {
    cwd: process.cwd(),
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return server;
}

function stopServer(server) {
  if (!server) return;
  try {
    if (process.platform === 'win32') {
      server.kill('SIGTERM');
    } else {
      process.kill(-server.pid, 'SIGTERM');
    }
  } catch {
    server.kill('SIGTERM');
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Keep polling until the dev server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
  } catch {
    return chromium.launch();
  }
}

function preferenceScript(state) {
  return ({ theme, density, sidebarMode }) => {
    localStorage.setItem('asrbox-ui', JSON.stringify({
      state: {
        locale: 'zh',
        theme,
        density,
        sidebarMode,
        fontScale: 'standard',
        reducedMotion: 'normal',
      },
      version: 0,
    }));
  };
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const bodyText = document.body.innerText.trim();
    const isVisuallyHidden = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        element.classList.contains('sr-only') ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        rect.width <= 1 ||
        rect.height <= 1
      );
    };
    const overflow = Array.from(document.querySelectorAll('body *'))
      .filter((element) => !isVisuallyHidden(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className).slice(0, 100),
          text: (element.textContent ?? '').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.width > 0 && (item.left < -2 || item.right > window.innerWidth + 2))
      .slice(0, 12);

    const clippedButtons = Array.from(document.querySelectorAll('button, a'))
      .filter((element) => {
        if (isVisuallyHidden(element)) return false;
        const text = (element.textContent ?? '').trim();
        return text && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? '').trim().slice(0, 80),
        className: String(element.className).slice(0, 100),
      }));

    return {
      title: document.title,
      url: location.href,
      hasBodyText: bodyText.length > 0,
      bodyTextSample: bodyText.slice(0, 240),
      overflow,
      clippedButtons,
    };
  });
}

const server = startServer();

try {
  await mkdir(outputDir, { recursive: true });
  await waitForServer();
  const browser = await launchBrowser();
  const report = [];

  for (const viewport of viewports) {
    for (const state of states) {
      for (const route of routes) {
        const context = await browser.newContext({ viewport });
        await context.addInitScript(preferenceScript(state), state);
        const page = await context.newPage();
        const url = `${baseUrl}${route.path}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.waitForTimeout(300);

        const screenshotName = `${viewport.name}-${state.name}-${route.name}.png`;
        await page.screenshot({ path: join(outputDir, screenshotName), fullPage: true });
        const metrics = await collectPageMetrics(page);
        const passed = metrics.hasBodyText && metrics.overflow.length === 0 && metrics.clippedButtons.length === 0;
        report.push({ viewport, state, route, screenshot: screenshotName, passed, metrics });
        await context.close();
      }
    }
  }

  await browser.close();
  await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const failed = report.filter((item) => !item.passed);
  console.log(`Frontend audit complete: ${report.length - failed.length}/${report.length} checks passed.`);
  if (failed.length > 0) {
    console.log(`Issues found. See ${join(outputDir, 'report.json')}`);
    process.exitCode = 1;
  }
} finally {
  stopServer(server);
}
