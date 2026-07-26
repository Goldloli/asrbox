import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkVersions, validateReleaseTag } from "./check-versions.mjs";

async function fixture(version, backendVersion = version) {
  const root = await mkdtemp(path.join(tmpdir(), "asrbox-versions-"));
  for (const directory of ["app", "web", "tauri", "tauri/src-tauri", "backend"]) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  for (const file of ["package.json", "app/package.json", "web/package.json", "tauri/package.json"]) {
    await writeFile(path.join(root, file), JSON.stringify({ version }));
  }
  await writeFile(path.join(root, "tauri/src-tauri/Cargo.toml"), `[package]\nversion = "${version}"\n`);
  await writeFile(path.join(root, "tauri/src-tauri/tauri.conf.json"), JSON.stringify({ version }));
  await writeFile(path.join(root, "backend/__init__.py"), `__version__ = "${backendVersion}"\n`);
  await writeFile(
    path.join(root, "web/vite.config.ts"),
    "const applicationVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;\n"
      + "define: { __ASRBOX_VERSION__: JSON.stringify(applicationVersion) },\n",
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

test("release tag must be safe semver and match the application", () => {
  assert.equal(validateReleaseTag("v0.1.0-beta.1", "0.1.0-beta.1"), "v0.1.0-beta.1");
  assert.throws(() => validateReleaseTag("v0.1.0\nBAD=1", "0.1.0"), /Invalid release tag/);
  assert.throws(() => validateReleaseTag("v0.1.0", "0.1.0-beta.1"), /does not match/);
});
