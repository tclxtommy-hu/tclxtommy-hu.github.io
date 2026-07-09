import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 判断当前模块是否作为入口直接运行（兼容 tsx / Windows 路径分隔符差异）。
 */
export function isMain(metaUrl: string): boolean {
  return !!process.argv[1] && resolve(fileURLToPath(metaUrl)) === resolve(process.argv[1]);
}

/** 项目根目录（demo/BM25） */
export const ROOT = join(__dirname, "..");

/** 集中配置：目录、索引文件、BM25 超参 */
export const config = {
  /** 原始文档目录（.md / .txt） */
  docsDir: join(ROOT, "data", "docs"),
  /** 索引持久化文件（JSON） */
  indexFile: join(ROOT, "data", "index.json"),
  /** 词频饱和系数，默认 1.5 */
  k1: 1.5,
  /** 长度归一化系数，默认 0.75 */
  b: 0.75,
  /** 检索返回条数 */
  topK: 10,
};

export type Config = typeof config;
