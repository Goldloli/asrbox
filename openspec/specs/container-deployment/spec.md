# container-deployment Specification

## Purpose
规定单容器 Docker 部署：可复现构建、数据持久化、保守网络暴露、同源连接、条件化应用根路径、Linux 模型范围说明、宿主机 Ollama 集成与自动化容器验证。
## Requirements
### Requirement: Reproducible single-container application
ASRbox SHALL provide a reproducible Linux container image that builds the maintained Web UI, installs the CPU backend runtime and ffmpeg, runs the application as a non-root user, and serves the UI and API from one origin on port `17494`.

#### Scenario: Operator builds and starts the image
- **WHEN** an operator builds the documented Docker target and starts the resulting image
- **THEN** the container becomes healthy and the published root URL loads the ASRbox Web UI while API routes remain available on the same origin

### Requirement: Persistent container data
The container SHALL use `/data` as its application data boundary, and the supported Compose configuration SHALL mount a persistent volume at that path for the database, media, transcripts, settings, exports, caches, and downloaded model data.

#### Scenario: Container is recreated
- **WHEN** an operator removes and recreates the application container without deleting its volume
- **THEN** previously persisted application state remains available

### Requirement: Conservative network exposure

The supported Compose configuration SHALL bind the published port to host loopback by default and SHALL allow the bind address, host port, and API token to be configured explicitly. It SHALL pass the selected public bind address into the container. If that address is not loopback, application startup SHALL require a non-empty API token and fail closed otherwise. Direct Docker image use SHALL default to the conservative non-loopback assumption unless the operator explicitly declares a loopback-only publication.

#### Scenario: Default Compose deployment starts

- **WHEN** an operator starts Compose without overriding network variables
- **THEN** ASRbox is reachable from the Docker host at `127.0.0.1:17494`, is not published on every host interface, and retains the documented optional-token host-local behavior

#### Scenario: Operator enables LAN access

- **WHEN** an operator explicitly selects a non-loopback bind address and supplies an API token
- **THEN** the service starts and the documentation identifies trusted-network, VPN, and TLS reverse-proxy precautions without describing ASRbox as an Internet-facing security gateway

#### Scenario: Non-loopback deployment omits a token

- **WHEN** the supported container runtime declares a non-loopback public bind address but `ASRBOX_API_TOKEN` is empty
- **THEN** startup fails with an actionable configuration error before serving protected APIs

### Requirement: Same-origin container connection
The container-built Web UI SHALL resolve its backend from the browser's current origin and SHALL support a session-scoped API token without persisting that token in durable browser settings.

#### Scenario: Web UI is opened from another device
- **WHEN** a user opens the explicitly exposed container URL from a mobile or desktop browser
- **THEN** frontend API requests target that same scheme, hostname, and port rather than the browser device's loopback interface

#### Scenario: User supplies a container API token
- **WHEN** a user enters the configured API token in Web settings
- **THEN** protected requests use the token for the current browser session and a later fresh browser session does not recover it from durable storage

### Requirement: Conditional application root
The backend SHALL serve the SPA at `/` when a packaged frontend is present, SHALL expose API metadata at a dedicated public route, and SHALL preserve the development JSON root response when no packaged frontend is present.

#### Scenario: Packaged frontend is present
- **WHEN** the container requests `/`
- **THEN** the backend returns the frontend entry document and the dedicated API information route returns backend metadata

#### Scenario: Packaged frontend is absent
- **WHEN** a source backend without compiled frontend assets requests `/`
- **THEN** the existing JSON service metadata remains available for development diagnostics

### Requirement: Documented Linux model scope
The Docker runtime SHALL support documented Linux CPU-compatible engines, SHALL omit Apple-only MLX execution, and SHALL download model weights on demand into persistent data rather than embedding them in the image.

#### Scenario: Docker user selects an MLX-only model
- **WHEN** a Docker user reviews or attempts to use an MLX-only model
- **THEN** the product clearly identifies it as unavailable in the Linux container and directs the user to a compatible engine or the macOS desktop build

### Requirement: Container host Ollama integration
The container runtime SHALL provide a host-gateway alias, SHALL use that alias in its Ollama provider preset, and SHALL permit HTTP for that alias only when the backend is explicitly running in container mode.

#### Scenario: Docker user selects the Ollama preset
- **WHEN** a user creates an Ollama provider from the container Web UI
- **THEN** the preset targets `host.docker.internal`, requires no API key, and does not weaken the normal requirement that non-local LLM endpoints use HTTPS

### Requirement: Automated container verification
The repository SHALL provide automated checks for Compose validity, image construction, container health, same-origin SPA delivery, state persistence across recreation, and browser startup.

#### Scenario: Container deployment regresses
- **WHEN** an applicable Docker build, health, persistence, or browser smoke check fails
- **THEN** the container verification command and maintained CI report the failure

