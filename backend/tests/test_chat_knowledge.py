import json
import sys
from pathlib import Path

from backend.services import chat_knowledge

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_knowledge_file_structure_and_source_docs():
    chunks = json.loads((REPO_ROOT / 'backend' / 'data' / 'chat_knowledge.json').read_text(encoding='utf-8'))
    assert len(chunks) >= 10
    for chunk in chunks:
        assert set(chunk) == {'title', 'text', 'keywords', 'source_doc'}
        assert isinstance(chunk['title'], str) and chunk['title']
        assert isinstance(chunk['text'], str) and chunk['text']
        assert isinstance(chunk['keywords'], list) and chunk['keywords']
        assert all(isinstance(keyword, str) and keyword for keyword in chunk['keywords'])
        assert (REPO_ROOT / chunk['source_doc']).is_file(), chunk['source_doc']
    assert chat_knowledge.load_chunks()


def test_chinese_query_hits_relevant_chunk():
    hits = chat_knowledge.search('如何恢复字幕的历史版本')
    assert hits and '版本' in hits[0]['title']
    hits = chat_knowledge.search('支持哪些导出格式')
    assert hits and '导出' in hits[0]['title']
    hits = chat_knowledge.search('macOS 提示已损坏无法打开')
    assert hits and '损坏' in hits[0]['title']


def test_unrelated_query_returns_empty():
    assert chat_knowledge.search('量子引力与弦论研究进展') == []
    assert chat_knowledge.search('') == []
    assert chat_knowledge.search('好') == []


def test_threshold_filters_weak_matches():
    chunks = [{'title': '水果', 'text': '苹果香蕉橘子', 'keywords': ['水果'], 'source_doc': 'x.md'}]
    assert chat_knowledge.search('苹果梨子', chunks, threshold=0.2)
    assert chat_knowledge.search('苹果梨子', chunks, threshold=0.5) == []


def test_top_n_limits_results():
    chunks = [
        {'title': f'条目{index}', 'text': f'字幕导出说明{index}', 'keywords': ['字幕', '导出'], 'source_doc': 'x.md'}
        for index in range(5)
    ]
    hits = chat_knowledge.search('字幕导出', chunks, top_n=2, threshold=0.1)
    assert len(hits) == 2
    assert chat_knowledge.search('字幕导出', chunks, top_n=0, threshold=0.1) == []


def test_frozen_data_file_resolution(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, '_MEIPASS', str(tmp_path), raising=False)
    assert chat_knowledge._default_data_file() == tmp_path / 'backend' / 'data' / 'chat_knowledge.json'


def test_packaging_includes_knowledge_file():
    source = (REPO_ROOT / 'backend' / 'build_binary.py').read_text(encoding='utf-8')
    assert 'chat_knowledge.json' in source
    assert 'backend/data' in source
