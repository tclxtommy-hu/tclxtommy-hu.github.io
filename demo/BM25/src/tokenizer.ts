export type Tokenizer = (text: string) => string[];

/**
 * 纯 JS 二元分词（bigram）兜底方案：零额外依赖，中文可用，
 * 将连续文本切成相邻两个字符的片段（忽略空白）。
 */
export const bigramTokenizer: Tokenizer = (text) => {
  const s = text.toLowerCase().replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
};

/**
 * 英文 / 通用分词：小写 + 字母数字切分。
 */
export const simpleTokenizer: Tokenizer = (text) =>
  text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

let cachedTokenizer: Tokenizer | undefined;

/**
 * 自动选择分词器：
 *   优先尝试加载可选依赖 @node-rs/jieba（Rust 预编译，中文分词质量高）；
 *   加载失败（未安装）则自动回退到 bigram，保证 demo 立即可跑。
 *   结果带模块级缓存，重复调用只探测/打印一次。
 */
export async function getTokenizer(): Promise<Tokenizer> {
  if (cachedTokenizer) return cachedTokenizer;

  let tokenizer: Tokenizer;
  try {
    const mod = await import("@node-rs/jieba");
    // v1.10.x 为扁平 API：直接导出 cut / cutForSearch 等函数（也可经 default 实例调用）
    const cut = mod.cut ?? mod.default?.cut;
    if (typeof cut !== "function") throw new Error("jieba 未导出 cut");
    console.log("✓ 使用 @node-rs/jieba 中文分词");
    tokenizer = (text: string) => cut(text).map((t) => t.trim()).filter(Boolean);
  } catch {
    console.log("· 未安装 @node-rs/jieba，使用 bigram 分词（pnpm add -D @node-rs/jieba 可启用）");
    tokenizer = bigramTokenizer;
  }

  cachedTokenizer = tokenizer;
  return tokenizer;
}
