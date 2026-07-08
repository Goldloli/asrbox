# Privacy

ASRbox is designed as a local-first transcription workbench.

## Local Mode

When using local models:

- Audio and video files are processed by the local ASRbox backend.
- Files are stored in the local ASRbox data directory.
- Transcripts and exports are generated locally.
- ASRbox does not need to upload audio to a remote ASR service.

Desktop builds use the Tauri app data directory. Development builds use the backend data directory configured by `ASRBOX_DATA_DIR`, defaulting to `data/`.

## Online Providers

When using an online provider:

- Audio, extracted audio, transcript text, or metadata may be sent to the configured provider.
- Provider API keys are sensitive credentials.
- Provider behavior is governed by that provider's terms and privacy policy.

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

Use task deletion, storage cleanup, and manual removal of the app data directory when you need to remove local data.

## Security Notes

- Do not share logs that contain private filenames, transcript text, provider URLs, or API keys.
- Do not commit local data, model caches, or test media to the repository.
- Report sensitive vulnerabilities privately using `SECURITY.md`.
