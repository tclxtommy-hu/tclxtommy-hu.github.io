/**
 * index.ts —— 文档分块 + 向量化入库
 * 用法：yarn index
 *
 * 数据源：
 *   1) data/docs 目录下的 *.md / *.txt 文件（优先）
 *   2) 若目录为空，则使用内嵌的示例文档
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config.js";
import { chunkText } from "./chunk.js";
import { addChunks, stats, type DocChunk } from "./vectorstore.js";

// ===================== 内嵌示例文档 =====================
const sampleDocs: { name: string; content: string }[] = [
  {
    name: "rag-intro.md",
    content: `RAG（检索增强生成，Retrieval-Augmented Generation）是一种把「检索」与「生成」结合的大模型应用范式。

它的典型流程是：用户提出问题后，系统先从知识库中检索出最相关的若干片段，再把这些片段作为上下文拼进提示词，最后交给大语言模型生成回答。

RAG 的核心价值在于缓解大模型的「幻觉」问题，并让模型能够基于私有、最新或领域专属的数据作答，而无需微调模型本身。`,
  },
  {
    name: "vector-db.md",
    content: `向量数据库是 RAG 的基础设施之一，专门用于存储和检索高维向量。

其核心能力是「近似最近邻搜索（ANN）」，能够在海量向量中快速找到与目标向量最相似的结果。常见的开源方案有 Qdrant、Milvus、Weaviate，云方案有 Pinecone，以及在 PostgreSQL 上的 pgvector 扩展。

对于数据量较小（万级以内）的场景，也可以直接用 JSON 文件保存向量，在内存中暴力计算余弦相似度，简单且零依赖。`,
  },
  {
    name: "deepseek-embedding.md",
    content: `DeepSeek 提供了官方的 Embedding 接口，可以把文本转换为稠密向量，用于语义检索与 RAG。

调用 /embeddings 接口，传入模型名（如 deepseek-embedding）和文本（单条或批量），即可返回对应的向量数组。语义相近的文本在向量空间中的距离也更近，从而实现「语义搜索」。

在 Node.js 中只需使用原生 fetch 即可完成调用，无需引入额外的第三方 LLM 框架。`,
  },
  {
    name: "chunking.md",
    content: `文档分块（Chunking）是 RAG 效果的关键一步。把一整篇长文档切分成若干语义相对完整的小片段，检索时才能精准命中相关部分。

常见的分块策略有：按固定长度切分、按段落/句子切分、以及带重叠窗口的滑动切分。重叠窗口能保留片段之间的上下文连续性，避免关键信息被切分边界切断。

分块过大可能引入噪声，过小则可能丢失上下文，通常根据模型上下文窗口和文档特点在 200~800 字符之间权衡。`,
  },
];

// ===================== 文档加载 =====================
function loadSourceDocs(): { name: string; content: string }[] {
  const dir = config.docsDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return sampleDocs;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f));
  if (files.length === 0) return sampleDocs;

  return files.map((f) => ({
    name: f,
    content: fs.readFileSync(path.join(dir, f), "utf-8"),
  }));
}

// ===================== 主流程 =====================
async function main() {
  console.log("🚀 DeepSeek RAG 文档入库\n");

  const sources = loadSourceDocs();
  console.log(`📂 待处理文档: ${sources.length} 篇\n`);

  const chunks: DocChunk[] = [];
  for (const doc of sources) {
    const pieces = chunkText(doc.content);
    console.log(`  ✂️  ${doc.name}: 切分为 ${pieces.length} 个片段`);
    pieces.forEach((content, i) => {
      chunks.push({
        id: `${doc.name}#${i}`,
        content,
        source: doc.name,
        index: i,
        meta: { source: doc.name, chunk: String(i) },
      });
    });
  }

  console.log(`\n🔢 共 ${chunks.length} 个片段，开始向量化入库...\n`);
  const total = await addChunks(chunks);

  const s = stats();
  console.log(`\n✅ 入库完成！共 ${total} 个片段，向量维度 ${s.vectorDim}`);
  console.log("   接下来可运行: yarn demo / yarn search / yarn query \"你的问题\"");
}

main().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
