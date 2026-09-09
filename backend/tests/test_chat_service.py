import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from backend.database.migrations import run_migrations
from backend.database.models import Base, ChatMessage, ChatSession, SchemaMigration
from backend.services import chat, llm_providers
from backend.tests.test_proofreading_service import _completed_task, _database


@pytest.fixture
def setup(tmp_path):
    factory = _database(tmp_path)
    with factory.SessionLocal() as db:
        task, provider, _ = _completed_task(db)
        yield db, task, provider


def test_fresh_database_creates_chat_tables(tmp_path):
    factory = _database(tmp_path)
    engine = factory.engine
    assert {'chat_sessions', 'chat_messages'} <= set(inspect(engine).get_table_names())
    with factory.SessionLocal() as db:
        versions = {row.version for row in db.query(SchemaMigration).all()}
    assert '20260909_001_ai_chatbot' in versions


def test_upgrade_adds_chat_tables_to_legacy_database(tmp_path, monkeypatch):
    monkeypatch.setenv('ASRBOX_DATA_DIR', str(tmp_path))
    engine = create_engine(f'sqlite:///{tmp_path}/legacy.db')
    legacy = [table for name, table in Base.metadata.tables.items()
              if name not in ('chat_sessions', 'chat_messages')]
    Base.metadata.create_all(engine, tables=legacy)
    factory = sessionmaker(bind=engine)
    run_migrations(engine, factory)
    run_migrations(engine, factory)
    assert {'chat_sessions', 'chat_messages'} <= set(inspect(engine).get_table_names())
    with factory() as db:
        assert db.query(SchemaMigration).filter_by(version='20260909_001_ai_chatbot').count() == 1
    engine.dispose()


def test_session_crud_and_message_lifecycle(setup):
    db, task, provider = setup
    session = chat.create_session(db, task_id=task.id, provider_id=provider.id)
    assert chat.get_session(db, session.id).id == session.id

    first = chat.add_message(db, session.id, role='user', content='总结一下这段字幕讲了什么？')
    assert first.status == 'complete'
    db.expire_all()
    assert chat.get_session(db, session.id).title == '总结一下这段字幕讲了什么？'

    reply = chat.add_message(db, session.id, role='assistant', content='这段字幕介绍了……')
    second = chat.add_message(db, session.id, role='user', content='再补充一点')
    db.expire_all()
    loaded = chat.get_session(db, session.id)
    assert loaded.title == '总结一下这段字幕讲了什么？'
    assert [message.role for message in loaded.messages] == ['user', 'assistant', 'user']

    partial = chat.add_message(db, session.id, role='assistant', content='被中止的', status='partial')
    assert partial.status == 'partial'
    assert chat.list_sessions(db)[0].id == session.id


def test_title_truncation_and_validation(setup):
    db, task, provider = setup
    session = chat.create_session(db)
    long_question = '  这是一个非常长的问题，' * 10
    chat.add_message(db, session.id, role='user', content=long_question)
    db.expire_all()
    title = chat.get_session(db, session.id).title
    assert 0 < len(title) <= chat.TITLE_MAX_LENGTH
    assert title == ' '.join(long_question.split())[:chat.TITLE_MAX_LENGTH]

    with pytest.raises(ValueError):
        chat.add_message(db, session.id, role='system', content='不允许')
    with pytest.raises(ValueError):
        chat.add_message(db, session.id, role='assistant', content='x', status='unknown')
    assert chat.add_message(db, 'missing-session', role='user', content='hello') is None
    assert chat.get_session(db, 'missing-session') is None
    assert chat.delete_session(db, 'missing-session') is False


def test_delete_session_cascades_messages_and_keeps_task(setup):
    db, task, provider = setup
    session = chat.create_session(db, task_id=task.id, provider_id=provider.id)
    chat.add_message(db, session.id, role='user', content='问题')
    chat.add_message(db, session.id, role='assistant', content='回答')
    assert chat.delete_session(db, session.id) is True
    db.expire_all()
    assert db.query(ChatSession).count() == 0
    assert db.query(ChatMessage).count() == 0
    assert db.get(type(task), task.id) is not None


def test_provider_deletion_preserves_session(setup):
    db, task, provider = setup
    session = chat.create_session(db, task_id=task.id, provider_id=provider.id)
    assert llm_providers.delete_provider(db, provider.id) is True
    db.expire_all()
    assert chat.get_session(db, session.id).provider_id is None


def test_followup_question_falls_back_to_previous_user_message(setup):
    db, _, _ = setup
    session = chat.create_session(db)
    chat.add_message(db, session.id, role="user", content="如何恢复字幕的历史版本？")
    chat.add_message(db, session.id, role="assistant", content="恢复会创建新版本。")
    messages = chat.build_context_messages(db, chat.get_session(db, session.id), "这个操作会影响原始字幕吗？")
    assert "版本历史" in messages[0]["content"]


def test_subtitle_injection_includes_timestamps(setup):
    db, _, _ = setup
    task, _, _ = _completed_task(db, task_id="chat-ts-task", texts=["第一句话"])
    session = chat.create_session(db, task_id=task.id)
    messages = chat.build_context_messages(db, chat.get_session(db, session.id), "总结一下")
    subtitle = next(message["content"] for message in messages if "绑定任务的字幕内容" in message["content"])
    assert "[00:00] 第一句话" in subtitle
