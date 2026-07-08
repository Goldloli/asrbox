# Troubleshooting

## Backend is offline

Symptoms:

- Header shows backend offline.
- `/health` does not respond.
- Desktop startup reports backend failure.

Checks:

```bash
lsof -nP -iTCP:17494 -sTCP:LISTEN
curl http://127.0.0.1:17494/health
```

Fixes:

- Close old ASRbox instances and reopen the app.
- Stop any non-ASRbox process using port `17494`.
- In development, run `npm run dev:server`.

## Desktop app starts slowly

The desktop app starts a local backend sidecar. Cold startup can be slower when the backend binary initializes Python and ML dependencies.

Fixes:

- Wait for the backend online indicator.
- Avoid launching multiple ASRbox copies at once.
- Use smaller local models for faster first transcription.

## ffmpeg or ffprobe is missing

Desktop releases should use bundled ffmpeg/ffprobe.

Checks:

- Open Settings -> Storage and diagnostics.
- Confirm ffmpeg and ffprobe show a bundled or system path.

Fixes:

- Reinstall the latest DMG.
- In development, ensure `third_party/ffmpeg/darwin-arm64/ffmpeg` and `ffprobe` are executable.
- Configure manual paths in Settings if needed.

## Export file is missing

Checks:

- Open Settings -> General -> Download location.
- If unset, check `~/Downloads/ASRbox Exports`.

ASRbox appends numeric suffixes instead of overwriting existing files.

## macOS says the app cannot be verified

Current MVP builds are not signed or notarized.

Workaround:

- Right-click the app and choose Open.
- Or allow the app from macOS Privacy & Security settings.

Future releases should add Developer ID signing and notarization.

## Model download fails

Checks:

- Network connection.
- Available disk space.
- Provider or model source availability.
- Model license and access requirements.

Try a smaller model first to separate model-specific issues from runtime issues.

## Qwen3-ASR fails to load

If the error mentions `transformers.models.qwen3_asr`, the installed Transformers version does not include the required module.

Fixes:

- Update backend dependencies.
- Confirm the frozen desktop backend includes the Qwen3-ASR hidden imports.
- Rebuild the desktop package after dependency changes.
