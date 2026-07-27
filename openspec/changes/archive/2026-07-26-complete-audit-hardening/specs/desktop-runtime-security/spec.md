## MODIFIED Requirements

### Requirement: Process-scoped API token

The desktop runtime SHALL generate and use an in-memory process-scoped API token for protected backend requests without persisting that token as a user credential. The maintained frontend SHALL send this token in an Authorization header and SHALL NOT place it in resource or event-stream URLs. Browser-native resources that cannot attach a header MAY use an in-memory, short-lived ticket restricted to one allowed GET path. Authentication query parameters SHALL be removed from the request scope after validation so routine access logs do not record them.

#### Scenario: Protected request lacks the desktop token

- **WHEN** a protected endpoint receives a missing or invalid token in packaged desktop operation
- **THEN** the backend rejects the request without revealing the expected token

#### Scenario: Maintained client loads protected audio

- **WHEN** the desktop client requests a task audio URL for browser-native playback
- **THEN** the URL contains only a short-lived ticket restricted to that audio path and does not contain the process-scoped API token

#### Scenario: Sensitive query compatibility path is used

- **WHEN** a legacy client authenticates with a supported query credential
- **THEN** authentication is evaluated before the sensitive parameter is removed from the ASGI query string used by routine access logging

### Requirement: WebView-privileged file and URL boundaries

Privileged Tauri commands SHALL NOT let WebView-supplied input decide arbitrary filesystem targets or arbitrary open URLs. Text-file saves SHALL accept a target directory only when it resolves to the system download directory, the application or backend data directories, or a directory previously chosen through a native directory picker and recorded by the Rust side across restarts; any other directory SHALL be rejected with a clear error. File-location reveal SHALL canonicalize an existing target before applying reveal semantics, SHALL reveal a file's parent directory, and SHALL refuse executable bundle directories such as `.app` even when reached through a symbolically linked alias. The WebView SHALL NOT hold a direct JavaScript shell-open capability or broad shell-open configuration; all URL and location opening SHALL go through validated Rust commands.

#### Scenario: Save export into a picker-chosen directory

- **WHEN** the WebView requests a text-file save into a directory the user previously selected via the native directory picker
- **THEN** the save proceeds using the existing sanitized filename and non-overwriting path behavior

#### Scenario: Save into an arbitrary directory is rejected

- **WHEN** the WebView requests a text-file save into a directory outside the allowed set, such as a user LaunchAgents directory
- **THEN** the command fails with a clear error and no file is created

#### Scenario: Reveal an executable bundle is refused

- **WHEN** the WebView requests opening the location of a path that is an executable bundle directory or an alias resolving to one
- **THEN** the command refuses to open it instead of launching the bundle

#### Scenario: WebView has no direct shell-open permission

- **WHEN** JavaScript inside the WebView attempts to invoke the shell plugin open endpoint directly
- **THEN** the capability system denies the call and opening remains possible only through validated Rust commands

## ADDED Requirements

### Requirement: Bounded desktop sidecar networking

Desktop health checks, sidecar shutdown requests, and wait loops SHALL have explicit connect and total deadlines. A packaged desktop instance SHALL NOT silently adopt an already-running healthy backend for which it does not own the process token.

#### Scenario: Loopback service accepts a connection but never responds

- **WHEN** desktop startup or shutdown contacts a stalled loopback service
- **THEN** the operation returns a timeout error within its maintained deadline instead of blocking application startup or exit indefinitely

#### Scenario: Another packaged backend is already healthy

- **WHEN** a packaged instance starts while no child is owned but an ASRbox health response is already served on the fixed port
- **THEN** startup reports the conflicting instance instead of returning a newly generated token that cannot authenticate to it
