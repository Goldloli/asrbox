import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECKSUM_LINE = /^([0-9A-Fa-f]{64})  ([^\s/\\]+)$/;

export function validateChecksumManifest(contents, expectedFilenames) {
  const expected = new Set(expectedFilenames);
  if (expected.size !== expectedFilenames.length) {
    throw new Error("Expected release asset names must be unique");
  }

  const lines = contents.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0) {
    throw new Error("SHA256SUMS.txt is empty");
  }

  const checksums = new Map();
  for (const [index, line] of lines.entries()) {
    const match = CHECKSUM_LINE.exec(line);
    if (!match || match[2] === "." || match[2] === "..") {
      throw new Error(
        `SHA256SUMS.txt line ${index + 1} must contain a SHA-256 digest and a release-root basename`,
      );
    }
    const [, digest, filename] = match;
    if (checksums.has(filename)) {
      throw new Error(`SHA256SUMS.txt contains duplicate entry: ${filename}`);
    }
    checksums.set(filename, digest.toLowerCase());
  }

  const missing = [...expected].filter((filename) => !checksums.has(filename));
  const unexpected = [...checksums.keys()].filter((filename) => !expected.has(filename));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`missing: ${missing.join(", ")}`);
    if (unexpected.length > 0) details.push(`unexpected: ${unexpected.join(", ")}`);
    throw new Error(`SHA256SUMS.txt asset set mismatch (${details.join("; ")})`);
  }

  return checksums;
}

async function main() {
  const [manifestPath, ...expectedFilenames] = process.argv.slice(2);
  if (!manifestPath || expectedFilenames.length === 0) {
    throw new Error(
      "Usage: node scripts/verify-release-checksums.mjs <SHA256SUMS.txt> <asset>...",
    );
  }
  const contents = await readFile(manifestPath, "utf8");
  validateChecksumManifest(contents, expectedFilenames);
  console.log(`Verified canonical checksums for ${expectedFilenames.length} release assets.`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
