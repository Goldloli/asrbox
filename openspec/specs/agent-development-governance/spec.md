# agent-development-governance Specification

## Purpose
规定仓库内 coding agent 的开发治理：权威来源层级、OpenSpec 使用分级、变更契约、实现范围纪律、稳定边界协调、验证分级，以及敏感与生成数据的保护。
## Requirements
### Requirement: Canonical project guidance
The repository SHALL provide a root `AGENTS.md` that contains ASRbox-specific development rules and routes agents to accepted OpenSpec capabilities, generated or executable contracts, and focused audience documentation instead of duplicating product behavior or relying on retired planning snapshots.

#### Scenario: Agent starts work in ASRbox
- **WHEN** an agent begins a development task in the repository
- **THEN** it can identify the accepted capability specs, generated API contract, verification commands, privacy and security policies, and release runbooks that govern the affected area

### Requirement: Proportionate OpenSpec usage
The guidance SHALL require an OpenSpec change before implementation when work changes observable behavior, stable APIs, persisted data, security or privacy boundaries, dependencies, packaging, architecture, or multiple subsystems. Trivial non-behavioral edits SHALL be allowed to proceed directly.

#### Scenario: Trivial documentation correction
- **WHEN** a change only corrects wording and does not alter product behavior or a maintained contract
- **THEN** the agent may edit and verify it without creating an OpenSpec change

#### Scenario: Product behavior change
- **WHEN** a change adds or modifies user-visible behavior or crosses a stable subsystem boundary
- **THEN** the agent creates or continues an OpenSpec change before implementation

### Requirement: Explicit change contract
Before significant implementation, the agent SHALL record the intended behavior, protected existing behavior, allowed touch points, non-goals, and verification plan.

#### Scenario: New feature proposal
- **WHEN** an agent prepares to implement a feature such as optional LLM transcript proofreading
- **THEN** the proposal identifies both the new behavior and the transcription, timing, versioning, provider, and export behavior that must remain unchanged

### Requirement: Scoped implementation
The agent SHALL limit edits to the declared change and SHALL NOT perform unrelated refactors, dependency upgrades, formatting sweeps, or generated-file churn.

#### Scenario: Unrelated improvement is discovered
- **WHEN** the agent finds an adjacent issue that is not required for the active change
- **THEN** it reports or tracks the issue separately without modifying it in the current change

### Requirement: Stable boundary coordination
Changes to a stable backend route, response field, event, transcript version behavior, data location, Tauri-sidecar contract, or bundled third-party component SHALL update every affected contract, consumer, test, and owned document in the same change.

#### Scenario: Backend API contract changes
- **WHEN** an implementation changes a route or field documented in `backend/API_FREEZE.md`
- **THEN** the frontend client, contract tests, and stability document are updated together

### Requirement: Proportionate verification
The agent SHALL run focused checks during implementation and SHALL select broader pre-merge checks according to the subsystems and release risks affected by the change.

#### Scenario: Backend-only behavior change
- **WHEN** a change affects backend behavior without touching packaging or real-model execution
- **THEN** the agent runs relevant backend tests and contract checks before the repository-wide pre-merge gate

#### Scenario: Expensive verification is not relevant
- **WHEN** a change does not affect model execution, binary packaging, dependencies, or release assets
- **THEN** the agent does not claim those expensive suites were required or run

### Requirement: Sensitive and generated data protection
The agent SHALL NOT read, expose, modify, or commit private media, transcripts, credentials, model weights, local databases, backups, diagnostics, build output, or caches unless the task explicitly requires a safe operation on an approved fixture or artifact.

#### Scenario: Local user data is present
- **WHEN** project-adjacent directories contain real user media, transcripts, credentials, or application data
- **THEN** the agent leaves them untouched and excludes them from commits and output

### Requirement: Task transition implementation discipline

Repository guidance SHALL require mutations of task lifecycle, transcript state, media linkage, or task-owned artifacts to re-read state inside the shared transition boundary, keep claims short, and preserve cancellation before final persistence. Slow inference or external calls SHALL NOT hold the shared transition lock. Regression tests for active task behavior SHALL establish the active state after application lifespan recovery or explicitly control that recovery.

#### Scenario: Agent adds a task mutation

- **WHEN** an agent implements retry, cleanup, relink, transcript mutation, or another task state transition
- **THEN** the implementation has one writer, rejects conflicting active state, releases the transition boundary before slow work, and tests cancellation or finalization at the responsible boundary

#### Scenario: Agent tests an active task endpoint

- **WHEN** application startup intentionally converts persisted active rows to interrupted recovery state
- **THEN** the test creates or marks the runtime active state after startup so it cannot pass against the wrong lifecycle state

### Requirement: Async route blocking discipline

Repository guidance SHALL require FastAPI `async` routes to move synchronous inference, subprocess waiting, recursive file work, heavy database composition, or runtime probing to a threadpool or a genuinely asynchronous implementation. Each newly delegated blocking route family SHALL have a responsiveness test that yields control while the synchronous operation is still running.

#### Scenario: Async route calls a synchronous service

- **WHEN** a route must wait for a blocking service without changing its response contract
- **THEN** it delegates the work off the event loop and a regression test proves unrelated coroutine progress remains possible

### Requirement: Maintained test entrypoints

Repository guidance SHALL require newly maintained unit or browser tests to be added to the aggregate commands used by local readiness, CI, and Release, while focused commands MAY remain available for iteration.

#### Scenario: Maintainer adds a browser regression spec

- **WHEN** the new spec protects a maintained user workflow
- **THEN** the maintained aggregate command includes it and workflow tests prevent CI or Release from reverting to a partial list

