"""文档入库：扫描 docs → 切片 → 向量化 → 写入 Milvus Lite。"""

from __future__ import annotations

import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from .chunk import chunk_text
from .config import (
    CHUNK_MAX_LEN,
    CHUNK_OVERLAP,
    COLLECTION_NAME,
    DOCS_DIR,
    EMBED_DIM,
    MILVUS_DB,
)
from .embed import embed_texts
from .loaders import load_docs
from .store import ensure_collection, get_client, insert_chunks


def build_index() -> int:
    docs = load_docs(DOCS_DIR)
    if not docs:
        raise RuntimeError(f"未找到文档，请把 txt/md/pdf 放入: {DOCS_DIR}")

    print(f"[index] 文档目录: {DOCS_DIR}")
    print(f"[index] 找到 {len(docs)} 篇文档")

    rows: list[dict] = []
    chunk_id = 0
    for doc in docs:
        pieces = chunk_text(doc.text, CHUNK_MAX_LEN, CHUNK_OVERLAP)
        print(f"  - {doc.source}: {len(pieces)} 个片段")
        for i, piece in enumerate(pieces):
            rows.append(
                {
                    "id": chunk_id,
                    "text": piece,
                    "source": doc.source,
                    "chunk_index": i,
                }
            )
            chunk_id += 1

    if not rows:
        raise RuntimeError("分块结果为空，请检查文档内容")

    print(f"[index] 共 {len(rows)} 个片段，开始向量化…")
    vectors = embed_texts([r["text"] for r in rows])
    if vectors and len(vectors[0]) != EMBED_DIM:
        raise RuntimeError(
            f"向量维度 {len(vectors[0])} 与配置 EMBED_DIM={EMBED_DIM} 不一致，"
            "请修改 .env 中的 EMBED_DIM 或 EMBED_MODEL"
        )

    for row, vec in zip(rows, vectors):
        row["vector"] = vec

    print(f"[index] 写入 Milvus Lite: {MILVUS_DB}")
    client = get_client()
    try:
        ensure_collection(
            client,
            name=COLLECTION_NAME,
            dim=EMBED_DIM,
            drop_if_exists=True,
        )
        n = insert_chunks(client, rows, name=COLLECTION_NAME)
        print(f"[index] 入库完成：{n} 条 → collection `{COLLECTION_NAME}`")
        return n
    finally:
        client.close()


def main() -> None:
    build_index()


if __name__ == "__main__":
    main()
