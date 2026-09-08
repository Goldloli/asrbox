# AI Subtitle Proofreading and Translation

[中文](ai-proofreading.md)

Subtitle proofreading checks an already successful transcript. It does not replace ASR and never rewrites the whole transcript automatically: the LLM creates suggestions, and only explicitly selected suggestions create a new transcript version.

## Configure a provider

Open Settings → AI LLM providers and select a preset or OpenAI-compatible service:

- Ollama is local and needs no API key, but it does need an installed model name.
- MiniMax, Kimi, DeepSeek, Qwen, and GLM normally require provider credentials.
- OpenAI-compatible needs the service URL, model, and any credential required by that service.

Use Test connection to validate the URL, authentication, and model. Docker reaches host Ollama at `http://host.docker.internal:11434/v1`; container `localhost` refers to ASRbox itself.

## Custom platform compatibility

Test connection checks a basic response only. After saving, select **Test translation and proofreading** to send built-in samples: at most 6 requests within 3 minutes, potentially billed, without user subtitles or media. The test tries JSON Schema, JSON object and prompt-only constraints. Only when both samples pass does it offer **Apply tested settings**. Tests do not modify configuration. Applying a recommendation fails if the provider changed in the meantime.

Expand **Translation and proofreading compatibility** in the provider editor:

| Setting | Purpose |
| --- | --- |
| Parameter protocol | Use the preset/known official host automatically, or choose OpenAI, DeepSeek, Ollama, Qwen or GLM for a custom proxy; model names do not determine the protocol |
| Thinking mode | Automatic, model default or request thinking off; thinking-only models need the model default |
| Output constraint | Automatic, JSON Schema, JSON object or prompt only; ASRbox still validates business structure locally |
| Response transport | Complete JSON or streaming SSE; some thinking models require streaming |

Translation and proofreading share these settings, a 90-second total request deadline and a 1 MiB response limit. Keep-alives cannot renew the deadline. Streaming collects content only, excluding reasoning; truncation, refusals and incomplete structures fail explicitly. Real subtitle failures never trigger speculative configuration changes or automatic resends. Capability testing also stops immediately on authentication, rate-limit, timeout, connection or other non-format errors.

Passing fixed samples does not prove a platform obeys every parameter and does not guarantee long-task speed, availability, semantic segment alignment or translation quality. APIs outside OpenAI Chat Completions are unsupported. Existing configurations migrate without losing credentials. Compatibility options can be changed before explicitly resuming unfinished translation batches with the same preset, endpoint and model; saved batches are preserved.

## Workflow

1. Open AI from the sidebar.
2. The left column lists only completed tasks that have a subtitle version.
3. Select a task and LLM provider, then start Subtitle proofreading.
4. Wait for completion. Returning to AI restores the current run.
5. Results retain subtitle order. Suggested changes are expanded; adjacent correct ranges have individual “expand segments X-Y” controls.
6. Review time, original text, suggestion, and reason, then select suggestions to accept.
7. Apply selected suggestions. ASRbox creates a new version and remains on the AI page.

Suggestions start unselected. Applying is disabled with no selection, and unselected suggestions never change the transcript. Applied or stale suggestions cannot overwrite a newer version.

## Results and failures

- No changes needed: the LLM completed successfully and returned an empty suggestion list.
- Connection failure: unreachable URL, stopped Ollama, DNS, or network failure.
- Authentication failure: invalid, expired, or insufficient credentials.
- Model failure: missing, unpulled, or unsupported model.
- Context too long: the prompt and subtitle exceed the model limit.
- Rate limit/server failure: retry later or check provider quota/status.
- Invalid response: the model did not return parseable structured suggestions.

Only the first case means a successful check found nothing to change. Every failure preserves the transcript and does not invalidate completed ASR work.

## Privacy

Requests include segment text, identifiers, and limited neighboring context. They do not include audio, video, or local file paths. Remote providers process that text on third-party systems; review their privacy and retention terms.

LLM credentials, run records, and suggestions live in local SQLite and are included in app backups. Diagnostic bundles should exclude credentials and suggestion content. Ollama is local only when its URL actually points to a controlled local or private service.

A 128k context window cannot be converted directly into `128000 / 30 Chinese characters` subtitle lines: instructions, JSON, punctuation, timestamps, output allowance, and the model tokenizer all consume tokens. ASRbox keeps safety headroom, and long transcripts remain subject to the selected model's real input/output limits.

## Multilingual subtitle translation (unreleased)

The development branch adds AI → Subtitle translation using the same LLM providers. Sources are preserved. Proofreading is optional: select a saved proofread version if you want to translate corrected subtitles.

1. Select a completed task and a specific saved source version. Unsaved source edits are excluded.
2. Choose source and target languages. Auto supports mixed source languages; the target must be explicit. Presets cover simplified/traditional Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Arabic, Hindi, Thai and Vietnamese. Custom names allow 1–80 Unicode characters without controls. Identical explicit languages are rejected; Chinese script conversion is allowed.
3. Review the provider and local/remote disclosure, then start. Each run has one target language; create separate runs for other languages. Opening, switching or refreshing the page never sends a translation request automatically.
4. Progress counts saved segments. Leave and return, or open a link containing `mode=translation&run=…` to locate a run.
5. Review every source/translation pair, search, play source media and save text edits as one immutable revision. Missing media does not prevent text review or export. Older translations remain paired with their original source snapshot after source edits.
6. Select a saved translation revision and export TXT, SRT, VTT, ASS, JSON or Markdown. Choose translated-only or bilingual content, with source-first or translation-first order. JSON preserves separate `source_text` and `translated_text` fields. Unsaved edits are excluded from exports.

Translations do not change the source transcript, its export or proofreading staleness. While the source task is being retranscribed, creation/resuming/editing is disabled, but saved history remains readable and exportable. Save conflicts preserve drafts so you can check newer revisions before deciding how to save.

Batches contain at most 100 target segments and 6,000 Unicode characters including context. Context includes at most two neighboring segments on each side, totaling at most 1,000 characters. A segment over 6,000 characters is rejected before any request. Sources require unique segment IDs, nonempty text and exportable timestamps. These character limits are not token guarantees.

Only fully successful batches are checkpointed. A complete translation version is published only after every batch succeeds. Cancellation stops local progress and discards late responses, but an in-flight provider request may continue until timeout and incur charges. Failed, cancelled or restart-interrupted runs require explicit resumption. There are no automatic paid retries. Only unfinished batches are resent, but a remotely processed batch that was not saved locally may incur charges again.

Resuming requires the original provider endpoint, preset and model; changing them requires a new full translation. Rotating only credentials is allowed. Removing a provider preserves completed translations; deleting a source task deletes its translations. Backups include all translation revisions and checkpoints. Export translations and back up before downgrading: old binaries do not guarantee safe deletion/restoration of the new tables.

Language coverage, accuracy and terminology consistency depend on the model. Structural validation is not semantic quality verification. Review before sharing. Glossaries, dubbing, subtitle burn-in and automatic retiming are outside this first version. ASS fonts and complex-script rendering depend on the player; long bilingual text is not silently shortened.

Each translation request has a 90-second total deadline, including provider keep-alives. A timeout preserves completed batches for explicit resumption. The UI shows time spent waiting for the current batch; saved progress changes only after complete results pass validation. The DeepSeek preset uses JSON output and disables thinking for V4 translation requests; proofreading shares the compatibility settings, while connectivity tests do not request subtitle structures. Models can still omit segments or return invalid data; incomplete results are rejected and manual review remains necessary.

Ollama translation disables thinking and uses JSON Schema to constrain output fields, segment IDs and segment count. This reduces waiting and format errors from larger thinking models. Use an Ollama version supporting these OpenAI-compatible parameters; proofreading shares the compatibility settings; connection tests share thinking and transport settings but do not request subtitle output structures.
