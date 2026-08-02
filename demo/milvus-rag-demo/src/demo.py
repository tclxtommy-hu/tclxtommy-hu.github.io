"""一键演示：入库 → 预置查询。"""

from __future__ import annotations

import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from .index import build_index
from .search import format_hits, run_search

DEMO_QUERIES = [
    "什么是向量检索？",
    "RAG 的核心步骤有哪些？",
    "Milvus Lite 适合什么场景？",
]


def main() -> None:
    print("=== Milvus Lite RAG Demo ===\n")
    n = build_index()
    print(f"\n入库 {n} 条片段，开始演示检索…\n")

    for q in DEMO_QUERIES:
        print(f"── 查询: {q}")
        hits = run_search(q)
        print(format_hits(hits))
        print()


if __name__ == "__main__":
    main()
