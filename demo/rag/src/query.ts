/**
 * query.ts —— 基于 RAG 的 DeepSeek 问答
 * 用法：yarn query "你的问题"
 */
import { answer } from "./rag.js";

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.log('用法: yarn query "你的问题"');
    process.exit(1);
  }

  console.log(`❓ 问题: ${query}\n`);

  const result = await answer(query, 3, 0.0);

  console.log(`📚 检索到 ${result.sources.length} 条上下文 (${result.searchMs.toFixed(0)}ms):`);
  result.sources.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${r.content.slice(0, 60)}...`);
  });

  console.log("\n⏳ 正在询问 DeepSeek...\n");
  console.log(`🤖 回答 (${result.chatMs.toFixed(0)}ms):`);
  console.log("─".repeat(50));
  console.log(result.answer);
  console.log("─".repeat(50));
  console.log(`\n📊 总耗时: 检索 ${result.searchMs.toFixed(0)}ms + 生成 ${result.chatMs.toFixed(0)}ms`);
}

main().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
