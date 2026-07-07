/**
 * 文档分块（Chunking）
 *
 * 真实 RAG 的第一步：把长文档切成适合检索的小片段。
 * 策略：先按空行拆段落，段落拼接到接近 maxLen 时切分；
 * 超长段落再按重叠窗口（overlap）做字符级切分，保证上下文连续。
 */

export interface ChunkOptions {
  /** 单片段最大字符数 */
  maxLen?: number;
  /** 相邻片段重叠字符数（保留上下文） */
  overlap?: number;
}

/**
 * 将长文本切分为若干片段
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxLen = opts.maxLen ?? 500;
  const overlap = opts.overlap ?? 60;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  for (const para of paragraphs) {
    if (buffer.length + para.length + 1 <= maxLen) {
      buffer = buffer ? `${buffer}\n${para}` : para;
    } else {
      flush();
      if (para.length > maxLen) {
        // 超长段落：按重叠窗口做字符级切分
        for (const piece of splitLong(para, maxLen, overlap)) {
          chunks.push(piece);
        }
      } else {
        buffer = para;
      }
    }
  }
  flush();

  return chunks;
}

/** 超长文本按重叠窗口切分 */
function splitLong(text: string, maxLen: number, overlap: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxLen, text.length);
    out.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter(Boolean);
}
