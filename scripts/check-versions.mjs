import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JSON_FILES = [
  "package.json",
  "app/package.json",
  "web/package.json",
  "tauri/package.json",
  "tauri/src-tauri/tauri.conf.json",
];

export async function checkVersions(root) {
  const versions = new Map();
  for (const file of JSON_FILES) {
    const value = JSON.parse(await readFile(path.join(root, file), "utf8"));
    versions.set(file, value.version);
  }

  const cargo = await readFile(path.join(root, "tauri/src-tauri/Cargo.toml"), "utf8");
  const backend = await readFile(path.join(root, "backend/__init__.py"), "utf8");
  const viteConfig = await readFile(path.join(root, "web/vite.config.ts"), "utf8");
  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  const compose = await readFile(path.join(root, "compose.yaml"), "utf8");
  const envExample = await readFile(path.join(root, ".env.example"), "utf8");
  const bunLock = await readFile(path.join(root, "bun.lock"), "utf8");
  const cargoLock = await readFile(path.join(root, "tauri/src-tauri/Cargo.lock"), "utf8");
  versions.set("tauri/src-tauri/Cargo.toml", matchVersion(cargo, /^version\s*=\s*"([^"]+)"/m));
  versions.set("backend/__init__.py", matchVersion(backend, /^__version__\s*=\s*"([^"]+)"/m));
  versions.set("Dockerfile", matchVersion(dockerfile, /^ARG APP_VERSION=([^\s#]+)/m));
  versions.set(
    "compose.yaml",
    matchVersion(compose, /APP_VERSION:\s*\$\{ASRBOX_VERSION:-([^}]+)\}/),
  );
  versions.set(".env.example", matchVersion(envExample, /^ASRBOX_VERSION=([^\s#]+)/m));

  const expected = versions.get("package.json");
  if (expected) {
    validateReleaseTag(`v${expected}`, expected);
  }
  const bunWorkspaces = parseBunWorkspaceVersions(bunLock);
  for (const workspace of ["app", "web", "tauri"]) {
    versions.set(`bun.lock#workspaces.${workspace}`, bunWorkspaces[workspace]);
  }
  versions.set(
    "tauri/src-tauri/Cargo.lock#asrbox",
    matchVersion(
      cargoLock,
      /\[\[package\]\]\s*\nname\s*=\s*"asrbox"\s*\nversion\s*=\s*"([^"]+)"/m,
    ),
  );

  if (expected) {
    const readmeZh = await readOptional(path.join(root, "README.md"));
    const readmeEn = await readOptional(path.join(root, "README.en.md"));
    const releaseGuide = await readOptional(path.join(root, "docs/release.md"));
    const releaseNotes = await readOptional(
      path.join(root, `docs/releases/v${expected}.md`),
    );
    versions.set(
      "README.md#source",
      matchVersion(readmeZh ?? "", /当前源码版本为\s*`([^`]+)`/),
    );
    versions.set(
      "README.md#release",
      matchVersion(readmeZh ?? "", /releases\/tag\/v([^)\s]+)/),
    );
    versions.set(
      "README.en.md#source",
      matchVersion(readmeEn ?? "", /current source version is\s*`([^`]+)`/i),
    );
    versions.set(
      "README.en.md#release",
      matchVersion(readmeEn ?? "", /releases\/tag\/v([^)\s]+)/),
    );
    versions.set(
      "docs/release.md#current",
      matchVersion(releaseGuide ?? "", /releases\/tag\/v([^)\s]+)/),
    );
    const expectedTag = `v${expected}`;
    const expectedDmg = `ASRbox_${expected}_aarch64.dmg`;
    const expectedNsis = `ASRbox_${expected}_x64-setup.exe`;
    versions.set(
      "release notes",
      releaseNotes?.includes(expectedTag)
        && releaseNotes.includes(expectedDmg)
        && releaseNotes.includes(expectedNsis)
        ? expected
        : undefined,
    );
    const changelog = await readOptional(path.join(root, "CHANGELOG.md"));
    const escapedExpected = escapeRegExp(expected);
    versions.set(
      "CHANGELOG.md#section",
      changelog && new RegExp(`^## \\[${escapedExpected}\\]`, "m").test(changelog) ? expected : undefined,
    );
    versions.set(
      "CHANGELOG.md#link",
      changelog && new RegExp(`^\\[${escapedExpected}\\]:\\s*\\S+`, "m").test(changelog) ? expected : undefined,
    );
    versions.set(
      "CHANGELOG.md#unreleased",
      changelog && new RegExp(`^\\[Unreleased\\]:\\s*\\S+/compare/v${escapedExpected}\\.\\.\\.HEAD\\s*$`, "m").test(changelog)
        ? expected
        : undefined,
    );
  }

  const frontendVersionIsBound =
    /const applicationVersion\s*=\s*[\s\S]*new URL\(['"]\.\.\/package\.json['"]/.test(viteConfig)
    && /__ASRBOX_VERSION__\s*:\s*JSON\.stringify\(applicationVersion\)/.test(viteConfig);
  versions.set(
    "web/vite.config.ts",
    frontendVersionIsBound ? expected : undefined,
  );
  const mismatches = [...versions].filter(([, version]) => version !== expected);
  if (!expected || mismatches.length > 0) {
    const details = [...versions].map(([file, version]) => `${file}: ${version ?? "missing"}`).join("\n");
    throw new Error(`Version mismatch:\n${details}`);
  }
  await checkCudaKitLockParity(root);
  return expected;
}

async function checkCudaKitLockParity(root) {
  const cpuLock = await readOptional(path.join(root, "requirements-windows.lock"));
  const cudaLock = await readOptional(path.join(root, "requirements-windows-cuda.lock"));
  if (!cpuLock || !cudaLock) {
    return;
  }
  const cpu = cpuLock.match(/^torch==([^\s+]+)\s*$/m)?.[1];
  const cuda = cudaLock.match(/^torch==([^\s+]+)\+cu(\d+)\s*$/m);
  if (!cpu || !cuda || cuda[1] !== cpu) {
    throw new Error(
      `CUDA kit lock torch mismatch: requirements-windows.lock torch==${cpu ?? "missing"} must share the base version of requirements-windows-cuda.lock ${cuda ? `torch==${cuda[1]}+cu${cuda[2]}` : "(expected torch==<base>+cuXXX)"}`,
    );
  }
}

export function validateReleaseTag(tag, version) {
  const semverTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  if (!semverTag.test(tag)) {
    throw new Error(`Invalid release tag: ${JSON.stringify(tag)}`);
  }
  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} does not match application version ${version}`);
  }
  return tag;
}

function matchVersion(contents, pattern) {
  return contents.match(pattern)?.[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBunWorkspaceVersions(contents) {
  try {
    const withoutTrailingCommas = contents.replace(/,(\s*[}\]])/g, "$1");
    const parsed = JSON.parse(withoutTrailingCommas);
    return Object.fromEntries(
      Object.entries(parsed.workspaces ?? {}).map(([name, value]) => [
        name,
        value?.version,
      ]),
    );
  } catch {
    return {};
  }
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const version = await checkVersions(root);
  const tagFlag = process.argv.indexOf("--tag");
  const tag = tagFlag >= 0 ? process.argv[tagFlag + 1] : process.env.RELEASE_TAG;
  if (tag) validateReleaseTag(tag, version);
  console.log(`Version check passed: ${version}${tag ? ` (${tag})` : ""}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
