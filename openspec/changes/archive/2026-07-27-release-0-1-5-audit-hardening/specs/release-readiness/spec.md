## MODIFIED Requirements

### Requirement: Release verification gate

A release SHALL pass version consistency across application package manifests, corresponding Bun and Cargo lock entries, backend, Tauri, Dockerfile defaults, Compose defaults, `.env.example`, maintained README release references, the current release guide, and a version-matched release-note file; locked dependency installation; vulnerability audit; TypeScript and Web build checks; maintained frontend unit tests; backend and contract tests; Cargo checks and tests; the complete maintained browser suite; third-party verification; frozen-backend smoke; Docker build and runtime smoke; and release-asset verification applicable to the target. Maintained frontend unit and browser specs SHALL have explicit runnable commands, and CI and release workflows SHALL invoke those maintained commands rather than duplicating a partial file list.

#### Scenario: Required release check fails

- **WHEN** an applicable release gate, version source, lock entry, current release document, maintained frontend unit test, or maintained browser scenario does not pass
- **THEN** the release workflow does not publish the affected artifacts as a verified release

#### Scenario: Release version is prepared

- **WHEN** a maintainer prepares a version for tagging
- **THEN** package manifests, generated lock entries, runtime surfaces, current README and release-guide references, and `docs/releases/<tag>.md` all identify that same version
