## Context

ASRbox already documents its architecture, stable backend contract, development commands, CI gates, privacy boundary, and release process. The root agent guidance currently duplicates generic coding advice instead of routing agents to those project facts. OpenSpec has now been initialized with the core Codex profile, but the repository does not yet define when a change requires OpenSpec or how agents must protect existing behavior while implementing it.

## Goals / Non-Goals

**Goals:**

- Make the root agent guidance specific to ASRbox and concise enough to load in every coding session.
- Separate persistent product specifications from agent workflow instructions.
- Scale process with risk so small, non-behavioral edits remain lightweight.
- Require explicit scope, invariants, affected subsystems, and verification before significant implementation.
- Preserve existing API, data, privacy, packaging, and dependency boundaries unless a change explicitly updates them.

**Non-Goals:**

- Document every ASRbox feature inside `AGENTS.md`.
- Require OpenSpec for typo fixes, narrow documentation edits, or equivalent non-behavioral maintenance.
- Introduce a mandatory TDD, worktree, subagent, or full-regression workflow for every change.
- Modify application code, dependencies, CI, or runtime behavior.

## Decisions

### Use AGENTS.md as a router, not a product specification

The root file will contain stable development rules and links to repository facts. Product behavior belongs in `openspec/specs/`, proposed behavior belongs in `openspec/changes/`, and detailed operational documentation remains in the existing focused documents. This avoids loading duplicated and stale product detail into every session.

Alternative considered: copy architecture and feature descriptions into `AGENTS.md`. Rejected because those details would drift and compete with their existing sources of truth.

### Classify changes by observable risk

Trivial non-behavioral changes can proceed directly. Changes to observable behavior, APIs, persisted data, security/privacy, dependencies, packaging, or multiple subsystems require an OpenSpec change before implementation. The classification is based on blast radius rather than line count.

Alternative considered: require OpenSpec for every edit. Rejected because it recreates the process overhead the repository is trying to avoid.

### Require an explicit change contract

Before significant implementation, the agent must identify the intended behavior, protected behavior, allowed touch points, non-goals, and verification. These constraints belong in the OpenSpec artifacts and implementation update, making unrelated edits visible before code changes begin.

### Protect existing repository boundaries

The guidance will name the stable ownership boundaries already present in the repository: React UI, Web entrypoint, FastAPI backend, Tauri shell, build/release scripts, vendored FFmpeg, immutable transcript versions, and the frozen frontend/backend API contract. Cross-boundary changes must be coordinated rather than silently patched on one side.

### Use proportionate verification

Agents must run focused checks while iterating and broaden verification according to the affected area. The unified gate remains the pre-merge default for code changes, while expensive real-model and release checks are only required when their corresponding risk is touched.

## Risks / Trade-offs

- [Risk] The guidance becomes another long generic checklist. -> Keep it project-specific, reference existing documents, and avoid restating command details already maintained elsewhere.
- [Risk] Agents over-classify small edits and create unnecessary OpenSpec changes. -> Define explicit direct-change examples and make observable risk the threshold.
- [Risk] A written scope is ignored during implementation. -> Require final diff review against the declared touch points and protected behavior.
- [Risk] Repository documentation and guidance drift apart. -> Give focused project documents precedence for their owned facts and update both in the same change when a contract changes.
