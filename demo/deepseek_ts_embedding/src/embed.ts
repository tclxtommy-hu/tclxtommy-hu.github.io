import { config } from "./config.js";

/**
 * DeepSeek LLM 语义向量化
 *
 * 原理：通过 prompt 让 DeepSeek 对文本在 8 个语义维度上打分，
 * 形成一个 8 维语义向量，用于相似度计算。
 *
 * 维度定义（可自定义扩展）：
 * - 技术性、实用性、理论性
 * - AI/ML相关、前端相关、后端相关
 * - 入门友好、进阶深度
 */

const VECTOR_DIM = 8;

const DIM_DEFINITIONS = [
  "技术性（涉及编程/工程实现的程度，0=纯概念，1=大量代码和工程细节）",
  "实用性（可直接落地的程度，0=纯理论，1=即拿即用的实践指南）",
  "理论性（底层原理/数学推导的程度，0=纯应用，1=深入底层原理）",
  "AI/ML相关性（与人工智能/机器学习的关联度，0=无关，1=高度相关）",
  "前端相关性（与前端开发/浏览器/UI的关联度，0=无关，1=高度相关）",
  "后端相关性（与后端/服务端/数据库的关联度，0=无关，1=高度相关）",
  "入门友好度（对初学者易于理解，0=需要深厚背景，1=零基础可读）",
  "创新性/前沿性（涉及的新技术/新思路，0=传统成熟技术，1=前沿探索）",
];

const SYSTEM_PROMPT = `你是一个文本语义分析器。请对给定文本在以下 ${VECTOR_DIM} 个维度上打分，每个维度输出 0.00 到 1.00 之间的浮点数。

维度定义：
${DIM_DEFINITIONS.map((d, i) => `${i + 1}. ${d}`).join("\n")}

要求：
- 只输出一个 JSON 数组，不要任何其他文字
- 数组长度必须为 ${VECTOR_DIM}
- 每个值精确到小数点后两位
- 示例输出格式：[0.85, 0.60, 0.30, 0.95, 0.10, 0.20, 0.70, 0.50]`;

/**
 * 单条文本 → DeepSeek 打分 → 语义向量
 */
export async function embed(text: string): Promise<number[]> {
  const normalizedText = text.trim().toLowerCase(); // 忽略大小写
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.chatModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `请分析以下文本：\n\n${normalizedText}` },
      ],
      temperature: 0, // 确定性输出
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API 错误 (${res.status}): ${err}`);
  }

  const json = await res.json();
  const raw = json.choices[0].message.content.trim();

  // 解析 JSON，兼容 markdown 代码块包裹
  const clean = raw.replace(/```(json)?/g, "").trim();
  const vector = JSON.parse(clean) as number[];

  if (vector.length !== VECTOR_DIM) {
    throw new Error(`向量维度错误: 期望 ${VECTOR_DIM}, 实际 ${vector.length}`);
  }

  return vector;
}

/**
 * 批量文本转向量（逐条调用，每条都走 DeepSeek）
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const [i, text] of texts.entries()) {
    console.log(`  向量化 [${i + 1}/${texts.length}]: ${text.slice(0, 30)}...`);
    results.push(await embed(text));
  }
  return results;
}
