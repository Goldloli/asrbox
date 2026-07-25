## Why

ASRbox's product behavior, compatibility rules, release expectations, and historical implementation plans are spread across overlapping Markdown documents. The repository needs a durable OpenSpec baseline so future changes have one accepted behavioral source of truth while user, operational, legal, and historical evidence documents retain clear ownership.

## What Changes

- Establish baseline OpenSpec capabilities for the current public-beta product behavior and its highest-risk boundaries.
- Define documentation ownership so OpenSpec records accepted behavior, focused guides serve users and maintainers, and generated evidence remains evidence rather than policy.
- Replace the manually maintained backend API freeze document with OpenSpec compatibility requirements backed by FastAPI schemas and contract tests.
- Replace dated maturity and frontend quality snapshots with stable requirements plus CI or release evidence.
- Remove completed Superpowers plans and designs after preserving their still-current constraints in OpenSpec.
- Keep and cross-link user, contributor, privacy, security, release, troubleshooting, legal, licensing, changelog, release-note, and real-model evidence documents.
- Preserve all application behavior; this is a documentation and specification migration only.

## Capabilities

### New Capabilities

- `documentation-governance`: Ownership and lifecycle rules for product specs, guides, runbooks, legal documents, and verification evidence.
- `api-compatibility`: Compatibility rules for the FastAPI contract used by the React and Tauri clients.
- `transcription-lifecycle`: Accepted task creation, execution, failure, recovery, and completion behavior.
- `transcript-editing-versioning`: Editing, post-processing, immutable version history, and restore behavior.
- `model-management`: Local model catalog, download lifecycle, compatibility, and storage behavior.
- `online-providers`: Online ASR provider configuration, selection, failure, credential, and data-transfer behavior.
- `export-formats`: Export behavior for current transcript and historical versions.
- `storage-privacy-recovery`: Local data locations, deletion, backup, restore, diagnostics, and sensitive-data boundaries.
- `desktop-runtime-security`: Desktop sidecar lifecycle, loopback access, API token, Web boundary, and bundled media runtime behavior.
- `release-readiness`: Supported public-beta targets, required release gates, artifacts, limitations, and evidence.
- `frontend-quality`: Stable usability, responsive layout, state, accessibility, and verification expectations for the workbench UI.

### Modified Capabilities

- `agent-development-governance`: Route agents to OpenSpec and generated or tested contracts after retiring manually maintained API and maturity snapshots.

## Impact

- Adds baseline specifications under `openspec/specs/` when archived.
- Updates `AGENTS.md`, `CONTRIBUTING.md`, README documentation indexes, and focused CI/release references.
- Removes `backend/API_FREEZE.md`, `backend/MATURITY_REPORT.md`, completed `docs/superpowers/` plans and designs, and dated frontend audit Markdown after their active requirements are migrated.
- Does not modify application code, API behavior, dependencies, tests, build configuration, or release artifacts.
