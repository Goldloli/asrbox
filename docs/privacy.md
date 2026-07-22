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

An endpoint is classified as local only when its configured hostname is `localhost`, `127.0.0.1`, or `::1`. Ollama defaults to `http://localhost:11434/v1`, but changing that address to a non-loopback host makes it a third-party endpoint. Remote LLM endpoints must use HTTPS. Review the selected provider's retention, training, privacy, and regional-processing terms before starting proofreading.

Proofreading suggestions never change a transcript automatically. Runs are bound to an immutable source version, and only explicitly selected suggestions are applied. Application creates a new transcript version; the source version remains available for export and restore.

## Desktop Data Root

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

## Provider Credentials

ASR and LLM provider API keys are masked in normal API responses but are currently stored as plaintext in `asrbox.db`. They are not encrypted with macOS Keychain. ASRbox backups include the database, so backup archives also contain provider credentials, proofreading runs, source-version references, reasons, and suggestion text.

Treat the data directory and every backup as sensitive. Do not attach them to public issues or commit them to Git.

## Local API Boundary

The supported desktop backend binds to `127.0.0.1` and uses a random API token generated for each app launch. The token reduces access from unrelated local web pages, but it is not user authentication, disk encryption, or protection from software running as the same macOS user.

Health and root metadata remain available without the token. A manually started development backend is unauthenticated unless `ASRBOX_API_TOKEN` is set. Exposing the backend to a LAN or the public internet is unsupported.

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

## Reporting Privacy or Security Issues

Do not place credentials, private media, full diagnostic archives, or sensitive transcripts in a public issue. Follow the private reporting process in [SECURITY.md](../SECURITY.md).
