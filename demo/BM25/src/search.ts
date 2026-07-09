import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { config, isMain } from "./config.js";
import { BM25, type IndexData, type ScoredDoc } from "./bm25.js";
import { getTokenizer, type Tokenizer } from "./tokenizer.js";

/** 按中英文标点切句 */
function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 转义正则特殊字符 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 在文本中高亮命中的查询词（终端绿色 ANSI） */
function highlightMatches(text: string, tokens: string[]): string {
  const uniq = [...new Set(tokens)].filter(Boolean);
  if (uniq.length === 0) return text;
  const re = new RegExp(uniq.map(escapeRe).join("|"), "gi");
  return text.replace(re, (m) => `\x1b[32m${m}\x1b[0m`);
}

/** 返回包含任意查询词的句子（最多 max 条），并高亮命中词 */
function matchingSentences(text: string, tokens: string[], max = 3): string[] {
  const uniq = [...new Set(tokens)].filter(Boolean);
  if (uniq.length === 0) return [];
  const re = new RegExp(uniq.map(escapeRe).join("|"), "i");
  return splitSentences(text)
    .filter((s) => re.test(s))
    .slice(0, max)
    .map((s) => highlightMatches(s, tokens));
}

/** 单次查询并打印结果（demo 与 query 共用） */
export function runOnce(bm: BM25, tokenizer: Tokenizer, query: string): void {
  const tokens = tokenizer(query);
  const results: ScoredDoc[] = bm.search(tokens);

  console.log(`\n查询: ${query}  (分词: ${tokens.join(" ") || "∅"})`);
  if (results.length === 0) {
    console.log("  无匹配结果");
    return;
  }
  for (const r of results) {
    const meta = r.meta;
    const where = meta ? `${meta.path} — ${meta.title}` : `#${r.docId}`;
    console.log(`  [${r.score.toFixed(4)}] ${where}`);
    if (meta?.text) {
      for (const s of matchingSentences(meta.text, tokens)) {
        console.log(`      · ${s}`);
      }
    }
  }
}

/** 从 JSON 文件加载索引 */
async function loadIndex(file: string): Promise<BM25> {
  const raw = await readFile(file, "utf-8");
  const data = JSON.parse(raw) as IndexData;
  return BM25.load(data);
}

// CLI 入口：`pnpm query "查询词"` 或 `pnpm query`（交互模式）
if (isMain(import.meta.url)) {
  const tokenizer = await getTokenizer();
  const bm = await loadIndex(config.indexFile);

  const q = process.argv[2];
  if (q) {
    runOnce(bm, tokenizer, q);
  } else {
    console.log(`已加载索引（${bm.toJSON().N} 个分块）。输入查询词，Ctrl+C 退出：`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (): void => {
      rl.question("> ", (line) => {
        const query = line.trim();
        if (query) runOnce(bm, tokenizer, query);
        ask();
      });
    };
    ask();
  }
}
