## Why

ASRbox currently ships a macOS Apple Silicon desktop build and has a development Web entry, but it does not provide a reproducible Linux container, persistent container storage contract, or safe deployment guidance. A supported Docker path makes the Web UI usable on home servers and NAS-style hosts while preserving the desktop security boundary and documenting the limits of LAN or public exposure.

## What Changes

- Add a multi-stage Linux Docker image that builds the React UI, installs a CPU-capable backend runtime and ffmpeg, runs as a non-root user, serves UI and API from one origin, and exposes a health check.
- Add Docker Compose with a named `/data` volume, loopback-only host binding by default, configurable port, restart policy, and optional API token.
- Make the container-built Web UI select its own origin as the backend while desktop and Vite development retain the existing `127.0.0.1:17494` default.
- Let a packaged frontend own `/` while preserving API metadata at a dedicated route and preserving current source/development behavior when no frontend bundle exists.
- Define Linux CPU support and explicitly exclude Apple-only MLX execution from the Docker image; model weights remain on-demand and outside the image.
- Add automated Docker configuration, image, health, persistence, and browser smoke verification and include Docker validation in CI/release documentation.
- Rewrite the maintained Chinese/English README and focused project guides to cover Docker, desktop, local/online ASR, LLM subtitle proofreading, security, storage, troubleshooting, testing, and packaging without duplicating specifications.
- Refresh local release artifacts and update the GitHub repository About description and topics.

## Capabilities

### New Capabilities
- `container-deployment`: Supported Docker image, Compose lifecycle, same-origin Web behavior, Linux runtime scope, persistence, health checks, and network exposure controls.

### Modified Capabilities
- `desktop-runtime-security`: Distinguish the unchanged desktop loopback/token boundary from explicit container network exposure and token configuration.
- `storage-privacy-recovery`: Define the persistent Docker data volume, backup sensitivity, and container removal behavior.
- `release-readiness`: Add reproducible Docker build/smoke evidence and container packaging documentation to release validation.
- `documentation-governance`: Require maintained Docker and AI proofreading documentation across the README and focused guides.

## Impact

- New root container files, Linux dependency input/lock, container smoke scripts, and CI workflow steps.
- Small frontend connection-state changes and backend static frontend/root routing changes with focused contract and browser tests.
- README files, `docs/`, release guidance, troubleshooting, privacy, contribution guidance, changelog/release notes, and GitHub repository metadata.
- Docker builds are substantially larger than the desktop Web bundle because local CPU ASR dependencies are included; model weights are still downloaded separately into `/data/models`.
