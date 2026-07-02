import "dotenv/config";

export const config = {
  /** DeepSeek API Key */
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
  /** Chat 模型（Embedding 和 RAG 共用） */
  chatModel: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  /** 向量存储 JSON 文件路径 */
  dataDir: "data",
  vectorsFile: "data/vectors.json",
  docsFile: "data/docs.json",
} as const;

if (!config.apiKey) {
  console.error("❌ 请在 .env 中配置 DEEPSEEK_API_KEY");
  process.exit(1);
}
