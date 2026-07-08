#!/usr/bin/env node

const { execSync } = require('child_process');
const { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } = require('fs');
const { join } = require('path');
const binariesDir = join(__dirname, '..', 'tauri', 'src-tauri', 'binaries');
const minRealBinarySize = 10000;

function targetTriple() {
  try {
    return execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim();
  } catch {
    if (process.platform === 'darwin') return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    if (process.platform === 'linux') return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
    if (process.platform === 'win32') return process.arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'i686-pc-windows-msvc';
    throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
  }
}

function createPlaceholder(baseName) {
  const triple = targetTriple();
  const isWindows = triple.includes('windows');
  const name = `${baseName}-${triple}${isWindows ? '.exe' : ''}`;
  const path = join(binariesDir, name);

  if (existsSync(path) && statSync(path).size > minRealBinarySize) {
    console.log(`Keeping real sidecar: ${name}`);
    return;
  }

  mkdirSync(binariesDir, { recursive: true });
  if (isWindows) {
    writeFileSync(path, 'ASRbox development sidecar placeholder. Run `bun run dev:server` separately.\n');
  } else {
    writeFileSync(
      path,
      '#!/bin/sh\n' +
        'echo "ASRbox development sidecar placeholder. Run `bun run dev:server` separately." >&2\n' +
        'exit 1\n',
    );
    chmodSync(path, 0o755);
  }
  console.log(`Created development sidecar placeholder: ${name}`);
}

function ensureResourceDirectory(baseName) {
  const path = join(binariesDir, baseName);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, '.gitkeep'), '');
}

createPlaceholder('asrbox-server');
ensureResourceDirectory('asrbox-server');
ensureResourceDirectory('ffmpeg');
