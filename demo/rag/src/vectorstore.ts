import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config.js";
import { embed, embedBatch } from "./embedding.js";

/** 文档片段（已分块） */
export interface DocChunk {
  id: string;
  content: string;
  /** 来源文档名 / 路径 */
  source?: string;
  /** 在原文中的序号 */
  index?: number;
  meta?: Record<string, string>;
}

/** 向量条目（与 DocChunk 通过 id 关联） */
interface VectorEntry {
  id: string;
  vector: number[];
}

/** 检索结果 */
export interface SearchResult {
  id: string;
  content: string;
  source?: string;
  index?: number;
  meta?: Record<string, string>;
  score: number; // 余弦相似度 [0, 1]
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

function loadDocs(): DocChunk[] {
  ensureDataDir();
  if (!fs.existsSync(config.docsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.docsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveDocs(docs: DocChunk[]): void {
  ensureDataDir();
  fs.writeFileSync(config.docsFile, JSON.stringify(docs, null, 2), "utf-8");
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

/**
 * 新增若干片段：自动向量化并存储（去重按 id）
 */
export async function addChunks(chunks: DocChunk[]): Promise<number> {
  const existingIds = new Set(loadVectors().map((v) => v.id));
  const newChunks = chunks.filter((c) => {
    if (existingIds.has(c.id)) {
      console.warn(`⚠️  跳过重复片段: "${c.id}"`);
      return false;
    }
    return true;
  });

  if (newChunks.length === 0) {
    console.log("没有新片段需要入库");
    return loadVectors().length;
  }

  const vectors = await embedBatch(newChunks.map((c) => c.content));

  const currentVectors = loadVectors();
  const currentDocs = loadDocs();

  for (let i = 0; i < newChunks.length; i++) {
    currentVectors.push({ id: newChunks[i].id, vector: vectors[i] });
    currentDocs.push(newChunks[i]);
  }

  saveVectors(currentVectors);
  saveDocs(currentDocs);

  return currentVectors.length;
}

/**
 * 语义检索：查询 -> 向量化 -> 余弦相似度 Top-K
 */
export async function search(
  query: string,
  topK = 5,
  minScore = 0
): Promise<SearchResult[]> {
  const vectors = loadVectors();
  const docs = loadDocs();
  const docMap = new Map(docs.map((d) => [d.id, d]));

  if (vectors.length === 0) {
    console.log("📭 向量库为空，请先运行 yarn index 入库文档");
    return [];
  }

  const queryVector = await embed(query);

  return vectors
    .map((entry) => {
      const doc = docMap.get(entry.id);
      return {
        id: entry.id,
        content: doc?.content ?? "(片段缺失)",
        source: doc?.source,
        index: doc?.index,
        meta: doc?.meta,
        score: cosineSimilarity(queryVector, entry.vector),
      };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** 按 id 删除 */
export function deleteDocument(id: string): boolean {
  const vectors = loadVectors();
  const docs = loadDocs();
  const vBefore = vectors.length;
  const newVectors = vectors.filter((v) => v.id !== id);
  const newDocs = docs.filter((d) => d.id !== id);
  if (newVectors.length === vBefore) return false;
  saveVectors(newVectors);
  saveDocs(newDocs);
  return true;
}

/** 清空 */
export function clearAll(): void {
  saveVectors([]);
  saveDocs([]);
  console.log("🗑️  向量库已清空");
}

/** 统计信息 */
export function stats(): { chunkCount: number; vectorDim: number | null } {
  const vectors = loadVectors();
  return {
    chunkCount: vectors.length,
    vectorDim: vectors.length > 0 ? vectors[0].vector.length : null,
  };
}
