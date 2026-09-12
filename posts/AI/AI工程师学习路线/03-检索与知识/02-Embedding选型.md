# Embedding 选型

> 状态：✅ 已补齐（2026-09-12）  
> 一句话定义：选对嵌入模型（维度、多语言、领域、延迟与价格），否则后面检索怎么调都像噪声。

## 大纲

1. [选型的五个维度](#一选型的五个维度)
2. [相似度度量与归一化](#二相似度度量与归一化)
3. [用数据选型：评测驱动](#三用数据选型评测驱动)
4. [换模型的迁移成本](#四换模型的迁移成本)
5. [端到端落地示例：四周迭代](#五端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [Chunking 策略 · 本系列](./01-Chunking策略.md)
- [Embedding 与表示](../../AI知识库/06-大语言模型LLM/03-Embedding与表示.md)
- [向量数据库](../../AI知识库/09-RAG与上下文/03-向量数据库.md)

## 学习要点（读后应能回答）

- 换 embedding 的迁移成本怎么估？→ 见 [四](#四换模型的迁移成本)
- 中英混合语料怎么选？→ 见 [1.2](#12-多语言语料怎么选) 与 [三](#三用数据选型评测驱动)

---

## 一、选型的五个维度

**Embedding** /ɪmˈbedɪŋ/ （Embedding，向量嵌入）模型把文本映射成定长向量，向量空间里「近」代表「语义近」。选型看五个维度，缺一都会在后期变成硬伤：

| 维度 | 关键问题 | 典型取值 |
|------|----------|----------|
| 效果 | 自建标注集上的 hit@k、 **MRR** /ˌem ɑːr ˈɑːr/ （Mean Reciprocal Rank，平均倒数排名） | 以自有数据为准，公榜仅作初筛 |
| 语言 | 语料与查询的语言覆盖 | 中文 / 多语言 / 代码混合 |
| 维度 | 向量长度，决定存储与检索速度 | 384 / 768 / 1024 / 1536 / 3072 |
| 延迟 | 单条嵌入耗时（查询在线要 embed，文档离线批量 embed） | 查询路径 < 50ms 为宜 |
| 价格 | API 计费或自托管 GPU 成本 | 每百万 token 计价 |

一个常被忽略的原则：**文档和查询必须用同一个模型**。两个模型的向量空间互不通约，跨模型算余弦相似度得到的只是噪声。

### 1.1 通用 / 领域 / 多模态怎么分

- **通用模型**：覆盖面广，多数场景的首选起点；先跑通用，别一上来就追领域模型；
- **领域模型**：在医疗、法律、金融等垂直语料上训练。领域术语密集、公榜分数与实际召回脱节时才考虑——例如「解除合同」「违约金」这类表述，通用模型常把「解除」嵌到「取消订阅」附近；
- **代码模型**：代码与自然语言联合训练（注释 ↔ 函数体对齐），代码库检索优先考虑；
- **多模态模型**：图文同空间（用文字搜图）。小北的架构图检索用不上——图已转 caption 文本，见 [01 篇 4.3](./01-Chunking策略.md)。

### 1.2 多语言语料怎么选

小北的真实痛点：制度 PDF 全中文，技术文档中英混排（术语原样英文），代码库几乎全英文，而用户查询三种语言都出现。

- 选**单语优化模型**：中文效果最好，但英文技术文档块会被嵌入得语义含混，查「rate limiter 实现」召回很差；
- 选**多语言模型**：单语峰值略低，但跨语言检索稳——英文文档块能被中文问题「rate limiter 怎么写」命中；
- 判据一句话：**语料跨语言，模型就选多语言；语料纯单语，才用单语模型拿那 1~2 个点的峰值**。

### 1.3 维度与成本的换算

维度直接乘进向量库成本与检索延迟：

- 存储：300 万块 × 1536 维 × 4 字节 ≈ 17 **GB** /ˌɡɪɡəˈbaɪt/ （Gigabyte，吉字节）原始向量，768 维直接减半；
- 检索： **HNSW** /ˈeɪ en ˈes ˈdʌbljuː/ （Hierarchical Navigable Small World，分层可导航小世界图）索引的建图与查询耗时随维度近似线性涨；
- 有些模型提供 **Matryoshka** /ˌmætriˈɔːʃkə/ （Matryoshka Representation Learning，套娃表示学习，俄套娃）截断能力：1536 维模型可截断到 256 维用，精度损失很小——先用低维上线，召回不够再升维，是最低成本的扩容路径。

## 二、相似度度量与归一化

向量库里配的「距离」不是玄学，三条规则定死：

1. **归一化（L2 归一化）后，余弦相似度 = 点积**——归一化做完，选哪个都一样，性能上点积更快，向量库默认用它；
2. **不归一化时余弦与点积不等价**：点积会被向量长度（信息量）带偏，长文本块天然占优——这是「为什么我的块越长分数越高」的经典病因；
3. 部分模型（如一些 **BERT** /ˈbɜːrt/ （Bidirectional Encoder Representations from Transformers，双向编码器表示）家族衍生模型）要求特定度量，换度量必须重跑标注集验证，不能拍脑袋切换。

**落地示例**：归一化 + 统一度量入口（Node.js + TS）：

```typescript
// 所有向量入库前归一化，全库统一用点积
export function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // 归一化后：等价于余弦相似度
}
```

归一化放在**入库管道**与**查询路径**两处同时做，且在向量库 schema 上声明 metric 为内积——三层对齐，杜绝「本地算的分和库里算的对不上」。

## 三、用数据选型：评测驱动

**MTEB** /ˌem tiː iː ˈbiː/ （Massive Text Embedding Benchmark，大规模文本嵌入基准）是公榜初筛工具，但它测的是通用分布，**不能替你做决定**——小北的制度条款、表格转写、代码签名，公榜里一个都没有。

正确流程：公榜初筛（锁定 3~5 个候选）→ 自建标注集精测（复用 [01 篇五章](./01-Chunking策略.md) 的「问题 → 期望块」标注集）→ 按效果、延迟、价格三方定夺。

**落地示例**：候选模型横评脚本（Node.js + TS）：

```typescript
interface Candidate { name: string; embed: EmbedFn; pricePerMTok: number; }

export async function benchmarkEmbedders(
  cases: EvalCase[], candidates: Candidate[],
  searchFactory: (e: EmbedFn) => (q: string) => Promise<{ chunkId: string }[]>,
): Promise<void> {
  for (const c of candidates) {
    const t0 = performance.now();
    const hit5 = await hitAtK(cases, searchFactory(c.embed)); // 复用 01 篇五章脚本
    const latency = (performance.now() - t0) / cases.length;
    console.log(
      `${c.name}: hit@5=${(hit5 * 100).toFixed(1)}% ` +
      `p50=${latency.toFixed(0)}ms ¥${c.pricePerMTok}/Mtok`,
    );
  }
}
```

小北的真实横评结果（300 万块语料、150 条标注集）：

| 候选 | hit@5 | 查询 p50 延迟 | 价格 | 结论 |
|------|-------|--------------|------|------|
| 通用单语 A（1536 维） | 84.7% | 38ms | ¥0.3/M | 英文文档块召回差，淘汰 |
| 多语言 B（1024 维） | 86.2% | 31ms | ¥0.5/M | 三语种均衡，**胜出** |
| 领域代码 C（768 维） | 82.1% | 22ms | 自托管 | 制度场景掉分明显，仅代码子库用 |

结论落成**分库分模型**：制度/文档库用多语言 B，代码库用 C——同一应用多个向量集合，查询时按路由分发（路由实现见 [03 篇](./03-查询改写与HyDE.md)）。

## 四、换模型的迁移成本

**换 embedding = 全量重嵌 + 全量重建索引**。向量空间随模型改变，新旧向量混存毫无意义；维度变了连存储 schema 都要动。这是选型时最该想清楚的沉没成本——**选型错误的纠错代价 ≈ 全量重做一次嵌入管道**。

### 4.1 成本估算公式

```
迁移成本 ≈ 语料块数 × (嵌入单价 × 平均块长)   ← 直接费用
        + 语料块数 ÷ 吞吐速率                  ← 时长（决定灰度窗口）
        + 索引重建时间                          ← 向量库侧停写窗口
```

小北的真实数字：30 万块（制度 6 万 + 文档 9 万 + 代码 15 万），平均块长 300 token：

- 直接费用：30 万 × 300 token × ¥0.5/M ≈ ¥45，便宜到可以忽略；
- 真正的瓶颈是**时间与验证**：批量嵌入吞吐 200 块/秒 → 25 分钟跑完；但重跑 150 条标注集回归 + 双版本影子比对要 2 天；
- 结论：**小库换模型是周末任务，大库换模型是季度项目**——预算里时间成本远大于 API 费用。

### 4.2 双版本影子运行

换模型禁止一刀切换流量。标准做法：新旧两套索引并行，同一查询双打分，观察 1~2 周再切：

**落地示例**：影子比对打分（Node.js + TS）：

```typescript
interface DualHit { oldRank: number; newRank: number } // 期望块的排名，0=未进 top-k

// 影子期统计：新模型在多少查询上不劣于旧模型
export function shadowReport(hits: DualHit[], tolerance = 0): {
  winRate: number; regressions: number;
} {
  let win = 0, reg = 0;
  for (const h of hits) {
    if (h.newRank === 0) { reg++; continue; }        // 新模型直接丢块，最严重
    if (h.oldRank === 0 || h.newRank <= h.oldRank + tolerance) win++;
  }
  return { winRate: win / hits.length, regressions: reg };
}
// 切流门槛：winRate ≥ 97% 且无「期望块整组丢失」的查询 → 开始灰度
```

## 五、端到端落地示例：四周迭代

把「小北」的 embedding 选型与切换排进四周（1 算法 + 1 工程）：

| 周 | 动作 | 产出 | 指标 |
|----|------|------|------|
| W1 | 公榜初筛 5 个候选 → 沿用 01 篇 150 条标注集横评 | 横评报告（效果/延迟/价格三列） | 基线 hit@5 = 81% |
| W2 | 采购定版（文档库 B + 代码库 C）→ 离线全量重嵌 30 万块 → 重建索引 | 双版本索引并行 | 新库 hit@5 = 86.2% |
| W3 | 影子运行：双版本双打分，日对账 winRate 与回归数 | 影子报告 | winRate 97.8%，0 组丢失 |
| W4 | 灰度切流 20% → 50% → 全量；旧索引保留 30 天回滚垫 | v2 全量上线 | hit@5 = 86.2%（线上实测 85.4%） |

工具速查：

| 环节 | 工具 | 备注 |
|------|------|------|
| 公榜初筛 | MTEB 排行榜 | 只做初筛，不替代自建评测 |
| 自托管嵌入 | sentence-transformers、BGE / GTE 系列 | 多语言开源首选，GPU 批量跑 |
| API 嵌入 | OpenAI / 智谱 / 通义协议 | 注意批接口限流与重试 |
| 影子比对 | 自写 TS 脚本 + 定时对账 | 比对逻辑百行内，勿上重框架 |

## 自检清单

- [ ] 文档与查询使用同一 embedding 模型，且有版本字段随块入库；
- [ ] 全库向量已归一化，度量统一为内积；
- [ ] 选型经自建标注集评测，公榜分数仅作初筛；
- [ ] 多语言 / 代码场景已验证跨语言召回，必要时分库分模型；
- [ ] 有换模型 runbook：成本估算、影子比对、灰度切流、回滚预案。

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **BERT** | /ˈbɜːrt/ | Bidirectional Encoder Representations from Transformers | 双向编码器表示 |
| **GB** | /ˌɡɪɡəˈbaɪt/ | Gigabyte | 吉字节 |
| **HNSW** | /ˈeɪ en ˈes ˈdʌbljuː/ | Hierarchical Navigable Small World | 分层可导航小世界图 |
| **MRR** | /ˌem ɑːr ˈɑːr/ | Mean Reciprocal Rank | 平均倒数排名 |
| **MTEB** | /ˌem tiː iː ˈbiː/ | Massive Text Embedding Benchmark | 大规模文本嵌入基准 |

## 参考资料

- [MTEB: Massive Text Embedding Benchmark](https://arxiv.org/abs/2210.07316)（Muennighoff 等，2022）
- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147)（Kusupati 等，2022，可截断嵌入）
- [BGE-M3 多语言嵌入模型](https://arxiv.org/abs/2402.03216)（Chen 等，2024）
- [Embedding 与表示 · 本仓库](../../AI知识库/06-大语言模型LLM/03-Embedding与表示.md)
