# Chunking 策略

> 状态：✅ 已补齐（2026-09-12）  
> 一句话定义：把文档切成适合嵌入与检索的块；切法决定召回质量上限。

## 大纲

1. [为什么切分决定召回上限](#一为什么切分决定召回上限)
2. [切分策略谱系](#二切分策略谱系固定语义结构感知)
3. [overlap、父子块与小块检索大块生成](#三overlap父子块与小块检索大块生成)
4. [特殊内容处理：代码、表格与多模态](#四特殊内容处理代码表格与多模态)
5. [评测切分质量的方法](#五评测切分质量的方法)
6. [端到端落地示例：四周迭代](#六端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [RAG 核心概念](../../Agent开发知识/07-RAG与知识集成/02-RAG%20核心概念与原理：Chunking、Embedding、相似度、HNSW%20与多路召回.md)
- [RAG 工程化](../../Agent开发知识/13-进阶与工程化/07-RAG工程化与GraphRAG.md)
- [RAG 检索增强生成](../../AI知识库/09-RAG与上下文/01-RAG检索增强生成.md)

## 学习要点（读后应能回答）

- 代码库与制度文档切法有何不同？→ 见 [2.4](#二切分策略谱系固定语义结构感知) 与 [4.1](#四特殊内容处理代码表格与多模态)
- 切太碎 / 切太大的失败症状是什么？→ 见 [1.2](#12-失败症状诊断表) 与 [五](#五评测切分质量的方法)

---

## 一、为什么切分决定召回上限

**Chunking** /ˈtʃʌŋkɪŋ/ （Chunking，分块）是 **RAG** /ˌɑːr eɪ ˈdʒiː/ （ **Retrieval-Augmented Generation** /rɪˈtriːvl ˈɔːɡmentɪd ˌdʒenəˈreɪʃn/ ，检索增强生成）流程里最便宜的环节，却决定召回上限：向量检索比对的是「问题向量」与「块向量」的相似度，块怎么切，语义就怎么「糊」或「散」。

- **块太大**：一块里混了多个主题，向量变成「平均语义」。用户问其中一个主题时，相似度被稀释，该块排不到前排；即使召回，也塞进大量无关上下文，浪费 **token** /ˈtoʊkən/ （token，词元）且引入噪声；
- **块太小**：一条完整论述被拦腰切断，召回回来的块缺主语、缺条件、缺步骤，答案无据可依； **top-k** /tɒp keɪ/ （top-k，前 k 名）召回名额被同一主题的碎片占满。

### 1.1 贯穿案例：企业知识助手「小北」

后续所有示例都基于这个虚构但真实感足够的场景：

| 项 | 设定 |
|----|------|
| 业务 | 公司内部助手：制度问答（人事 / 财务 / IT）+ 技术文档问答 + 代码库问答 |
| 知识库 | 制度 **PDF** /ˌpiː diː ˈef/ （Portable Document Format，便携文档格式）800 篇（平均 15 页）；技术文档 3000 篇（ **Markdown** /ˈmɑːrkdaʊn/ ）；代码仓库 40 个（TypeScript 为主） |
| 现状 | v1 一刀切：所有内容统一按 512 token 切块，20 **overlap** /ˌoʊvərˈlæp/ （overlap，块间重叠），无差别入库 |
| 症状 | 「病假怎么请」召回的是年假条款；代码问题返回半个函数；答案常引用错误条款 |
| 目标 | 4 周内检索 **hit@5** /hɪt æt faɪv/ （hit@5，前 5 名命中率）从 62% 提到 80%+ |

### 1.2 失败症状诊断表

这是文首第二个学习问题的速查答案——先看症状，再定位切法：

| 症状 | 典型表现 | 根因 | 处方 |
|------|----------|------|------|
| 切太大 | 召回块里只有 1/3 内容与问题相关；答案被无关段落带偏；长文档召回率普遍低 | 语义稀释，向量「平均化」 | 改小粒度 / 递归 / 语义切分 |
| 切太小 | 召回的块互相割裂：「第 3 步」单独出现却没有第 1、2 步；同一问题 top-5 全是同一文档的碎片 | 上下文不足，一条论述被切断 | overlap / 父子块（见三） |
| 边界截断 | 答案停在半句；表格只剩表头；代码函数缺 return | 固定长度在任意位置下刀 | 结构感知切分（见 2.4） |
| 张冠李戴 | 问 A 条款召回 B 条款，且两条款常在同一块 | 相邻主题被合并成一块 | 按标题树切分，块内只留单主题 |

**落地示例**：同一个制度 PDF，两种切法的对比。原文（节选，真实样貌）：

```markdown
### 第三章 考勤与休假
#### 3.1 年假
员工累计工作满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的，10 天……
#### 3.2 病假
病假需三甲医院开具证明，单次不超过 30 天，病假期间按基本工资的 60% 发放……
```

- v1 按 512 token 固定切：「3.1 年假」与「3.2 病假」落在同一块 → 问「病假期间工资怎么算」，这块的向量被年假内容稀释，排在第 7 位，没进 top-5 → 用户拿到的是年假答案；
- 按标题树切分：「3.2 病假」独立成块 → 命中第 1 位。

### 1.3 工程要点

- **切分是内容类型问题，不是超参问题**：先问「这是什么文档」（条款 / 教程 / 代码 / 表格），再选切法；直接网格搜索 `chunk_size` 是在错误的抽象层上努力；
- **块要自带上下文**：切完后每块补上文档标题 + 章节路径（面包屑），否则「第三步」这样的块永远无法被正确检索；
- **切分粒度与下游生成对齐**：检索粒度 ≠ 生成粒度，两者解耦是本文第三章的核心。

## 二、切分策略谱系（固定 / 语义 / 结构感知）

### 2.1 固定长度切分（fixed-size）

最简单的 baseline：按 token 数切块，可加 overlap。优点是可预测、实现快；缺点是无视语义边界。适用：内容同质、句子长度均匀的文本（如客服话术库）。

**落地示例**：固定长度 + 重叠切块（Node.js + TS）：

```typescript
interface Chunk {
  id: string;
  text: string;
  startToken: number; // 在原文中的位置，便于回溯引用
}

// 固定长度切分：size 为块长，overlap 为相邻块重叠
export function fixedSplit(text: string, size: number, overlap: number): Chunk[] {
  const step = size - overlap;
  const chunks: Chunk[] = [];
  for (let i = 0, n = 0; i < text.length; i += step, n++) {
    chunks.push({ id: `c-${n}`, text: text.slice(i, i + size), startToken: i });
    if (i + size >= text.length) break; // 尾块不足 size 也保留
  }
  return chunks;
}

// 后文多处复用的别名：按长度切文本，作为通用辅助函数
export const splitBySize = fixedSplit;
```

### 2.2 递归字符切分（recursive）

LangChain `RecursiveCharacterTextSplitter` 的思路：按分隔符优先级层层下刀——先试段落 `\n\n`，切不开再试句子 `。`，最后才按字符。让块边界尽量落在自然边界上。

**落地示例**：递归切分（Node.js + TS）：

```typescript
const SEPARATORS = ["\n\n", "\n", "。", "；", "，", ""]; // 优先级从段落到字符

export function recursiveSplit(
  text: string,
  size: number,
  seps: string[] = SEPARATORS,
): string[] {
  const [sep, ...rest] = seps;
  if (sep === "" || text.length <= size) return [text];
  const parts = text.split(sep);
  const chunks: string[] = [];
  let buf = "";
  for (const p of parts) {
    const candidate = buf ? buf + sep + p : p;
    if (candidate.length > size) {
      if (buf) chunks.push(buf);          // 当前缓冲区成块
      chunks.push(...recursiveSplit(p, size, rest)); // 超长部分降级到下一级分隔符
      buf = "";
    } else {
      buf = candidate;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
```

### 2.3 语义切分（semantic）

用 **embedding** /ɪmˈbedɪŋ/ （embedding，向量嵌入）度量相邻句子的语义相似度，在「相似度骤降谷点」下刀——主题切换处正是切分点。适合没有结构标记的长文（会议记录、书籍章节）。

**落地示例**：谷点检测切分（Node.js + TS）：

```typescript
interface EmbedFn {
  (text: string): Promise<number[]>;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// 相邻句组向量相似度低于均值 - k*标准差 处即为切分点
export async function semanticSplit(
  sentences: string[], embed: EmbedFn, k = 1.0,
): Promise<string[]> {
  const vecs = await Promise.all(sentences.map(embed));
  const sims = vecs.slice(1).map((v, i) => cosine(vecs[i], v));
  const mean = sims.reduce((s, x) => s + x, 0) / sims.length;
  const std = Math.sqrt(sims.reduce((s, x) => s + (x - mean) ** 2, 0) / sims.length);
  const chunks: string[] = [];
  let buf: string[] = [];
  sentences.forEach((s, i) => {
    buf.push(s);
    // 句 i 与句 i+1 之间出现谷点 → 在此断开
    if (i < sims.length && sims[i] < mean - k * std && buf.length >= 2) {
      chunks.push(buf.join("")); buf = [];
    }
  });
  if (buf.length) chunks.push(buf.join(""));
  return chunks;
}
```

小北实测：800 篇制度 PDF 用语义切分，单篇切块数比固定 512 token 少 35%，但 hit@5 只从 62% 升到 68%——**制度文档有天然结构（章节标题），语义切分是花力气重造标题树**。这引出 2.4。

### 2.4 结构感知切分（structure-aware）

有结构用结构，别重新发明：Markdown 按 `#` 标题树切，HTML 按 `h1~h6` + 块级标签切，代码按函数 / 类切（见 4.1），表格整块保留（见 4.2）。切完给每块拼上面包屑前缀：

**落地示例**：按 Markdown 标题树切分 + 面包屑前缀（Node.js + TS）：

```typescript
interface Node2 { level: number; title: string; body: string; children: Node2[] }

// 把「3.2 病假」一节的正文切成块，每块前面带上标题路径
export function markdownBreadcrumbs(root: Node2): string[] {
  const out: string[] = [];
  function walk(n: Node2, path: string[]): void {
    const p = [...path, n.title];
    for (const seg of splitBySize(n.body, 400)) { // 正文超长再二次切
      out.push(`【${p.join(" > ")}】\n${seg}`); // 前缀同时改善 embedding 与生成引用
    }
    n.children.forEach((c) => walk(c, p));
  }
  walk(root, []);
  return out;
}
```

**代码库与制度文档的切法对比**（文首第一个学习问题的核心答案）：

| 维度 | 制度文档（条款型） | 代码库 |
|------|--------------------|--------|
| 天然结构 | 标题树、条款编号 | 函数 / 类 / 文件边界 |
| 切分单位 | 一条条款（约 100~300 字），宁小勿大 | 一个完整函数 / 类，宁大勿碎 |
| 前缀 | 标题路径 + 生效日期 | 文件路径 + 符号签名（`export function refund(days: number)`） |
| 边缘情况 | 附则、附录单独成块 | 配置 / 常量聚合一块；测试代码降权或排除 |
| 绝对禁止 | 跨条款合并 | 函数内部任意截断 |

## 三、overlap、父子块与小块检索大块生成

### 3.1 overlap（重叠）

相邻块共享一段文本，作用是「别把一句话从中间切断后丢两边」。要点：

- 经验值：overlap 取块长的 10%~20%（512 块配 50~100）；
- 代价：索引体积膨胀约 15%，且同一句话可能命中多个块、重复召回占用 top-k 名额——召回后按 `docId` 去重合并；
- 结构感知切分到位后，overlap 的边际收益骤降：小北把制度文档改为标题树切分后，overlap 从 50 降到 0，hit@5 无回退。

### 3.2 父子块：小块检索，大块生成

**父子块**（Parent-Child，亦称 small-to-big）是切分粒度与生成粒度的解耦：入库时建立两级索引——子块（约 1~2 句）用于精准检索，命中后返回其父块（完整章节 / 完整函数）给模型生成。检索要「准」，生成要「全」，一块两吃。

**落地示例**：父子块索引与召回（Node.js + TS）：

```typescript
interface ParentChunk { id: string; text: string; }
interface ChildChunk  { id: string; parentId: string; text: string; }

// 建索引：父块按章节，子块按句子组
export function buildHierarchy(doc: string): { parents: ParentChunk[]; children: ChildChunk[] } {
  const parents: ParentChunk[] = splitBySize(doc, 1200).map((t, i) => ({ id: `p-${i}`, text: t }));
  const children: ChildChunk[] = parents.flatMap((p) =>
    splitBySize(p.text, 200).map((t, j) => ({ id: `${p.id}-c-${j}`, parentId: p.id, text: t })),
  );
  return { parents, children };
}

// 检索用子块向量，返回父块去重后的结果
export function retrieve(
  children: ChildChunk[], parents: ParentChunk[],
  topKChildHits: { childId: string }[], maxParents = 4,
): ParentChunk[] {
  const seen = new Set<string>();
  const result: ParentChunk[] = [];
  for (const hit of topKChildHits) {
    const c = children.find((x) => x.id === hit.childId)!;
    if (seen.has(c.parentId)) continue; // 多个子块命中同一父块，只返回一次
    seen.add(c.parentId);
    const parent = parents.find((p) => p.id === c.parentId)!;
    result.push(parent);
    if (result.length >= maxParents) break;
  }
  return result;
}
```

小北的真实数字：子块 200 token 检索 + 父块 1200 token 生成，hit@5 从 68%（单层 512）升到 76%，同时生成上下文条数从 5 降到 3——更准且更省。开源实现：LlamaIndex `SentenceWindowNodeParser`、LangChain `ParentDocumentRetriever`。

### 3.3 选型速查

| 手段 | 适用 | 不适用 |
|------|------|--------|
| overlap | 无结构文本兜底 | 已按结构切分的内容 |
| 父子块 | 长文档、条款、教程 | 本身极短的 FAQ（直接整条入库） |
| 句子窗口 | 需要逐句引用溯源的场景 | 篇幅紧张、上下文窗口稀缺时 |

## 四、特殊内容处理：代码、表格与多模态

### 4.1 代码切分

代码的检索单元是「符号」，不是行数：

- 按 **AST** /ˌeɪ es ˈtiː/ （ **Abstract Syntax Tree** /ˈæbstrækt ˈsɪntæks triː/ ，抽象语法树）边界切：一个函数 / 一个类一块，绝不从函数中间下刀；
- 每块头部拼接「文件路径 + 签名」前缀，例如 `src/billing/refund.ts // export function calcRefund(order: Order): number`——embedding 时文件路径与函数名本身就是强检索信号；
- import 语句块单独入库或拼进首块：用户常问「refund 依赖哪些模块」；
- 过长函数（> 800 token）按逻辑段（参数校验 / 核心逻辑 / 错误处理）二次切，子块仍带函数签名前缀。

**落地示例**：用 ts-morph 按函数边界切块（Node.js + TS）：

```typescript
import { Project, SyntaxKind } from "ts-morph";

interface CodeChunk { filePath: string; symbol: string; code: string; }

export function splitTsBySymbol(code: string, filePath: string): CodeChunk[] {
  const sf = new Project({ useInMemoryFileSystem: true })
    .createSourceFile(filePath, code);
  const fns = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .concat(sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration));
  return fns.map((f) => ({
    filePath,
    symbol: f.getName() ?? "<anonymous>",
    code: f.getText(), // 完整函数体，含签名与注释
  }));
}
```

### 4.2 表格

表格是「行 ≠ 独立语义」的典型：表头定义列含义，单独拿走一行就失去意义。规则：

1. **整表一块**，绝不按行切；
2. 表格上方/下方的说明文字拼进同一块（表题常含检索关键词）；
3. 宽表（列 > 10）补一段「转写文本」：把每行改写成自然语言句子一并入库，因为 embedding 对表格结构的编码远弱于散文；
4. 检索命中表格块时，生成端按 Markdown 表格原样喂给模型。

**落地示例**：一张报销标准的表格，转写后的入库形态：

```markdown
【财务制度 > 差旅费 > 住宿标准】
表格：城市 × 职级 × 住宿限额
| 城市 | 总监及以下 | 总监以上 |
| 北京 | 600 元/晚 | 900 元/晚 |
| 其他 | 400 元/晚 | 700 元/晚 |
转写：北京地区总监及以下职级住宿限额为每晚 600 元，总监以上为每晚 900 元；
其他城市总监及以下为每晚 400 元，总监以上为每晚 700 元。
```

「转写」这段看似重复，实际把「北京 住宿 报销 多少钱」这类口语问法的召回率从 54% 拉到 88%——**表格问题 80% 输在问法与表结构不匹配，转写是最便宜的解法**。

### 4.3 多模态（图片与扫描件）

- 扫描版 PDF：先 **OCR** /ˌoʊ siː ˈɑːr/ （ **Optical Character Recognition** /ˈɒptɪkl ˌkærəktə ˌrekəɡˈnɪʃn/ ，光学字符识别）转文本再走常规切分；小北 800 篇制度 PDF 里有 120 篇是扫描件，漏掉它们 = 制度问答天花板只有 85%；
- 流程图 / 架构图：用多模态模型生成图片描述（caption）入库，描述中强制带上图内文字（节点名、箭头标注）；
- 图片本身不入向量库，只在父块中留引用链接，生成时按需注入。

## 五、评测切分质量的方法

切分没有独立于下游的「好」——**切分质量只能通过检索质量度量**。三个层次：

### 5.1 指标分层

| 层次 | 指标 | 回答的问题 |
|------|------|------------|
| 检索层 | **hit@k** /hɪt æt keɪ/ （前 k 个结果中含正确文档的比例）、 **MRR** /ˌem ɑːr ˈɑːr/ （ **Mean Reciprocal Rank** /miːn rɪˈsɪprəkl ræŋk/ ，平均倒数排名）、 **nDCG** /ˌen diː siː ˈdʒiː/ （normalized Discounted Cumulative Gain，归一化折损累计增益） | 正确的块排进前几名了吗 |
| 生成层 | 忠实度（答案是否被召回内容支撑）、引用正确率 | 答案引用的是召回的那块吗 |
| 业务层 | 用户点踩率、转人工率 | 用户买账吗 |

### 5.2 评测集与实验方法

1. 构造小型标注集：50~200 条「问题 → 应命中的块/文档」配对，覆盖每种内容类型（条款 / 表格 / 代码各 ≥ 20 条）；
2. 每次改切分参数，重跑检索指标，与上一版对比；
3. 先修「错误归因」再调参：用 1.2 的症状表给 **bad case** /bæd keɪs/ （bad case，坏例）分类，哪种症状多就改哪个参数——切分调参不是玄学网格搜索，是症状驱动的。

**落地示例**：hit@5 评测脚本（Node.js + TS）：

```typescript
interface EvalCase { question: string; expectedChunkIds: string[]; }

// top-k 里出现任一期望块即算命中
export async function hitAtK(
  cases: EvalCase[],
  search: (q: string) => Promise<{ chunkId: string }[]>,
  k = 5,
): Promise<number> {
  let hits = 0;
  for (const c of cases) {
    const top = (await search(c.question)).slice(0, k).map((r) => r.chunkId);
    if (c.expectedChunkIds.some((id) => top.includes(id))) hits++;
  }
  return hits / cases.length;
}
```

工具上不自研： **Ragas** /ˈrɑːɡɑːs/ 开源框架内置 context precision / recall 指标， **promptfoo** 支持把标注集变成回归用例接 CI——每次改切分配置自动跑一遍，指标回退超噪声带就告警。

## 六、端到端落地示例：四周迭代

把「小北」从 62% hit@5 推到 80%+ 的四周排期（1 算法 + 1 工程）：

| 周 | 动作 | 产出 | 指标变化 |
|----|------|------|----------|
| W1 | 抽 500 条线上 bad case 按 1.2 症状表归因：切太大 38%、边界截断 27%、碎片化 21%、其他 14% | bad case 归因报告 | 基线 hit@5 = 62% |
| W2 | 分内容类型重切：制度 → 标题树 + 面包屑；代码 → AST；表格 → 整表 + 转写；扫描件 OCR 补齐 | 新版索引 v2 | hit@5 = 74% |
| W3 | 父子块上线（子 200 / 父 1200）；FAQ 类短文档整条入库；overlap 归零 | 两级索引 | hit@5 = 79% |
| W4 | 标注集扩到 150 条接 CI 回归；生成端按召回块引用溯源；灰度 20% 流量 | v2 灰度上线 | hit@5 = 81%，点踩率 9.2% → 5.8% |

工具栈速查（全部有开源实现）：

| 环节 | 工具 | 备注 |
|------|------|------|
| 通用切分 | LangChain TextSplitter、LlamaIndex NodeParser | 固定 / 递归 / 语义开箱即用 |
| 代码 AST | ts-morph（TS）、tree-sitter（多语言） | 按符号边界切块 |
| 表格解析 | pdfplumber、Unstructured | PDF 表格还原 |
| OCR | PaddleOCR、Tesseract | 扫描件文本化 |
| 评测回归 | Ragas、promptfoo | 接 CI，指标回退告警 |

四周之后的常态：**切分配置与索引版本绑定**——知识库内容更新走增量重切，切分代码变更必须全量重建索引并跑回归，禁止「只换切法不换索引」的混部。

## 自检清单

- [ ] 切分策略按内容类型区分，而非全局统一 `chunk_size`；
- [ ] 每个块带面包屑前缀（文档标题 + 章节路径 / 文件路径 + 符号签名）；
- [ ] 表格整块保留且有转写文本；代码按符号边界切，无函数内截断；
- [ ] 长文档已启用父子块，检索与生成粒度解耦；
- [ ] 有 50+ 条「问题 → 期望块」标注集，切分变更跑 hit@k 回归；
- [ ] 扫描件已 OCR，图片已有 caption 入库。

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **AST** | /ˌeɪ es ˈtiː/ | Abstract Syntax Tree | 抽象语法树 |
| **MRR** | /ˌem ɑːr ˈɑːr/ | Mean Reciprocal Rank | 平均倒数排名 |
| **nDCG** | /ˌen diː siː ˈdʒiː/ | normalized Discounted Cumulative Gain | 归一化折损累计增益 |
| **OCR** | /ˌoʊ siː ˈɑːr/ | Optical Character Recognition | 光学字符识别 |
| **PDF** | /ˌpiː diː ˈef/ | Portable Document Format | 便携文档格式 |
| **RAG** | /ˌɑːr eɪ ˈdʒiː/ | Retrieval-Augmented Generation | 检索增强生成 |

## 参考资料

- [Dense X Retrieval: What Retrieval Granularity Should We Use?](https://arxiv.org/abs/2312.06648)（Chen 等，2023，检索粒度：命题级 vs 段落级）
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)（Liu 等，2023，长上下文中间信息丢失，约束父子块父块长度）
- [LangChain Text splitters 文档](https://python.langchain.com/docs/concepts/text_splitters/)
- [LlamaIndex Node Parsers / Text Splitters](https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/)
- [RAG 核心概念 · 本仓库](../../Agent开发知识/07-RAG与知识集成/02-RAG%20核心概念与原理：Chunking、Embedding、相似度、HNSW%20与多路召回.md)
