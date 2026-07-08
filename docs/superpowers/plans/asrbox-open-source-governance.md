# ASRbox Open Source Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Use `verification-before-completion` before claiming completion.

**Goal:** Normalize ASRbox as a sustainable open source project with MIT licensing, contribution rules, issue/PR templates, CI, compliance notes, and release documentation.

**Architecture:** Project governance lives at the repository root and `.github/`. Long-form maintenance docs live in `docs/`. CI is split into normal checks and release packaging.

**Tech Stack:** GitHub Actions, Bun, Python/FastAPI, Rust/Tauri, Markdown, YAML.

---

## Phase Checklist

- [x] Phase 1: Add MIT license, governance files, changelog, and Superpowers plan record.
- [x] Phase 2: Add GitHub issue templates and pull request template.
- [x] Phase 3: Add normal CI for push and pull request quality gates.
- [x] Phase 4: Add third-party notices, privacy, model, troubleshooting, and release docs.
- [x] Phase 5: Verify files, run checks, commit, push, and inspect GitHub Actions.

## Verification Commands

```bash
git diff --check
npm run typecheck
npm run build:web
npm run test:backend
cd tauri/src-tauri && cargo check && cargo test
```

## Release Discipline

- Use MIT as the project license.
- Keep release packaging in `.github/workflows/release.yml`.
- Use `.github/workflows/ci.yml` for regular PR/push checks.
- Update `CHANGELOG.md` before tagging a release.
- Update `THIRD_PARTY_NOTICES.md` when vendoring or adding dependencies.

## Implementation Log

- Phase 1 commit: `7c01657 docs: add open source governance files`
- Phase 2 commit: `5e34d64 docs: add contribution templates`
- Phase 3 commit: `a38f91d ci: add pull request quality checks`
- Phase 4 commit: `cfd50e6 docs: add compliance and release guides`
- Phase 5 local verification:
  - YAML parse for `.github/**/*.yml`
  - `git diff --check`
  - `npm run typecheck`
  - `npm run build:web`
  - `npm run test:backend`
  - `cargo check`
  - `cargo test`
- Phase 5 GitHub verification: inspect Actions after pushing `main`.
