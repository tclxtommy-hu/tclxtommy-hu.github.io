"""文档分块：段落优先 + 重叠窗口（对齐 demo/rag 的 chunk 策略）。"""

from __future__ import annotations


def chunk_text(
    text: str,
    max_len: int = 500,
    overlap: int = 60,
) -> list[str]:
    """将长文本切分为若干片段。"""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    paragraphs = [
        p.strip() for p in normalized.split("\n\n") if p.strip()
    ]

    chunks: list[str] = []
    buffer = ""

    def flush() -> None:
        nonlocal buffer
        if buffer.strip():
            chunks.append(buffer.strip())
        buffer = ""

    for para in paragraphs:
        if len(buffer) + len(para) + (1 if buffer else 0) <= max_len:
            buffer = f"{buffer}\n{para}" if buffer else para
        else:
            flush()
            if len(para) > max_len:
                chunks.extend(_split_long(para, max_len, overlap))
            else:
                buffer = para
    flush()
    return chunks


def _split_long(text: str, max_len: int, overlap: int) -> list[str]:
    out: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_len, len(text))
        piece = text[start:end].strip()
        if piece:
            out.append(piece)
        if end == len(text):
            break
        start = max(end - overlap, start + 1)
    return out
