from __future__ import annotations

import json
import sys
from functools import lru_cache
from pathlib import Path


def _default_data_file() -> Path:
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass) / "backend" / "data" / "chat_knowledge.json"
    return Path(__file__).resolve().parent.parent / "data" / "chat_knowledge.json"


DATA_FILE = _default_data_file()
DEFAULT_TOP_N = 3
DEFAULT_THRESHOLD = 0.2


@lru_cache(maxsize=4)
def _load(path: str) -> tuple[dict, ...]:
    chunks = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(chunks, list):
        raise ValueError("chat knowledge file must contain a list")
    for chunk in chunks:
        if not isinstance(chunk, dict) or not all(
            isinstance(chunk.get(key), str) and chunk[key] for key in ("title", "text", "source_doc")
        ) or not isinstance(chunk.get("keywords"), list):
            raise ValueError("chat knowledge chunk has an invalid structure")
    return tuple(chunks)


def load_chunks(path: Path | None = None) -> list[dict]:
    return list(_load(str(path or DATA_FILE)))


def _bigrams(text: str) -> set[str]:
    normalized = "".join(text.lower().split())
    if len(normalized) < 2:
        return {normalized} if normalized else set()
    return {normalized[index:index + 2] for index in range(len(normalized) - 1)}


def _haystack(chunk: dict) -> str:
    return " ".join([chunk["title"], *chunk["keywords"], chunk["text"]])


def search(query: str, chunks: list[dict] | None = None, *, top_n: int = DEFAULT_TOP_N,
           threshold: float = DEFAULT_THRESHOLD) -> list[dict]:
    query_bigrams = _bigrams(query)
    if not query_bigrams or top_n < 1:
        return []
    scored = []
    for chunk in chunks if chunks is not None else load_chunks():
        overlap = len(query_bigrams & _bigrams(_haystack(chunk)))
        score = overlap / len(query_bigrams)
        if score >= threshold:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:top_n]]
