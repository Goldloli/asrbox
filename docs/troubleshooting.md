# Troubleshooting

Start with Settings → Storage and diagnostics. It shows the backend data directory, model directory, Python runtime, ffmpeg/ffprobe source, free disk space, and diagnostic-bundle action.

## Backend Offline

Symptoms: the header reports an offline backend, task creation is unavailable, or `/health` does not respond.

Check:

```bash
lsof -nP -iTCP:17494 -sTCP:LISTEN
curl http://127.0.0.1:17494/health
```

Fix:

1. Quit every ASRbox instance and reopen one copy.
2. Stop a non-ASRbox process that occupies port `17494`.
3. In development, run `npm run dev:server` and confirm the terminal has no import error.
4. Use the desktop “Restart backend” action if the app shell is responsive.

The supported desktop backend listens only on `127.0.0.1`. A manually exposed LAN/public backend is outside the supported configuration.

## macOS Blocks the App

The public-beta DMG is not signed or notarized.

1. Verify the DMG against `SHA256SUMS.txt` from the same GitHub Release.
2. Move the app to Applications.
3. Right-click ASRbox and choose Open.
4. If necessary, allow it in System Settings → Privacy & Security.

Do not bypass macOS warnings for an artifact from an unknown source or with a mismatched checksum.

## Desktop Startup Is Slow

The frozen Python backend loads machine-learning libraries before it reports healthy. A first model transcription also has a separate model cold start.

- Wait for the backend-online indicator before creating a task.
- Do not launch multiple app copies.
- Use `faster-whisper-base` for a quick functional check.
- Check available RAM and disk before loading large models.

## ffmpeg or ffprobe Is Missing

The desktop package should resolve bundled ffmpeg and ffprobe. Development can use the vendored Apple Silicon files or a system installation.

Check Settings → Storage and diagnostics, or run:

```bash
third_party/ffmpeg/darwin-arm64/ffmpeg -version
third_party/ffmpeg/darwin-arm64/ffprobe -version
```

If the desktop app reports a missing tool, reinstall a complete ASRbox build. In development, set `ASRBOX_FFMPEG_PATH` and `ASRBOX_FFPROBE_PATH` to executable files or install ffmpeg on `PATH`.

## `MODEL_LOAD_FAILED` Mentions TorchCodec

Current ASRbox loads audio for Transformers Whisper and Qwen3-ASR through the Transformers `librosa` path before inference, and the frozen backend excludes TorchCodec. This avoids requiring a TorchCodec binary compatible with the installed PyTorch version.

If a packaged app still reports “Could not load libtorchcodec”:

1. Confirm you are running a build containing the current `0.1.0-beta.1` source rather than an older app copy.
2. Quit ASRbox fully, replace the old `.app`, and reopen it.
3. For a source build, reinstall `requirements-dev.lock` and `requirements-build.lock`, then rebuild with `npm run build:desktop`.
4. Generate a diagnostic bundle and include the ASRbox version, Python version, model id, and sanitized traceback in an issue.

Do not solve this by installing arbitrary PyTorch/TorchCodec versions into a packaged `.app`; the frozen runtime must be rebuilt as a matched unit.

## Model Download Is Stuck or Fails

Check the model row and Download tasks panel for status, source, file, and error text. Also check network access, upstream availability, gated-model access, and free disk space.

- **Pause / Resume**: use for a temporary network or bandwidth interruption.
- **Stop**: end the worker while keeping reusable downloaded files.
- **Retry**: start again using the existing directory.
- **Redownload**: use only when the completed directory is incompatible or corrupt; it deletes the old model first.
- **Clean incomplete downloads**: removes model directories without a valid marker/weights or with root-level incomplete files.

Try `faster-whisper-base` to distinguish a general network/runtime problem from a large-model problem. ModelScope and Hugging Face fallback is available only for catalog entries that define both sources.

## Model Uses More Disk Than Expected

Catalog sizes are estimates. Upstream revisions, cache metadata, interrupted files, and older duplicate weight variants can increase usage. Model Management reports actual per-model and total bytes.

Safe order:

1. Confirm no model download or transcription is running.
2. Use compatibility verification to confirm the model is usable.
3. Use “Clean incomplete downloads” only for entries the UI identifies as incomplete.
4. Delete and redownload one model if its directory remains unexpectedly large.

Manual deletion is possible under:

```text
~/Library/Application Support/com.goldloli.asrbox/models/<model-name>/
```

Manual removal is irreversible. Do not delete the whole data directory if you need tasks, settings, or backups.

## Qwen3-ASR Fails to Load

Qwen3-ASR needs the locked Transformers model class, processor, audio dependencies, and sufficient memory. The packaged backend also needs the corresponding hidden imports.

- Confirm the model compatibility result before transcribing.
- Reinstall the exact lock files instead of upgrading only Transformers.
- Rebuild the frozen backend after dependency changes.
- Try `qwen3-asr-0.6b` before `qwen3-asr-1.7b` on a memory-constrained machine.

## Export File Is Missing

Check Settings → General → Download location. Without a custom directory, desktop exports go to:

```text
~/Downloads/ASRbox Exports/
```

ASRbox appends a numeric suffix rather than overwriting an existing file. Backend-generated diagnostics may instead be under the app data `exports/` directory.

## A Task Fails or Produces Empty/Bad Subtitles

1. Open the task's Diagnostics, Logs, and Quality tabs.
2. Confirm the selected model is downloaded and compatible.
3. Confirm preflight found an audio stream and a non-zero duration.
4. Retry with an explicit language or another model family.
5. Test a short excerpt to separate model quality from long-file chunking.
6. Preserve the original media and export any useful transcript before cleanup.

Music, crowd noise, overlapping speakers, poor microphones, and unsupported languages can reduce accuracy even when the runtime is healthy.

## Create a Diagnostic Bundle

Use Settings → Storage and diagnostics → Diagnostic bundle. Before sharing it, inspect the archive and remove private filenames, transcript text, provider URLs, tokens, or credentials. Sensitive security reports should follow [SECURITY.md](../SECURITY.md), not a public issue.
