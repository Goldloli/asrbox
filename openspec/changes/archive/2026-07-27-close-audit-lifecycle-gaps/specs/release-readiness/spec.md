## MODIFIED Requirements

### Requirement: Release verification gate

A release SHALL pass version consistency across application packages, backend, Tauri, Dockerfile defaults, Compose defaults, and `.env.example`; locked dependency installation; vulnerability audit; TypeScript and Web build checks; maintained frontend unit tests; backend and contract tests; Cargo checks and tests; the complete maintained browser suite; third-party verification; frozen-backend smoke; Docker build and runtime smoke; and release-asset verification applicable to the target. Maintained frontend unit and browser specs SHALL have explicit runnable commands, and CI and release workflows SHALL invoke those maintained commands rather than duplicating a partial file list.

#### Scenario: Required release check fails

- **WHEN** an applicable release gate, version source, maintained frontend unit test, or maintained browser scenario does not pass
- **THEN** the release workflow does not publish the affected artifacts as a verified release
