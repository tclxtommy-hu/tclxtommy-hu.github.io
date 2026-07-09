import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { config, isMain } from "./config.js";
import { BM25, type IndexData } from "./bm25.js";
import { getTokenizer } from "./tokenizer.js";
import { buildIndex } from "./index.js";
import { runOnce } from "./search.js";

const SAMPLE_QUERIES = [
  "BM25 评分公式",
  "中文分词如何影响检索",
  "倒排索引的作用",
  "k1 和 b 参数",
];

// CLI 入口：`pnpm demo`
if (isMain(import.meta.url)) {
  const tokenizer = await getTokenizer();

  let bm: BM25;
  if (existsSync(config.indexFile)) {
    console.log("· 加载已有索引");
    bm = BM25.load(JSON.parse(await readFile(config.indexFile, "utf-8")) as IndexData);
  } else {
    console.log("· 索引不存在，先构建...\n");
    bm = await buildIndex();
  }

  console.log("\n=== 示例查询 ===");
  for (const q of SAMPLE_QUERIES) runOnce(bm, tokenizer, q);
}
