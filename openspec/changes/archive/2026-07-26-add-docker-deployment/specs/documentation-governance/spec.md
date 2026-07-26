## ADDED Requirements

### Requirement: Docker deployment guidance
The maintained Chinese and English project documentation SHALL describe Docker prerequisites, build and startup commands, loopback and LAN modes, `/data` persistence and backup, API-token handling, model compatibility, upgrades, rollback, troubleshooting, validation, and removal without presenting Docker as a public-hosting security layer.

#### Scenario: User follows the Docker guide
- **WHEN** a user deploys ASRbox using the documented Compose workflow
- **THEN** the user can identify how to start, access, update, back up, troubleshoot, and remove the service without accidentally deleting data or exposing it by default

### Requirement: AI subtitle proofreading guidance
The maintained product documentation SHALL describe LLM provider setup, local-versus-third-party data transfer, supported subtitle proofreading workflow, suggestion review and explicit application, error feedback, and the fact that transcription success does not depend on LLM availability.

#### Scenario: User evaluates subtitle proofreading
- **WHEN** a user reads the README or focused AI guide before configuring a provider
- **THEN** the user understands what text is sent, how suggestions become a new subtitle version, and what happens when the provider fails or returns no changes
