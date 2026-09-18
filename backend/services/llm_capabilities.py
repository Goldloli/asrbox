"""User-triggered synthetic subtitle checks; never probe with user media or subtitles."""
from __future__ import annotations

import time
from types import SimpleNamespace

from backend.models import LLMCapabilityCheck, LLMCapabilityTestResponse
from backend.services import llm_providers, proofreading, translation
from backend.services.llm_compatibility import resolved

PROBE_TIMEOUT = 180
RETRYABLE = {'LLM_OUTPUT_FORMAT_UNSUPPORTED', 'LLM_PROVIDER_INVALID_RESPONSE',
             'LLM_INVALID_RESPONSE', 'TRANSLATION_INVALID_RESPONSE', 'LLM_CAPABILITY_SAMPLE_FAILED'}


def test_capabilities(db, provider_id):
    row = llm_providers.get_provider_row(db, provider_id)
    if row is None:
        return None
    # Copy only the fields used for a request; no ORM objects cross a concurrent update.
    provider = SimpleNamespace(**{key: getattr(row, key) for key in (
        'preset', 'base_url', 'api_key_secret', 'default_model', 'enabled', 'compatibility_json')})
    revision = row.updated_at
    checks = {name: LLMCapabilityCheck(error_code='LLM_CAPABILITY_NOT_TESTED') for name in ('translation', 'proofreading')}
    requests_made, recommendation = 0, None
    deadline = time.monotonic() + PROBE_TIMEOUT
    try:
        llm_providers.validate_usable(provider)
        options = resolved(provider)
        for output_format in ('json_schema', 'json_object', 'prompt'):
            candidate = options.model_copy(update={'output_format': output_format})
            provider.compatibility_json = candidate.model_dump_json()
            checks = {name: LLMCapabilityCheck(error_code='LLM_CAPABILITY_NOT_TESTED') for name in checks}
            for kind in checks:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    checks[kind] = LLMCapabilityCheck(error_code='LLM_PROVIDER_TIMEOUT')
                    break
                if kind == 'translation':
                    batch = {'targets': [{'id': 1, 'text': 'Hello.'}, {'id': 2, 'text': 'Thank you.'}],
                             'context_before': [], 'context_after': []}
                    run = SimpleNamespace(source_language_json='{"kind":"preset","code":"en"}',
                                          target_language_json='{"kind":"preset","code":"zh-Hans"}')
                    messages = translation.messages_for(run, batch)
                    schema = translation.provider_response_schema([1, 2])
                else:
                    batch = proofreading.ProofreadingBatch(targets=[{'id': 1, 'text': 'I has a book.'}], context=[])
                    messages, schema = proofreading._messages_for_batch(batch), proofreading.response_schema([1])
                requests_made += 1
                try:
                    content = llm_providers.chat_completion(provider, messages, timeout=min(90, remaining), response_schema=schema)
                    if kind == 'translation':
                        values = translation.parse_provider_translations(content, [1, 2])
                        if not all(any('\u4e00' <= c <= '\u9fff' for c in item['text']) for item in values):
                            raise llm_providers.LLMProviderError('LLM_CAPABILITY_SAMPLE_FAILED', 'Sample did not perform the requested operation')
                    else:
                        values = proofreading.parse_suggestions(content, batch.targets)
                        if len(values) != 1 or values[0].suggested_text.strip().rstrip('.!') != 'I have a book':
                            raise llm_providers.LLMProviderError('LLM_CAPABILITY_SAMPLE_FAILED', 'Sample did not perform the requested operation')
                    checks[kind] = LLMCapabilityCheck(ok=True)
                except (llm_providers.LLMProviderError, translation.TranslationError, proofreading.ProofreadingError) as exc:
                    checks[kind] = LLMCapabilityCheck(error_code=exc.code)
                    break
            if all(check.ok for check in checks.values()):
                recommendation = candidate
                break
            if any(check.error_code not in RETRYABLE | {'LLM_CAPABILITY_NOT_TESTED', None} for check in checks.values()):
                break
    except (llm_providers.LLMProviderError, ValueError) as exc:
        checks['translation'] = LLMCapabilityCheck(error_code=getattr(exc, 'code', 'LLM_PROVIDER_INVALID'))
    return LLMCapabilityTestResponse(
        ok=recommendation is not None,
        message='Both subtitle samples passed; apply the tested settings before use.' if recommendation else
                'Subtitle samples did not pass. Review protocol, thinking and streaming settings.',
        provider_updated_at=revision, requests_made=requests_made,
        translation=checks['translation'], proofreading=checks['proofreading'], recommended=recommendation,
    )
