import "dotenv/config";

/**
 * 配置
 *
 * 重要：截至当前 DeepSeek 官方 API 并未提供公开的 Embedding 接口（仅有 chat / reasoner）。
 * 因此本示例默认使用「DeepSeek Chat 语义向量」方案做检索向量化（与同仓库
 * deepseek_ts_embedding 思路一致），开箱即用、零额外依赖。
 *
 * 若你想要「真实稠密向量」，可将 EMBED_PROVIDER 设为 openai，并配置 OpenAI 兼容的
 * Embedding 接口（任何 OpenAI 兼容服务均可，如 OpenAI / 自建 vLLM / 本地服务等）。
 */
export const config = {
  // ===== DeepSeek（对话 / 语义向量化共用）=====
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
  chatModel: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",

  // ===== 向量化策略 =====
  // "deepseek" -> 用 DeepSeek Chat 在多个语义维度上打分（默认，无需额外 Key）
  // "openai"   -> 调用 OpenAI 兼容的 /embeddings 接口（真实稠密向量）
  embedProvider: (process.env.EMBED_PROVIDER ?? "deepseek").toLowerCase(),

  // ===== OpenAI 兼容 Embedding（仅当 EMBED_PROVIDER=openai 时需要）=====
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiEmbedModel: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",

  // ===== 存储 =====
  dataDir: "data",
  vectorsFile: "data/vectors.json",
  docsFile: "data/docs.json",
  docsDir: "data/docs",
} as const;

if (!config.apiKey) {
  console.error("❌ 请在 .env 中配置 DEEPSEEK_API_KEY");
  process.exit(1);
}

if (config.embedProvider === "openai" && !config.openaiApiKey) {
  console.error("❌ EMBED_PROVIDER=openai 时，请在 .env 中配置 OPENAI_API_KEY");
  process.exit(1);
}
