# Security Policy

## Supported Versions

ASRbox is pre-1.0. Security fixes target the latest `main` branch and, when possible, the latest GitHub prerelease. Older prereleases are not guaranteed to receive backports.

## Reporting a Vulnerability

Do not open a public issue for a sensitive report. Use a private GitHub Security Advisory if enabled for the repository, or contact the maintainer through the [Goldloli GitHub profile](https://github.com/Goldloli).

Include:

- Affected version or commit and whether it is a source or packaged build.
- macOS and hardware version.
- Reproduction steps and expected versus actual behavior.
- Whether local files, model downloads, provider credentials, exports, backups, or the loopback API are involved.
- A minimal proof of concept with secrets and private media removed.

Do not send active credentials, private media, full user databases, or unredacted backups.

## Security-Relevant Scope

- Local file ingestion, managed storage, export paths, backup and restore.
- Desktop sidecar startup, process ownership, port handling, and API-token checks.
- Docker image construction, non-root execution, host binding, API-token handling, and persistent-volume boundaries.
- Provider endpoints and credentials.
- Model source fallback, downloaded-file validation, caches, and deletion.
- Bundled ffmpeg/ffprobe and frozen Python runtime contents.
- Tauri permissions, shell opening, CSP, and desktop resources.

## Current Boundaries

- The supported desktop backend listens on `127.0.0.1:17494`.
- Desktop API requests use a random in-memory token generated for each launch. Health and root metadata remain unauthenticated.
- This token is not an operating-system account boundary and does not protect against software running as the same macOS user.
- A manually started development backend is unauthenticated unless `ASRBOX_API_TOKEN` is set.
- Docker Compose binds to `127.0.0.1` by default. Explicit LAN deployments need a strong `ASRBOX_API_TOKEN` and a trusted network or VPN.
- ASRbox does not provide TLS, multi-user accounts, role authorization, or brute-force protection. Direct public-Internet exposure is unsupported; operators need an authenticated HTTPS reverse proxy or VPN.
- The Web API token is session-scoped and is not written to persistent browser settings or exported configuration.
- Provider API keys are masked in normal responses but stored as plaintext in local `asrbox.db` and included in backups.
- Local-model mode keeps inference local, but model downloads contact Hugging Face or ModelScope.
- Online-provider mode can send media, extracted audio, text, options, or metadata to the configured third party.
- Public-beta DMGs are not signed or notarized. Verify the Release checksum before opening them.
- Docker builds install distribution ffmpeg and locked Python dependencies but do not include model weights. Operators publishing derived images must review all applicable third-party licenses.

## Out of Scope

- Reports whose only condition is intentionally exposing a tokenless container or development backend contrary to the documented network boundary.
- Upstream model or provider behavior that ASRbox does not control, unless ASRbox misrepresents or mishandles it.
- Social engineering, denial of service requiring physical access, or reports without a reproducible security impact.
- Security warnings caused solely by the documented absence of code signing/notarization.

Out-of-scope reports can still become normal bug or documentation issues if they identify a useful improvement.

## Disclosure

The maintainer will acknowledge the report, reproduce and assess it, prepare a fix when applicable, and coordinate disclosure after a patched commit or release is available. Do not disclose the issue publicly before coordination is complete.
