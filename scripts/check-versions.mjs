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
  versions.set("tauri/src-tauri/Cargo.toml", matchVersion(cargo, /^version\s*=\s*"([^"]+)"/m));
  versions.set("backend/__init__.py", matchVersion(backend, /^__version__\s*=\s*"([^"]+)"/m));

  const expected = versions.get("package.json");
  const mismatches = [...versions].filter(([, version]) => version !== expected);
  if (!expected || mismatches.length > 0) {
    const details = [...versions].map(([file, version]) => `${file}: ${version ?? "missing"}`).join("\n");
    throw new Error(`Version mismatch:\n${details}`);
  }
  return expected;
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
