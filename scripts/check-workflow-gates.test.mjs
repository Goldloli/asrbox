import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const workflow of [".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
  test(`${workflow} runs every maintained frontend gate`, async () => {
    const content = await readFile(workflow, "utf8");

    assert.match(content, /npm run test:frontend:unit/);
    assert.match(content, /npm run test:e2e:maintained/);
    assert.doesNotMatch(content, /npm run test:e2e:(smoke|llm)/);
  });
}
