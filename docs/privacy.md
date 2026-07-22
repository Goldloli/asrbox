# Privacy and Local Data

ASRbox is local-first, but its privacy boundary depends on whether a task uses a local model or an online provider.

## Local Model Mode

With a local model, ASRbox processes media through the local backend. Model inference, transcript editing, subtitle generation, and export rendering do not require sending the media to an ASR service.

Model downloads still contact Hugging Face or ModelScope. Dependency installation, update checks performed outside ASRbox, and links opened by the user have their own network behavior.

## Online Provider Mode

With an online provider, ASRbox may send the original media, extracted audio, transcript text, request options, and metadata to the configured endpoint. The exact data depends on that provider implementation.

Before use, review the provider's pricing, retention, training, privacy, and regional-processing terms. Use a local model when the media must not be submitted to a third-party ASR service.

## LLM Transcript Proofreading

LLM proofreading is a separate, optional post-processing step for a completed transcript. It sends only target segment identifiers and text plus limited neighboring segment identifiers and text. It does not send audio, media bytes, filenames, file paths, timestamps, speaker labels, confidence values, or other task metadata.

An endpoint is normally classified as local only when its configured hostname is `localhost`, `127.0.0.1`, or `::1`. In the marked Docker runtime, `host.docker.internal` is also treated as the operator-controlled Docker host so host Ollama can use HTTP. Other non-loopback endpoints are third parties and must use HTTPS. Review the selected provider's retention, training, privacy, and regional-processing terms before starting proofreading.

Proofreading suggestions never change a transcript automatically. Runs are bound to an immutable source version, and only explicitly selected suggestions are applied. Application creates a new transcript version; the source version remains available for export and restore.

## Desktop and Docker Data Roots

The normal macOS desktop data root is:

```text
~/Library/Application Support/com.goldloli.asrbox/
```

The backend can store:

| Location | Contents |
| --- | --- |
| `asrbox.db` | Tasks, transcript versions, settings, diagnostics metadata, ASR/LLM provider configuration, proofreading runs, and suggestions |
| `models/<model-name>/` | Downloaded model files, markers, and model-local caches |
| `uploads/` | Media managed by transcription tasks |
| `audio/` | Extracted or normalized audio |
| `cache/` | Intermediate task data |
| `exports/` | Backend exports, diagnostics, and generated files |
| `backups/` | Backup archives created in the application |
| `restore-pending/` | Temporary restore data when applicable |

Desktop file exports go to `~/Downloads/ASRbox Exports/` by default or to the custom directory selected in Settings. Those files are outside the app data root.

A development backend uses the repository's `data/` directory unless `ASRBOX_DATA_DIR` is set.

Docker stores the same classes of data under `/data`, normally backed by the `asrbox-data` named volume. Removing or recreating the application container does not remove that volume. `docker compose down -v` or an explicit `docker volume rm` permanently deletes it. Container backups and migrated volumes have the same sensitivity as desktop backups.

Model weights and framework caches may instead use a user-selected desktop volume or an operator-declared Docker bind mount. The configured path remains recorded if that storage disconnects; ASRbox does not silently recreate it on the system disk. A relocation keeps the old model data until the target is copied, verified, and activated. Detected global Hugging Face, ModelScope, or Torch caches may be shared with other software and are excluded unless the user explicitly accepts the shared-cache warning.

## Provider Credentials

ASR and LLM provider API keys are masked in normal API responses but are currently stored as plaintext in `asrbox.db`. They are not encrypted with macOS Keychain. ASRbox backups include the database, so backup archives also contain provider credentials, proofreading runs, source-version references, reasons, and suggestion text.

Treat the data directory and every backup as sensitive. Do not attach them to public issues or commit them to Git.

## Local API Boundary

The supported desktop backend binds to `127.0.0.1` and uses a random API token generated for each app launch. The token reduces access from unrelated local web pages, but it is not user authentication, disk encryption, or protection from software running as the same macOS user.

Health and API metadata remain available without the token. A manually started development backend is unauthenticated unless `ASRBOX_API_TOKEN` is set.

The supported Docker Compose configuration binds to host loopback by default. An operator can explicitly bind to a LAN interface and set a fixed `ASRBOX_API_TOKEN`; the Web UI stores an entered token only in browser session storage. This is not multi-user authentication, TLS, rate limiting, or a public-Internet security layer. Use a trusted LAN/VPN or an authenticated HTTPS reverse proxy and never expose a tokenless container beyond loopback.

## Backups and Diagnostics

Backups can contain the SQLite database and therefore provider credentials, task metadata, filenames, transcript information, proofreading runs, and suggestions. Diagnostic bundles do not include LLM keys, proofreading prompts, transcript payloads sent for proofreading, raw LLM responses, or suggestion text. They can contain local paths, runtime data, ASR provider URLs, model ids, and sanitized error excerpts. Proofreading errors are stored and returned in sanitized form; ASRbox does not persist the prompt or raw provider response.

Inspect archives before sharing them. Remove private filenames, transcript content, media, tokens, credentials, and internal endpoints. Use a private security report for sensitive material.

## Deleting Tasks and Models

Task deletion and artifact cleanup affect ASRbox-managed task files according to the selected action. Exported files saved outside the data root are not automatically removed.

Deleting a model removes its directory under `models/<model-name>/`. Stopping a download does not delete reusable partial files; retry can reuse them. “Clean incomplete downloads” can remove an entire incomplete model directory and cannot be undone.

Confirm no task or model download is active before deleting data.

## Complete Uninstall on macOS

Removing `ASRbox.app` alone does not remove models, tasks, exports, or backups.

1. Export any transcripts you want to keep.
2. Quit ASRbox and confirm its backend is no longer running.
3. Remove `/Applications/ASRbox.app`.
4. Remove `~/Library/Application Support/com.goldloli.asrbox/` if you want to delete tasks, settings, credentials, and models.
5. Remove unwanted files from `~/Downloads/ASRbox Exports/` or the custom export directory.
6. Remove ASRbox backup ZIP files copied elsewhere.

These deletions are irreversible.

## Complete Uninstall with Docker

1. Export or back up transcripts and the `/data` volume you need.
2. Run `docker compose down --remove-orphans` to remove the application container while preserving data.
3. Remove the local image if desired.
4. Only after checking the backup, remove the named volume with `docker volume rm asrbox-data`.

See [Docker deployment](docker.md) for backup and restore commands. Volume deletion is irreversible.

## Reporting Privacy or Security Issues

Do not place credentials, private media, full diagnostic archives, or sensitive transcripts in a public issue. Follow the private reporting process in [SECURITY.md](../SECURITY.md).
