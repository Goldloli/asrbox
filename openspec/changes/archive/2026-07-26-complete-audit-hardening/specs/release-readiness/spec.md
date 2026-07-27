## MODIFIED Requirements

### Requirement: Release verification gate

A release SHALL pass version consistency across application packages, backend, Tauri, Dockerfile defaults, Compose defaults, and `.env.example`; locked dependency installation; vulnerability audit; TypeScript and Web build checks; backend and contract tests; Cargo checks and tests; browser smoke coverage; third-party verification; frozen-backend smoke; Docker build and runtime smoke; and release-asset verification applicable to the target. Maintained browser specs SHALL have an explicit runnable command or be included by a broader maintained suite.

#### Scenario: Required release check fails

- **WHEN** an applicable release gate, version source, or maintained browser scenario does not pass
- **THEN** the release workflow does not publish the affected artifacts as a verified release
