/**
 * JSON 向量存储 + 余弦相似度检索
 *
 * 沿用 rag demo 的成熟模式：向量与条目元信息分两个 JSON 文件存储，
 * 通过 id 关联。支持文本条目和图片条目混合检索。
 */
import * as fs from "node:fs";
import { config } from "./config.js";
import { embedText, embedTextBatch, embedImage } from "./embed.js";

/** 条目类型 */
export type ItemType = "text" | "image";

/** 存储条目（原文 / 图片信息） */
export interface StoreItem {
  id: string;
  type: ItemType;
  /** 文本内容 或 图片文件名 */
  content: string;
  /** 来源文件路径（图片为完整路径，文本为文件名） */
  source?: string;
  meta?: Record<string, string>;
}

/** 向量条目 */
interface VectorEntry {
  id: string;
  vector: number[];
}

/** 检索结果 */
export interface SearchResult {
  id: string;
  type: ItemType;
  content: string;
  source?: string;
  meta?: Record<string, string>;
  /** 余弦相似度 */
  score: number;
}

// ====================== 文件读写 ======================

function ensureDataDir(): void {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function loadVectors(): VectorEntry[] {
  ensureDataDir();
  if (!fs.existsSync(config.vectorsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.vectorsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveVectors(entries: VectorEntry[]): void {
  ensureDataDir();
  fs.writeFileSync(config.vectorsFile, JSON.stringify(entries, null, 2), "utf-8");
}

function loadItems(): StoreItem[] {
  ensureDataDir();
  if (!fs.existsSync(config.itemsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.itemsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveItems(items: StoreItem[]): void {
  ensureDataDir();
  fs.writeFileSync(config.itemsFile, JSON.stringify(items, null, 2), "utf-8");
}

// ====================== 向量运算 ======================

/** 余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量维度不匹配: ${a.length} vs ${b.length}`);
  }
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ====================== 公开 API ======================

/** 新增文本条目：自动向量化并存储（去重按 id） */
export async function addTexts(items: StoreItem[]): Promise<number> {
  const existingIds = new Set(loadVectors().map((v) => v.id));
  const newItems = items.filter((item) => {
    if (existingIds.has(item.id)) {
      console.warn(`⚠️  跳过重复条目: "${item.id}"`);
      return false;
    }
    return true;
  });

  if (newItems.length === 0) {
    console.log("没有新文本条目需要入库");
    return loadVectors().length;
  }

  const vectors = await embedTextBatch(newItems.map((i) => i.content));

  const currentVectors = loadVectors();
  const currentItems = loadItems();

  for (let i = 0; i < newItems.length; i++) {
    currentVectors.push({ id: newItems[i].id, vector: vectors[i] });
    currentItems.push(newItems[i]);
  }

  saveVectors(currentVectors);
  saveItems(currentItems);

  return currentVectors.length;
}

/** 新增图片条目：自动向量化并存储（去重按 id） */
export async function addImages(items: StoreItem[]): Promise<number> {
  const existingIds = new Set(loadVectors().map((v) => v.id));
  const newItems = items.filter((item) => {
    if (existingIds.has(item.id)) {
      console.warn(`⚠️  跳过重复条目: "${item.id}"`);
      return false;
    }
    return true;
  });

  if (newItems.length === 0) {
    console.log("没有新图片条目需要入库");
    return loadVectors().length;
  }

  const currentVectors = loadVectors();
  const currentItems = loadItems();

  for (const [i, item] of newItems.entries()) {
    console.log(`  🖼️  图片向量化 [${i + 1}/${newItems.length}]: ${item.content}`);
    const vector = await embedImage(item.source!);
    currentVectors.push({ id: item.id, vector });
    currentItems.push(item);
  }

  saveVectors(currentVectors);
  saveItems(currentItems);

  return currentVectors.length;
}

/** 语义检索（文本查询 → 搜文本 + 图片） */
export async function searchText(
  query: string,
  topK = 5,
  minScore = 0,
  filterType?: ItemType
): Promise<SearchResult[]> {
  const vectors = loadVectors();
  const items = loadItems();
  const itemMap = new Map(items.map((i) => [i.id, i]));

  if (vectors.length === 0) {
    console.log("📭 向量库为空，请先运行 pnpm index 入库");
    return [];
  }

  const queryVector = await embedText(query);

  return vectors
    .map((entry) => {
      const item = itemMap.get(entry.id);
      return {
        id: entry.id,
        type: item?.type ?? "text",
        content: item?.content ?? "(条目缺失)",
        source: item?.source,
        meta: item?.meta,
        score: cosineSimilarity(queryVector, entry.vector),
      };
    })
    .filter((r) => r.score >= minScore)
    .filter((r) => !filterType || r.type === filterType)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** 语义检索（图片查询 → 以图搜库，仅 CLIP 等多模态模型支持） */
export async function searchImage(
  imagePath: string,
  topK = 5,
  minScore = 0
): Promise<SearchResult[]> {
  const vectors = loadVectors();
  const items = loadItems();
  const itemMap = new Map(items.map((i) => [i.id, i]));

  if (vectors.length === 0) {
    console.log("📭 向量库为空，请先运行 pnpm index 入库");
    return [];
  }

  const queryVector = await embedImage(imagePath);

  return vectors
    .map((entry) => {
      const item = itemMap.get(entry.id);
      return {
        id: entry.id,
        type: item?.type ?? "text",
        content: item?.content ?? "(条目缺失)",
        source: item?.source,
        meta: item?.meta,
        score: cosineSimilarity(queryVector, entry.vector),
      };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** 按 id 删除 */
export function deleteItem(id: string): boolean {
  const vectors = loadVectors();
  const items = loadItems();
  const vBefore = vectors.length;
  const newVectors = vectors.filter((v) => v.id !== id);
  const newItems = items.filter((i) => i.id !== id);
  if (newVectors.length === vBefore) return false;
  saveVectors(newVectors);
  saveItems(newItems);
  return true;
}

/** 清空 */
export function clearAll(): void {
  saveVectors([]);
  saveItems([]);
  console.log("🗑️  向量库已清空");
}

/** 统计信息 */
export function stats(): {
  count: number;
  vectorDim: number | null;
  textCount: number;
  imageCount: number;
} {
  const vectors = loadVectors();
  const items = loadItems();
  return {
    count: vectors.length,
    vectorDim: vectors.length > 0 ? vectors[0].vector.length : null,
    textCount: items.filter((i) => i.type === "text").length,
    imageCount: items.filter((i) => i.type === "image").length,
  };
}
