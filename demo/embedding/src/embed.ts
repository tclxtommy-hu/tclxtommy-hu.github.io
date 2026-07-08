/**
 * 本地模型向量化（Transformers.js v3 + ONNX Runtime）
 *
 * CLIP 模型：
 *   - 文本：CLIPTextModelWithProjection  → text_embeds（512维投影向量）
 *   - 图片：CLIPVisionModelWithProjection → image_embeds（512维投影向量）
 *   两者在同一向量空间，支持跨模态检索（以文搜图、以图搜文）。
 *
 * 非 CLIP 纯文本模型（如 all-MiniLM-L6-v2、multilingual-e5-small）：
 *   - 文本：feature-extraction pipeline → mean pooling → L2 normalize
 *   - 图片：不支持
 *
 * 首次运行会自动下载模型并缓存，之后离线可用。
 */
import {
  env,
  RawImage,
  pipeline,
  AutoTokenizer,
  AutoProcessor,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
} from "@huggingface/transformers";
import { config } from "./config.js";

// ===== 环境配置 =====
if (config.hfMirror) {
  env.remoteHost = config.hfMirror;
}
env.allowLocalModels = false;
// 模型缓存到项目根目录 .cache/ 下，方便查找和手动管理
env.cacheDir = ".cache";

/** 是否为 CLIP 系列模型（支持跨模态） */
const isCLIP = config.model.toLowerCase().includes("clip");

// ===== CLIP 模型组件（懒加载单例） =====
let textModel: any = null;
let tokenizer: any = null;
let visionModel: any = null;
let processor: any = null;

// ===== 非 CLIP 文本 pipeline =====
let textExtractor: any = null;

async function ensureText(): Promise<void> {
  if (isCLIP) {
    if (!textModel) {
      console.log(`⏳ 加载文本编码器: ${config.model}（首次需下载模型，请耐心等待）...`);
      tokenizer = await AutoTokenizer.from_pretrained(config.model);
      textModel = await CLIPTextModelWithProjection.from_pretrained(config.model, {
        dtype: config.dtype as any,
      });
      console.log(`✅ 文本编码器就绪`);
    }
  } else {
    if (!textExtractor) {
      console.log(`⏳ 加载文本编码器: ${config.model}（首次需下载模型，请耐心等待）...`);
      textExtractor = await pipeline("feature-extraction", config.model, {
        dtype: config.dtype as any,
      });
      console.log(`✅ 文本编码器就绪`);
    }
  }
}

async function ensureImage(): Promise<void> {
  if (!visionModel) {
    console.log(`⏳ 加载图像编码器: ${config.model}...`);
    processor = await AutoProcessor.from_pretrained(config.model);
    visionModel = await CLIPVisionModelWithProjection.from_pretrained(config.model, {
      dtype: config.dtype as any,
    });
    console.log(`✅ 图像编码器就绪`);
  }
}

// ===== 工具函数 =====

/** L2 归一化 */
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

// ===== 公开 API =====

/** 单条文本 → 向量 */
export async function embedText(text: string): Promise<number[]> {
  await ensureText();

  if (isCLIP) {
    // CLIP: 使用投影后的 text_embeds（512维，与图片同一空间）
    const inputs = tokenizer(text, { padding: true, truncation: true });
    const { text_embeds } = await textModel(inputs);
    return normalize(Array.from(text_embeds.data as Float32Array));
  }

  // 非 CLIP: feature-extraction pipeline → mean pooling → normalize
  const output = await textExtractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** 批量文本 → 向量 */
export async function embedTextBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const [i, text] of texts.entries()) {
    console.log(`  🔢 文本向量化 [${i + 1}/${texts.length}]: ${text.slice(0, 40)}...`);
    results.push(await embedText(text));
  }
  return results;
}

/** 图片路径 → 向量（仅 CLIP 等多模态模型支持） */
export async function embedImage(imagePath: string): Promise<number[]> {
  if (!isCLIP) {
    throw new Error(
      "图片向量化需要 CLIP 模型。请在 .env 中设置 MODEL_NAME=Xenova/clip-vit-base-patch32"
    );
  }
  await ensureImage();
  const image = await RawImage.read(imagePath);
  const inputs = await processor(image);
  const { image_embeds } = await visionModel(inputs);
  // image_embeds 是 [1, 512] 投影向量，与 text_embeds 同一空间
  return normalize(Array.from(image_embeds.data as Float32Array));
}
