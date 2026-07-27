# mcp-integration Specification

## Purpose
规定 MCP 工具面的信任边界：转写路径白名单、与桌面模式的关系，以及拒绝时的错误行为。
## Requirements
### Requirement: MCP transcription path boundary

In non-desktop runtime mode, the MCP `asrbox.transcribe` tool SHALL accept a local file path only when its resolved location is inside the configured uploads directory, the configured derived-audio directory, or an additional root explicitly declared by the operator via the `ASRBOX_MCP_ALLOWED_ROOTS` environment variable. In desktop mode it SHALL retain parity with the desktop-gated HTTP path-based ingestion route and accept any existing readable media file path. A rejected path SHALL fail with a clear error and SHALL NOT create a task or register the file as task media.

#### Scenario: MCP transcribe targets a path inside an allowed root

- **WHEN** a non-desktop MCP client calls `asrbox.transcribe` with a path that resolves inside the uploads directory, the derived-audio directory, or an operator-declared allowed root
- **THEN** the task is created from that path as before

#### Scenario: MCP transcribe targets a path outside all allowed roots

- **WHEN** a non-desktop MCP client calls `asrbox.transcribe` with a path outside every allowed root, including the application database or other files under the data directory root
- **THEN** the call fails with a clear error and no task is created

#### Scenario: Desktop runtime keeps local-path ingestion

- **WHEN** the backend runs in desktop mode and an MCP client calls `asrbox.transcribe` with any existing readable media path
- **THEN** the task is created with the same behavior as the desktop-gated HTTP path ingestion route
