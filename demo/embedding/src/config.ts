import "dotenv/config";

/**
 * 配置
 *
 * 本 Demo 使用本地模型（Transformers.js / ONNX Runtime），无需任何 API Key。
 * 首次运行时会从 HuggingFace Hub 下载模型并缓存到本地，之后离线可用。
 *
 * 可通过 .env 文件或环境变量覆盖以下配置。
 */
export const config = {
  /** 模型名称（HuggingFace Hub ID） */
  model: process.env.MODEL_NAME ?? "Xenova/clip-vit-base-patch32",

  /** HuggingFace 镜像（国内加速），留空使用官方源 */
  hfMirror: process.env.HF_MIRROR ?? "https://hf-mirror.com",

  /**
   * ONNX 数据类型
   * - "q8"：量化模型（默认，体积小 ~60MB，兼容性好）
   * - "fp32"：全精度（~250MB，部分 onnxruntime 版本可能不兼容）
   * - "fp16"：半精度
   */
  dtype: process.env.DTYPE ?? "q8",

  // ===== 存储路径 =====
  dataDir: "data",
  textsDir: "data/texts",
  imagesDir: "data/images",
  vectorsFile: "data/vectors.json",
  itemsFile: "data/items.json",
} as const;
