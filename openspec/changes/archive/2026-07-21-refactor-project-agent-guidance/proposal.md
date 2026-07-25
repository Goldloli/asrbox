## Why

The current agent guidance is a generic development template copied from another project. It does not tell coding agents how ASRbox is structured, which product contracts must remain stable, when OpenSpec is required, or how to choose proportionate verification for a change.

## What Changes

- Replace the generic root guidance with an ASRbox-specific `AGENTS.md`.
- Define a lightweight change classification so trivial edits stay simple while behavior, API, data, architecture, and multi-subsystem changes use OpenSpec.
- Require agents to state scope, protected behavior, allowed touch points, and verification before implementation.
- Point agents to existing repository sources of truth for architecture, API stability, CI, privacy, release, and contribution rules.
- Establish project-specific boundaries for the React/Web, FastAPI, Tauri, FFmpeg, user data, transcript versioning, and generated artifacts.
- Preserve existing application behavior; this change only affects agent development guidance.

## Capabilities

### New Capabilities

- `agent-development-governance`: Repository-level rules that constrain AI-assisted changes to ASRbox and route significant work through OpenSpec.

### Modified Capabilities

None.

## Impact

- Replaces the tracked root `AGENTS.MD` with the canonical `AGENTS.md` filename.
- Adds OpenSpec planning and specification artifacts for agent development governance.
- Does not modify application code, APIs, dependencies, build output, or runtime behavior.
