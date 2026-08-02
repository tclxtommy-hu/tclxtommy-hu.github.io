"""语义检索：交互式 / 命令行单次查询。"""

from __future__ import annotations

import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from .config import COLLECTION_NAME, MILVUS_DB, TOP_K
from .embed import embed_query
from .store import SearchHit, get_client, search


def format_hits(hits: list[SearchHit]) -> str:
    if not hits:
        return "(无结果)"
    lines: list[str] = []
    for i, hit in enumerate(hits, 1):
        preview = hit.text.replace("\n", " ")
        if len(preview) > 160:
            preview = preview[:160] + "…"
        lines.append(
            f"{i}. score={hit.score:.4f}  source={hit.source}#{hit.chunk_index}\n"
            f"   {preview}"
        )
    return "\n".join(lines)


def run_search(query: str, top_k: int = TOP_K) -> list[SearchHit]:
    client = get_client()
    try:
        vector = embed_query(query)
        return search(client, vector, top_k=top_k, name=COLLECTION_NAME)
    finally:
        client.close()


def interactive() -> None:
    print(f"Milvus Lite 语义检索  db={MILVUS_DB}  collection={COLLECTION_NAME}")
    print("输入查询内容；输入 exit 退出。\n")
    while True:
        try:
            q = input("search> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            continue
        if q.lower() in {"exit", "quit", "q"}:
            break
        hits = run_search(q)
        print(format_hits(hits))
        print()


def main(argv: list[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    if args:
        query = " ".join(args)
        hits = run_search(query)
        print(f"查询: {query}\n")
        print(format_hits(hits))
    else:
        interactive()


if __name__ == "__main__":
    main()
