import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function releaseFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "asrbox-release-assets-"));
  const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const sourceDirectory = path.join(directory, "source");
  await mkdir(sourceDirectory);
  await writeFile(path.join(sourceDirectory, "ffmpeg-8.1.2.tar.xz"), "source");
  await writeFile(path.join(sourceDirectory, "LICENSE.GPLv3"), "license");

  const filenames = [
    `ASRbox_${version}_aarch64.dmg`,
    `ASRbox_${version}_x64-setup.exe`,
    "ASRbox-ffmpeg-source-8.1.2.tar.gz",
    "asrbox-cuda-kit-windows-x64.zip.part1",
    "cuda-kit-manifest.json",
  ];
  await writeFile(path.join(directory, filenames[0]), "dmg");
  await writeFile(path.join(directory, filenames[1]), "nsis");
  await execFileAsync("tar", [
    "-czf",
    path.join(directory, filenames[2]),
    "-C",
    sourceDirectory,
    ".",
  ]);
  await writeFile(path.join(directory, filenames[3]), "cuda-part");
  await writeFile(path.join(directory, filenames[4]), "{}\n");
  await rm(sourceDirectory, { recursive: true });

  const checksums = await Promise.all(
    filenames.map(async (filename) => `${await sha256(path.join(directory, filename))}  ${filename}`),
  );
  await writeFile(path.join(directory, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
  return { directory, filenames, version };
}

test("release asset verification accepts one canonical manifest", async (context) => {
  const { directory, version } = await releaseFixture();
  context.after(() => rm(directory, { recursive: true, force: true }));

  const result = await execFileAsync("bash", ["scripts/verify-release-assets.sh", directory], {
    cwd: root,
  });

  assert.match(result.stdout, /Verified canonical checksums for 5 release assets/);
  assert.ok(result.stdout.includes(`Verified release assets for ASRbox ${version}`));
});

test("release asset verification rejects legacy relative paths", async (context) => {
  const { directory, filenames } = await releaseFixture();
  context.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = path.join(directory, "SHA256SUMS.txt");
  await writeFile(
    manifest,
    (await readFile(manifest, "utf8")).replace(filenames[0], `./${filenames[0]}`),
  );

  await assert.rejects(
    execFileAsync("bash", ["scripts/verify-release-assets.sh", directory], { cwd: root }),
    (error) => {
      assert.match(error.stderr, /release-root basename/);
      return true;
    },
  );
});
