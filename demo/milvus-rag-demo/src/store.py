"""Milvus Lite：建库 / 入库 / 检索。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pymilvus import DataType, MilvusClient

from .config import COLLECTION_NAME, EMBED_DIM, MILVUS_DB


@dataclass
class SearchHit:
    score: float
    text: str
    source: str
    chunk_index: int


def get_client(db_path: Path | None = None) -> MilvusClient:
    path = db_path or MILVUS_DB
    path.parent.mkdir(parents=True, exist_ok=True)
    return MilvusClient(uri=str(path))


def ensure_collection(
    client: MilvusClient,
    name: str = COLLECTION_NAME,
    dim: int = EMBED_DIM,
    drop_if_exists: bool = False,
) -> None:
    if client.has_collection(name):
        if drop_if_exists:
            client.drop_collection(name)
            print(f"[milvus] 已删除旧 collection: {name}")
        else:
            return

    schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("vector", DataType.FLOAT_VECTOR, dim=dim)
    schema.add_field("text", DataType.VARCHAR, max_length=65535)
    schema.add_field("source", DataType.VARCHAR, max_length=1024)
    schema.add_field("chunk_index", DataType.INT64)

    index_params = client.prepare_index_params()
    index_params.add_index(
        field_name="vector",
        index_type="AUTOINDEX",
        metric_type="COSINE",
    )

    client.create_collection(
        collection_name=name,
        schema=schema,
        index_params=index_params,
    )
    print(f"[milvus] 已创建 collection: {name} (dim={dim}, COSINE)")


def insert_chunks(
    client: MilvusClient,
    rows: list[dict[str, Any]],
    name: str = COLLECTION_NAME,
) -> int:
    if not rows:
        return 0
    client.insert(collection_name=name, data=rows)
    return len(rows)


def search(
    client: MilvusClient,
    query_vector: list[float],
    top_k: int = 5,
    name: str = COLLECTION_NAME,
) -> list[SearchHit]:
    if not client.has_collection(name):
        raise RuntimeError(
            f"Collection `{name}` 不存在，请先运行: python -m src.index"
        )

    # 新连接下 collection 可能处于 released，检索前需 load
    client.load_collection(name)

    results = client.search(
        collection_name=name,
        data=[query_vector],
        limit=top_k,
        output_fields=["text", "source", "chunk_index"],
    )

    hits: list[SearchHit] = []
    for item in results[0]:
        entity = item.get("entity") or {}
        hits.append(
            SearchHit(
                score=float(item.get("distance", 0.0)),
                text=str(entity.get("text", "")),
                source=str(entity.get("source", "")),
                chunk_index=int(entity.get("chunk_index", 0)),
            )
        )
    return hits
