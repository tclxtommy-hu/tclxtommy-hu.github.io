/**
 * index.ts —— 文本 + 图片向量化入库
 * 用法：pnpm index
 *
 * 数据源：
 *   1) data/texts/ 目录下的 *.md / *.txt 文件（每篇作为一个条目）
 *   2) data/images/ 目录下的 *.png / *.jpg / *.jpeg / *.webp 文件
 *   3) 若 texts 目录为空，使用内嵌示例文本
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config.js";
import { addTexts, addImages, stats, type StoreItem } from "./vectorstore.js";

// ===================== 内嵌示例文本 =====================
const sampleTexts: { name: string; content: string }[] = [
  {
    name: "clip-intro.txt",
    content:
      "CLIP（Contrastive Language-Image Pre-training）是 OpenAI 提出的跨模态模型，通过对比学习将文本和图片映射到同一个向量空间，从而支持跨模态检索。",
  },
  {
    name: "embedding-intro.txt",
    content:
      "Embedding 是将文本、图片等数据转换为稠密向量的技术。语义相近的内容在向量空间中距离更近，这是语义搜索和推荐系统的基础。",
  },
  {
    name: "local-model.txt",
    content:
      "本地模型推理无需调用云端 API，数据不出本机，隐私安全有保障。通过 ONNX Runtime，JavaScript 也能高效运行深度学习模型。",
  },
  {
    name: "vector-search.txt",
    content:
      "向量检索的核心是计算查询向量与库中所有向量的相似度（如余弦相似度），返回得分最高的 Top-K 结果。数据量大时可使用近似最近邻（ANN）算法加速。",
  },
  {
    name: "transformers-js.txt",
    content:
      "Transformers.js 是 HuggingFace 推出的 JavaScript 版 Transformers 库，基于 ONNX Runtime，支持在 Node.js 和浏览器中运行超过 1200 种预训练模型。",
  },
];

// ===================== 数据加载 =====================

function loadTexts(): { name: string; content: string }[] {
  const dir = config.textsDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return sampleTexts;
  }
  const files = fs.readdirSync(dir).filter((f) => /\.(md|txt)$/i.test(f));
  if (files.length === 0) return sampleTexts;
  return files.map((f) => ({
    name: f,
    content: fs.readFileSync(path.join(dir, f), "utf-8"),
  }));
}

function loadImages(): string[] {
  const dir = config.imagesDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f))
    .map((f) => path.join(dir, f));
}

// ===================== 主流程 =====================

async function main() {
  console.log("🚀 本地 Embedding 向量化入库\n");
  console.log(`   模型: ${config.model}\n`);

  const texts = loadTexts();
  const images = loadImages();
  console.log(`📂 待处理: ${texts.length} 篇文本, ${images.length} 张图片\n`);

  if (texts.length === 0 && images.length === 0) {
    console.log("⚠️  没有找到待入库的数据");
    return;
  }

  // 入库文本
  if (texts.length > 0) {
    console.log("── 文本入库 ──");
    const textItems: StoreItem[] = texts.map((t) => ({
      id: `text:${t.name}`,
      type: "text" as const,
      content: t.content.trim(),
      source: t.name,
    }));
    await addTexts(textItems);
    console.log();
  }

  // 入库图片
  if (images.length > 0) {
    console.log("── 图片入库 ──");
    const imageItems: StoreItem[] = images.map((imgPath) => ({
      id: `image:${path.basename(imgPath)}`,
      type: "image" as const,
      content: path.basename(imgPath),
      source: imgPath,
    }));
    await addImages(imageItems);
    console.log();
  }

  const s = stats();
  console.log(
    `✅ 入库完成！共 ${s.count} 条（文本 ${s.textCount}，图片 ${s.imageCount}），向量维度 ${s.vectorDim}`
  );
  console.log('   接下来可运行: pnpm demo / pnpm search "关键词"');
}

main().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
