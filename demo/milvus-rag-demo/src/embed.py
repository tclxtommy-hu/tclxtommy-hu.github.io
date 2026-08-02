"""本地 Embedding：sentence-transformers。"""

from __future__ import annotations

from functools import lru_cache

from sentence_transformers import SentenceTransformer

from .config import EMBED_MODEL


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    print(f"[embed] 加载模型: {EMBED_MODEL}")
    return SentenceTransformer(EMBED_MODEL)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """批量向量化；normalize 后配合 COSINE 检索。"""
    if not texts:
        return []
    model = get_model()
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=len(texts) > 8,
    )
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
