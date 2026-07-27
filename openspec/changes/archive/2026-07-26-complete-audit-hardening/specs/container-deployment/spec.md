## MODIFIED Requirements

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
