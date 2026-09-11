import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { pinBunWorkspaceVersions } from "./bump-version.mjs";

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

test("pinBunWorkspaceVersions leaves unrelated versions untouched", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "asrbox-bump-"));
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
