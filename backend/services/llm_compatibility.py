"""Explicit Chat Completions compatibility; no speculative retries of user content."""
from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlparse

import httpx

from backend.models import LLMCompatibility

MAX_RESPONSE_BYTES = 1024 * 1024


class LLMProviderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code, self.message = code, message


def invalid():
    raise LLMProviderError("LLM_PROVIDER_INVALID_RESPONSE", "Provider returned an invalid or incomplete response")


def json_object(content):
    """Only unwrap a complete JSON fence; reject duplicate keys at every depth."""
    fenced = re.fullmatch(r"```(?:json)?[ \t]*\r?\n(.*?)\r?\n```", content.strip(), re.DOTALL | re.IGNORECASE)
    if fenced:
        content = fenced.group(1)

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(content, object_pairs_hook=unique)


def settings(provider):
    return LLMCompatibility.model_validate_json(getattr(provider, "compatibility_json", None) or "{}")


def resolved(provider):
    options = settings(provider)
    protocol = options.protocol
    if protocol == "auto":
        protocol = provider.preset if provider.preset in {"deepseek", "ollama", "qwen", "glm"} else "openai"
        if provider.preset == "custom":
            protocol = {
                "api.deepseek.com": "deepseek", "dashscope.aliyuncs.com": "qwen",
                "dashscope-intl.aliyuncs.com": "qwen", "open.bigmodel.cn": "glm",
                "api.z.ai": "glm",
            }.get((urlparse(provider.base_url).hostname or "").lower(), "openai")
    thinking = options.thinking
    if thinking == "auto":
        thinking = "disabled" if protocol in {"ollama", "qwen", "glm"} or (
            protocol == "deepseek" and (provider.default_model or "").startswith("deepseek-v4-")
        ) else "default"
    output = options.output_format
    if output == "auto":
        output = "json_schema" if protocol == "ollama" else (
            "json_object" if protocol in {"deepseek", "qwen", "glm"} else "prompt")
    return options.model_copy(update={"protocol": protocol, "thinking": thinking, "output_format": output})


def request_body(provider, messages, *, structured=False, schema=None):
    options = resolved(provider)
    body = {"model": provider.default_model, "messages": messages, "stream": options.transport == "sse"}
    if options.thinking == "disabled":
        if options.protocol in {"deepseek", "glm"}:
            body["thinking"] = {"type": "disabled"}
        elif options.protocol == "qwen":
            body["enable_thinking"] = False
        else:
            body["reasoning_effort"] = "none"
    if structured:
        if options.output_format == "json_schema" and schema is not None:
            body["response_format"] = {"type": "json_schema", "json_schema": {
                "name": "subtitle_result", "strict": True, "schema": schema,
            }}
        elif options.output_format in {"json_schema", "json_object"}:
            body["response_format"] = {"type": "json_object"}
    return body


def check_finish(reason):
    if reason == "length":
        raise LLMProviderError("LLM_PROVIDER_TRUNCATED", "Provider output was truncated; reduce the input or use another model")
    if reason in {"content_filter", "tool_calls", "function_call"}:
        raise LLMProviderError("LLM_PROVIDER_REFUSED", "Provider did not return subtitle text")
    if reason not in {None, "stop"}:
        invalid()


def completion_content(payload):
    try:
        choice = payload["choices"][0]
        check_finish(choice.get("finish_reason"))
        message = choice["message"]
        if message.get("refusal") or message.get("tool_calls") or message.get("function_call"):
            raise LLMProviderError("LLM_PROVIDER_REFUSED", "Provider did not return subtitle text")
        content = message["content"]
        if not isinstance(content, str) or not content.strip():
            invalid()
        return content
    except (KeyError, IndexError, TypeError, AttributeError):
        invalid()


class _SSE:
    def __init__(self, on_delta=None):
        self.data = []
        self.parts = []
        self.finished = False
        self.done = False
        self.on_delta = on_delta

    def line(self, line):
        if line.startswith('data:'):
            self.data.append(line[5:].lstrip(' '))
        elif not line and self.data:
            data, self.data = '\n'.join(self.data), []
            if data == '[DONE]':
                if not self.finished:
                    invalid()
                self.done = True
                return
            try:
                payload = json.loads(data)
                if 'error' in payload:
                    invalid()
                for choice in payload.get('choices', []):
                    if choice.get('index', 0) != 0:
                        continue
                    delta = choice.get('delta', {})
                    if delta.get('refusal') or delta.get('tool_calls') or delta.get('function_call'):
                        raise LLMProviderError('LLM_PROVIDER_REFUSED', 'Provider did not return subtitle text')
                    content = delta.get('content')
                    if content is not None:
                        if not isinstance(content, str) or self.finished and content:
                            invalid()
                        self.parts.append(content)
                        if content and self.on_delta is not None:
                            self.on_delta(content)
                    reason = choice.get('finish_reason')
                    check_finish(reason)
                    if reason == 'stop':
                        self.finished = True
            except (ValueError, TypeError, AttributeError, RecursionError):
                invalid()

    def response(self):
        if not self.finished or not ''.join(self.parts).strip():
            invalid()
        return httpx.Response(200, json={'choices': [{'message': {'content': ''.join(self.parts)}, 'finish_reason': 'stop'}]})


async def bounded_completion(url, headers, body, timeout, max_response_bytes, on_delta=None):
    try:
        async with asyncio.timeout(timeout):
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
                async with client.stream('POST', url, headers=headers, json=body) as response:
                    is_sse = response.is_success and 'text/event-stream' in response.headers.get('content-type', '')
                    chunks, size, buffer = [], 0, b''
                    sse = _SSE(on_delta)
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > max_response_bytes:
                            raise LLMProviderError('LLM_PROVIDER_RESPONSE_TOO_LARGE', 'LLM provider response exceeds size limit')
                        if not is_sse:
                            chunks.append(chunk)
                            continue
                        buffer += chunk
                        while b'\n' in buffer:
                            line, buffer = buffer.split(b'\n', 1)
                            sse.line(line.rstrip(b'\r').decode('utf-8'))
                            if sse.done:
                                return sse.response()
                    if is_sse:
                        if buffer:
                            sse.line(buffer.rstrip(b'\r').decode('utf-8'))
                        sse.line('')
                        return sse.response()
                    result = httpx.Response(response.status_code, content=b''.join(chunks))
                    if on_delta is not None and result.is_success:
                        try:
                            on_delta(completion_content(result.json()))
                        except (ValueError, RecursionError):
                            pass
                    return result
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise LLMProviderError('LLM_PROVIDER_TIMEOUT', 'LLM provider timed out') from exc
    except httpx.HTTPError as exc:
        raise LLMProviderError('LLM_PROVIDER_UNAVAILABLE', 'LLM provider request failed') from exc
    except UnicodeError as exc:
        raise LLMProviderError('LLM_PROVIDER_INVALID_RESPONSE', 'Provider returned invalid text encoding') from exc
