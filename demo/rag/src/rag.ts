import { config } from "./config.js";
import { search, type SearchResult } from "./vectorstore.js";

/** RAG 问答结果 */
export interface RagAnswer {
  answer: string;
  sources: SearchResult[];
  searchMs: number;
  chatMs: number;
  /** 是否基于检索到的上下文作答 */
  grounded: boolean;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 调用 DeepSeek Chat 生成文本 */
async function chat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek Chat API 错误 (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.choices[0].message.content as string;
}

/**
 * RAG 核心管线：检索相关片段 -> 拼入提示词 -> DeepSeek 生成回答
 *
 * @param query  用户问题
 * @param topK   检索片段数
 * @param minScore 最低相似度阈值（低于则视为无相关上下文）
 */
export async function answer(
  query: string,
  topK = 3,
  minScore = 0.0
): Promise<RagAnswer> {
  // 1) 检索
  const t0 = performance.now();
  const sources = await search(query, topK, minScore);
  const searchMs = performance.now() - t0;

  // 2) 生成
  const t1 = performance.now();
  let answerText: string;
  let grounded = false;

  if (sources.length === 0) {
    console.log("⚠️  未检索到相关上下文，直接请 DeepSeek 回答...\n");
    answerText = await chat([{ role: "user", content: query }]);
  } else {
    grounded = true;
    const context = sources
      .map((s, i) => `[${i + 1}] (来源: ${s.source ?? s.id})\n${s.content}`)
      .join("\n\n---\n\n");

    const systemPrompt = `你是一个严谨的知识助手，请严格依据下面提供的「参考信息」回答用户问题。
规则：
- 只使用参考信息中的内容作答，不要编造参考信息之外的知识；
- 如果参考信息不足以回答问题，请如实说明「根据现有资料无法回答」；
- 回答时尽量引用参考信息的编号（如 [1]、[2]）；
- 使用简洁清晰的中文。

参考信息：
${context}`;

    answerText = await chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ]);
  }

  const chatMs = performance.now() - t1;

  return { answer: answerText, sources, searchMs, chatMs, grounded };
}
