import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config.js";
import { embed, embedBatch } from "./embed.js";

/** 文档条目 */
export interface Doc {
  id: string;
  content: string;
  /** 文档元数据（可选） */
  meta?: Record<string, string>;
}

/** 向量条目（与 Doc 通过 id 关联） */
interface VectorEntry {
  id: string;
  vector: number[];
}

/** 搜索结果 */
export interface SearchResult {
  id: string;
  content: string;
  meta?: Record<string, string>;
  score: number; // 余弦相似度 [0, 1]
}

/** 向量维度（首次调用时自动设置） */
let dim: number | null = null;

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

function loadDocs(): Doc[] {
  ensureDataDir();
  if (!fs.existsSync(config.docsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.docsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveDocs(docs: Doc[]): void {
  ensureDataDir();
  fs.writeFileSync(config.docsFile, JSON.stringify(docs, null, 2), "utf-8");
}

// ====================== 向量操作 ======================

/** 计算两个向量的余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量维度不匹配: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
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
 * 添加文档（自动转为向量后存储）
 * @returns 向量维度
 */
export async function addDocument(doc: Doc): Promise<number> {
  const vectors = loadVectors();
  const docs = loadDocs();

  // 去重
  if (vectors.find((v) => v.id === doc.id)) {
    throw new Error(`文档 ID "${doc.id}" 已存在`);
  }

  const vector = await embed(doc.content);

  // 维度校验
  if (dim === null) {
    dim = vector.length;
    console.log(`📐 向量维度: ${dim}`);
  } else if (vector.length !== dim) {
    throw new Error(`向量维度不一致: 期望 ${dim}, 实际 ${vector.length}`);
  }

  vectors.push({ id: doc.id, vector });
  docs.push(doc);

  saveVectors(vectors);
  saveDocs(docs);
  return vector.length;
}

/**
 * 批量添加文档
 */
export async function addDocuments(documents: Doc[]): Promise<number> {
  // 过滤已存在的
  const existingIds = new Set(loadVectors().map((v) => v.id));
  const newDocs = documents.filter((d) => {
    if (existingIds.has(d.id)) {
      console.warn(`⚠️  跳过重复文档: "${d.id}"`);
      return false;
    }
    return true;
  });

  if (newDocs.length === 0) {
    console.log("没有新文档需要添加");
    return 0;
  }

  const texts = newDocs.map((d) => d.content);
  const vectors = await embedBatch(texts);

  if (dim === null) {
    dim = vectors[0].length;
    console.log(`📐 向量维度: ${dim}`);
  }

  const currentVectors = loadVectors();
  const currentDocs = loadDocs();

  for (let i = 0; i < newDocs.length; i++) {
    currentVectors.push({ id: newDocs[i].id, vector: vectors[i] });
    currentDocs.push(newDocs[i]);
  }

  saveVectors(currentVectors);
  saveDocs(currentDocs);

  return vectors[0].length;
}

/**
 * 语义搜索 —— 暴力余弦相似度
 * @param query  查询文本
 * @param topK   返回 Top-K 结果
 * @param minScore  最低相似度阈值
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
    console.log("📭 向量库为空，请先执行索引操作");
    return [];
  }

  const queryVector = await embed(query);

  const results: SearchResult[] = vectors
    .map((entry) => {
      const doc = docMap.get(entry.id);
      return {
        id: entry.id,
        content: doc?.content ?? "(文档缺失)",
        meta: doc?.meta,
        score: cosineSimilarity(queryVector, entry.vector),
      };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

/**
 * 通过 ID 删除文档
 */
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

/**
 * 清空向量库
 */
export function clearAll(): void {
  saveVectors([]);
  saveDocs([]);
  console.log("🗑️  向量库已清空");
}

/**
 * 获取向量库统计信息
 */
export function stats(): { docCount: number; vectorDim: number | null } {
  const vectors = loadVectors();
  return {
    docCount: vectors.length,
    vectorDim: vectors.length > 0 ? vectors[0].vector.length : null,
  };
}
