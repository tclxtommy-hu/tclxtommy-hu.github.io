/**
 * search.ts —— 语义搜索交互式查询
 * 用法：npx tsx src/search.ts "搜索关键词"
 */
import { search, stats } from "./vectorstore.js";
import * as readline from "node:readline";

async function interactiveSearch() {
  const s = stats();
  if (s.docCount === 0) {
    console.log("📭 向量库为空，请先运行 npm run index 入库文档");
    return;
  }

  console.log(`🔍 语义搜索（向量库: ${s.docCount} 条记录）`);
  console.log('输入 "exit" 退出，输入 "clear" 清空向量库\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("🔎 搜索 > ", async (query) => {
      query = query.trim();
      if (!query) {
        ask();
        return;
      }

      if (query.toLowerCase() === "exit") {
        console.log("👋 再见");
        rl.close();
        return;
      }

      if (query.toLowerCase() === "clear") {
        const { clearAll } = await import("./vectorstore.js");
        clearAll();
        rl.close();
        return;
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
          if (r.meta) {
            console.log(`     📂 ${Object.values(r.meta).join(" / ")}`);
          }
          console.log();
        });
      }

      ask();
    });
  };

  ask();
}

// 命令行参数模式：npx tsx src/search.ts "如何做向量搜索"
const query = process.argv[2];
if (query) {
  (async () => {
    const s = stats();
    if (s.docCount === 0) {
      console.log("📭 向量库为空，请先运行 npm run index");
      return;
    }
    console.log(`🔎 搜索: "${query}" (向量库: ${s.docCount} 条)\n`);
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
