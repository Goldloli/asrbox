## ADDED Requirements

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
