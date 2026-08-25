import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 判断当前模块是否作为入口直接运行（兼容 tsx / Windows 路径分隔符差异）。
 */
export function isMain(metaUrl: string): boolean {
  return !!process.argv[1] && resolve(fileURLToPath(metaUrl)) === resolve(process.argv[1]);
}

/** 项目根目录（demo/jsonl-zstd） */
export const ROOT = join(__dirname, "..");

/** 集中配置：目录、文件路径、压缩级别 */
export const config = {
  /** 数据目录 */
  dataDir: join(ROOT, "data"),
  /** 示例 JSONL 原始文件（未压缩） */
  jsonlFile: join(ROOT, "data", "sample-logs.jsonl"),
  /** 压缩后文件 */
  zstFile: join(ROOT, "data", "sample-logs.jsonl.zst"),
  /** 流式写入的大文件 */
  bigZstFile: join(ROOT, "data", "big-logs.jsonl.zst"),
  /** 默认压缩级别（1-19，3 为通用推荐） */
  level: 3,
  /** 大文件流式写入条数 */
  bigLogCount: 100_000,
};

export type Config = typeof config;
