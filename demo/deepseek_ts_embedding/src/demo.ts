/**
 * demo.ts —— 一键演示：入库 → 搜索 → RAG 问答
 * 用法：npx tsx src/demo.ts
 */
import { addDocuments, search, stats } from "./vectorstore.js";
import { config } from "./config.js";

const demoDocs = [
  {
    id: "quick-1",
    content:
      "DeepSeek Embedding API 支持批量输入，单次最多可处理 32 条文本。返回的向量会按输入顺序排列，可直接用于语义搜索场景。",
    meta: { source: "DeepSeek API 文档" },
  },
  {
    id: "quick-2",
    content:
      "JSON 文件作为向量存储是最简单的方案：将向量序列化为 JSON 数组，搜索时加载到内存，暴力计算余弦相似度。适合数据量 < 10000 条的轻量场景。",
    meta: { source: "工程实践" },
  },
  {
    id: "quick-3",
    content:
      "在 Node.js 中调用 DeepSeek API 只需要原生的 fetch（Node 18+）。不需要任何第三方 LLM 依赖库，完全零依赖即可完成 Embedding 和 Chat 调用。",
    meta: { source: "工程实践" },
  },
  {
    id: "quick-4",
    content:
      "余弦相似度是衡量两个向量方向一致程度的指标，取值范围 [-1, 1]，值越接近 1 表示越相似。由于 DeepSeek Embedding 输出的是归一化向量，相似度等于向量内积。",
    meta: { source: "数学基础" },
  },
  {
    id: "quick-5",
    content:
      "RAG（检索增强生成）的典型流程：用户提问 → 向量检索相关文档 → 将文档拼入提示词 → LLM 生成回答。这套方案可以有效减少大模型的幻觉问题。",
    meta: { source: "AI 应用" },
  },
];

async function runDemo() {
  console.log("═══════════════════════════════════════");
  console.log("  DeepSeek Embedding + JSON 向量存储");
  console.log("  Demo 演示");
  console.log("═══════════════════════════════════════\n");

  // Step 1: 入库
  console.log("📥 Step 1: 文档向量化入库...");
  console.log(`   待入库: ${demoDocs.length} 篇文档`);
  await addDocuments(demoDocs);
  const s = stats();
  console.log(`   ✅ 入库完成 | 文档数: ${s.docCount} | 维度: ${s.vectorDim}\n`);

  // Step 2: 搜索
  console.log("🔍 Step 2: 语义搜索测试...\n");

  const queries = [
    "如何处理大量文本的向量化？",
    "RAG 的工作流程是什么？",
    "怎样用 Node.js 调用 AI 接口？",
  ];

  for (const q of queries) {
    const results = await search(q, 3);
    console.log(`   🔎 "${q}"`);
    if (results.length === 0) {
      console.log("      ⚠️  未找到结果\n");
    } else {
      results.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.score.toFixed(3)}] ${r.content.slice(0, 60)}...`);
      });
      console.log();
    }
  }

  console.log("✅ Demo 完成！试试 npx tsx src/search.ts 进行交互搜索");
}

runDemo().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
