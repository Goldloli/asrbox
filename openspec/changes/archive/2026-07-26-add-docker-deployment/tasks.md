## 1. Runtime Contracts

- [x] 1.1 Add a Linux CPU dependency input and generated lock that omit Apple-only MLX packages
- [x] 1.2 Make packaged Web builds use the browser origin while preserving desktop and Vite defaults
- [x] 1.3 Add session-only Web API-token configuration without persisting the token
- [x] 1.4 Serve the SPA at `/` only when packaged assets exist and expose API metadata at a dedicated route
- [x] 1.5 Add focused frontend, backend, and contract tests for connection and root-routing behavior

## 2. Container Packaging

- [x] 2.1 Add a multi-stage non-root Dockerfile, `.dockerignore`, and health check
- [x] 2.2 Add Compose and environment examples with loopback default, configurable port/token, and persistent `/data`
- [x] 2.3 Add model/runtime visibility and host-Ollama defaults so Docker users can choose compatible local capabilities
- [x] 2.4 Add automated Compose, image, health, persistence, and browser smoke scripts
- [x] 2.5 Add maintained CI validation for the Docker build and runtime smoke path

## 3. Documentation

- [x] 3.1 Rewrite Chinese and English README content for desktop, Docker, ASR, exports, and LLM subtitle proofreading
- [x] 3.2 Add focused Docker and AI proofreading guides
- [x] 3.3 Update privacy, security, model, troubleshooting, contribution, CI, and release documentation
- [x] 3.4 Refresh changelog and current beta release notes without claiming registry publication or unsupported platforms

## 4. Verification And Packaging

- [x] 4.1 Validate the OpenSpec change strictly and run focused frontend/backend tests
- [x] 4.2 Build and smoke-test the Docker image, including state persistence and mobile-width browser rendering
- [x] 4.3 Run typecheck, Web build, backend/contract tests, dependency and open-source gates
- [x] 4.4 Rebuild and verify the macOS desktop release artifact
- [x] 4.5 Update GitHub About description and topics, review the final diff, and record remaining limitations
