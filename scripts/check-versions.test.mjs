import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkVersions, validateReleaseTag } from "./check-versions.mjs";

async function fixture(version, backendVersion = version) {
  const root = await mkdtemp(path.join(tmpdir(), "asrbox-versions-"));
  for (const directory of ["app", "web", "tauri", "tauri/src-tauri", "backend", "docs/releases"]) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  for (const file of ["package.json", "app/package.json", "web/package.json", "tauri/package.json"]) {
    await writeFile(path.join(root, file), JSON.stringify({ version }));
  }
  await writeFile(path.join(root, "tauri/src-tauri/Cargo.toml"), `[package]\nversion = "${version}"\n`);
  await writeFile(path.join(root, "tauri/src-tauri/tauri.conf.json"), JSON.stringify({ version }));
  await writeFile(path.join(root, "backend/__init__.py"), `__version__ = "${backendVersion}"\n`);
  await writeFile(path.join(root, "Dockerfile"), `ARG APP_VERSION=${version}\n`);
  await writeFile(
    path.join(root, "compose.yaml"),
    `services:\n  asrbox:\n    build:\n      args:\n        APP_VERSION: \${ASRBOX_VERSION:-${version}}\n`,
  );
  await writeFile(path.join(root, ".env.example"), `ASRBOX_VERSION=${version}\n`);
  await writeFile(
    path.join(root, "bun.lock"),
    `{
  "workspaces": {
    "app": { "version": "${version}" },
    "tauri": { "version": "${version}" },
    "web": { "version": "${version}" },
  },
}\n`,
  );
  await writeFile(
    path.join(root, "tauri/src-tauri/Cargo.lock"),
    `[[package]]\nname = "asrbox"\nversion = "${version}"\ndependencies = []\n`,
  );
  await writeFile(
    path.join(root, "README.md"),
    `当前源码版本为 \`${version}\`\n从 [\`v${version}\` Release](https://github.com/Goldloli/asrbox/releases/tag/v${version}) 下载\n`,
  );
  await writeFile(
    path.join(root, "README.en.md"),
    `The current source version is \`${version}\`.\nDownload from the [\`v${version}\` Release](https://github.com/Goldloli/asrbox/releases/tag/v${version}).\n`,
  );
  await writeFile(
    path.join(root, "docs/release.md"),
    `Current release: [\`v${version}\`](https://github.com/Goldloli/asrbox/releases/tag/v${version}).\n`,
  );
  await writeFile(
    path.join(root, `docs/releases/v${version}.md`),
    `ASRbox \`v${version}\`\nhttps://github.com/Goldloli/asrbox/releases/download/v${version}/ASRbox_${version}_aarch64.dmg\nhttps://github.com/Goldloli/asrbox/releases/download/v${version}/ASRbox_${version}_x64-setup.exe\n`,
  );
  await writeFile(
    path.join(root, "web/vite.config.ts"),
    "const applicationVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;\n"
      + "define: { __ASRBOX_VERSION__: JSON.stringify(applicationVersion) },\n",
  );
  await writeFile(
    path.join(root, "CHANGELOG.md"),
    `# Changelog\n\n## [Unreleased]\n\n## [${version}] - 2026-07-05\n\n### Added\n\n- Entry.\n\n[Unreleased]: https://github.com/Goldloli/asrbox/compare/v${version}...HEAD\n[${version}]: https://github.com/Goldloli/asrbox/releases/tag/v${version}\n`,
  );
  return root;
}

test("accepts one version across every application surface", async () => {
  const root = await fixture("0.1.0-beta.1");
  assert.equal(await checkVersions(root), "0.1.0-beta.1");
});

test("rejects a mismatched version", async () => {
  const root = await fixture("0.1.0-beta.1", "0.1.0");
  await assert.rejects(checkVersions(root), /Version mismatch/);
});

test("rejects a missing frontend build-version binding", async () => {
  const root = await fixture("0.1.0-beta.1");
  await writeFile(path.join(root, "web/vite.config.ts"), "define: {},\n");
  await assert.rejects(checkVersions(root), /Version mismatch/);
});

test("rejects drift in Docker release surfaces", async () => {
  const root = await fixture("0.1.0-beta.1");
  await writeFile(path.join(root, "Dockerfile"), "ARG APP_VERSION=0.1.0\n");
  await assert.rejects(checkVersions(root), /Dockerfile: 0.1.0/);
});

test("rejects drift in generated dependency lock versions", async () => {
  const bunRoot = await fixture("0.1.0-beta.1");
  await writeFile(
    path.join(bunRoot, "bun.lock"),
    '{"workspaces":{"app":{"version":"0.0.9"},"tauri":{"version":"0.1.0-beta.1"},"web":{"version":"0.1.0-beta.1"}}}\n',
  );
  await assert.rejects(checkVersions(bunRoot), /bun\.lock#workspaces\.app: 0\.0\.9/);

  const cargoRoot = await fixture("0.1.0-beta.1");
  await writeFile(
    path.join(cargoRoot, "tauri/src-tauri/Cargo.lock"),
    '[[package]]\nname = "asrbox"\nversion = "0.0.9"\n',
  );
  await assert.rejects(checkVersions(cargoRoot), /Cargo\.lock#asrbox: 0\.0\.9/);
});

test("requires version-matched current release documentation", async () => {
  const staleRoot = await fixture("0.1.0-beta.1");
  await writeFile(
    path.join(staleRoot, "README.md"),
    "当前源码版本为 `0.0.9`\n从 [`v0.0.9` Release](https://github.com/Goldloli/asrbox/releases/tag/v0.0.9) 下载\n",
  );
  await assert.rejects(checkVersions(staleRoot), /README\.md#source: 0\.0\.9/);

  const missingNotesRoot = await fixture("0.1.0-beta.1");
  await rm(path.join(missingNotesRoot, "docs/releases/v0.1.0-beta.1.md"));
  await assert.rejects(checkVersions(missingNotesRoot), /release notes: missing/);
});

test("release tag must be safe semver and match the application", () => {
  assert.equal(validateReleaseTag("v0.1.0-beta.1", "0.1.0-beta.1"), "v0.1.0-beta.1");
  assert.throws(() => validateReleaseTag("v0.1.0\nBAD=1", "0.1.0"), /Invalid release tag/);
  assert.throws(() => validateReleaseTag("v0.1.0", "0.1.0-beta.1"), /does not match/);
});

test("rejects stale CHANGELOG link references", async () => {
  const staleUnreleased = await fixture("0.1.0-beta.1");
  await writeFile(
    path.join(staleUnreleased, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n## [0.1.0-beta.1] - 2026-07-05\n\n[Unreleased]: https://github.com/Goldloli/asrbox/compare/v0.0.9...HEAD\n[0.1.0-beta.1]: https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-beta.1\n",
  );
  await assert.rejects(checkVersions(staleUnreleased), /CHANGELOG\.md#unreleased: missing/);

  const missingLink = await fixture("0.1.0-beta.1");
  await writeFile(
    path.join(missingLink, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n## [0.1.0-beta.1] - 2026-07-05\n\n[Unreleased]: https://github.com/Goldloli/asrbox/compare/v0.1.0-beta.1...HEAD\n",
  );
  await assert.rejects(checkVersions(missingLink), /CHANGELOG\.md#link: missing/);

  const missingSection = await fixture("0.1.0-beta.1");
  await writeFile(
    path.join(missingSection, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n[Unreleased]: https://github.com/Goldloli/asrbox/compare/v0.1.0-beta.1...HEAD\n[0.1.0-beta.1]: https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-beta.1\n",
  );
  await assert.rejects(checkVersions(missingSection), /CHANGELOG\.md#section: missing/);
});

test("CUDA kit lock torch base version must match the Windows runtime lock", async () => {
  const root = await fixture("0.1.0-beta.1");
  await writeFile(path.join(root, "requirements-windows.lock"), "torch==2.11.0\n");
  await writeFile(path.join(root, "requirements-windows-cuda.lock"), "torch==2.11.0+cu128\n");
  assert.equal(await checkVersions(root), "0.1.0-beta.1");

  const drifted = await fixture("0.1.0-beta.1");
  await writeFile(path.join(drifted, "requirements-windows.lock"), "torch==2.12.0\n");
  await writeFile(path.join(drifted, "requirements-windows-cuda.lock"), "torch==2.11.0+cu128\n");
  await assert.rejects(checkVersions(drifted), /CUDA kit lock torch mismatch/);

  const cpuBuild = await fixture("0.1.0-beta.1");
  await writeFile(path.join(cpuBuild, "requirements-windows.lock"), "torch==2.11.0\n");
  await writeFile(path.join(cpuBuild, "requirements-windows-cuda.lock"), "torch==2.11.0\n");
  await assert.rejects(checkVersions(cpuBuild), /CUDA kit lock torch mismatch/);
});
