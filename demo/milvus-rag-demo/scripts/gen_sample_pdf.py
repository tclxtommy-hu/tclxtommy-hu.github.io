"""生成 data/docs/milvus-lite.pdf（最小可抽取文本的 PDF）。"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "docs" / "milvus-lite.pdf"

CONTENT = """BT
/F1 12 Tf
50 750 Td
(Milvus Lite Local Vector Database) Tj
0 -24 Td
(Milvus Lite embeds a local .db file into your Python app.) Tj
0 -20 Td
(No Docker or standalone server is required for demos.) Tj
0 -20 Td
(It fits prototyping, notebooks, and small RAG indexes.) Tj
0 -20 Td
(For large production traffic, use Milvus Standalone or Distributed.) Tj
0 -20 Td
(API stays the same: change uri from a file path to a server endpoint.) Tj
ET"""


def main() -> None:
    stream = CONTENT.encode("latin-1")
    objs = [
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
        (
            b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
        ),
        (
            f"4 0 obj<< /Length {len(stream)} >>stream\n".encode("latin-1")
            + stream
            + b"\nendstream\nendobj\n"
        ),
        b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)

    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode("latin-1"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n".encode("latin-1")
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(out)
    print(f"wrote {OUT} ({len(out)} bytes)")


if __name__ == "__main__":
    main()
