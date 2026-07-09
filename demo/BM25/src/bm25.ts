import { config } from "./config.js";

export interface BM25Options {
  /** 词频饱和系数，默认取 config.k1 */
  k1?: number;
  /** 长度归一化系数，默认取 config.b */
  b?: number;
}

/** 文档元信息，随索引一起持久化，供检索结果展示 */
export interface DocMeta {
  docId: number;
  /** 来源文件名 */
  path?: string;
  /** 展示标题（取首段前若干字符） */
  title?: string;
  /** 该分块的原始文本，供检索结果展示命中句子 */
  text?: string;
  /** token 数 */
  length: number;
}

/** 单条检索结果 */
export interface ScoredDoc {
  docId: number;
  score: number;
  meta?: DocMeta;
}

/** 索引序列化结构（JSON 友好） */
export interface IndexData {
  version: number;
  k1: number;
  b: number;
  N: number;
  avgdl: number;
  docLen: number[];
  docFreq: Record<string, number>;
  termFreqs: Record<string, Record<number, number>>;
  docMeta: DocMeta[];
}

/**
 * BM25 稀疏检索核心。
 * 仅做纯计算与序列化，不触碰任何文件 I/O，便于单测。
 */
export class BM25 {
  private k1: number;
  private b: number;
  /** term -> (docId -> tf) */
  private termFreqs = new Map<string, Map<number, number>>();
  /** term -> df（包含该词的文档数） */
  private docFreq = new Map<string, number>();
  /** docId -> token 数 */
  private docLen: number[] = [];
  /** docId -> 元信息 */
  private docMeta: DocMeta[] = [];
  private avgdl = 0;
  private N = 0;

  constructor(opts: BM25Options = {}) {
    this.k1 = opts.k1 ?? config.k1;
    this.b = opts.b ?? config.b;
  }

  /** 增加一个文档分块（docId 从 0 自增分配） */
  addDocument(
    tokens: string[],
    docId: number,
    meta?: Omit<DocMeta, "docId" | "length">,
  ): void {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    this.docLen[docId] = tokens.length;
    this.docMeta[docId] = { docId, length: tokens.length, ...meta };

    // 增量维护平均文档长度，避免二次遍历
    this.N++;
    this.avgdl += (tokens.length - this.avgdl) / this.N;

    for (const [term, count] of tf) {
      if (!this.termFreqs.has(term)) this.termFreqs.set(term, new Map());
      this.termFreqs.get(term)!.set(docId, count);
      this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
    }
  }

  /** BM25 IDF，带 +0.5 平滑，始终非负 */
  private idf(term: string): number {
    const n = this.docFreq.get(term) ?? 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  /** 对查询词项打分，返回 Top-K */
  search(queryTokens: string[], topK = config.topK): ScoredDoc[] {
    const scores = new Map<number, number>();

    for (const term of new Set(queryTokens)) {
      const postings = this.termFreqs.get(term);
      if (!postings) continue; // 该词项未出现于任何文档
      const idf = this.idf(term);
      for (const [docId, f] of postings) {
        const denom =
          f + this.k1 * (1 - this.b + this.b * (this.docLen[docId] / this.avgdl));
        const s = (idf * (f * (this.k1 + 1))) / denom;
        scores.set(docId, (scores.get(docId) ?? 0) + s);
      }
    }

    return [...scores]
      .sort((a, c) => c[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => ({ docId, score, meta: this.docMeta[docId] }));
  }

  /** 序列化为 JSON 友好的纯对象 */
  toJSON(): IndexData {
    const termFreqs: Record<string, Record<number, number>> = {};
    for (const [term, m] of this.termFreqs) {
      termFreqs[term] = {};
      for (const [docId, c] of m) termFreqs[term][docId] = c;
    }
    const docFreq: Record<string, number> = {};
    for (const [term, c] of this.docFreq) docFreq[term] = c;

    return {
      version: 1,
      k1: this.k1,
      b: this.b,
      N: this.N,
      avgdl: this.avgdl,
      docLen: this.docLen,
      docFreq,
      termFreqs,
      docMeta: this.docMeta,
    };
  }

  /** 从序列化数据还原（反向 toJSON） */
  static load(data: IndexData): BM25 {
    const bm = new BM25({ k1: data.k1, b: data.b });
    bm.N = data.N;
    bm.avgdl = data.avgdl;
    bm.docLen = data.docLen ?? [];
    bm.docMeta = data.docMeta ?? [];
    for (const [term, c] of Object.entries(data.docFreq)) bm.docFreq.set(term, c);
    for (const [term, m] of Object.entries(data.termFreqs)) {
      const inner = new Map<number, number>();
      for (const [docId, c] of Object.entries(m)) inner.set(Number(docId), c);
      bm.termFreqs.set(term, inner);
    }
    return bm;
  }
}
