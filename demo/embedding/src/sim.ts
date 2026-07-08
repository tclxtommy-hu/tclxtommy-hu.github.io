/**
 * sim.ts —— 图片相似度搜索（DINO 模型）
 *
 * DINO（Self-Distillation with NO labels）是 Meta 提出的视觉 Transformer，
 * 专为图像特征提取设计，图像-图像相似度效果远优于 CLIP。
 *
 * 与 CLIP 的区别：
 *   CLIP：文本↔图片跨模态（强项），图片↔图片相似度（弱项）
 *   DINO：图片↔图片相似度（强项），不支持文本
 *
 * 用法：
 *   pnpm run sim                    # 入库 data/images/ 下所有图片
 *   pnpm run sim --image ./xx.png   # 搜索相似图片
 */
import { pipeline, env, RawImage } from "@huggingface/transformers";
import { config } from "./config.js";
import * as fs from "node:fs";
import * as path from "node:path";

// ===== 环境配置（与 embed.ts 一致）=====
if (config.hfMirror) {
  env.remoteHost = config.hfMirror;
}
env.allowLocalModels = false;
env.cacheDir = ".cache";

/** DINO 模型名称（可通过环境变量 SIM_MODEL 覆盖） */
const SIM_MODEL = process.env.SIM_MODEL ?? "Xenova/dino-vits16";

/** 独立存储（与 CLIP 向量分开） */
const SIM_FILE = "data/sim_vectors.json";

// ===== 模型单例 =====
let extractor: any = null;

async function ensureModel(): Promise<any> {
  if (!extractor) {
    console.log(`⏳ 加载图像相似度模型: ${SIM_MODEL}（首次需下载，请耐心等待）...`);
    extractor = await pipeline("image-feature-extraction", SIM_MODEL, {
      dtype: config.dtype as any,
    });
    console.log(`✅ 模型就绪`);
  }
  return extractor;
}

// ===== 向量化 =====

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

async function embedImage(imagePath: string): Promise<number[]> {
  const ext = await ensureModel();
  const image = await RawImage.read(imagePath);

  // 优先用 pool=true 获取 pooler_output（CLS token，DINO 推荐用法）
  let output;
  try {
    output = await ext(image, { pool: true });
  } catch {
    // 回退：无 pooler_output 时取 last_hidden_state 手动均值池化
    output = await ext(image);
  }

  const dims = output.dims as number[];

  // [1, D] → 直接使用
  if (dims.length === 2) {
    return normalize(Array.from(output.data as Float32Array));
  }

  // [1, N, D] → 对 N 个 patch 均值池化
  if (dims.length === 3) {
    const n = dims[1];
    const d = dims[2];
    const data = output.data as Float32Array;
    const pooled = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        pooled[j] += data[i * d + j] / n;
      }
    }
    return normalize(pooled);
  }

  return normalize(Array.from(output.data as Float32Array));
}

// ===== 余弦相似度（向量已归一化，直接点积）=====
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ===== 存储 =====

interface SimEntry {
  id: string;
  content: string;
  source: string;
  vector: number[];
}

function loadIndex(): SimEntry[] {
  if (!fs.existsSync(SIM_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SIM_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveIndex(entries: SimEntry[]): void {
  fs.writeFileSync(SIM_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// ===== 入库 =====

async function indexImages(): Promise<void> {
  const dir = config.imagesDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log("📭 data/images/ 目录为空，请放入图片后重试");
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f))
    .map((f) => path.join(dir, f));

  if (files.length === 0) {
    console.log("📭 data/images/ 中没有图片");
    return;
  }

  console.log(`🚀 DINO 图片相似度入库\n   模型: ${SIM_MODEL}\n`);
  console.log(`📂 发现 ${files.length} 张图片，开始向量化...\n`);

  const entries: SimEntry[] = [];
  for (const [i, imgPath] of files.entries()) {
    console.log(`  🖼️  [${i + 1}/${files.length}] ${path.basename(imgPath)}`);
    const vector = await embedImage(imgPath);
    entries.push({
      id: path.basename(imgPath),
      content: path.basename(imgPath),
      source: imgPath,
      vector,
    });
  }

  saveIndex(entries);
  console.log(
    `\n✅ 入库完成！共 ${entries.length} 张图片，向量维度 ${entries[0].vector.length}`
  );
  console.log("   搜索: pnpm run sim --image ./data/images/xx.jpg");
}

// ===== 搜索 =====

async function searchSimilar(queryImagePath: string): Promise<void> {
  const entries = loadIndex();
  if (entries.length === 0) {
    console.log("📭 图片索引为空，请先运行 pnpm run sim 入库");
    return;
  }

  console.log(`🔎 DINO 以图搜图: "${queryImagePath}" (索引: ${entries.length} 张图片)\n`);

  const t0 = performance.now();
  const queryVec = await embedImage(queryImagePath);

  const results = entries
    .map((e) => ({
      content: e.content,
      source: e.source,
      score: cosineSimilarity(queryVec, e.vector),
    }))
    .sort((a, b) => b.score - a.score);

  const elapsed = (performance.now() - t0).toFixed(0);

  console.log(`  ── Top ${results.length} 结果 (${elapsed}ms) ──`);
  results.forEach((r, i) => {
    const bar = "█".repeat(Math.round(Math.max(0, r.score) * 20));
    console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${bar} 🖼️ ${r.content}`);
  });
}

// ===== 入口 =====

const args = process.argv.slice(2);

if (args[0] === "--image" && args[1]) {
  searchSimilar(args[1]).catch((err) => {
    console.error("❌ 搜索失败:", err.message);
    process.exit(1);
  });
} else {
  indexImages().catch((err) => {
    console.error("❌ 入库失败:", err.message);
    process.exit(1);
  });
}
