import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates =
  process.platform === "win32"
    ? [path.join(root, ".venv", "Scripts", "python.exe"), path.join(root, ".venv", "bin", "python")]
    : [path.join(root, ".venv", "bin", "python"), path.join(root, ".venv", "Scripts", "python.exe")];
const python = candidates.find((candidate) => existsSync(candidate));

if (!python) {
  console.error("Python virtualenv not found at .venv; create it before running this command.");
  process.exit(1);
}

const args = process.argv.slice(2);
const env = {};
while (args.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0])) {
  const assignment = args.shift();
  const separator = assignment.indexOf("=");
  env[assignment.slice(0, separator)] = assignment.slice(separator + 1);
}

const result = spawnSync(python, args, { stdio: "inherit", env: { ...process.env, ...env } });
if (result.error) {
  console.error(String(result.error));
  process.exit(1);
}
process.exit(result.status ?? 1);
