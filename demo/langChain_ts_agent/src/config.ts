import { ChatOpenAI } from "@langchain/openai";
import "dotenv/config";

/**
 * 创建 DeepSeek ChatModel 实例
 * DeepSeek API 与 OpenAI 接口兼容，使用 @langchain/openai 适配
 */
export function createDeepSeekModel(options?: {
  temperature?: number;
  model?: string;
}) {
  return new ChatOpenAI({
    model: options?.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    temperature: options?.temperature ?? 0.7,
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    },
  });
}
