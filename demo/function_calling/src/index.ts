import OpenAI from "openai";
import "dotenv/config";
import { TOOLS, executeTool } from "./tools.js";
import type { ToolCallResult, ToolName } from "./tools.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

// ── DeepSeek 客户端配置 ───────────────────────────────────────────────

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const MODEL = "deepseek-chat";

// ── 系统提示词 ────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "你是一个智能助手，可以帮用户查天气、汇率换算、以及数学计算。当需要这些信息时，请使用提供的工具函数，不要自己编造数据。";

// ── Function Calling 核心循环 ────────────────────────────────────────

async function runConversation(userMessage: string) {
  console.log("━".repeat(50));
  console.log(`👤 用户: ${userMessage}\n`);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  // 最多循环 5 轮，防止无限循环
  for (let round = 0; round < 5; round++) {
    console.log(`🔄 第 ${round + 1} 轮调用 LLM...`);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto", // 让模型自行判断是否需要调用工具
      temperature: 0.1,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    // ── 情况 1: 模型直接返回文本（不需要工具调用） ──
    if (msg.content && !msg.tool_calls) {
      console.log(`🤖 助手: ${msg.content}`);
      console.log("━".repeat(50));
      return;
    }

    // ── 情况 2: 模型要求调用工具 ──
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // 将 assistant 消息加入历史
      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls,
      } as ChatCompletionMessageParam);

      // 并行执行所有工具调用
      const toolResults: ToolCallResult[] = await Promise.all(
        msg.tool_calls.map(async (tc: ChatCompletionMessageToolCall) => {
          const funcName = tc.function.name as ToolName;
          const args = JSON.parse(tc.function.arguments);

          console.log(`🔧 调用工具: ${funcName}(${tc.function.arguments})`);

          const result = await executeTool(funcName, args);
          console.log(`📋 工具结果: ${result.replace(/\n/g, " | ")}`);

          return {
            tool_call_id: tc.id,
            role: "tool" as const,
            content: result,
          };
        })
      );

      // 将工具结果加入消息历史
      toolResults.forEach((tr) => {
        messages.push(tr as ChatCompletionMessageParam);
      });

      console.log();
      // 继续下一轮，让 LLM 处理工具返回结果
      continue;
    }

    // ── 情况 3: finish_reason = "stop"，无 content 也无 tool_calls ──
    console.log("⚠️  模型返回空响应，终止");
    break;
  }

  console.log("⚠️  达到最大循环次数，终止");
  console.log("━".repeat(50));
}

// ── 主入口 ────────────────────────────────────────────────────────────

async function main() {
  // 检查环境变量
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("❌ 错误: 请先设置 DEEPSEEK_API_KEY 环境变量");
    console.error("   复制 .env.example 为 .env 并填入你的 API Key");
    console.error("   获取 Key: https://platform.deepseek.com/api_keys");
    process.exit(1);
  }

  console.log("🚀 DeepSeek Function Calling 示例启动\n");

  // 运行多个示例对话
  await runConversation("北京今天天气怎么样？");
  await runConversation("100 美元能换多少人民币？");
  await runConversation("帮我算一下 12345 * 67890 等于多少？");
  await runConversation("上海天气如何？如果我有500欧元，能换多少人民币？");
}

main().catch(console.error);
