/**
 * demo.ts —— 一键演示：入库 -> 检索 -> RAG 问答
 * 用法：yarn demo
 */
import { addChunks, search, stats, clearAll, type DocChunk } from "./vectorstore.js";
import { answer } from "./rag.js";
import { chunkText } from "./chunk.js";

const demoDocs: { name: string; content: string }[] = [
  {
    name: "d1-rag.md",
    content: `RAG 的标准流程是：用户提问 -> 向量检索相关文档片段 -> 将片段拼入提示词 -> 大模型生成回答。通过引入外部知识，RAG 能有效缓解大模型的幻觉问题。`,
  },
  {
    name: "d2-embed.md",
    content: `DeepSeek 的 Embedding 接口可将文本映射为稠密向量。语义相近的文本在向量空间中距离更近，这正是语义搜索与 RAG 的基础。在 Node.js 中只需原生 fetch 即可调用。`,
  },
  {
    name: "d3-store.md",
    content: `当数据量在万级以内时，可使用 JSON 文件保存向量，在内存中暴力计算余弦相似度。这种方案零依赖、简单透明，非常适合教学和轻量 RAG 场景。`,
  },
  {
    name: "d4-chunk.md",
    content: `文档分块（Chunking）是 RAG 效果的关键。带重叠窗口的滑动切分能保留片段间的上下文连续性，避免关键信息被切分边界切断。分块大小通常在 200~800 字符之间权衡。`,
  },
  {
    name: "d5-cosine.md",
    content: `余弦相似度衡量两个向量方向的接近程度，取值范围 [-1, 1]，越接近 1 越相似。向量检索本质上就是在向量空间中寻找与查询向量余弦相似度最高的若干片段。`,
  },
];

async function runDemo() {
  console.log("═══════════════════════════════════════");
  console.log("  DeepSeek RAG（真实 Embedding）Demo");
  console.log("═══════════════════════════════════════\n");

  // Step 1: 入库
  console.log("📥 Step 1: 文档分块 + 向量化入库...");
  clearAll();
  const chunks: DocChunk[] = [];
  for (const doc of demoDocs) {
    chunkText(doc.content).forEach((content, i) => {
      chunks.push({ id: `${doc.name}#${i}`, content, source: doc.name, index: i });
    });
  }
  console.log(`   片段数: ${chunks.length}`);
  await addChunks(chunks);
  const s = stats();
  console.log(`   ✅ 入库完成 | 片段数: ${s.chunkCount} | 维度: ${s.vectorDim}\n`);

  // Step 2: 检索
  console.log("🔍 Step 2: 语义检索测试\n");
  const queries = [
    "RAG 的工作流程是什么？",
    "怎样用 Node.js 调用向量接口？",
    "余弦相似度有什么用？",
  ];
  for (const q of queries) {
    const results = await search(q, 3);
    console.log(`   🔎 "${q}"`);
    if (results.length === 0) {
      console.log("      ⚠️  未找到结果\n");
    } else {
      results.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.score.toFixed(3)}] ${r.content.slice(0, 50)}...`);
      });
      console.log();
    }
  }

  // Step 3: RAG 问答
  console.log("💬 Step 3: RAG 问答\n");
  const qa = "RAG 是怎么减少大模型幻觉的？";
  console.log(`   ❓ ${qa}\n`);
  const result = await answer(qa, 3, 0.0);
  result.sources.forEach((r, i) => {
    console.log(`   📚 [${r.score.toFixed(3)}] ${r.source}`);
  });
  console.log(`\n   🤖 ${result.answer}\n`);

  console.log("✅ Demo 完成！试试 yarn search 或 yarn query \"你的问题\"");
}

runDemo().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
