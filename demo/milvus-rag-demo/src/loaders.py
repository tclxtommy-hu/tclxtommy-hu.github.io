"""按后缀加载 txt / md / pdf → 纯文本。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

SUPPORTED_SUFFIXES = {".txt", ".md", ".pdf"}


@dataclass
class SourceDoc:
    """一篇源文档。"""

    path: Path
    text: str

    @property
    def source(self) -> str:
        return self.path.name


def load_file(path: Path) -> str:
    """加载单个文件为纯文本。"""
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return path.read_text(encoding="utf-8")
    if suffix == ".pdf":
        reader = PdfReader(str(path))
        pages = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            pages.append(page_text)
        return "\n\n".join(pages).strip()
    raise ValueError(f"不支持的文件类型: {path.suffix}")


def load_docs(docs_dir: Path) -> list[SourceDoc]:
    """递归扫描目录，加载支持的文档。"""
    if not docs_dir.is_dir():
        raise FileNotFoundError(f"文档目录不存在: {docs_dir}")

    docs: list[SourceDoc] = []
    for path in sorted(docs_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        text = load_file(path).strip()
        if not text:
            print(f"[skip] 空文档: {path.name}")
            continue
        docs.append(SourceDoc(path=path, text=text))
    return docs
