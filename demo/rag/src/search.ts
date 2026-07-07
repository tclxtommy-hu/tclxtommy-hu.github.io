/**
 * search.ts —— 语义检索（交互式 / 命令行）
 * 用法：
 *   yarn search              # 交互式
 *   yarn search "搜索词"     # 单次检索
 */
import { search, stats } from "./vectorstore.js";
import * as readline from "node:readline";

async function interactiveSearch() {
  const s = stats();
  if (s.chunkCount === 0) {
    console.log("📭 向量库为空，请先运行 yarn index 入库文档");
    return;
  }

  console.log(`🔍 语义检索（向量库: ${s.chunkCount} 个片段）`);
  console.log('输入 "exit" 退出，输入 "clear" 清空向量库\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("🔎 搜索 > ", async (query) => {
      query = query.trim();
      if (!query) return ask();

      if (query.toLowerCase() === "exit") {
        console.log("👋 再见");
        return rl.close();
      }
      if (query.toLowerCase() === "clear") {
        const { clearAll } = await import("./vectorstore.js");
        clearAll();
        return rl.close();
      }

      const t0 = performance.now();
      const results = await search(query, 5);
      const elapsed = (performance.now() - t0).toFixed(0);

      if (results.length === 0) {
        console.log(`  ⚠️  未找到相关结果 (${elapsed}ms)\n`);
      } else {
        console.log(`  ── Top ${results.length} 结果 (${elapsed}ms) ──`);
        results.forEach((r, i) => {
          const bar = "█".repeat(Math.round(r.score * 20));
          console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${bar}`);
          console.log(`     ${r.content.slice(0, 80)}${r.content.length > 80 ? "..." : ""}`);
          if (r.source) console.log(`     📂 ${r.source}`);
          console.log();
        });
      }
      ask();
    });
  };
  ask();
}

const query = process.argv[2];
if (query) {
  (async () => {
    const s = stats();
    if (s.chunkCount === 0) {
      console.log("📭 向量库为空，请先运行 yarn index");
      return;
    }
    console.log(`🔎 搜索: "${query}" (向量库: ${s.chunkCount} 个片段)\n`);
    const results = await search(query, 5);
    results.forEach((r, i) => {
      console.log(`${i + 1}. [${r.score.toFixed(3)}] ${r.content.slice(0, 100)}${r.content.length > 100 ? "..." : ""}`);
    });
  })().catch((err) => {
    console.error("❌ 搜索失败:", err.message);
    process.exit(1);
  });
} else {
  interactiveSearch().catch((err) => {
    console.error("❌ 错误:", err.message);
    process.exit(1);
  });
}
