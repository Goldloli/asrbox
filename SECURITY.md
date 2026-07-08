# Security Policy

## Supported Versions

ASRbox is currently pre-1.0. Security fixes target the latest `main` branch and the latest published release.

## Reporting a Vulnerability

Please do not open a public issue for sensitive security reports.

Report vulnerabilities privately by contacting the maintainer through the GitHub profile for `Goldloli`, or by opening a private security advisory if GitHub enables advisories for this repository.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Affected ASRbox version or commit.
- Operating system and desktop/web runtime.
- Whether local files, model downloads, provider credentials, or exported transcripts are involved.

## Scope

Security-sensitive areas include:

- Local file access and export paths.
- Backend sidecar startup and shutdown.
- Provider API keys and online ASR integrations.
- Model download and cache handling.
- Desktop app resource bundling.

## Disclosure

The maintainer will review reports, prepare a fix when applicable, and coordinate public disclosure after a patched release is available.
