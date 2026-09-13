import json

import httpx
import pytest

from backend.services import llm_compatibility as compat, llm_providers
from backend.tests.test_llm_compatibility import configured, event
from backend.tests.test_translation_execution import TrackedBody, mock_transport
from backend.tests.test_translation_service import setup


def test_sse_delivers_each_delta_and_full_result(setup, monkeypatch):
    provider = configured(setup, transport='sse')
    data = event({'content': '你'}) + event({'content': ''}) + event({'content': '好'}) + event({}, 'stop') + b'data: [DONE]\n\n'
    mock_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={'content-type': 'text/event-stream'}, stream=TrackedBody(data)))
    deltas = []
    result = llm_providers.chat_completion(provider, [], on_delta=deltas.append)
    assert result == '你好'
    assert deltas == ['你', '好']


def test_json_upstream_falls_back_to_single_full_text_delta(setup, monkeypatch):
    provider = configured(setup, transport='sse')
    calls = []
    def reply(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={'choices': [{'message': {'content': '完整回答'}, 'finish_reason': 'stop'}]})
    mock_transport(monkeypatch, reply)
    deltas = []
    assert llm_providers.chat_completion(provider, [], on_delta=deltas.append) == '完整回答'
    assert calls[0]['stream'] is True
    assert deltas == ['完整回答']


def test_default_json_transport_invokes_delta_once(setup, monkeypatch):
    mock_transport(monkeypatch, lambda request: httpx.Response(
        200, json={'message': {'content': 'OK'}, 'done': True, 'done_reason': 'stop'}))
    deltas = []
    assert llm_providers.chat_completion(setup[2], [], on_delta=deltas.append) == 'OK'
    assert deltas == ['OK']


def ndjson(*objects):
    return ''.join(json.dumps(obj, ensure_ascii=False) + '\n' for obj in objects).encode()


def test_native_ndjson_delivers_deltas_and_full_result(setup, monkeypatch):
    data = ndjson({'message': {'content': '你'}, 'done': False},
                  {'message': {'content': '好'}, 'done': False},
                  {'done': True, 'done_reason': 'stop'})
    def reply(request):
        assert request.url.path == '/api/chat' and json.loads(request.content)['stream'] is True
        return httpx.Response(200, headers={'content-type': 'application/x-ndjson'}, stream=TrackedBody(data))
    mock_transport(monkeypatch, reply)
    deltas = []
    assert llm_providers.chat_completion(setup[2], [], on_delta=deltas.append) == '你好'
    assert deltas == ['你', '好']


@pytest.mark.parametrize('payload,code', [
    ({'done': True, 'done_reason': 'length'}, 'LLM_PROVIDER_TRUNCATED'),
    ({'error': 'secret mid-stream failure'}, 'LLM_PROVIDER_INVALID_RESPONSE'),
])
def test_native_ndjson_finish_and_error_classification(setup, monkeypatch, payload, code):
    data = ndjson({'message': {'content': '半截'}, 'done': False}, payload)
    mock_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={'content-type': 'application/x-ndjson'}, stream=TrackedBody(data)))
    deltas = []
    with pytest.raises(compat.LLMProviderError) as caught:
        llm_providers.chat_completion(setup[2], [], on_delta=deltas.append)
    assert caught.value.code == code and 'secret' not in str(caught.value)
    assert deltas == ['半截']


def test_midstream_network_error_keeps_classification_and_delivered_deltas(setup, monkeypatch):
    provider = configured(setup, transport='sse')
    class Broken(TrackedBody):
        async def __aiter__(self):
            yield event({'content': '半截'})
            raise httpx.ReadError('connection reset')
    mock_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={'content-type': 'text/event-stream'}, stream=Broken(b'')))
    deltas = []
    with pytest.raises(compat.LLMProviderError) as caught:
        llm_providers.chat_completion(provider, [], on_delta=deltas.append)
    assert caught.value.code == 'LLM_PROVIDER_UNAVAILABLE'
    assert deltas == ['半截']


def test_midstream_invalid_payload_raises_after_delivered_deltas(setup, monkeypatch):
    provider = configured(setup, transport='sse')
    data = event({'content': '半截'}) + b'data: {invalid json\n\n'
    mock_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={'content-type': 'text/event-stream'}, stream=TrackedBody(data)))
    deltas = []
    with pytest.raises(compat.LLMProviderError) as caught:
        llm_providers.chat_completion(provider, [], on_delta=deltas.append)
    assert caught.value.code == 'LLM_PROVIDER_INVALID_RESPONSE'
    assert deltas == ['半截']


def test_no_callback_keeps_existing_behavior(setup, monkeypatch):
    provider = configured(setup, transport='sse')
    data = event({'content': '你好'}) + event({}, 'stop') + b'data: [DONE]\n\n'
    mock_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={'content-type': 'text/event-stream'}, stream=TrackedBody(data)))
    assert llm_providers.chat_completion(provider, []) == '你好'


def test_delta_caller_forces_stream_request_even_with_json_transport(setup, monkeypatch):
    provider = configured(setup, transport='json')
    calls = []
    def reply(request):
        calls.append(json.loads(request.content))
        data = event({'content': '流式'}) + event({}, 'stop') + b'data: [DONE]\n\n'
        return httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=TrackedBody(data))
    mock_transport(monkeypatch, reply)
    deltas = []
    assert llm_providers.chat_completion(provider, [], on_delta=deltas.append) == '流式'
    assert calls[0]['stream'] is True
    assert deltas == ['流式']


def test_no_delta_caller_keeps_configured_transport(setup, monkeypatch):
    provider = configured(setup, transport='json')
    calls = []
    def reply(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={'choices': [{'message': {'content': 'OK'}, 'finish_reason': 'stop'}]})
    mock_transport(monkeypatch, reply)
    assert llm_providers.chat_completion(provider, []) == 'OK'
    assert calls[0]['stream'] is False
