import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { pinBunWorkspaceVersions, rewriteReleaseGuide } from "./bump-version.mjs";

test("pinBunWorkspaceVersions updates workspace version stamps only", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "asrbox-bump-"));
  try {
    const lock = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "asrbox",
    },
    "app": {
      "name": "@asrbox/app",
      "version": "0.1.9",
    },
    "tauri": {
      "name": "@asrbox/tauri",
      "version": "0.1.9",
    },
    "web": {
      "name": "@asrbox/web",
      "version": "0.1.9",
      "dependencies": {
        "@asrbox/app": "file:../app",
      },
    },
  },
  "packages": {
    "@asrbox/app": ["@asrbox/app@workspace:app"],
  },
}
`;
    await writeFile(path.join(root, "bun.lock"), lock);
    await pinBunWorkspaceVersions(root, "0.2.0");
    const updated = await readFile(path.join(root, "bun.lock"), "utf8");
    assert.equal(
      updated,
      lock.replaceAll('"version": "0.1.9"', '"version": "0.2.0"'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pinBunWorkspaceVersions leaves unrelated versions untouched", async () => {  const root = await mkdtemp(path.join(tmpdir(), "asrbox-bump-"));
  try {
    const lock = `{
  "workspaces": {
    "app": {
      "name": "@asrbox/app",
      "version": "0.1.9",
      "dependencies": {
        "vite": "^8.1.4",
      },
    },
    "other": {
      "name": "@example/other",
      "version": "0.1.9",
    },
  },
}
`;
    await writeFile(path.join(root, "bun.lock"), lock);
    await pinBunWorkspaceVersions(root, "0.2.0");
    const updated = await readFile(path.join(root, "bun.lock"), "utf8");
    assert.match(updated, /"@asrbox\/app",\s*"version": "0\.2\.0"/);
    assert.match(updated, /"@example\/other",\s*"version": "0\.1\.9"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rewriteReleaseGuide updates the current-release label and tag URL", () => {
  const guide = [
    "# Releasing",
    "",
    "Current release: [`v0.3.2`](https://github.com/Goldloli/asrbox/releases/tag/v0.3.2). Notes here.",
    "",
  ].join("\n");

  const updated = rewriteReleaseGuide(guide, "0.3.3");

  assert.equal(
    updated,
    [
      "# Releasing",
      "",
      "Current release: [`v0.3.3`](https://github.com/Goldloli/asrbox/releases/tag/v0.3.3). Notes here.",
      "",
    ].join("\n"),
  );
});

test("rewriteReleaseGuide rejects a guide without the current-release anchor", () => {
  assert.throws(() => rewriteReleaseGuide("# Releasing\n\nNo anchor here.\n", "0.3.3"), /anchor not found/);
});
