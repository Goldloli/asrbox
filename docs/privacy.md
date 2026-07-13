# Privacy

ASRbox is designed as a local-first transcription workbench.

## Local Mode

When using local models:

- Audio and video files are processed by the local ASRbox backend.
- Files are stored in the local ASRbox data directory.
- Transcripts and exports are generated locally.
- ASRbox does not need to upload audio to a remote ASR service.

Desktop builds use the Tauri app data directory. Development builds use the backend data directory configured by `ASRBOX_DATA_DIR`, defaulting to `data/`.

On macOS, the desktop data directory is normally:

```text
~/Library/Application Support/com.goldloli.asrbox/
```

## Online Providers

When using an online provider:

- Audio, extracted audio, transcript text, or metadata may be sent to the configured provider.
- Provider API keys are sensitive credentials.
- Provider behavior is governed by that provider's terms and privacy policy.
- Provider connection tests may send credentials and requests to the configured endpoint.

Use local models for private files when you do not want media or transcript data sent to third parties.

## Local Data

ASRbox may store:

- Uploaded media.
- Normalized audio.
- Transcription chunks.
- Transcript results and exports.
- Model files and caches.
- Provider configuration.
- Logs and diagnostics.

Provider API keys are currently stored as plaintext in the local `asrbox.db`
SQLite database. They are masked in normal API responses, but they are not
encrypted with the macOS Keychain. Every ASRbox backup includes `asrbox.db`, so
backups also contain provider credentials. Store data directories and backup ZIP
files as secrets.

The desktop backend binds to `127.0.0.1` and uses a random, in-memory API token
for each app launch. This reduces access from unrelated local web pages; it is
not account authentication, disk encryption, or protection from other software
running as your macOS user. A manually started development backend is
unauthenticated unless `ASRBOX_API_TOKEN` is set.

## Deletion and Uninstall

Deleting a task removes its managed task files according to the action selected
in the UI. Removing `ASRbox.app` alone does not remove the app data directory,
exports, or backups.

For a complete uninstall on macOS:

1. Quit ASRbox and confirm no transcription or model download is running.
2. Remove `/Applications/ASRbox.app`.
3. Remove `~/Library/Application Support/com.goldloli.asrbox/`.
4. Remove unwanted exports from `~/Downloads/ASRbox Exports/` or the custom export directory.
5. Remove any ASRbox backup ZIP files copied elsewhere.

These deletions are irreversible. Preserve exports you want to keep.

Use task deletion, storage cleanup, and manual removal of the app data directory when you need to remove local data.

## Security Notes

- Do not share logs that contain private filenames, transcript text, provider URLs, or API keys.
- Verify release checksums before running an unsigned beta build.
- Do not commit local data, model caches, or test media to the repository.
- Report sensitive vulnerabilities privately using `SECURITY.md`.
