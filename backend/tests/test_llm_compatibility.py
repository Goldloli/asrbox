import asyncio
import json
import threading
import time
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from backend.app import create_app
from backend.database.models import LLMProvider
from backend.models import LLMCompatibility, LLMProviderCreate, LLMProviderUpdate
from backend.services import llm_capabilities, llm_compatibility as compat, llm_providers, proofreading
from backend.tests.test_translation_execution import mock_transport, TrackedBody
from backend.tests.test_translation_service import setup


def configured(setup, **options):
    provider = setup[2]
    provider.preset = 'custom'
    provider.compatibility_json = LLMCompatibility(**options).model_dump_json()
    return provider


@pytest.mark.parametrize('protocol,expected', [
    ('openai', {'reasoning_effort': 'none'}), ('ollama', {'reasoning_effort': 'none'}),
    ('deepseek', {'thinking': {'type': 'disabled'}}), ('glm', {'thinking': {'type': 'disabled'}}),
    ('qwen', {'enable_thinking': False}),
])
def test_custom_protocol_applies_to_both_workloads(setup, monkeypatch, protocol, expected):
    p = configured(setup, protocol=protocol, thinking='disabled', output_format='json_schema', transport='sse')
    calls = []
    def respond(request):
        body = json.loads(request.content); calls.append(body)
        assert body['stream'] is True
        assert {key: body[key] for key in expected} == expected
        assert set(body) == {'model', 'messages', 'stream', 'response_format', *expected}
        assert body['response_format']['json_schema']['schema'] == {'type': 'object'}
        return httpx.Response(200, json={'choices': [{'message': {'content': '{}'}, 'finish_reason': 'stop'}]})
    mock_transport(monkeypatch, respond)
    for translation in (True, False):
        assert llm_providers.chat_completion(p, [], structured_translation=translation, response_schema={'type': 'object'}) == '{}'
    assert len(calls) == 2


def test_explicit_defaults_override_preset_and_unknown_endpoint_does_not_guess_model(setup):
    p = configured(setup)
    p.default_model = 'glm-qwen-deepseek'
    assert compat.resolved(p).protocol == 'openai'
    p.base_url = 'https://open.bigmodel.cn'
    assert compat.resolved(p).protocol == 'glm'
    p.base_url = 'https://open.bigmodel.cn.evil.example'
    assert compat.resolved(p).protocol == 'openai'
    p.compatibility_json = LLMCompatibility(protocol='qwen', thinking='default', output_format='prompt').model_dump_json()
    assert set(compat.request_body(p, [], structured=True)) == {'model', 'messages', 'stream'}


def event(delta, reason=None):
    return ('data: '+json.dumps({'choices': [{'index': 0, 'delta': delta, 'finish_reason': reason}]}, ensure_ascii=False)+'\r\n\r\n').encode()


@pytest.mark.parametrize('ending,code', [
    ('stop', None), ('length', 'LLM_PROVIDER_TRUNCATED'), ('content_filter', 'LLM_PROVIDER_REFUSED'),
    ('tool_calls', 'LLM_PROVIDER_REFUSED'), (None, 'LLM_PROVIDER_INVALID_RESPONSE'),
])
def test_sse_ignores_reasoning_requires_complete_text_and_closes(setup, monkeypatch, ending, code):
    p = configured(setup, transport='sse')
    data = event({'reasoning_content': 'private reasoning'}) + event({'content': '{"你好":'}) + event({'content': '1}'})
    data += event({}, ending) + b'data: [DONE]\n\n'
    class Split(TrackedBody):
        async def __aiter__(self):
            for byte in self.body: yield bytes([byte])
    stream = Split(data)
    mock_transport(monkeypatch, lambda request: httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=stream))
    if code:
        with pytest.raises(compat.LLMProviderError) as exc: llm_providers.chat_completion(p, [])
        assert exc.value.code == code
    else:
        assert llm_providers.chat_completion(p, []) == '{"你好":1}'
    assert stream.closed


def test_sse_keepalives_do_not_renew_deadline(setup, monkeypatch):
    class Endless(TrackedBody):
        async def __aiter__(self):
            while True:
                yield b': keepalive\n\n'
                await asyncio.sleep(.01)
    body = Endless(b'')
    mock_transport(monkeypatch, lambda r: httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=body))
    started = time.monotonic()
    with pytest.raises(compat.LLMProviderError) as exc: llm_providers.chat_completion(setup[2], [], timeout=.06)
    assert exc.value.code == 'LLM_PROVIDER_TIMEOUT' and time.monotonic()-started < .5 and body.closed


@pytest.mark.parametrize('message,reason,code', [
    ({'content': '{}'}, 'length', 'LLM_PROVIDER_TRUNCATED'),
    ({'content': '{}', 'refusal': 'secret refusal'}, 'stop', 'LLM_PROVIDER_REFUSED'),
    ({'content': '{}', 'tool_calls': [{}]}, 'stop', 'LLM_PROVIDER_REFUSED'),
    ({'reasoning_content': 'secret thinking'}, 'stop', 'LLM_PROVIDER_INVALID_RESPONSE'),
])
def test_json_rejects_truncation_refusal_and_reasoning_only(setup, monkeypatch, message, reason, code):
    calls = []
    def reply(request):
        calls.append(request)
        return httpx.Response(200, json={'choices': [{'message': message, 'finish_reason': reason}]})
    mock_transport(monkeypatch, reply)
    with pytest.raises(compat.LLMProviderError) as exc: llm_providers.chat_completion(setup[2], [])
    assert exc.value.code == code and 'secret' not in str(exc.value) and len(calls) == 1


def test_proofreading_accepts_whole_fence_but_not_duplicate_keys_or_coercion():
    targets = [{'id': 1, 'text': 'hello'}]
    assert proofreading.parse_suggestions('```json\n{"suggestions": []}\n```', targets) == []
    for data in ('{"suggestions": [], "suggestions": []}',
                 '{"suggestions":[{"segment_id":"1","suggested_text":"Hello","reason":"case"}]}',
                 'prefix {"suggestions": []}'):
        with pytest.raises(proofreading.ProofreadingError): proofreading.parse_suggestions(data, targets)


def sample_reply(request):
    body = json.loads(request.content)
    data = json.loads(body['messages'][1]['content'])
    if 'target_language' in data:
        content = {'translations': [{'segment_id': 1, 'text': '你好。'}, {'segment_id': 2, 'text': '谢谢。'}]}
    else:
        content = {'suggestions': [{'segment_id': 1, 'suggested_text': 'I have a book.', 'reason': 'Subject agreement'}]}
    return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(content)}, 'finish_reason': 'stop'}]})


def test_capabilities_probe_fallback_never_saves_settings_or_exposes_content(setup, monkeypatch):
    db, _, p, _ = setup
    saved = p.compatibility_json
    calls = []
    def respond(r):
        body = json.loads(r.content); calls.append(body)
        assert 'filename' not in r.content.decode() and 'audio' not in r.content.decode()
        if 'response_format' in body:
            return httpx.Response(400, json={'error': {'message': 'response_format not supported secret'}})
        return sample_reply(r)
    mock_transport(monkeypatch, respond)
    result = llm_capabilities.test_capabilities(db, p.id)
    assert result.ok and result.requests_made == 4 and result.recommended.output_format == 'prompt'
    assert result.translation.ok and result.proofreading.ok
    db.refresh(p); assert p.compatibility_json == saved
    assert 'secret' not in result.model_dump_json() and 'I have' not in result.model_dump_json()


@pytest.mark.parametrize('status,payload,code', [
    (401, {}, 'LLM_PROVIDER_AUTH_FAILED'), (429, {}, 'LLM_PROVIDER_RATE_LIMITED'),
    (400, {'error': 'stream required'}, 'LLM_PARAMETERS_REJECTED'), (503, {}, 'LLM_PROVIDER_HTTP_ERROR'),
])
def test_capability_non_format_errors_stop_after_one_request(setup, monkeypatch, status, payload, code):
    calls = []
    def reply(r): calls.append(r); return httpx.Response(status, json=payload)
    mock_transport(monkeypatch, reply)
    result = llm_capabilities.test_capabilities(setup[0], setup[2].id)
    assert not result.ok and result.requests_made == len(calls) == 1
    assert result.translation.error_code == code and result.proofreading.error_code == 'LLM_CAPABILITY_NOT_TESTED'


def test_capability_max_six_requests_and_budget(setup, monkeypatch):
    calls = []
    def reply(r):
        calls.append(r)
        if len(calls) % 2: return sample_reply(r)
        return httpx.Response(200, json={'choices': [{'message': {'content': '{"suggestions": []}'}}]})
    mock_transport(monkeypatch, reply)
    result = llm_capabilities.test_capabilities(setup[0], setup[2].id)
    assert not result.ok and result.requests_made == len(calls) == 6
    assert result.translation.ok and result.proofreading.error_code == 'LLM_CAPABILITY_SAMPLE_FAILED'
    monkeypatch.setattr(llm_capabilities, 'PROBE_TIMEOUT', 0)
    result = llm_capabilities.test_capabilities(setup[0], setup[2].id)
    assert not result.ok and result.requests_made == 0 and len(calls) == 6


def test_compatibility_additive_migration_preserves_old_provider(tmp_path, monkeypatch):
    from backend.database.models import Base
    from backend.database.migrations import run_migrations
    monkeypatch.setenv('ASRBOX_DATA_DIR', str(tmp_path))
    engine = create_engine(f'sqlite:///{tmp_path}/legacy.db')
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE llm_providers DROP COLUMN compatibility_json'))
        conn.execute(text("INSERT INTO llm_providers (id,name,preset,base_url,enabled,api_key_secret) VALUES ('old','Old','custom','https://example.com',1,'keep-me')"))
    factory = sessionmaker(bind=engine)
    run_migrations(engine, factory); run_migrations(engine, factory)
    with factory() as db:
        row = db.get(LLMProvider, 'old')
        assert row.api_key_secret == 'keep-me' and compat.settings(row) == LLMCompatibility()
    engine.dispose()


@pytest.mark.parametrize('route', ['test', 'test-capabilities'])
def test_capability_and_connection_routes_do_not_block_loop(setup, monkeypatch, route):
    entered, release = threading.Event(), threading.Event()
    def slow(*args):
        entered.set(); assert release.wait(3)
        return None
    module, name = (llm_providers, 'test_provider') if route == 'test' else (llm_capabilities, 'test_capabilities')
    monkeypatch.setattr(module, name, slow)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url='http://test') as client:
            pending = asyncio.create_task(client.post(f'/llm-providers/{setup[2].id}/{route}'))
            try:
                assert await asyncio.to_thread(entered.wait, 1)
                assert (await asyncio.wait_for(client.get('/health'), .5)).status_code == 200
            finally: release.set()
            assert (await pending).status_code == 404
    asyncio.run(run())
