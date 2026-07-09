import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { config, isMain } from "./config.js";
import { BM25 } from "./bm25.js";
import { getTokenizer, type Tokenizer } from "./tokenizer.js";

interface Chunk {
  /** 来源文件名 */
  path: string;
  title: string;
  text: string;
}

/**
 * 将一个文档拆成多个分块：按空行切段落，滑动窗口每 2 段一个 chunk，
 * 相邻 chunk 重叠 1 段，兼顾召回与上下文。
 */
function chunkFile(content: string, path: string): Chunk[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const title = paragraphs[0].slice(0, 50);
  const windowSize = 2;
  const step = 1;
  const chunks: Chunk[] = [];

  for (let i = 0; i < paragraphs.length; i += step) {
    const slice = paragraphs.slice(i, i + windowSize);
    if (slice.length === 0) break;
    chunks.push({ path, title, text: slice.join("\n\n") });
  }
  return chunks;
}

/** 读取 docs 目录下所有 .md / .txt，返回分块列表 */
async function loadDocs(docsDir: string): Promise<Chunk[]> {
  const entries = await readdir(docsDir, { withFileTypes: true });
  const chunks: Chunk[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (ext !== ".md" && ext !== ".txt") continue;
    const full = join(docsDir, e.name);
    const content = await readFile(full, "utf-8");
    chunks.push(...chunkFile(content, e.name));
  }
  return chunks;
}

/** 构建索引：读取文档 -> 分词 -> 倒排 -> 写入 JSON，返回 BM25 实例 */
export async function buildIndex(): Promise<BM25> {
  const tokenizer: Tokenizer = await getTokenizer();
  const chunks = await loadDocs(config.docsDir);

  const bm = new BM25();
  for (let i = 0; i < chunks.length; i++) {
    const tokens = tokenizer(chunks[i].text);
    bm.addDocument(tokens, i, {
      path: chunks[i].path,
      title: chunks[i].title,
      text: chunks[i].text,
    });
  }

  const data = bm.toJSON();
  await mkdir(dirname(config.indexFile), { recursive: true });
  await writeFile(config.indexFile, JSON.stringify(data), "utf-8");

  console.log(`已索引 ${chunks.length} 个文档分块（来自 ${config.docsDir}）`);
  console.log(`词表大小: ${Object.keys(data.termFreqs).length}`);
  console.log(`平均文档长度: ${data.avgdl.toFixed(1)} tokens`);
  console.log(`索引已写入 ${config.indexFile}`);
  return bm;
}

// CLI 入口：`pnpm index`
if (isMain(import.meta.url)) {
  buildIndex().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
