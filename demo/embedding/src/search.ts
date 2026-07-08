/**
 * search.ts —— 语义检索（交互式 / 命令行）
 * 用法：
 *   pnpm run search                              # 交互式（全部）
 *   pnpm run search "a rose flower"              # 文本检索（全部）
 *   pnpm run search "a rose" --images-only       # 只搜图片
 *   pnpm run search "CLIP" --texts-only          # 只搜文本
 *   pnpm run search --image ./data/images/xx.jpg # 以图搜库
 *
 * 交互式特殊命令：
 *   exit  退出 | clear  清空 | images  只搜图片 | texts  只搜文本 | all  搜全部
 */
import { searchText, searchImage, stats, type SearchResult, type ItemType } from "./vectorstore.js";
import * as readline from "node:readline";

function printResults(results: SearchResult[], elapsed: string): void {
  if (results.length === 0) {
    console.log(`  ⚠️  未找到相关结果 (${elapsed}ms)\n`);
    return;
  }
  console.log(`  ── Top ${results.length} 结果 (${elapsed}ms) ──`);
  results.forEach((r, i) => {
    const icon = r.type === "image" ? "🖼️ " : "📝";
    const bar = "█".repeat(Math.round(Math.max(0, r.score) * 20));
    console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${bar} ${icon}`);
    console.log(`     ${r.content.slice(0, 80)}${r.content.length > 80 ? "..." : ""}`);
    if (r.source) console.log(`     📂 ${r.source}`);
    console.log();
  });
}

// ===================== 交互式 =====================

async function interactiveSearch() {
  const s = stats();
  if (s.count === 0) {
    console.log("📭 向量库为空，请先运行 pnpm index 入库");
    return;
  }

  let filterType: ItemType | undefined = undefined;
  const filterLabel = () =>
    filterType === "image" ? "仅图片" : filterType === "text" ? "仅文本" : "全部";

  console.log(
    `🔍 语义检索（向量库: ${s.count} 条 | 文本 ${s.textCount} | 图片 ${s.imageCount}）`
  );
  console.log('特殊命令: "exit" 退出 | "clear" 清空 | "images" 只搜图片 | "texts" 只搜文本 | "all" 搜全部\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question(`🔎 搜索[${filterLabel()}] > `, async (query) => {
      query = query.trim();
      if (!query) return ask();

      const cmd = query.toLowerCase();
      if (cmd === "exit") {
        console.log("👋 再见");
        return rl.close();
      }
      if (cmd === "clear") {
        const { clearAll } = await import("./vectorstore.js");
        clearAll();
        return rl.close();
      }
      if (cmd === "images") {
        filterType = "image";
        console.log(`   ✅ 已切换为：仅搜图片\n`);
        return ask();
      }
      if (cmd === "texts") {
        filterType = "text";
        console.log(`   ✅ 已切换为：仅搜文本\n`);
        return ask();
      }
      if (cmd === "all") {
        filterType = undefined;
        console.log(`   ✅ 已切换为：搜全部\n`);
        return ask();
      }

      const t0 = performance.now();
      const results = await searchText(query, 5, 0, filterType);
      const elapsed = (performance.now() - t0).toFixed(0);
      printResults(results, elapsed);
      ask();
    });
  };
  ask();
}

// ===================== 命令行入口 =====================

const args = process.argv.slice(2);

if (args.length > 0) {
  (async () => {
    const s = stats();
    if (s.count === 0) {
      console.log("📭 向量库为空，请先运行 pnpm index");
      return;
    }

    // --image <path>
    if (args[0] === "--image" && args[1]) {
      console.log(`🔎 以图搜索: "${args[1]}" (向量库: ${s.count} 条)\n`);
      const t0 = performance.now();
      const results = await searchImage(args[1], 5);
      const elapsed = (performance.now() - t0).toFixed(0);
      printResults(results, elapsed);
      return;
    }

    // 解析 flags 和查询词
    let filterType: ItemType | undefined = undefined;
    const queryParts: string[] = [];
    for (const arg of args) {
      if (arg === "--images-only") filterType = "image";
      else if (arg === "--texts-only") filterType = "text";
      else queryParts.push(arg);
    }

    const query = queryParts.join(" ");
    if (!query) {
      console.log("⚠️  请提供搜索词，例如: pnpm run search \"a rose\" --images-only");
      return;
    }

    const scope = filterType === "image" ? "仅图片" : filterType === "text" ? "仅文本" : "全部";
    console.log(`🔎 搜索: "${query}" (${scope} | 向量库: ${s.count} 条)\n`);
    const t0 = performance.now();
    const results = await searchText(query, 5, 0, filterType);
    const elapsed = (performance.now() - t0).toFixed(0);
    printResults(results, elapsed);
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
