# ASRbox 0.1.0-beta.1 Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish accurate ASRbox `0.1.0-beta.1` product and contributor documentation, verify the pending model-management fixes, and deliver the verified branch to `main` on GitHub.

**Architecture:** Keep the Chinese and English README files as aligned landing pages, then place model, privacy, troubleshooting, CI, release, governance, and backend-contract detail in their existing focused documents. Preserve legal text and historical artifacts, derive claims from code and test evidence, and validate the complete repository before merging.

**Tech Stack:** Markdown, Git, Bun/npm scripts, Playwright, pytest, Rust/Cargo, GitHub CLI.

---

## File Map

- `README.md`: primary Chinese user and developer introduction.
- `README.en.md`: English mirror of the README structure and claims.
- `docs/models.md`: 14-model catalog, download controls, storage, selection, and licensing.
- `docs/troubleshooting.md`: actionable desktop, media-runtime, model, disk, and diagnostics guidance.
- `docs/privacy.md`: local and online data boundaries, storage, backup, deletion, and uninstall.
- `docs/ci.md`: checks performed by the current CI and release workflows.
- `docs/release.md`: versioning, verification, packaging, assets, and unsigned-beta release procedure.
- `CONTRIBUTING.md`: development setup, change workflow, verification, and dependency rules.
- `SECURITY.md`: supported versions, private reporting, security boundaries, and exclusions.
- `.github/ABOUT.md`, `.github/pull_request_template.md`, `docs/labels.md`: repository metadata and contribution triage.
- `CHANGELOG.md`: the pending model-management and packaged-runtime changes for the current prerelease.
- `backend/API_FREEZE.md`: current stable model-download routes and response semantics.
- `backend/MATURITY_REPORT.md`: current test evidence, 14-model verification, and remaining beta limitations.

### Task 1: Verify and Commit Pending Model-Management Fixes

**Files:**

- Modify: `app/src/components/models/ModelManagement.tsx`
- Modify: `app/src/lib/api.ts`
- Modify: `app/src/lib/i18n.ts`
- Modify: `app/src/routes/ModelsPage.tsx`
- Modify: `backend/backends/local_asr.py`
- Modify: `backend/build_binary.py`
- Modify: `backend/models.py`
- Modify: `backend/routes/models.py`
- Modify: `backend/server.py`
- Modify: `backend/services/models.py`
- Modify: `backend/services/tasks.py`
- Modify: `backend/tests/test_api.py`
- Modify: `backend/utils/hf_progress.py`
- Create: `app/e2e/models-download-controls.spec.ts`
- Test: `backend/tests/test_api.py`
- Test: `app/e2e/models-download-controls.spec.ts`

- [ ] **Step 1: Review the pending product diff**

Run:

```bash
git diff -- app/src backend app/e2e/models-download-controls.spec.ts
git diff --check
```

Expected: only model storage, download controls, runtime compatibility, task behavior, and their tests are changed; no whitespace errors.

- [ ] **Step 2: Run focused backend verification**

Run:

```bash
npm run test:backend
```

Expected: all backend tests pass.

- [ ] **Step 3: Run the download-control browser test**

Run:

```bash
bunx playwright test app/e2e/models-download-controls.spec.ts
```

Expected: the model download controls test passes.

- [ ] **Step 4: Commit the verified product changes**

Run:

```bash
git add app/src/components/models/ModelManagement.tsx app/src/lib/api.ts app/src/lib/i18n.ts app/src/routes/ModelsPage.tsx app/e2e/models-download-controls.spec.ts backend/backends/local_asr.py backend/build_binary.py backend/models.py backend/routes/models.py backend/server.py backend/services/models.py backend/services/tasks.py backend/tests/test_api.py backend/utils/hf_progress.py
git diff --cached --check
git commit -m "feat: add resilient model download controls"
```

Expected: one focused product commit, with the documentation files still unmodified.

### Task 2: Rewrite the Chinese and English Landing Pages

**Files:**

- Modify: `README.md`
- Modify: `README.en.md`

- [ ] **Step 1: Replace both README structures with aligned sections**

Use this shared section order in both languages:

```text
ASRbox
Public beta status
What it can do
Download and first launch
First transcription
Local models
Where data is stored
Architecture
Development
Build and release
Verification
Documentation
Security and privacy
Contributing
License
```

Expected content: version `0.1.0-beta.1`, macOS Apple Silicon support, unsigned/notarized limitation, 14 downloadable models, pause/resume/stop/retry behavior, export formats, default data and export paths, exact package scripts, and links to focused documentation.

- [ ] **Step 2: Compare the two README outlines**

Run:

```bash
rg '^## ' README.md
rg '^## ' README.en.md
```

Expected: headings have the same count and equivalent order.

- [ ] **Step 3: Check README claims against source files**

Run:

```bash
rg '0.1.0-beta.1|com.goldloli.asrbox|check:open-source|build:desktop' README.md README.en.md package.json tauri/src-tauri/tauri.conf.json
```

Expected: documented version, identifier, and commands match source configuration.

### Task 3: Rewrite User Reference Documentation

**Files:**

- Modify: `docs/models.md`
- Modify: `docs/troubleshooting.md`
- Modify: `docs/privacy.md`

- [ ] **Step 1: Rewrite the model guide from the registry**

Document all 14 exact model identifiers and group them by engine:

```text
whisper-base
whisper-small
whisper-medium
whisper-large-v3
whisper-large-v3-turbo
faster-whisper-base
faster-whisper-small
faster-whisper-medium
faster-whisper-large-v3
faster-whisper-large-v3-turbo
mlx-whisper-turbo
sensevoice-small
qwen3-asr-0.6b
qwen3-asr-1.7b
```

Include registry estimates, source fallback, model selection guidance, pause/resume/stop/retry semantics, `<data-root>/models/<model-name>/`, incomplete cache behavior, deletion behavior, and upstream-license responsibility.

- [ ] **Step 2: Rewrite troubleshooting as symptom-check-fix procedures**

Cover backend startup, unsigned macOS launch, ffmpeg/ffprobe, TorchCodec/model runtime compatibility, stalled or failed model downloads, pause/stop/retry, unexpectedly high disk use, Qwen3-ASR, exports, and diagnostic bundle generation.

- [ ] **Step 3: Rewrite privacy and deletion guidance**

Document local processing, online-provider transfers, plaintext provider credentials in `asrbox.db` and backups, loopback token limits, stored subdirectories, task/model deletion, export retention, and complete macOS uninstall.

- [ ] **Step 4: Verify catalog and path coverage**

Run:

```bash
for model in whisper-base whisper-small whisper-medium whisper-large-v3 whisper-large-v3-turbo faster-whisper-base faster-whisper-small faster-whisper-medium faster-whisper-large-v3 faster-whisper-large-v3-turbo mlx-whisper-turbo sensevoice-small qwen3-asr-0.6b qwen3-asr-1.7b; do rg -q "$model" docs/models.md || exit 1; done
rg -n 'Application Support/com.goldloli.asrbox|models/<model-name>|ASRbox Exports' docs/models.md docs/privacy.md docs/troubleshooting.md
```

Expected: every model and storage location is documented.

### Task 4: Rewrite Maintainer, Governance, and Backend Documents

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`
- Modify: `.github/ABOUT.md`
- Modify: `.github/pull_request_template.md`
- Modify: `docs/ci.md`
- Modify: `docs/labels.md`
- Modify: `docs/release.md`
- Modify: `backend/API_FREEZE.md`
- Modify: `backend/MATURITY_REPORT.md`

- [ ] **Step 1: Align contribution and repository metadata**

Use the exact setup and verification commands from `package.json`; require focused changes, relevant tests, third-party notice updates, no models/media/secrets, and explicit privacy/release impact in pull requests. Update the repository description and labels to mention macOS Apple Silicon beta, model management, runtime, storage, and documentation.

- [ ] **Step 2: Align security, CI, and release documents**

Document current loopback-token boundaries, plaintext provider keys, unsigned DMG limitation, current CI steps, `npm run check:open-source`, release tag/version consistency, DMG/source/checksum assets, and post-build smoke checks.

- [ ] **Step 3: Update changelog and backend contract evidence**

Add the current model storage UI fix, pause/resume/stop/retry endpoints, resumable download behavior, TorchCodec-independent media loading path, frozen runtime imports, duplicate-weight filtering, and 14-model real-media verification. Update API routes and model-status semantics, and replace stale test counts or obsolete remaining-work claims in the maturity report.

- [ ] **Step 4: Verify workflow and API references**

Run:

```bash
rg -n 'check:open-source|test:e2e:smoke|build:desktop' package.json docs/ci.md docs/release.md CONTRIBUTING.md README.md README.en.md
rg -n 'pause-download|resume-download|cancel-download|retry-download' backend/routes/models.py backend/API_FREEZE.md docs/models.md docs/troubleshooting.md
```

Expected: command and endpoint names match the implementation.

### Task 5: Review and Commit the Documentation Set

**Files:**

- Modify: all files listed in Tasks 2 through 4

- [ ] **Step 1: Check scope and stale claims**

Run:

```bash
git status --short
git diff --stat
rg -n '0.1.0-rc.1|49 tests|2h23m|HF large-model downloads still pull|transformers.models.qwen3_asr' README.md README.en.md CHANGELOG.md CONTRIBUTING.md SECURITY.md docs backend/API_FREEZE.md backend/MATURITY_REPORT.md
```

Expected: only the planned documents are changed; any historical or still-valid match is intentionally explained.

- [ ] **Step 2: Check links and formatting**

Run:

```bash
test -f README.en.md && test -f CONTRIBUTING.md && test -f SECURITY.md && test -f docs/models.md && test -f docs/privacy.md && test -f docs/troubleshooting.md && test -f docs/ci.md && test -f docs/release.md && test -f THIRD_PARTY_NOTICES.md
git diff --check
```

Expected: referenced local documents exist and Markdown changes have no whitespace errors.

- [ ] **Step 3: Review the complete documentation diff**

Run:

```bash
git diff -- README.md README.en.md CHANGELOG.md CONTRIBUTING.md SECURITY.md .github/ABOUT.md .github/pull_request_template.md docs/ci.md docs/labels.md docs/models.md docs/privacy.md docs/release.md docs/troubleshooting.md backend/API_FREEZE.md backend/MATURITY_REPORT.md
```

Expected: claims are current, Chinese and English landing pages agree, and legal/historical files are untouched.

- [ ] **Step 4: Commit the documentation refresh**

Run:

```bash
git add README.md README.en.md CHANGELOG.md CONTRIBUTING.md SECURITY.md .github/ABOUT.md .github/pull_request_template.md docs/ci.md docs/labels.md docs/models.md docs/privacy.md docs/release.md docs/troubleshooting.md backend/API_FREEZE.md backend/MATURITY_REPORT.md docs/superpowers/plans/2026-07-13-documentation-refresh.md
git diff --cached --check
git commit -m "docs: rewrite guides for public beta"
```

Expected: one documentation commit containing only the planned maintained documents and this implementation plan.

### Task 6: Run the Release Gate and Deliver Main

**Files:**

- Verify: entire repository

- [ ] **Step 1: Run the complete open-source readiness gate**

Run:

```bash
npm run check:open-source
```

Expected: dependency installation/check, Python compilation, version checks, release-tool tests, third-party verification, typecheck, Web build, backend tests, Cargo checks/tests, and browser smoke all pass.

- [ ] **Step 2: Confirm a clean feature branch**

Run:

```bash
git status -sb
git log -3 --oneline
```

Expected: `codex/open-source-mvp-hardening` is clean and contains the design, product, and documentation commits.

- [ ] **Step 3: Finish the branch using the approved merge-and-push outcome**

Run:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git merge --no-ff codex/open-source-mvp-hardening
npm run check:open-source
git push origin main
git fetch origin main
test "$(git rev-parse main)" = "$(git rev-parse origin/main)"
```

Expected: GitHub `main` contains the verified model-management fixes and rewritten documentation.

### Task 7: Publish and Verify v0.1.0-beta.1

**Files:**

- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/release.md`
- Modify: `docs/superpowers/specs/2026-07-13-documentation-refresh-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-documentation-refresh.md`
- Verify: GitHub Release assets

- [ ] **Step 1: Commit and push the authorized release-documentation amendment**

Run:

```bash
git add README.md README.en.md CHANGELOG.md docs/release.md docs/superpowers/specs/2026-07-13-documentation-refresh-design.md docs/superpowers/plans/2026-07-13-documentation-refresh.md
git diff --cached --check
git commit -m "docs: publish beta release links"
git push origin main
```

Expected: `origin/main` contains the release links and authorization amendment.

- [ ] **Step 2: Create and push the annotated version tag**

Run:

```bash
git tag -a v0.1.0-beta.1 -m "ASRbox v0.1.0-beta.1"
git push origin v0.1.0-beta.1
```

Expected: the remote tag resolves to the release-documentation commit on `main` and triggers the Release workflow.

- [ ] **Step 3: Monitor and verify the public Release**

Use GitHub Actions to monitor the tag-triggered Release workflow to completion. Download all published assets, run the repository release-asset verifier, verify every SHA-256 line, run `hdiutil verify` on the DMG, and inspect the FFmpeg source archive.

Expected: the GitHub Release is a prerelease with a valid DMG, `ASRbox-ffmpeg-source-8.1.2.tar.gz`, and `SHA256SUMS.txt` available for public download.
