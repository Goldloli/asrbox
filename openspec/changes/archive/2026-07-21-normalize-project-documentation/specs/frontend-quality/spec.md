## ADDED Requirements

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
