## ADDED Requirements

### Requirement: Resilient authenticated application events

The maintained frontend SHALL connect to the application event stream without placing the long-lived API token in the URL. It SHALL parse supported events, refresh affected queries, and automatically reconnect with bounded exponential backoff after initial connection failure or later disconnection until the component unmounts or connection settings change.

#### Scenario: Desktop sidecar is not ready on first event connection

- **WHEN** the frontend attempts to subscribe before the sidecar accepts requests
- **THEN** it retries after a bounded delay and begins processing events once the backend becomes available without requiring a page reload

#### Scenario: Authenticated event stream is opened

- **WHEN** the current server requires an API token
- **THEN** the stream request authenticates by Authorization header and the token is absent from its URL

### Requirement: Non-destructive settings and shortcuts

Editing the server address SHALL not clear or replace the active connection token until the user explicitly applies the staged connection values. Global application shortcuts SHALL ignore editable controls, contenteditable targets, and IME composition. Version comparison SHALL bound memory use for large transcripts and provide a truthful truncated summary when a full line LCS would exceed that bound.

#### Scenario: User types a server address

- **WHEN** the user changes one or more characters in the server address field without applying
- **THEN** the active server URL, API token, queries, and event connection remain unchanged

#### Scenario: User types inside an editor

- **WHEN** a shortcut-shaped key combination occurs in an input, textarea, select, contenteditable target, or active IME composition
- **THEN** the application leaves the editing interaction in control and does not navigate or open a global palette

#### Scenario: Very large versions are compared

- **WHEN** the product of previous and current transcript line counts exceeds the maintained diff-cell limit
- **THEN** the UI avoids allocating the full LCS matrix and labels or renders a bounded comparison summary
