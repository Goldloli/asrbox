# api-compatibility Specification

## Purpose
TBD - created by archiving change normalize-project-documentation. Update Purpose after archive.
## Requirements
### Requirement: Coordinated client contract
Backend routes, request and response models, and event payloads consumed by the React or Tauri clients SHALL change together with their typed consumers, contract tests, and affected product specifications.

#### Scenario: Maintained API field changes
- **WHEN** a field used by a client is added, removed, renamed, or changes semantics
- **THEN** the backend model, client typing and usage, contract coverage, and capability spec are updated in the same change

### Requirement: Exact API discovery
The running FastAPI application's generated OpenAPI schema SHALL be the exact discoverable API reference; OpenSpec SHALL record behavior and compatibility policy rather than duplicate a complete endpoint inventory.

#### Scenario: Developer needs the current route shape
- **WHEN** a developer needs exact paths, parameters, or schemas
- **THEN** the developer reads generated OpenAPI and backend models and verifies the maintained surface with contract tests

### Requirement: Internal option isolation
Frontend behavior SHALL NOT depend on internal `options_json` keys unless the backend exposes that behavior through a typed response contract.

#### Scenario: Internal task metadata changes
- **WHEN** backend implementation changes an internal task option
- **THEN** the frontend remains unaffected unless a coordinated typed API change is approved

