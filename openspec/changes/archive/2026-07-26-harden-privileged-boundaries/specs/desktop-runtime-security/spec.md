# desktop-runtime-security Specification Delta

## ADDED Requirements

### Requirement: WebView-privileged file and URL boundaries

Privileged Tauri commands SHALL NOT let WebView-supplied input decide arbitrary filesystem targets or arbitrary open URLs. Text-file saves SHALL accept a target directory only when it resolves to the system download directory, the application or backend data directories, or a directory previously chosen through a native directory picker and recorded by the Rust side across restarts; any other directory SHALL be rejected with a clear error. File-location reveal SHALL use reveal-only semantics (files reveal their parent directory) and SHALL refuse to open executable bundle directories such as `.app`. The WebView SHALL NOT hold a direct JavaScript shell-open capability; all URL and location opening SHALL go through validated Rust commands.

#### Scenario: Save export into a picker-chosen directory

- **WHEN** the WebView requests a text-file save into a directory the user previously selected via the native directory picker
- **THEN** the save proceeds using the existing sanitized filename and non-overwriting path behavior

#### Scenario: Save into an arbitrary directory is rejected

- **WHEN** the WebView requests a text-file save into a directory outside the allowed set, such as a user LaunchAgents directory
- **THEN** the command fails with a clear error and no file is created

#### Scenario: Reveal an executable bundle is refused

- **WHEN** the WebView requests opening the location of a path that is an executable bundle directory such as a `.app`
- **THEN** the command refuses to open it instead of launching the bundle

#### Scenario: WebView has no direct shell-open permission

- **WHEN** JavaScript inside the WebView attempts to invoke the shell plugin open endpoint directly
- **THEN** the capability system denies the call and opening remains possible only through validated Rust commands
