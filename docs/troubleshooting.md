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

The desktop backend listens only on `127.0.0.1`. For Docker, also run:

```bash
docker compose ps
docker compose logs --tail=200 asrbox
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q asrbox)"
```

If the Docker page loads but reports the backend offline, confirm the API token in Settings matches `ASRBOX_API_TOKEN`. Server URL and token edits remain drafts until Save is selected; applying an empty token clears the current session token.

## Docker Build or Startup Fails

- Run `docker compose config` to catch malformed `.env` values.
- Confirm Docker has enough disk and memory; the CPU ML stack makes the image large.
- First builds need Docker Hub, PyPI, the PyTorch CPU index, and GitHub access.
- A `/data` permission error usually means a bind mount is not writable by container uid/gid `10001`; prefer the named volume or fix host ownership.
- An unhealthy container should be diagnosed from logs before it is repeatedly restarted.
- A log saying a public bind requires `ASRBOX_API_TOKEN` means `ASRBOX_BIND_ADDRESS` is non-loopback while the token is empty. Return to `127.0.0.1` or generate a strong token before restarting.
- `mlx-whisper-turbo` is intentionally unavailable in Linux containers. Choose Faster Whisper, Transformers Whisper, SenseVoice, or Qwen3-ASR.

Do not use `docker compose down -v` as a troubleshooting reset unless permanent data loss is intended.

## Model Storage Location Is Unavailable

- Desktop: reconnect the same external disk and confirm it is mounted at the configured full path. ASRbox intentionally does not fall back to the system disk or classify those models as never downloaded.
- Docker: check that the host bind mount still appears at the configured container path, then run `docker compose config` and `docker compose exec asrbox ls -ld /model-storage`. The Web UI cannot inspect or open the host-side path.
- Confirm the selected directory and every parent are real directories rather than symbolic links. Network filesystems are warning-only and are not guaranteed reliable.
- If a completed migration reports manual cleanup, verify that the new root is active and models work before deleting the listed old duplicate. A failed or cancelled migration keeps the old root authoritative.

## macOS Blocks the App

The public-beta DMG is not signed or notarized.

1. Verify the DMG against `SHA256SUMS.txt` from the same GitHub Release.
2. Move the app to Applications.
3. Right-click ASRbox and choose Open.
4. If necessary, allow it in System Settings → Privacy & Security.

Do not bypass macOS warnings for an artifact from an unknown source or with a mismatched checksum.

## Application Update Check or Download Fails

Open Settings → About and retry the check manually. Automatic checks require network access to the GitHub Releases API and are limited to once every 24 hours; manual checks bypass that schedule. If GitHub is unavailable or rate-limits the request, use “View Releases” and try again later. Update failures are isolated from transcription, models, and stored data.

An in-app download requires both the matching Apple Silicon DMG and `SHA256SUMS.txt` in the same official Release. The download is first written as a `.part` file in the system Downloads directory, then renamed only after SHA-256 verification. Cancelling, a missing checksum, a mismatched checksum, an unexpected asset URL, or a renamed release asset prevents the file from being opened; use the browser Releases fallback and verify the asset manually instead of bypassing the error.

After a verified download, finish active work and quit ASRbox normally before opening the DMG and replacing the previous application. ASRbox does not install the update automatically. The current package remains unsigned and unnotarized, so the Gatekeeper guidance above still applies.

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

ffprobe and ffmpeg executions have bounded deadlines. A timeout removes partial derived output and leaves the task failed with a diagnostic error. On unusually slow hardware, `ASRBOX_MEDIA_PROCESS_TIMEOUT_SECONDS` may be raised to a positive number of seconds; avoid lowering it below the time needed to process the longest media.

## `MODEL_LOAD_FAILED` Mentions TorchCodec

Current ASRbox loads audio for Transformers Whisper and Qwen3-ASR through the Transformers `librosa` path before inference, and the frozen backend excludes TorchCodec. This avoids requiring a TorchCodec binary compatible with the installed PyTorch version.

If a packaged app still reports “Could not load libtorchcodec”:

1. Confirm you are running a build containing the current `0.1.0-rc.2` source rather than an older app copy.
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

For security, custom download directories must be chosen through the native folder picker; the desktop app only saves exports into the system download directory, its own data directory, or picker-chosen directories. If an older custom directory is rejected after an upgrade, pick it once more in Settings → General → Download location to re-authorize it.

## A Task Fails or Produces Empty/Bad Subtitles

1. Open the task's Diagnostics, Logs, and Quality tabs.
2. Confirm the selected model is downloaded and compatible.
3. Confirm preflight found an audio stream and a non-zero duration.
4. Retry with an explicit language or another model family.
5. Test a short excerpt to separate model quality from long-file chunking.
6. Preserve the original media and export any useful transcript before cleanup.

Music, crowd noise, overlapping speakers, poor microphones, and unsupported languages can reduce accuracy even when the runtime is healthy.

If the transcript shows long runs of a repeated word or character, check the Quality tab for `REPETITIVE_TRANSCRIPT`. Current releases decode Whisper-family models with anti-hallucination defaults and collapse extreme repeated runs during post-processing, so retranscribing the task applies those safeguards; a persistent warning after retranscription usually means a silent, musical, or very low-quality audio section.

## AI Subtitle Proofreading Fails

- **Connection failed**: start Ollama or check DNS, firewall, proxy, and provider URL. Docker reaches host Ollama at `http://host.docker.internal:11434/v1`.
- **Authentication failed**: replace the provider key and use Test connection.
- **Model error**: confirm the exact model name; for Ollama, run `ollama list` on its host.
- **Context too long**: use a larger-context model or a shorter transcript.
- **Invalid response**: retry or choose a model that reliably follows structured-output instructions.
- **No changes needed** appears only after a successful response with zero suggestions; it is not used for failures.

Provider failures preserve the source transcript. See [AI subtitle proofreading](ai-proofreading.md).

## Create a Diagnostic Bundle

Use Settings → Storage and diagnostics → Diagnostic bundle. Before sharing it, inspect the archive and remove private filenames, transcript text, provider URLs, tokens, or credentials. Sensitive security reports should follow [SECURITY.md](../SECURITY.md), not a public issue.
