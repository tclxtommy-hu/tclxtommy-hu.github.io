"""配置：环境变量 + 项目路径。"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

DOCS_DIR = ROOT_DIR / "data" / "docs"

MILVUS_DB = Path(
    os.getenv("MILVUS_DB", "data/milvus.db")
)
if not MILVUS_DB.is_absolute():
    MILVUS_DB = ROOT_DIR / MILVUS_DB

COLLECTION_NAME = os.getenv("COLLECTION_NAME", "rag_docs")
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-zh-v1.5")
# bge-small-zh-v1.5 输出维度
EMBED_DIM = int(os.getenv("EMBED_DIM", "512"))

CHUNK_MAX_LEN = int(os.getenv("CHUNK_MAX_LEN", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "60"))
TOP_K = int(os.getenv("TOP_K", "5"))

# 国内镜像：设置 HF_ENDPOINT 后 huggingface_hub 会走该域名
_hf_endpoint = os.getenv("HF_ENDPOINT", "").strip()
if _hf_endpoint:
    os.environ["HF_ENDPOINT"] = _hf_endpoint
