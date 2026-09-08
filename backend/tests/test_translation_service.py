import json
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.models import TranslationCreateRequest, TranslationEditRequest
from backend.database.models import TranslationRun, TranslationBatch, TranslationVersion, TranscriptVersion
from backend.services import translation as svc, llm_providers, versions, tasks
from backend.tests.test_proofreading_service import _database, _completed_task


@pytest.fixture
def setup(tmp_path, monkeypatch):
    factory = _database(tmp_path)
    monkeypatch.setattr(svc, 'enqueue', lambda *args: None)
    with factory.SessionLocal() as db:
        task, provider, version = _completed_task(db)
        yield db, task, provider, version


def create(setup):
    db, task, provider, version = setup
    return svc.create_run(db, task.id, TranslationCreateRequest(provider_id=provider.id,
        source_version_id=version.id, source_language={'kind': 'preset', 'code': 'ja'},
        target_language={'kind': 'preset', 'code': 'fr'}))


def echo(provider, messages, **kwargs):
    data = json.loads(messages[1]['content'])
    return json.dumps({'translations': [{'segment_id': s['id'], 'text': '译 ' + s['text']} for s in data['targets']]})


def complete(setup, monkeypatch):
    monkeypatch.setattr(llm_providers, 'chat_completion', echo)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    setup[0].expire_all()
    return svc.get_run(setup[0], setup[1].id, run.id)


def test_completion_edit_and_original_independence(setup, monkeypatch):
    db, task, provider, source = setup
    run = complete(setup, monkeypatch)
    assert run.status == 'completed'
    assert (run.completed_batches, run.completed_segments) == (1, 2)
    assert db.query(TranscriptVersion).count() == 1
    assert task.text == 'first text\nsecond text'
    first = svc.get_version(db, task.id, run.id, svc.latest_version(db, run.id).id)
    payload = TranslationEditRequest(base_version_id=first.id, segments=[{'id': 1, 'text': 'Bonjour'}, {'id': 2, 'text': 'Salut'}])
    second = svc.edit_version(db, task.id, run.id, payload)
    assert second.revision == 2 and second.parent_version_id == first.id
    assert svc.get_version(db, task.id, run.id, first.id).segments[0].text == '译 first text'
    with pytest.raises(svc.TranslationError, match='reload'):
        svc.edit_version(db, task.id, run.id, payload)
    payload.base_version_id = second.id
    assert svc.edit_version(db, task.id, run.id, payload).id == second.id
    versions.create_version(db, task, 'edit')
    assert not svc.to_response(db, run).source_is_current
    assert svc.get_version(db, task.id, run.id, first.id).source_version_id == source.id
    task.status = 'running'; db.commit()
    assert not svc.to_response(db, run).can_edit
    assert svc.to_response(db, run).can_export


@pytest.mark.parametrize('mutation', ['unfinished', 'foreign', 'empty', 'duplicate', 'time', 'long', 'disabled'])
def test_preflight_does_not_enqueue(setup, monkeypatch, mutation):
    db, task, provider, source = setup
    called = []
    monkeypatch.setattr(svc, 'enqueue', lambda *a: called.append(a))
    segments = json.loads(source.segments_json)
    if mutation == 'unfinished': task.status = 'running'
    elif mutation == 'foreign': source.task_id = 'another'
    elif mutation == 'empty': segments[0]['text'] = ' '
    elif mutation == 'duplicate': segments[1]['id'] = segments[0]['id']
    elif mutation == 'time': segments[0]['end'] = -1
    elif mutation == 'long': segments[-1]['text'] = '字' * 6001
    elif mutation == 'disabled': provider.enabled = False
    source.segments_json = json.dumps(segments); db.commit()
    with pytest.raises((svc.TranslationError, llm_providers.LLMProviderError)):
        create(setup)
    assert not called and db.query(TranslationRun).count() == 0


def test_duplicate_create_and_workers(setup, monkeypatch):
    run = create(setup)
    with pytest.raises(svc.TranslationError, match='active'):
        create(setup)
    calls = []
    def provider(*args, **kwargs):
        calls.append(1)
        return echo(*args, **kwargs)
    monkeypatch.setattr(llm_providers, 'chat_completion', provider)
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(lambda _: svc.execute_run(run.id, run.attempt), range(2)))
    assert len(calls) == 1
    assert setup[0].query(TranslationVersion).count() == 1


def test_batch_limits_and_coverage():
    segments = [{'id': i, 'text': '𠮷' * 99} for i in range(201)]
    batches = svc.make_batches(segments)
    assert [s['id'] for b in batches for s in b['targets']] == list(range(201))
    for b in batches:
        assert len(b['targets']) <= 100
        context = b['context_before'] + b['context_after']
        assert len(b['context_before']) <= 2 and len(b['context_after']) <= 2
        assert sum(map(len, context)) <= 1000
        assert sum(len(s['text']) for s in b['targets']) + sum(map(len, context)) <= 6000
    assert len(svc.make_batches([{'id': 1, 'text': '字' * 6000}])) == 1
    assert len(svc.make_batches([{'id': i, 'text': 'x'} for i in range(101)])) == 2


@pytest.mark.parametrize('value', [
    {}, {'translations': []}, {'translations': [{'segment_id': 1, 'text': 'x', 'start': 1}]},
    {'translations': [{'segment_id': 1, 'text': ''}]}, {'translations': [{'segment_id': True, 'text': 'x'}]},
    {'translations': [{'segment_id': 2, 'text': 'x'}]},
    {'translations': [{'segment_id': 1, 'text': 'x'}, {'segment_id': 1, 'text': 'x'}]},
    {'translations': [{'segment_id': 1, 'text': 'x'}], 'extra': 0},
])
def test_strict_structure(value):
    with pytest.raises(svc.TranslationError):
        svc.parse_translations(json.dumps(value), [1])


def test_identical_text_and_strict_json():
    assert svc.parse_translations('{"translations":[{"segment_id":1,"text":"Tokyo"}]}', [1])[0]['text'] == 'Tokyo'
    with pytest.raises(svc.TranslationError):
        svc.parse_translations('{"translations":[],"translations":[{"segment_id":1,"text":"x"}]}', [1])


def test_partial_failure_resumes_only_unfinished_batches(setup, monkeypatch):
    db, task, provider, source = setup
    segments = [{'id': i, 'start': i, 'end': i+1, 'text': '字' * 3000} for i in range(5)]
    source.segments_json = json.dumps(segments); db.commit()
    seen = []
    def flaky(p, messages, **kwargs):
        ids = [s['id'] for s in json.loads(messages[1]['content'])['targets']]
        seen.append(ids)
        if len(seen) == 2:
            raise llm_providers.LLMProviderError('LLM_PROVIDER_TIMEOUT', 'SECRET raw text')
        return echo(p, messages, **kwargs)
    monkeypatch.setattr(llm_providers, 'chat_completion', flaky)
    run = create(setup); svc.execute_run(run.id, run.attempt); db.expire_all()
    row = svc.get_run(db, task.id, run.id)
    assert row.status == 'failed' and row.completed_batches == 1
    assert 'SECRET' not in row.error
    assert db.query(TranslationVersion).count() == 0
    resumed = svc.retry_run(db, task.id, run.id)
    with pytest.raises(svc.TranslationError): svc.retry_run(db, task.id, run.id)
    svc.execute_run(run.id, resumed.attempt); db.expire_all()
    assert svc.get_run(db, task.id, run.id).status == 'completed'
    assert seen == [[0,1], [2,3], [2,3], [4]]


@pytest.mark.parametrize('action', ['cancel', 'delete'])
def test_late_response_does_not_write_and_network_releases_lock(setup, monkeypatch, action):
    db, task, provider, source = setup
    entered, release = threading.Event(), threading.Event()
    def slow(*args, **kwargs):
        entered.set(); assert release.wait(5)
        return echo(*args, **kwargs)
    monkeypatch.setattr(llm_providers, 'chat_completion', slow)
    run = create(setup)
    with ThreadPoolExecutor(1) as pool:
        future = pool.submit(svc.execute_run, run.id, run.attempt)
        assert entered.wait(3)
        try:
            assert svc.task_transition_lock.acquire(timeout=1)
            svc.task_transition_lock.release()
            if action == 'cancel':
                svc.cancel_run(db, task.id, run.id)
                resumed = svc.retry_run(db, task.id, run.id)
                assert resumed.attempt == 2
            else:
                tasks.delete_task(db, task.id)
        finally: release.set()
        future.result(timeout=5)
    db.expire_all()
    assert db.query(TranslationVersion).count() == 0
    assert db.query(TranslationBatch).filter_by(status='completed').count() == 0
    if action == 'delete': assert db.query(TranslationRun).count() == 0
    else: assert db.get(TranslationRun, run.id).status == 'queued'


def test_recovery_and_provider_changes(setup):
    db, task, provider, source = setup
    run = create(setup)
    assert svc.mark_interrupted_runs(db) == 1
    db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'interrupted'
    provider.default_model = 'different'; db.commit()
    assert not svc.to_response(db, db.get(TranslationRun, run.id)).can_retry
    with pytest.raises(svc.TranslationError, match='configuration changed'):
        svc.retry_run(db, task.id, run.id)
    provider.default_model = 'qwen3'; provider.api_key_secret = 'rotated'; db.commit()
    assert svc.retry_run(db, task.id, run.id).attempt == 2


def test_deleted_provider_preserves_history(setup, monkeypatch):
    db, task, provider, source = setup
    run = complete(setup, monkeypatch)
    vid = svc.latest_version(db, run.id).id
    llm_providers.delete_provider(db, provider.id); db.expire_all()
    assert svc.to_response(db, db.get(TranslationRun, run.id)).llm_provider_id is None
    assert svc.get_version(db, task.id, run.id, vid).segments


def test_publication_failure_is_atomic_and_can_resume(setup, monkeypatch):
    db, task, provider, source = setup
    monkeypatch.setattr(llm_providers, 'chat_completion', echo)
    original = svc.TranslationVersion
    def broken(*args, **kwargs): raise RuntimeError('private response')
    monkeypatch.setattr(svc, 'TranslationVersion', broken)
    monkeypatch.setattr(svc, 'TranslationVersion', original)
    run = create(setup)
    monkeypatch.setattr(svc, 'TranslationVersion', broken)
    svc.execute_run(run.id, run.attempt)
    monkeypatch.setattr(svc, 'TranslationVersion', original)
    db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'failed'
    assert db.query(TranslationVersion).count() == 0
    resumed = svc.retry_run(db, task.id, run.id)
    monkeypatch.setattr(llm_providers, 'chat_completion', lambda *a, **k: pytest.fail('checkpoint was resent'))
    svc.execute_run(run.id, resumed.attempt); db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'completed'


def test_retry_uses_saved_batch_membership_if_default_batch_size_changes(setup, monkeypatch):
    db, task, provider, source = setup
    monkeypatch.setattr(svc, 'MAX_SEGMENTS', 1)
    run = create(setup)
    svc.mark_interrupted_runs(db)
    monkeypatch.setattr(svc, 'MAX_SEGMENTS', 100)
    calls = []
    def capture(p, messages, **kwargs):
        calls.append([s['id'] for s in json.loads(messages[1]['content'])['targets']])
        return echo(p, messages, **kwargs)
    monkeypatch.setattr(llm_providers, 'chat_completion', capture)
    retry = svc.retry_run(db, task.id, run.id)
    svc.execute_run(run.id, retry.attempt); db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'completed'
    assert calls == [[1], [2]]


@pytest.mark.parametrize('fence', ['json', '', 'JSON'])
def test_complete_json_fence_preserves_strict_alignment(fence):
    payload = '{"translations":[{"segment_id":24,"text":"final"},{"segment_id":7,"text":"first"}]}'
    result = svc.parse_translations(f'```{fence}\n{payload}\n```', [7, 24])
    assert result == [{'segment_id': 7, 'text': 'first'}, {'segment_id': 24, 'text': 'final'}]


@pytest.mark.parametrize('response', [
    'Explanation\n```json\n{"translations":[{"segment_id":1,"text":"x"}]}\n```',
    '```json\n{"translations":[{"segment_id":1,"text":"x"}]}\n```\nExplanation',
    '```python\n{"translations":[{"segment_id":1,"text":"x"}]}\n```',
    '```json\n```json\n{"translations":[]}\n```\n```',
    '```json\n{"translations":[{"segment_id":1,"text":"x"}]} {}\n```',
    '```json\n{"translations":[{"segment_id":1,"text":"x","extra":true}]}\n```',
    '```json\n{"translations":[],"translations":[{"segment_id":1,"text":"x"}]}\n```',
])
def test_fence_normalization_does_not_repair_invalid_output(response):
    with pytest.raises(svc.TranslationError):
        svc.parse_translations(response, [1])


def test_missing_final_segment_fails_without_publishing_and_keeps_source(setup, monkeypatch):
    db, task, provider, source = setup
    before = source.segments_json
    run = create(setup)
    def omit_last(provider, messages, **kwargs):
        payload = json.loads(messages[1]['content'])
        assert payload['required_segment_ids'] == [1, 2]
        assert payload['required_translation_count'] == 2
        assert kwargs['structured_translation'] is True
        return '{"translations":[{"segment_id":1,"text":"only first"}]}'
    monkeypatch.setattr(llm_providers, 'chat_completion', omit_last)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'failed' and row.error_code == 'TRANSLATION_INVALID_RESPONSE'
    assert row.completed_segments == 0
    assert svc.latest_version(db, run.id) is None
    assert source.segments_json == before
    assert svc.to_response(db, row).can_retry
