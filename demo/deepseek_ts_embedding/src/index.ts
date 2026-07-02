/**
 * index.ts —— 文档向量化入库
 * 用法：npx tsx src/index.ts
 */
import { addDocuments, stats } from "./vectorstore.js";

// ===================== 示例文档库 =====================
const sampleDocs = [
  {
    id: "deepseek-intro",
    content:
      "DeepSeek 是一款由中国团队深度求索开发的大语言模型，支持文本生成、代码补全、对话等多种任务。DeepSeek API 兼容 OpenAI 接口格式，可以无缝替换现有 OpenAI 项目。",
    meta: { category: "AI", topic: "大模型" },
  },
  {
    id: "deepseek-api",
    content:
      "DeepSeek API 提供 Chat Completion 和 Embedding 两种核心接口。Chat 接口支持流式输出，Embedding 接口可以将文本转换为高维向量，用于语义搜索和 RAG 场景。",
    meta: { category: "API", topic: "接口" },
  },
  {
    id: "vector-db-basics",
    content:
      "向量数据库是专门用于存储和检索高维向量数据的系统，核心功能是相似性搜索。常见方案包括 Pinecone、Qdrant、Milvus，以及基于 PostgreSQL 的 pgvector 扩展。",
    meta: { category: "数据库", topic: "向量数据库" },
  },
  {
    id: "embedding-concept",
    content:
      "Embedding（嵌入）是将文本、图像等非结构化数据转换为数值向量的技术。语义相近的文本在向量空间中距离也更近，这就是语义搜索的基础原理。",
    meta: { category: "AI", topic: "嵌入" },
  },
  {
    id: "frontend-vectorization",
    content:
      "前端数据向量化可以在浏览器端运行 Transformers.js 实现离线 Embedding，也可以通过 BFF 层调用云端 API。存储方案包括 IndexedDB、OPFS 或在内存中计算。",
    meta: { category: "前端", topic: "向量化" },
  },
  {
    id: "react-server-components",
    content:
      "React Server Components (RSC) 让组件在服务端渲染，减少客户端 JavaScript 体积。Next.js App Router 默认使用 RSC，通过 Server Actions 处理表单提交和数据变更。",
    meta: { category: "前端", topic: "React" },
  },
  {
    id: "typescript-generics",
    content:
      "TypeScript 泛型允许创建可复用的组件，支持类型参数化。常见模式包括泛型函数、泛型接口、泛型约束（extends）和条件类型。合理使用泛型可以大幅提升代码的类型安全性。",
    meta: { category: "前端", topic: "TypeScript" },
  },
];

// ===================== 主流程 =====================
async function main() {
  console.log("🚀 DeepSeek Embedding 文档向量化入库\n");
  console.log(`待入库文档: ${sampleDocs.length} 篇\n`);

  await addDocuments(sampleDocs);

  const s = stats();
  console.log(`\n✅ 入库完成！共 ${s.docCount} 条记录，向量维度 ${s.vectorDim}`);
}

main().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
