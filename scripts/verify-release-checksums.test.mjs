import assert from "node:assert/strict";
import test from "node:test";

import { validateChecksumManifest } from "./verify-release-checksums.mjs";

const digest = (character) => character.repeat(64);
const line = (character, filename) => `${digest(character)}  ${filename}`;

function nextPatch(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

test("accepts canonical checksums for both next-release installers", () => {
  const maintainedClientVersion = "7.11.3";
  const releaseVersion = nextPatch(maintainedClientVersion);
  const assets = [
    `ASRbox_${releaseVersion}_aarch64.dmg`,
    `ASRbox_${releaseVersion}_x64-setup.exe`,
    "ASRbox-ffmpeg-source-8.1.2.tar.gz",
    "asrbox-cuda-kit-windows-x64.zip.part1",
    "cuda-kit-manifest.json",
  ];
  const contents = `${assets.map((asset, index) => line(String(index + 1), asset)).join("\n")}\n`;

  const checksums = validateChecksumManifest(contents, assets);

  assert.equal(checksums.get(assets[0]), digest("1"));
  assert.equal(checksums.get(assets[1]), digest("2"));
});

test("rejects the legacy relative prefix for macOS and Windows installers", () => {
  for (const filename of ["ASRbox_8.0.0_aarch64.dmg", "ASRbox_8.0.0_x64-setup.exe"]) {
    assert.throws(
      () => validateChecksumManifest(`${line("a", `./${filename}`)}\n`, [filename]),
      /release-root basename/,
    );
  }
});

test("rejects directory components and absolute paths", () => {
  for (const unsafe of ["nested/app.dmg", "nested\\app.dmg", "../app.dmg", "/tmp/app.dmg"]) {
    assert.throws(
      () => validateChecksumManifest(`${line("a", unsafe)}\n`, ["app.dmg"]),
      /release-root basename/,
    );
  }
});

test("rejects malformed digests and checksum separators", () => {
  assert.throws(
    () => validateChecksumManifest(`${"a".repeat(63)}  app.dmg\n`, ["app.dmg"]),
    /release-root basename/,
  );
  assert.throws(
    () => validateChecksumManifest(`${digest("g")}  app.dmg\n`, ["app.dmg"]),
    /release-root basename/,
  );
  assert.throws(
    () => validateChecksumManifest(`${digest("a")} *app.dmg\n`, ["app.dmg"]),
    /release-root basename/,
  );
});

test("rejects duplicate, missing, and unexpected assets", () => {
  assert.throws(
    () => validateChecksumManifest(`${line("a", "app.dmg")}\n${line("b", "app.dmg")}\n`, ["app.dmg"]),
    /duplicate entry/,
  );
  assert.throws(
    () => validateChecksumManifest(`${line("a", "app.dmg")}\n`, ["app.dmg", "setup.exe"]),
    /missing: setup\.exe/,
  );
  assert.throws(
    () => validateChecksumManifest(`${line("a", "app.dmg")}\n${line("b", "extra.txt")}\n`, ["app.dmg"]),
    /unexpected: extra\.txt/,
  );
});
