# AI Subtitle Proofreading

[中文](ai-proofreading.md)

Subtitle proofreading checks an already successful transcript. It does not replace ASR and never rewrites the whole transcript automatically: the LLM creates suggestions, and only explicitly selected suggestions create a new transcript version.

## Configure a provider

Open Settings → AI LLM providers and select a preset or OpenAI-compatible service:

- Ollama is local and needs no API key, but it does need an installed model name.
- MiniMax, Kimi, DeepSeek, Qwen, and GLM normally require provider credentials.
- OpenAI-compatible needs the service URL, model, and any credential required by that service.

Use Test connection to validate the URL, authentication, and model. Docker reaches host Ollama at `http://host.docker.internal:11434/v1`; container `localhost` refers to ASRbox itself.

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
