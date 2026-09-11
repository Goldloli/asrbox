#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkVersions } from "./check-versions.mjs";

const JSON_FILES = [
  "package.json",
  "app/package.json",
  "web/package.json",
  "tauri/package.json",
  "tauri/src-tauri/tauri.conf.json",
];

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DEFAULT_REPO = "https://github.com/Goldloli/asrbox";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function bumpVersion(root, next, { regenLocks = true } = {}) {
  if (!SEMVER.test(next)) {
    throw new Error(`Invalid version: ${JSON.stringify(next)} (expected X.Y.Z or X.Y.Z-pre)`);
  }
  const current = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  if (current === next) {
    throw new Error(`Version is already ${next}`);
  }

  const edited = [];
  for (const file of JSON_FILES) {
    const filePath = path.join(root, file);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    if (data.version !== current) {
      throw new Error(`${file} is at ${data.version}, expected ${current}; run check-versions first`);
    }
    data.version = next;
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
    edited.push(file);
  }

  const rewrites = [
    ["tauri/src-tauri/Cargo.toml", /^version\s*=\s*"[^"]+"/m, `version = "${next}"`],
    ["backend/__init__.py", /^__version__\s*=\s*"[^"]+"/m, `__version__ = "${next}"`],
    ["Dockerfile", /^ARG APP_VERSION=[^\s#]+/m, `ARG APP_VERSION=${next}`],
    ["compose.yaml", /APP_VERSION:\s*\$\{ASRBOX_VERSION:-[^}]+\}/, "APP_VERSION: ${ASRBOX_VERSION:-" + next + "}"],
    [".env.example", /^ASRBOX_VERSION=[^\s#]+/m, `ASRBOX_VERSION=${next}`],
  ];
  for (const [file, pattern, replacement] of rewrites) {
    const filePath = path.join(root, file);
    const contents = await readFile(filePath, "utf8");
    if (!pattern.test(contents)) {
      throw new Error(`${file}: version anchor not found`);
    }
    await writeFile(filePath, contents.replace(pattern, replacement));
    edited.push(file);
  }

  for (const [file, pattern, replacement] of [
    ["README.md", /(当前源码版本为\s*)`[^`]+`/, `$1\`${next}\``],
    ["README.en.md", /(current source version is\s*)`[^`]+`/i, `$1\`${next}\``],
  ]) {
    const filePath = path.join(root, file);
    const contents = await readFile(filePath, "utf8");
    if (!pattern.test(contents)) {
      throw new Error(`${file}: source-version anchor not found`);
    }
    await writeFile(filePath, contents.replace(pattern, replacement).replace(/releases\/tag\/v[^)\s]+/, `releases/tag/v${next}`));
    edited.push(file);
  }
  const releaseGuidePath = path.join(root, "docs/release.md");
  const releaseGuide = await readFile(releaseGuidePath, "utf8");
  await writeFile(releaseGuidePath, releaseGuide.replace(/releases\/tag\/v[^)\s]+/, `releases/tag/v${next}`));
  edited.push("docs/release.md");

  await bumpChangelog(root, current, next);
  edited.push("CHANGELOG.md");

  const notesPath = path.join(root, "docs/releases", `v${next}.md`);
  try {
    await readFile(notesPath, "utf8");
  } catch {
    await writeFile(
      notesPath,
      `# ASRbox v${next}\n\n> TODO: write release highlights before tagging.\n\n## Assets\n\n- ASRbox_${next}_aarch64.dmg\n- ASRbox_${next}_x64-setup.exe\n`,
    );
    edited.push(`docs/releases/v${next}.md (skeleton)`);
  }

  if (regenLocks) {
    await regenerateLockfiles(root, next);
  }

  const verified = await checkVersions(root);
  return { current, next: verified, edited };
}

async function bumpChangelog(root, current, next) {
  const filePath = path.join(root, "CHANGELOG.md");
  let text = await readFile(filePath, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  if (/^## \[Unreleased\]\s*$/m.test(text)) {
    text = text.replace(/^## \[Unreleased\]\s*$/m, `## [Unreleased]\n\n## [${next}] - ${today}`);
  } else if (!new RegExp(`^## \\[${escapeRegExp(next)}\\]`, "m").test(text)) {
    throw new Error("CHANGELOG.md: no [Unreleased] section to promote");
  }
  const repo = text.match(/^\[Unreleased\]:\s*(\S+)\/compare\//m)?.[1] ?? DEFAULT_REPO;
  const unreleasedLine = /^\[Unreleased\]:\s*\S+\s*$/m;
  const unreleased = `[Unreleased]: ${repo}/compare/v${next}...HEAD`;
  text = unreleasedLine.test(text)
    ? text.replace(unreleasedLine, unreleased)
    : `${text.replace(/\s+$/, "")}\n\n${unreleased}\n`;
  if (!new RegExp(`^\\[${escapeRegExp(next)}\\]:`, "m").test(text)) {
    text = text.replace(unreleased, `${unreleased}\n[${next}]: ${repo}/compare/v${current}...v${next}`);
  }
  await writeFile(filePath, text);
}

async function regenerateLockfiles(root, next) {
  const bun = spawnSync("bun", ["install", "--lockfile-only"], { cwd: root, stdio: "inherit" });
  if (bun.status !== 0) {
    console.warn("warning: bun install --lockfile-only failed; regenerate bun.lock manually");
  } else {
    // bun install does not refresh workspace version stamps on a version-only
    // change, so pin them explicitly to keep check-versions green.
    await pinBunWorkspaceVersions(root, next);
  }
  const cargo = spawnSync("cargo", ["check", "--quiet", "--manifest-path", "tauri/src-tauri/Cargo.toml"], { cwd: root, stdio: "inherit" });
  if (cargo.status !== 0) {
    console.warn("warning: cargo check failed; regenerate tauri/src-tauri/Cargo.lock manually");
  }
}

export async function pinBunWorkspaceVersions(root, next) {
  const lockPath = path.join(root, "bun.lock");
  let text = await readFile(lockPath, "utf8");
  for (const key of ["app", "tauri", "web"]) {
    text = text.replace(
      new RegExp(`("${key}":\\s*\\{\\s*"name":\\s*"@asrbox/${key}",\\s*"version":\\s*")[^"]+`),
      `$1${next}`,
    );
  }
  await writeFile(lockPath, text);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const next = args.find((arg) => !arg.startsWith("--"))?.replace(/^v/, "");
  if (!next) {
    console.error("Usage: npm run version:bump -- <X.Y.Z> [--no-lock-regen]");
    process.exitCode = 1;
    return;
  }
  const result = await bumpVersion(root, next, { regenLocks: !args.includes("--no-lock-regen") });
  console.log(`Bumped ${result.current} -> ${result.next}`);
  for (const file of result.edited) {
    console.log(`  updated ${file}`);
  }
  console.log("Version check passed.");
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
