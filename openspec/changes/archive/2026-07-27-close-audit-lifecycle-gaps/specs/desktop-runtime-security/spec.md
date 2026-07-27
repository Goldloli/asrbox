## MODIFIED Requirements

### Requirement: Process-scoped API token

The desktop runtime SHALL generate and use an in-memory process-scoped API token for protected backend requests without persisting that token as a user credential. The maintained frontend SHALL send this token in an Authorization header and SHALL NOT place it in resource or event-stream URLs. Browser-native resources that cannot attach a header MAY use an in-memory, short-lived ticket restricted to one allowed GET path. A resource ticket SHALL expire after its idle lifetime and SHALL have an absolute non-renewable lifetime; successful Range playback MAY renew only the idle deadline up to that absolute deadline, and the returned `expires_at` SHALL identify the absolute deadline. Authentication query parameters SHALL be removed from the request scope after validation so routine access logs do not record them.

#### Scenario: Protected request lacks the desktop token

- **WHEN** a protected endpoint receives a missing or invalid token in packaged desktop operation
- **THEN** the backend rejects the request without revealing the expected token

#### Scenario: Maintained client loads protected audio

- **WHEN** the desktop client requests a task audio URL for browser-native playback
- **THEN** the URL contains only a short-lived ticket restricted to that audio path and does not contain the process-scoped API token

#### Scenario: Active audio renews ticket idle time

- **WHEN** valid Range playback continues within the ticket idle lifetime
- **THEN** idle validity is renewed without extending the ticket beyond its returned absolute `expires_at`

#### Scenario: Resource ticket reaches absolute expiry

- **WHEN** a ticket is continuously reused until its absolute deadline
- **THEN** later requests are rejected and obtaining a new ticket still requires the full API token

#### Scenario: Sensitive query compatibility path is used

- **WHEN** a legacy client authenticates with a supported query credential
- **THEN** authentication is evaluated before the sensitive parameter is removed from the ASGI query string used by routine access logging
