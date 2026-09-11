# frontend-quality Specification

## Purpose
规定前端质量基线：工作台工作流层级、响应式不重叠布局、可访问的交互状态、前端验证要求与活动任务停止控制。

## Requirements

### Requirement: Workbench workflow hierarchy
Each primary route SHALL present a clear main work area and visible next action appropriate to its state without requiring decorative or nested panels to explain the interface.

#### Scenario: Route has no content or backend is unavailable
- **WHEN** a user encounters an empty, loading, offline, or error state
- **THEN** the interface presents an understandable status and an actionable recovery or next step

### Requirement: Responsive non-overlapping layout
Supported desktop and narrow viewports SHALL not introduce horizontal overflow, clipped labels, unreadable controls, or navigation and status surfaces that cover primary content or actions.

#### Scenario: Required viewport is rendered
- **WHEN** the workbench is displayed at maintained desktop or mobile-width smoke-test dimensions
- **THEN** interactive text fits, content remains reachable, and fixed UI does not occlude the active workflow

### Requirement: Accessible interaction states
Navigation, buttons, icon controls, menus, dialogs, tabs, forms, disabled states, and status text SHALL provide readable contrast, visible keyboard focus, and accessible names where required.

#### Scenario: User navigates without a pointer
- **WHEN** keyboard focus moves through an interactive workflow
- **THEN** the focused control is visible, identifiable, and operable in the expected order

### Requirement: Frontend verification
User-visible frontend changes SHALL pass TypeScript checking, the production Web build, relevant automated browser scenarios, and the maintained frontend quality audit appropriate to the affected routes and states.

#### Scenario: Frontend behavior changes
- **WHEN** a change affects a maintained user workflow
- **THEN** automated verification covers the changed behavior and representative layout states before acceptance

### Requirement: Active task stop control
The primary transcription workspace SHALL provide an accessible, confirmed stop control for the selected active transcription and SHALL prevent duplicate cancellation requests while the action is pending.

#### Scenario: User stops a task from the transcription workspace
- **WHEN** the selected task is queued or running and the user confirms the stop action
- **THEN** the interface requests cancellation, refreshes active task state, and reports success or a diagnosable error

### Requirement: Resilient authenticated application events

The maintained frontend SHALL connect to the application event stream without placing the long-lived API token in the URL. It SHALL parse supported events, refresh affected queries, and automatically reconnect with bounded exponential backoff after initial connection failure or later disconnection until the component unmounts or connection settings change.

#### Scenario: Desktop sidecar is not ready on first event connection

- **WHEN** the frontend attempts to subscribe before the sidecar accepts requests
- **THEN** it retries after a bounded delay and begins processing events once the backend becomes available without requiring a page reload

#### Scenario: Authenticated event stream is opened

- **WHEN** the current server requires an API token
- **THEN** the stream request authenticates by Authorization header and the token is absent from its URL

### Requirement: Non-destructive settings and bounded comparison

Editing the server address SHALL not clear or replace the active connection token until the user explicitly applies the staged connection values. Version comparison SHALL bound memory use for large transcripts and provide a truthful truncated summary when a full line LCS would exceed that bound.

#### Scenario: User types a server address

- **WHEN** the user changes one or more characters in the server address field without applying
- **THEN** the active server URL, API token, queries, and event connection remain unchanged

#### Scenario: Very large versions are compared

- **WHEN** the product of previous and current transcript line counts exceeds the maintained diff-cell limit
- **THEN** the UI avoids allocating the full LCS matrix and labels or renders a bounded comparison summary
