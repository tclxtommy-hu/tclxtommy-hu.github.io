/**
 * query.ts —— 基于 RAG 的 DeepSeek 问答
 * 用法：npx tsx src/query.ts "问题"
 */
import { config } from "./config.js";
import { search } from "./vectorstore.js";

// query.ts 需要 DeepSeek Chat API，运行时校验
if (!config.apiKey) {
  console.error("❌ RAG 问答需要 DeepSeek Chat API，请在 .env 中配置 DEEPSEEK_API_KEY");
  process.exit(1);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat API 错误 (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.choices[0].message.content;
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.log("用法: npx tsx src/query.ts \"你的问题\"");
    process.exit(1);
  }

  console.log(`❓ 问题: ${query}\n`);

  // 1. 向量检索上下文
  const t0 = performance.now();
  const results = await search(query, 3, 0.3);
  const searchMs = (performance.now() - t0).toFixed(0);

  if (results.length === 0) {
    console.log("⚠️  未找到相关上下文，直接询问 DeepSeek...\n");
    const answer = await chat([
      { role: "user", content: query },
    ]);
    console.log(`🤖 ${answer}`);
    return;
  }

  console.log(`📚 检索到 ${results.length} 条上下文 (${searchMs}ms):`);
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${r.content.slice(0, 60)}...`);
  });

  // 2. 构建 RAG 提示词
  const context = results.map((r) => r.content).join("\n\n---\n\n");
  const systemPrompt = `你是一个知识助手。请根据以下参考信息回答用户问题。
如果参考信息不足以回答问题，请如实说明，不要编造。

参考信息：
${context}`;

  console.log("\n⏳ 正在询问 DeepSeek...\n");

  const t1 = performance.now();
  const answer = await chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ]);
  const chatMs = (performance.now() - t1).toFixed(0);

  console.log(`🤖 DeepSeek 回答 (${chatMs}ms):`);
  console.log("─".repeat(50));
  console.log(answer);
  console.log("─".repeat(50));
  console.log(`\n📊 总耗时: 检索 ${searchMs}ms + 生成 ${chatMs}ms`);
}

main().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
