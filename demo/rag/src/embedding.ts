import { config } from "./config.js";

/**
 * 文本向量化（可插拔）
 *
 *  DeepSeek 当前没有公开的 Embedding 接口，所以提供两种策略：
 *
 *  1) "deepseek"（默认）：用 DeepSeek Chat 在 N 个语义维度上打分，
 *     得到一个 N 维语义向量用于余弦相似度检索。零额外依赖、开箱即用。
 *     （这不是模型内部隐式表示，而是 LLM 显式语义理解后的属性标注。）
 *
 *  2) "openai"：调用 OpenAI 兼容的 /embeddings 接口，得到真实稠密向量。
 *     适用于需要标准语义向量的场景（需配置 OPENAI_API_KEY 等）。
 */

export const VECTOR_DIM = 12;

/** 语义维度定义（仅 deepseek 策略使用） */
const DIM_DEFINITIONS = [
  "技术/工程（涉及编程、系统实现的程度，0=纯概念，1=大量代码与工程细节）",
  "人工智能/机器学习（与 AI/ML 的关联度，0=无关，1=高度相关）",
  "前端开发（与前端/浏览器/UI 的关联度，0=无关，1=高度相关）",
  "后端/服务端（与后端/服务端/数据库的关联度，0=无关，1=高度相关）",
  "数据/数据库（与数据处理、存储、向量库的关联度，0=无关，1=高度相关）",
  "算法/数学（涉及算法、数学推导的程度，0=纯应用，1=深入底层原理）",
  "产品/设计（与产品、交互、设计的关联度，0=无关，1=高度相关）",
  "商业/行业（与商业、行业趋势的关联度，0=无关，1=高度相关）",
  "教程/实操（可直接落地的程度，0=纯理论，1=即拿即用的实践指南）",
  "概念/理论（底层概念与原理的程度，0=纯应用，1=深入理论）",
  "工具/框架（涉及具体工具、框架、SDK 的程度，0=无关，1=大量提及）",
  "运维/安全（与部署、运维、安全的关联度，0=无关，1=高度相关）",
];

const SYSTEM_PROMPT = `你是一个文本语义分析器。请对给定文本在以下 ${VECTOR_DIM} 个维度上打分，每个维度输出 0.00 到 1.00 之间的浮点数。

维度定义：
${DIM_DEFINITIONS.map((d, i) => `${i + 1}. ${d}`).join("\n")}

要求：
- 只输出一个 JSON 数组，不要任何其他文字
- 数组长度必须为 ${VECTOR_DIM}
- 每个值精确到小数点后两位
- 示例输出格式：[0.85, 0.60, 0.30, 0.95, 0.10, 0.20, 0.70, 0.50, 0.80, 0.40, 0.60, 0.30]`;

// ===================== DeepSeek 语义向量 =====================

async function deepseekEmbed(text: string): Promise<number[]> {
  const normalized = text.trim().toLowerCase();
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
        { role: "user", content: `请分析以下文本：\n\n${normalized}` },
      ],
      temperature: 0, // 确定性输出
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek Chat API 错误 (${res.status}): ${err}`);
  }

  const json = await res.json();
  const raw = json.choices[0].message.content.trim();
  const clean = raw.replace(/```(json)?/g, "").trim();
  const vector = JSON.parse(clean) as number[];

  if (vector.length !== VECTOR_DIM) {
    throw new Error(`语义向量维度错误: 期望 ${VECTOR_DIM}, 实际 ${vector.length}`);
  }
  return vector;
}

// ===================== OpenAI 兼容 Embedding =====================

const EMBED_BATCH = 32;

interface EmbeddingItem {
  embedding: number[];
  index: number;
}

async function openaiEmbedBatch(texts: string[]): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    console.log(`  🔢 向量化 [${i + 1}-${Math.min(i + EMBED_BATCH, texts.length)}/${texts.length}]`);

    const res = await fetch(`${config.openaiBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.openaiEmbedModel,
        input: batch,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Embedding API 错误 (${res.status}): ${err}`);
    }

    const json = await res.json();
    const data = (json.data as EmbeddingItem[] | undefined) ?? [];
    if (data.length === 0 || !data[0]?.embedding) {
      throw new Error("Embedding 返回格式异常");
    }
    const ordered = [...data].sort((a, b) => a.index - b.index);
    for (const item of ordered) all.push(item.embedding);
  }
  return all;
}

// ===================== 公开 API =====================

/** 单条文本 -> 向量 */
export async function embed(text: string): Promise<number[]> {
  if (config.embedProvider === "openai") {
    return (await openaiEmbedBatch([text]))[0];
  }
  return deepseekEmbed(text);
}

/** 批量文本 -> 向量 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (config.embedProvider === "openai") {
    return openaiEmbedBatch(texts);
  }
  // deepseek 策略：逐条打分
  const out: number[][] = [];
  for (const [i, t] of texts.entries()) {
    console.log(`  🔢 向量化 [${i + 1}/${texts.length}]: ${t.slice(0, 30)}...`);
    out.push(await deepseekEmbed(t));
  }
  return out;
}
