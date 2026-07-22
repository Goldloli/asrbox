# Summary

Describe the problem, the user-visible result, and why this is the smallest sufficient change.

# OpenSpec

- Change: <!-- openspec/changes/<change-name>, or N/A for an allowed direct change -->
- [ ] Accepted behavior and explicit non-goals remain current.

# Verification

List exact commands and results. Check every command actually run:

- [ ] `npm run check:open-source`
- [ ] `npm run audit:dependencies` when dependencies changed
- [ ] Focused backend/contract/browser test: <!-- command -->
- [ ] `npm run test:docker` when container, Linux dependencies, network binding, or `/data` behavior changed
- [ ] Manual desktop verification when startup, packaging, models, storage, media, or exports changed

# Impact

- [ ] Frontend / UI
- [ ] Backend / stable API
- [ ] Desktop startup or packaging
- [ ] Docker image, Compose, Linux runtime, or network exposure
- [ ] Models, downloads, or providers
- [ ] Storage, backup, privacy, or exports
- [ ] Dependencies, third-party licenses, or release assets
- [ ] Documentation only

# Evidence

Add screenshots for visible UI changes and concise sanitized logs for runtime changes. Do not attach private media, transcripts, credentials, databases, backups, or unredacted diagnostic bundles.

# Checklist

- [ ] Tests reproduce the bug or cover the new behavior.
- [ ] Maintained API changes update OpenSpec, generated schemas, typed consumers, and contract tests.
- [ ] User-facing behavior and `CHANGELOG.md` are current.
- [ ] Third-party notices, model licenses, source records, and checksums are current when affected.
- [ ] No model weights, generated packages, local data, or secrets are committed.
