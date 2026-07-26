# online-providers Specification

## Purpose
规定在线 ASR 提供商的显式选择、在线数据披露、凭据处理边界与提供商故障隔离。
## Requirements
### Requirement: Explicit provider selection
Online transcription SHALL require an existing enabled provider configuration and SHALL identify provider failures separately from local model failures.

#### Scenario: Disabled or missing provider is selected
- **WHEN** a provider transcription request references no usable provider
- **THEN** the request fails before successful task creation or media processing is claimed

### Requirement: Online data disclosure
The product SHALL disclose that online provider mode may transmit media, extracted audio, transcript text, or required metadata to the configured third party.

#### Scenario: User chooses online processing
- **WHEN** a user configures or selects an online provider
- **THEN** the interface or owned privacy documentation makes the external data boundary discoverable

### Requirement: Credential handling boundary
Provider API secrets SHALL be masked in API responses and user interfaces, excluded from logs and diagnostics, and documented according to their actual local persistence and backup behavior.

#### Scenario: Provider configuration is read
- **WHEN** the frontend or a diagnostic operation retrieves provider details
- **THEN** the full stored credential is not returned or exposed

### Requirement: Provider failure isolation
Authentication failure, rate limiting, timeout, malformed output, and other provider errors SHALL be explicit and SHALL NOT replace an existing successful transcript with fabricated or partial success.

#### Scenario: Provider request fails
- **WHEN** the configured provider cannot complete a request
- **THEN** the user receives a diagnosable provider error and existing completed transcript content remains intact

