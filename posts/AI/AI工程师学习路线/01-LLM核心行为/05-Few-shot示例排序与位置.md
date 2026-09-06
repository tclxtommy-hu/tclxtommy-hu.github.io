# Few-shot 示例排序与位置

> 状态：✅ 已补齐（2026-09-06）  
> 一句话定义：少样本（ **Few-shot** /ˈfjuː ʃɒt/ ，少样本）示例的 **内容、顺序、位置** 会显著改变模型行为；示例不是「越多越好」的装饰品，它是提示词里权重最高、也最容易写坏的一段。

## 大纲

1. [Zero / One / Few-shot 的适用边界](#一zero--one--few-shot-的适用边界)
2. [示例质量：四条硬标准](#二示例质量四条硬标准)
3. [排序：顺序本身就是提示的一部分](#三排序顺序本身就是提示的一部分)
4. [位置：示例该放在提示词的哪一段](#四位置示例该放在提示词的哪一段)
5. [动态选例：从「手写 12 条」到「示例库检索」](#五动态选例从手写-12-条到示例库检索)
6. [成本：示例 token 与收益的权衡](#六成本示例-token-与收益的权衡)
7. [评测与回归：few-shot 怎么测、怎么守](#七评测与回归few-shot-怎么测怎么守)

## 已有相关文档（先读这些）

- [提示工程基础](../../AI知识库/08-提示工程/01-提示工程基础.md)（四要素与 Few-shot 的最小写法）
- [高级提示技术](../../AI知识库/08-提示工程/02-高级提示技术.md)（ **CoT** /ˌsiː əʊ ˈtiː/ （ **Chain-of-Thought** ，思维链）与自洽）
- [Lost in the Middle 与位置偏见](01-Lost-in-the-Middle与位置偏见.md)（第三个机制的出处）
- [结构化输出](04-结构化输出.md)（示例里示范的格式，最终要靠 schema 兜底）
- [消息角色与提示结构](02-消息角色与提示结构.md)（system / user / assistant 怎么承载示例）
- [数据飞轮与合成数据](../07-前沿与形态/05-数据飞轮与合成数据.md)（示例库的另一半：把坏例变成示例）
- [Rerank 与混合检索](../03-检索与知识/04-Rerank与混合检索.md)（动态选例的检索侧技术来源）

## 学习要点（读后应能回答）

- 示例应该示范「格式」还是「推理」？→ 见 [2.2](#22-格式示范-vs-推理示范)
- 示例顺序为什么会影响结果？→ 见 [3.1](#31-三条机制为什么顺序会改结果)
- 示例放 system 还是 user？能不能用假多轮？→ 见 [4.1](#41-四种承载方式实测对比)
- 示例库如何维护与评测？→ 见 [5.4](#54-示例库怎么维护与评测)
- 示例越多越好吗？多少条才值？→ 见 [6.3](#63-边际收益曲线几条之后就不值了)

---

## 〇、贯穿案例：小智的意图路由

与 [《结构化输出》](04-结构化输出.md)、[《幻觉机理与缓解》](03-幻觉机理与缓解.md) 同一个虚构业务：电商客服「小智」，日均 2 万次请求。每次请求的第一步是 **意图路由** ——把用户消息分到 8 个类目之一，再交给下游节点：

```text
refund(退款) / exchange(换货) / repair(维修) / logistics(物流)
invoice(发票) / consult(咨询) / complaint(投诉) / other(其他)
```

v1 的实现：提示词里手写 12 条示例，「想到哪写到哪」，示例顺序从未被当作一个需要设计的变量。上线第四周，算法同学丢过来一张表：

| 指标 | v1 数值 | 问题在哪 |
|------|---------|----------|
| macro-F1（500 条黄金集） | 0.712 | 整体一般 |
| `exchange` 类 F1 | **0.41** | 12 条示例里 exchange 只有 1 条，refund 却有 5 条 |
| 格式不合规率 | 4.8% | 3 条示例用了不同引号风格、2 条缺字段 |
| 单次输入 token | 2,280（指令 420 + 示例 1,860） | 月输入成本约 $410 |
| 20 次随机打乱示例顺序后的 F1 标准差 | **0.031** | 最好 0.754、最差 0.669， **极差 8.5pp** |

最后一行是本文的立论证据： **同样的 12 条示例，换个顺序，模型的能力差了 8.5 个百分点** ——这个幅度，往往比你换一次模型的收益还大，而它完全是免费的。

本文所有方法、代码、排期都围绕把这张表修到 v1.3 展开（最终：macro-F1 0.794、格式不合规 0.4%、月成本 $40）。

---

## 一、Zero / One / Few-shot 的适用边界

### 1.1 什么时候该给示例：一张决策表

**Zero-shot** /ˈzɪərəʊ ʃɒt/ （零样本）、 **One-shot** /wʌn ʃɒt/ （单样本）、 **Few-shot** 不是「初级 → 高级」的进阶关系，而是三种不同成本结构的方案。选哪个，取决于 **任务的不确定性藏在哪** ：

| 任务特征 | 推荐 | 理由 |
|----------|------|------|
| 通用能力 + 常规输出格式（翻译、摘要、通用分类） | Zero-shot + 明确格式 | 强模型的指令跟随已足够，示例纯浪费 token |
| 输出格式非常规（内部 schema、行业标签体系） | Few-shot ≥ 2 | 一个示例抵得上 300 字格式描述 |
| 标签边界微妙、靠自然语言说不清 | Few-shot + 反例 | 「这算换货还是维修」用示例比用定义清楚 |
| 需要输出推理过程 | One-shot CoT 示范 | 示范「怎么想」而不是「答成什么样」 |
| 类目多（>10）且分布不均 | 动态选例 + 标签配额 | 手写示例必然偏斜 |
| 任务规则每周变 | 别用静态示例 | 示例库维护成本高于收益，考虑微调或规则 |
| 强推理模型 + 长推理 | 少给或不给 | 示例会把模型锁进「短答模式」，见 1.3 |

### 1.2 落地示例：同一任务的四种写法与实测

小智的意图路由，输出要求是一个 **JSON** /ˈdʒeɪsən/ （ **JavaScript Object Notation** ，轻量级数据交换格式）对象。四种写法在 500 条黄金集上的实测（同一模型、温度 0）：

| 写法 | macro-F1 | 格式不合规率 | 输入 token/次 | 月成本 |
|------|:---:|:---:|:---:|:---:|
| Zero-shot（纯描述 + JSON 要求） | 0.681 | 9.6% | 420 | $76 |
| One-shot | 0.703 | 3.1% | 575 | $104 |
| Few-shot k=5（均衡 + 排序 + 统一格式） | **0.781** | 0.6% | 1,195 | $215 |
| Few-shot k=12（手写乱序，v1 现状） | 0.712 | 4.8% | 2,280 | $410 |

**这张表最该记住的一行是最后一行** ：示例从 5 条加到 12 条，token 翻倍，F1 反而从 0.781 掉到 0.712。多出来的 7 条示例没有提供新信息，只提供了 **噪声、偏斜的标签分布和更长的中间带** 。

最小可运行对比（Node.js + **TS** /ˌtiː ˈes/ （TypeScript，本仓库主示例语言））：

```typescript
import OpenAI from "openai";

const client = new OpenAI();

const LABELS = ["refund", "exchange", "repair", "logistics", "invoice", "consult", "complaint", "other"] as const;
type Label = (typeof LABELS)[number];

interface Shot {
  input: string;
  label: Label;
}

const INSTRUCTION = `你是意图分类器。只输出一个 JSON：{"intent": <标签>, "reason": <不超过 15 字>}。
标签只能取自：${LABELS.join(" / ")}。判断依据只使用示例与定义，不要推测订单号、金额。`;

// 三种写法的 messages 构造器，共用同一个 classify 入口，便于 A/B
function buildZeroShot(text: string): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: INSTRUCTION },
    { role: "user", content: text },
  ];
}

function buildOneShot(text: string, pool: Shot[]): OpenAI.ChatCompletionMessageParam[] {
  const s = pool[0];
  return [
    { role: "system", content: INSTRUCTION },
    {
      role: "user",
      content: [
        "## 示例",
        `输入：${s.input}`,
        `输出：${JSON.stringify({ intent: s.label, reason: "见示例" })}`,
        "## 待分类",
        `输入：${text}`,
        "输出：",
      ].join("\n"),
    },
  ];
}

function buildFewShot(text: string, shots: Shot[]): OpenAI.ChatCompletionMessageParam[] {
  const block = shots
    .map((s) => `输入：${s.input}\n输出：${JSON.stringify({ intent: s.label, reason: "见示例" })}`)
    .join("\n");
  return [
    { role: "system", content: INSTRUCTION },
    { role: "user", content: `## 示例\n${block}\n\n## 待分类\n输入：${text}\n输出：` },
  ];
}

async function classify(text: string, shots: Shot[]): Promise<Label> {
  const messages = shots.length === 0 ? buildZeroShot(text) : buildFewShot(text, shots);
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,                                   // 分类任务必须确定性，否则 A/B 结果自带噪声
    response_format: { type: "json_object" },
    messages,
  });
  return JSON.parse(resp.choices[0].message.content!).intent as Label;
}
```

### 1.3 Few-shot 反而有害的四种情况

这是「多贴几个例子就好」这句话的错误之处。示例是 **强信号** ，信号错了就是负优化：

1. **示例本身标错或格式不一致** ——模型会忠实复制错误。小智 v1 的 12 条里有 1 条把「换货」标成了「维修」，该错误在 `exchange` 类上的误判占了 23%；
2. **标签分布偏斜** ——示例的标签分布被模型当成 **先验** 。12 条里 5 条 refund，模型就倾向于把所有带情绪的抱怨都判成 refund（见 [3.1](#31-三条机制为什么顺序会改结果) 的多数标签偏见）；
3. **示例锁死输出风格** ——在强推理模型上给「短答示例」，会压制它的推理能力。小智试过在推理型模型上塞 8 条「直接给标签」的示例，长尾类目 F1 反而比 zero-shot 低 4pp；
4. **示例与待判样本高度相似但标签相反** ——模型倾向于 **抄最近邻** 而不是 **学规律** 。这类「看似矛盾」的样本对会显著抬高错误率，处理办法是显式标注区别（见 [2.1](#21-覆盖每类边界反例) 的反例写法）。

---

## 二、示例质量：四条硬标准

### 2.1 覆盖：每类、边界、反例

合格的示例集要覆盖三种样本，缺一不可：

| 类型 | 作用 | 小智的例子 |
|------|------|-----------|
| **典型样本** | 建立「这个类长什么样」的原型 | 「我不想要了，能退货吗」→ `refund` |
| **边界样本** | 划清类目之间的分界 | 「东西坏了，是给我换一个新的还是修？」→ `repair`（不是 exchange） |
| **反例**（ **hard negative** /hɑːd ˈneɡətɪv/ ，难负例） | 明确「长得像但不是」 | 「订单还没发货，能换成别的颜色吗？」→ `exchange`（不是 logistics，虽然提到发货） |

反例必须 **带一句为什么** ，否则模型只看到两个相似输入对应不同标签，学到的是噪声：

```text
输入：订单还没发货，能换成别的颜色吗？
输出：{"intent": "exchange", "reason": "诉求是换规格，发货状态只是背景"}
```

边界与反例的收益可以直接量化：小智给 3 个最容易混的类目（refund / exchange / repair）各补 2 条带理由的反例后，这三个类目的 F1 从 0.52 / 0.41 / 0.63 升到 0.79 / 0.74 / 0.81—— **整个 macro-F1 提升里，有 60% 来自这 6 条** 。

### 2.2 格式示范 vs 推理示范

这是文首第一个学习问题。判据一句话：

> 任务本质是「可枚举的映射」 → 示范格式；任务本质是「多步推理」 → 示范推理（ **CoT** 示范）。

| 维度 | 格式示范 | 推理示范 |
|------|----------|----------|
| 示例内容 | 只给 `输入 → 输出` | 给 `输入 → 推理过程 → 输出` |
| 适用 | 分类、抽取、标签映射、格式转换 | 数学、规则判定、多条件决策、歧义消解 |
| token 成本 | 低（每条约 150） | 高（每条 400~800，输出侧还更长） |
| 主要风险 | 模型学到表面模式，遇长尾崩 | **推理链里的错误会被逐字复制** |

同一个任务（「要不要给退差价」）的两种示例写法对比：

```text
# 写法 A：格式示范（分类/判定类任务的默认选择）
输入：我买完第二天就降价 50 块，能补差价吗？
输出：{"price_protection": true, "window_days": 7}

# 写法 B：推理示范（规则判定类任务才需要）
输入：我买完第二天就降价 50 块，能补差价吗？
推理：价保政策为签收后 7 天内降价可补差。用户「买完第二天」在 7 天窗口内 → 满足。
输出：{"price_protection": true, "window_days": 7}
```

三条实战结论：

1. **不要默认上 CoT 示范** 。小智的意图路由试过 CoT 版示例，macro-F1 只有 +0.006，输出 token 却涨了 3.4 倍——对「映射型」任务，推理链是纯成本；
2. **CoT 示例必须人工审推理链** 。模型会模仿错误的推理路径，而且比错误的答案更隐蔽（答案错你能测出来，推理错但答案对，上线后换个样本就崩）；
3. **格式示范 + 结构化输出成对使用** 。示例负责「让它懂你要什么」，schema 负责「让它不能跑偏」，详见 [《结构化输出》](04-结构化输出.md#13-schema-合法--内容正确一个必踩的坑)。

### 2.3 一致性：模型是字面量的奴隶

示例之间任何不一致，都会被模型当成「这里有区别」来学习：

- **分隔符** ：全部用 `输入：` / `输出：`，不要一条用冒号一条用箭头；
- **字段顺序** ：JSON 示例里字段顺序固定（模型对字段顺序敏感，尤其小模型）；
- **标签字面量** ：必须和指令里的枚举 **逐字符一致** ，`refund` 不能有的地方写成 `Refund`、有的地方写成 `退货`；
- **引号与空格** ：`{"intent": "refund"}` 和 `{intent:refund}` 混用，是格式不合规率的主要来源；
- **理由长度** ：别一条写 5 字、一条写 40 字，模型会学会「随机长度」。

小智 v1 的 4.8% 格式不合规，逐条归因后 **有 3.6pp 来自示例自身不一致** ——统一示例格式（不改任何标签）后直接降到 1.1%。

### 2.4 真实性：别给模型一屋子「干净数据」

手写示例的通病是太干净：语法正确、信息完整、无噪音。真实用户输入是：带错别字、带口语、一句话里塞三个诉求、还夹着上一个问题的残留。

| 示例来源 | macro-F1（真实分布测试集） |
|----------|:---:|
| 12 条全部人工编写的「标准句」 | 0.712 |
| 6 条标准句 + 6 条从线上日志采样的真实句 | **0.758** |

**规则** ：至少一半示例来自 **真实分布的采样** （线上日志、标注数据），人工只做清洗与脱敏，不要重写。合成示例只在真实样本覆盖不到的边界上补（生成与治理见 [《数据飞轮与合成数据》](../07-前沿与形态/05-数据飞轮与合成数据.md)）。

### 2.5 落地示例：示例库的结构化定义与自动校验

示例必须是 **带元数据的结构化资产** ，不是提示词里的一段字符串。一条示例的样子：

```yaml
id: shot-0142
version: v2026.09.1
task: intent_routing
input: "订单还没发货，能换成别的颜色吗？"
output: { "intent": "exchange", "reason": "诉求是换规格，发货状态只是背景" }
label: exchange
kind: hard_negative        # typical | boundary | hard_negative
source: online_log         # manual | online_log | annotated | synthetic
added_at: "2026-08-21"
contribution: 0.004        # 留一法测得的 Δmacro-F1，见 5.4
```

配套的 TS 类型与校验器—— **示例库要像代码一样进 CI** 。 **CI** /ˌsiː ˈaɪ/ （ **Continuous Integration** /kənˈtɪnjuəs ˌɪntɪˈɡreɪʃn/ ，持续集成）意味着示例的任何改动都要过校验，而不是改完提示词就算完：

```typescript
import { z } from "zod";

export const LABELS = ["refund", "exchange", "repair", "logistics", "invoice", "consult", "complaint", "other"] as const;

export const ShotSchema = z.object({
  id: z.string().regex(/^shot-\d{4}$/),
  input: z.string().min(4).max(300),
  output: z.object({
    intent: z.enum(LABELS),                 // ① 字面量必须与指令枚举一致
    reason: z.string().max(24),             // ② 理由长度要限，防止风格漂移
  }),
  label: z.enum(LABELS),
  kind: z.enum(["typical", "boundary", "hard_negative"]),
  source: z.enum(["manual", "online_log", "annotated", "synthetic"]),
  addedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contribution: z.number().optional(),      // 由 5.4 的留一法回填
});

export type Shot = z.infer<typeof ShotSchema> & { output: { intent: string } };

/** 整库校验：结构 + 一致性 + 分布，任何一项不过就让 CI 失败 */
export function lintShotBank(bank: Shot[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  // ① 结构校验
  for (const s of bank) {
    const r = ShotSchema.safeParse(s);
    if (!r.success) problems.push(`${s.id}：结构不合法 ${r.error.message}`);
    // ② 一致性：output.intent 必须与 label 相同（防止标注漂移）
    if (s.output.intent !== s.label) problems.push(`${s.id}：output.intent 与 label 不一致`);
  }

  // ③ 覆盖：每个类目至少 1 条典型样本
  for (const l of LABELS) {
    const n = bank.filter((s) => s.label === l && s.kind === "typical").length;
    if (n === 0) problems.push(`类目 ${l} 缺少典型样本`);
  }

  // ④ 分布：最大类目占比不得超过 30%（防多数标签偏见，见 3.1）
  const counts = LABELS.map((l) => bank.filter((s) => s.label === l).length);
  const maxShare = Math.max(...counts) / bank.length;
  if (maxShare > 0.3) problems.push(`标签分布偏斜：最大类目占比 ${(maxShare * 100).toFixed(1)}% > 30%`);

  // ⑤ 去重：输入文本相似度过高（这里是精确去重，向量去重见 5.3）
  const seen = new Set<string>();
  for (const s of bank) {
    const key = s.input.trim().replace(/\s+/g, "");
    if (seen.has(key)) problems.push(`${s.id}：与已有示例输入重复`);
    seen.add(key);
  }

  return { ok: problems.length === 0, problems };
}
```

小智把 `lintShotBank` 接进 CI 后，第一次跑就报出 7 个问题（2 个类目无典型样本、1 个 `output.intent` 与 `label` 不一致、refund 占比 42%）。

---

## 三、排序：顺序本身就是提示的一部分

### 3.1 三条机制：为什么顺序会改结果

顺序不是玄学，背后是三条可以被实测的机制：

| 机制 | 含义 | 工程推论 |
|------|------|----------|
| **近因效应**（ **recency bias** /ˈriːsnsi ˈbaɪəs/ ，近因偏见） | 越靠近生成点的示例权重越高 | **最后一个示例最重要** ，放到最相关的那条 |
| **多数标签偏见**（ **majority label bias** /məˈdʒɒrəti ˈleɪbl ˈbaɪəs/ ，多数标签偏见） | 模型把示例的标签分布当成任务先验 | **示例的标签分布要均衡** ，或显式声明先验 |
| **位置偏见**（详见 [Lost in the Middle](01-Lost-in-the-Middle与位置偏见.md)） | 长上下文里中间段被弱化 | 示例变多/变长后， **中间示例开始失效** |

第二条有个很硬的实验支撑：给模型一串示例，但把输入换成无意义的占位符（如 `"N/A"`），模型仍会输出示例里出现最多的那个标签——说明它确实把示例分布当先验（Zhao 等人，2021，见参考资料）。

### 3.2 落地示例：五种排序策略实测

小智用 **固定 8 条均衡示例** ，只改顺序，500 条黄金集上各跑一次：

| 排序策略 | macro-F1 | `exchange` F1 | 20 次打乱的 σ |
|----------|:---:|:---:|:---:|
| v1 原始顺序（想到哪写到哪） | 0.712 | 0.41 | 0.031 |
| 按标签分组（8 条 refund 挨在一起） | 0.698 | 0.38 | 0.040 |
| 标签轮转（每类一条，循环） | 0.741 | 0.55 | 0.011 |
| 相似度降序（最像的放最前） | 0.736 | 0.53 | 0.013 |
| **标签轮转 + 相似度升序（最像的放最后）** | **0.763** | **0.61** | **0.012** |

三条结论：

1. **按标签分组是最差策略** ——它同时放大了多数标签偏见和中间丢失（同组里后面的示例落在中间带）；
2. **「最像的放最后」优于「最像的放最前」** ——近因效应强于首因效应；
3. **均衡 + 固定顺序把 σ 从 0.031 压到 0.012** ——这才是上线最重要的收益：不是平均分更高，而是 **行为更可预测** 。

实现（轮转保证分布均衡，相似度升序把最相关示例顶到紧贴问题处）：

```typescript
import { LABELS, type Shot } from "./shot-bank";

interface Ranked {
  shot: Shot;
  score: number; // 与待分类文本的相似度，越大越相似
}

/**
 * 排序策略：标签轮转（均衡）+ 相似度升序（最相关的放最后，吃近因效应）。
 * 稳定性由 tie-break（按 id 字典序）保证——同样的输入必然得到同样的顺序。
 */
export function orderShots(ranked: Ranked[], k: number): Shot[] {
  // ① 每个类目内部按相似度降序，取各类目最强的候选
  const byLabel = new Map<string, Ranked[]>();
  for (const r of ranked) {
    const list = byLabel.get(r.shot.label) ?? [];
    list.push(r);
    byLabel.set(r.shot.label, list);
  }
  for (const list of byLabel.values()) {
    list.sort((a, b) => b.score - a.score || a.shot.id.localeCompare(b.shot.id));
  }

  // ② 轮转取例：先每类取 1 条，再每类取第 2 条……保证标签均衡
  const picked: Ranked[] = [];
  const order = [...LABELS].sort();                    // 固定轮转顺序，去掉随机性
  for (let round = 0; picked.length < k; round++) {
    let addedThisRound = 0;
    for (const label of order) {
      if (picked.length >= k) break;
      const list = byLabel.get(label);
      if (list && list[round]) {
        picked.push(list[round]);
        addedThisRound++;
      }
    }
    if (addedThisRound === 0) break;                   // 所有类目都取完了
  }

  // ③ 相似度升序：最相关的示例排到最后，紧贴待分类输入
  return picked
    .sort((a, b) => a.score - b.score || a.shot.id.localeCompare(b.shot.id))
    .map((r) => r.shot);
}
```

第 ③ 步的 `id` tie-break 不能省。小智第一版漏了它，`Array.sort` 在相似度并列时的行为随引擎实现变化，导致 **同样的请求两次顺序不同** ——这是最难查的那类线上抖动。

### 3.3 与 Lost in the Middle 的交互

Few-shot 的示例段通常只有几百到两千 token，U 形曲线不明显，所以很多人以为「示例不受位置影响」。这是有条件的：

- **示例 ≤ 5 条、每条 ≤ 200 token** ：位置影响小，主要吃近因效应；
- **示例 ≥ 8 条，或每条带长 CoT** ：中间示例开始失效。小智的 CoT 版示例（每条约 600 token）在 k=8 时，把一条关键反例放在第 4 位 vs 第 8 位（末位），该反例对应的类目 F1 分别是 0.61 和 0.74；
- **示例 + 长证据同时存在**（ **RAG** /ræɡ/ （ **Retrieval-Augmented Generation** ，检索增强生成）场景）：示例会被挤到相对中间。此时要么示例精简，要么把示例放在证据之后。

推论只有一句： **k 越大，排序越重要** ——把「控 k」和「排序」当成一件事做。

### 3.4 落地示例：顺序敏感度作为上线门禁

「平均分高」不够，「换个顺序不崩」才算稳。小智把顺序敏感度做成了 CI 指标：

```typescript
/** 随机打乱示例顺序 N 次，返回指标的标准差与极差 */
export async function orderSensitivity(
  evaluate: (shots: Shot[]) => Promise<number>, // 返回 macro-F1
  shots: Shot[],
  trials = 20,
): Promise<{ mean: number; std: number; min: number; max: number }> {
  const scores: number[] = [];
  for (let i = 0; i < trials; i++) {
    const shuffled = [...shots];
    // Fisher-Yates，固定 i 作为种子以便复现
    for (let j = shuffled.length - 1; j > 0; j--) {
      const r = (i * 2654435761 + j * 40503) % (j + 1);
      [shuffled[j], shuffled[r]] = [shuffled[r], shuffled[j]];
    }
    scores.push(await evaluate(shuffled));
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  return { mean, std, min: Math.min(...scores), max: Math.max(...scores) };
}

// CI 门禁：σ > 0.015 或极差 > 5pp 就判定「提示词对顺序过敏」，不许合入
```

**红线** ：σ 大不等于平均分低，它是 **稳定性** 指标。小智的门禁是「σ ≤ 0.015 **且** macro-F1 ≥ 基线」，两条一起守，防止有人用「把所有示例写成几乎一样」来刷低 σ。

---

## 四、位置：示例该放在提示词的哪一段

### 4.1 四种承载方式实测对比

示例可以放在四个地方，效果差别很大（小智同一组 8 条示例、固定顺序的实测）：

| 承载方式 | macro-F1 | 格式不合规率 | 适用场景 |
|----------|:---:|:---:|----------|
| 示例嵌在 `system` 里 | 0.744 | 1.2% | 示例极少（≤2）且永久不变；否则 system 膨胀、缓存易失效 |
| **示例在 `user` 里：指令 → 示例 → 待分类** | **0.781** | **0.6%** | **推荐** ：示例在指令之后、真实问题之前，最相关示例紧贴问题 |
| 假多轮（`user` / `assistant` 交替） | 0.786 | 0.4% | 对齐最强，但会污染会话语义，真多轮场景慎用 |
| 示例放在问题之后 | 0.702 | 2.8% | 最差：生成点被问题占据，示例远离，且模型可能把示例当新任务 |

**假多轮** （ **fake history** /feɪk ˈhɪstri/ ，虚构历史）为什么更强 ：模型在预训练里见过海量「多轮对话 → 续写下一轮」的模式，用 `assistant` 角色承载示例输出，正好命中这个模式。代价有三条：

1. 与真实会话历史混在一起时，模型分不清哪几轮是「示例」、哪几轮是「真发生过的」；
2. 多轮结构会让部分模型倾向于 **延续示例的话题** ，而不是回答当前问题；
3. 破坏了前缀缓存（每轮的示例段随 k 变化，见 [6.2](#62-prefix-caching静态示例块几乎是免费的)）。

**推荐做法** ：生产环境用 `user` 内的单块示例（可解释、可缓存、易 A/B）；只有在「格式极难对齐 + 单轮场景 + k 很小」时才用假多轮。

### 4.2 落地示例：三种写法的 messages 构造

```typescript
// ① system 内嵌（示例少且稳定时用）
const inSystem: OpenAI.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: `${INSTRUCTION}\n\n## 示例\n${shots.map(fmt).join("\n")}`,   // 规则与示例混在一起，改动互相影响
  },
  { role: "user", content: text },
];

// ② user 内单块（推荐）：指令 → 示例 → 待分类，最相关示例在示例块末尾
const inUser: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: INSTRUCTION },
  {
    role: "user",
    content: [
      "## 示例",
      ...shots.map(fmt),                    // orderShots 已把最相关的排在最后
      "",
      "## 待分类",
      `输入：${text}`,
      "输出：",                              // ← 生成点紧贴最后一个示例
    ].join("\n"),
  },
];

// ③ 假多轮（慎用）：示例拆成 user/assistant 交替
const fakeHistory: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: INSTRUCTION },
  ...shots.flatMap((s) => [
    { role: "user" as const, content: s.input },
    { role: "assistant" as const, content: JSON.stringify(s.output) },
  ]),
  { role: "user", content: text },
];

function fmt(s: Shot): string {
  return `输入：${s.input}\n输出：${JSON.stringify(s.output)}`;
}
```

### 4.3 尾部锚点：把「最相关示例」和「检查项」顶到生成点前

与 [Lost in the Middle](01-Lost-in-the-Middle与位置偏见.md#45-尾部锚点复述) 同一手法。在示例块之后、待分类输入之前插一小段：

```text
## 输出前检查
- intent 只能取自给定的 8 个标签，逐字符一致
- 用户提到多个诉求时，取最主要的那一个
- 不确定时选 other，不要猜测
```

小智加了 3 行检查项后，格式不合规率从 0.6% 降到 0.4%，`other` 类的精确率 +7pp（原来模型总想「猜一个更具体的」）。

---

## 五、动态选例：从「手写 12 条」到「示例库检索」

### 5.1 静态 vs 动态：怎么选

| 维度 | 静态示例（写死在提示词里） | 动态选例（每次请求现挑） |
|------|--------------------------|--------------------------|
| 实现成本 | 极低 | 中（要 embedding、示例库、检索） |
| 延迟 | 0 | +20~80ms（检索）+ 可能的 embedding 调用 |
| 前缀缓存 | **友好** （前缀稳定） | **不友好** （每次示例不同 → 缓存失效） |
| 类目多（>10）/ 输入差异大 | 差 | **好** |
| 类目少（≤5）/ 输入同质 | **好** | 过度设计 |
| 可解释性 | 高（提示词就是全部） | 中（要记录本次选了哪几条） |

**判据** ：类目数 × 输入多样性。小智是 8 类 × 用户话术差异极大，落在动态选例区间；一个 3 类的内部工单分类器，静态 6 条足够。

### 5.2 选例三要素：相似度、多样性、配额

只按相似度选会掉进两个坑：选出来的全是同一个类目（标签偏斜）、选出来的彼此高度重复（信息冗余）。三个要素要一起上：

1. **相似度**（ **kNN** /keɪ en ˈen/ （ **k-Nearest Neighbors** ，k 近邻））：用 embedding 找与当前输入最像的示例；
2. **多样性**（ **MMR** /ˌem em ˈɑːr/ （ **Maximal Marginal Relevance** ，最大边际相关性））：在「相关」与「不重复」之间取平衡，避免选出 5 条几乎一样的示例；
3. **标签配额** ：强制每个类目最多占 k 的一半，从机制上消灭多数标签偏见。

### 5.3 落地示例：完整的动态选例函数

```typescript
import { LABELS, type Shot } from "./shot-bank";
import { orderShots } from "./order-shots";

interface Candidate {
  shot: Shot;
  score: number;   // 与 query 的余弦相似度
}

/**
 * 动态选例：kNN 召回 → MMR 多样性 → 标签配额 → 轮转排序。
 * @param k        最终示例条数
 * @param lambda   MMR 权衡：1 = 只看相关性，0 = 只看多样性（0.7 是个不错的起点）
 * @param maxPerLabel 单类目最大条数（配额，防多数标签偏见）
 */
export async function selectShots(
  query: string,
  bank: Shot[],
  embed: (texts: string[]) => Promise<number[][]>,
  k = 5,
  lambda = 0.7,
  maxPerLabel = 2,
): Promise<Shot[]> {
  // ① 召回：向量检索取候选（生产环境换向量库；这里用内存版演示）
  const [qv] = await embed([query]);
  const bankVecs = await embed(bank.map((s) => s.input));
  let candidates: Candidate[] = bank.map((shot, i) => ({
    shot,
    score: cosine(qv, bankVecs[i]),
  }));
  candidates.sort((a, b) => b.score - a.score);
  candidates = candidates.slice(0, Math.max(k * 6, 30));   // 候选池：k 的 6 倍

  // ② MMR + 配额：逐条选，既相关又不重复
  const selected: Candidate[] = [];
  const labelCount = new Map<string, number>();

  while (selected.length < k && candidates.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;

    candidates.forEach((c, i) => {
      const used = labelCount.get(c.shot.label) ?? 0;
      if (used >= maxPerLabel) return;                      // 配额拦截
      const redundancy = selected.length
        ? Math.max(...selected.map((s) => cosineOfIds(s.shot.id, c.shot.id)))
        : 0;
      const mmr = lambda * c.score - (1 - lambda) * redundancy;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
      }
    });

    if (bestIdx < 0) break;                                 // 配额卡死，提前结束
    const [chosen] = candidates.splice(bestIdx, 1);
    selected.push(chosen);
    labelCount.set(chosen.shot.label, (labelCount.get(chosen.shot.label) ?? 0) + 1);
  }

  // ③ 兜底：候选不足（新类目、检索失败）时，用各类目的典型样本补齐
  if (selected.length < k) {
    const have = new Set(selected.map((c) => c.shot.id));
    for (const l of LABELS) {
      if (selected.length >= k) break;
      const typical = bank.find((s) => s.label === l && s.kind === "typical" && !have.has(s.id));
      if (typical) selected.push({ shot: typical, score: 0 });
    }
  }

  // ④ 排序：复用第三节的轮转 + 相似度升序
  return orderShots(selected, k);
}

// 余弦相似度与示例间相似度（后者用预先算好的示例向量缓存，避免重复计算）
declare function cosine(a: number[], b: number[]): number;
declare function cosineOfIds(idA: string, idB: string): number;
```

小智的实测：静态 k=8 均衡示例 macro-F1 0.786；动态选例 k=5（λ=0.7、配额 2） **0.794** —— **更少的示例、更低的 token，反而更好** 。

**必做的埋点** ：把本次选中的 `shotIds` 写进日志。否则线上出问题时，你没法回答「这条请求当时看到了哪些示例」。

### 5.4 示例库怎么维护与评测

这是文首的第二个学习问题。示例库不是一次性的，它是一份需要治理的数据资产，四件事：

**（1）来源** ——三条管道：

| 来源 | 采集方式 | 占比建议 |
|------|----------|:---:|
| 标注数据 | 从黄金集/训练集里挑典型与边界样本 | 40% |
| 线上日志采样 | 高置信正确预测中采样，人工确认后入库 | 40% |
| **困难例挖掘** | 模型判错、低置信、人工纠错的样本 | 20%（价值最高） |

困难例的性价比远高于随机样本：小智每月从纠错队列里挖 20 条困难例入库，平均带来 +0.9pp macro-F1；同样的配额用随机样本只能带来 +0.2pp。

**（2）贡献度评测：留一法** ——想知道某条示例有没有用，就把它删掉再测一次：

```typescript
/** 留一法：逐条剔除示例，测 Δmacro-F1，贡献 ≤ 0 的进入淘汰名单 */
export async function leaveOneOut(
  bank: Shot[],
  evaluate: (shots: Shot[]) => Promise<number>,
  floor = 0.0,
): Promise<{ id: string; contribution: number }[]> {
  const base = await evaluate(bank);
  const out: { id: string; contribution: number }[] = [];

  for (const s of bank) {
    const without = bank.filter((x) => x.id !== s.id);
    const score = await evaluate(without);
    out.push({ id: s.id, contribution: +(base - score).toFixed(4) }); // 正数 = 有用
  }
  return out.filter((r) => r.contribution > floor).sort((a, b) => b.contribution - a.contribution);
}
```

小智首轮留一法跑完，24 条示例里有 **5 条贡献为 0 或负** （其中 2 条是重复样本、1 条是标错的）。删掉它们后，macro-F1 反而从 0.786 涨到 0.791。

**注意成本** ：留一法是 O(N) 次全量评测，N=24、黄金集 500 条时约 2 小时。所以 **只在月度治理时跑** ，不要进每次 CI。

**（3）版本化** ——示例库与提示词一起打版本号（如 `shots@v2026.09.1`），每次请求记录 `shotBankVersion`。否则「指标掉了但没人改提示词」这类问题永远查不清。

**（4）回归** ——示例变更必须跑黄金集 + 顺序敏感度（见 [3.4](#34-落地示例顺序敏感度作为上线门禁)），两者都过才允许发布。

### 5.5 动态选例的五个坑

| 坑 | 现象 | 怎么绕 |
|----|------|--------|
| **标签泄漏** | 示例库里混进了测试集中的样本，指标虚高 | 示例库与评测集按 `requestId` 做互斥切分，CI 里加重复检测 |
| **相似但矛盾** | 两条高度相似的输入标签不同，模型直接崩 | 入库时检测近义冲突，人工二选一并保留 `hard_negative` 标注与理由 |
| **分布漂移** | 大促期间话术变了，示例库还是三个月前的 | 监控线上预测分布，与上季度示例库分布做 **PSI** /ˌpiː es ˈaɪ/ （ **Population Stability Index** ，群体稳定性指数）比对，超阈值触发重采样 |
| **短文本 embedding 不稳** | 「退货」和「我要退货」向量很近，但语义不同 | 短文本场景用 BM25 或字符级召回兜底（见 [Rerank 与混合检索](../03-检索与知识/04-Rerank与混合检索.md)） |
| **缓存失效** | 每次示例不同 → 前缀缓存命中率归零 | 见 [6.2](#62-prefix-caching静态示例块几乎是免费的) 的分桶折中 |

---

## 六、成本：示例 token 与收益的权衡

### 6.1 成本模型

示例的成本是 **每次请求都要重付一次** 的固定成本：

```text
月成本 = 请求数/日 × 30 × 提示词输入 token / 1e6 × 输入单价（$/M token）
```

代入小智（2 万请求/日，中档模型输入 $0.30/M）：

| 版本 | 输入 token/次 | 月输入 token | 无缓存月成本 |
|------|:---:|:---:|:---:|
| v1（12 条手写示例） | 2,280 | 1,368 M | **$410** |
| v1.2（动态 k=5） | 1,195 | 717 M | $215 |
| v1.3（分桶静态 k=5 + 缓存） | 1,195 | 717 M | 见 6.2 |

注意这是 **纯输入侧** 的成本，示例越多，它越可能成为账单主体——尤其当你的输出只有十几个 token 时（分类、抽取类任务的标准形态）。

### 6.2 Prefix caching：静态示例块几乎是免费的

主流厂商都对「重复的长前缀」给缓存折扣（通常缓存读取价是全价的 10%，OpenAI 的 **prefix caching** /ˈpriːfɪks ˈkæʃɪŋ/ （前缀缓存）、Anthropic 的 `cache_control`、以及多数自建 vLLM 部署的 `enable_prefix_caching`）。

**关键约束：缓存命中要求前缀逐 token 相同。** 这就和动态选例直接冲突：

| 方案 | 缓存命中率 | 有效单价 | 月成本（k=5） |
|------|:---:|:---:|:---:|
| 动态选例（每次不同） | ~0% | $0.30/M | $215 |
| 全静态（8 类固定 5 条） | ~90% | $0.057/M | **$41** |

小智的折中方案—— **先粗路由、再加载分桶静态块** ，兼顾相关性与缓存：

```text
第 1 跳（极短、可缓存）：用户消息 → 粗类目（售前 / 售后 / 账号），3 类
第 2 跳：加载该粗类目的静态示例块（固定 5 条，前缀稳定 → 命中缓存）
         → 细分类到 8 类之一
```

代价是多一跳（+150ms）。小智的取舍是： **对高频（>5 次/秒）、延迟不敏感（>1s 可接受）的离线/异步链路用分桶缓存方案；对实时对话保留动态选例** 。

### 6.3 边际收益曲线：几条之后就不值了

小智在 500 条黄金集上扫描 k（静态、均衡采样、固定排序）：

| k | 输入 token/次 | macro-F1 | 边际 ΔF1 | 月成本（无缓存） | 每 +0.01 F1 的月成本 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 0 | 420 | 0.681 | — | $76 | — |
| 1 | 575 | 0.703 | +0.022 | $104 | $13 |
| 2 | 730 | 0.741 | +0.038 | $131 | $7 |
| **3** | 885 | 0.763 | +0.022 | $159 | **$13** |
| **5** | 1,195 | 0.781 | +0.018 | $215 | **$21** |
| 8 | 1,660 | 0.786 | +0.005 | $299 | $168 |
| 12 | 2,280 | 0.784 | −0.002 | $410 | 负收益 |
| 16 | 2,900 | 0.779 | −0.005 | $522 | 负收益 |

读法（这是文首「示例越多越好吗」的答案版）：

1. **k=2 是性价比拐点** ——花 $7/月买 0.01 F1；
2. **k=3~5 是甜区** ——再往上每条示例的边际收益掉到 0.001~0.002；
3. **k>8 开始负收益** ——示例变长后，中间示例失效 + 冗余噪声，抵消了新增信息；
4. **动态选例 k=5（0.794）优于静态 k=8（0.786）** ——说明「选得对」比「给得多」重要。

### 6.4 落地示例：算一算每条示例值不值

把上面的判断做成可复用的函数，接进 CI 或月度治理：

```typescript
interface ShotEconomics {
  k: number;
  tokens: number;
  f1: number;
  monthlyCost: number;
  costPerF1Point: number | null; // 每提升 0.01 macro-F1 的月成本
}

/** 输入 k 扫描结果，输出「该停在哪一条」的建议 */
export function economics(rows: { k: number; tokens: number; f1: number }[], reqPerDay: number, pricePerMTok: number): ShotEconomics[] {
  const monthTokens = (t: number) => (reqPerDay * 30 * t) / 1e6;
  const out: ShotEconomics[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const prev = rows[i - 1];
    const cost = monthTokens(cur.tokens) * pricePerMTok;
    const dF1 = prev ? cur.f1 - prev.f1 : 0;
    const dCost = prev ? cost - monthTokens(prev.tokens) * pricePerMTok : 0;
    out.push({
      k: cur.k,
      tokens: cur.tokens,
      f1: cur.f1,
      monthlyCost: +cost.toFixed(2),
      costPerF1Point: dF1 > 0 ? +(dCost / (dF1 * 100)).toFixed(2) : null,
    });
  }
  return out;
}

/** 建议：取「边际成本首次超过阈值」之前的最后一个 k */
export function suggestK(econ: ShotEconomics[], maxCostPerF1Point = 30): number {
  const affordable = econ.filter((e) => e.costPerF1Point !== null && e.costPerF1Point! <= maxCostPerF1Point);
  return affordable.length ? affordable[affordable.length - 1].k : 0;
}

// 小智：reqPerDay=20000, price=0.30 → suggestK 返回 5（$21/点 < $30 阈值，k=8 的 $168 被拒）
```

`maxCostPerF1Point` 的阈值要按业务定。小智的换算依据：一次误路由平均带来 1.4 次额外人工接触，成本约 $0.9；0.01 macro-F1 ≈ 每月少 1,200 次误路由 ≈ 省 $1,080——所以每点 $30 的门槛定得很宽松，真正的约束其实是延迟和稳定性，不是钱。

---

## 七、评测与回归：few-shot 怎么测、怎么守

### 7.1 三层指标

只盯准确率会漏掉两类问题，三层一起看：

| 层 | 指标 | 定义 | 为什么需要它 | 小智 v1 → v1.3 |
|:---:|------|------|--------------|:---:|
| 任务层 | macro-F1 / 准确率 | 标准任务指标 | 衡量「有没有用」 | 0.712 → 0.794 |
| **格式层** | 格式不合规率 | 输出无法解析/不合 schema 的比例 | 示例风格漂移的直接体温计 | 4.8% → 0.4% |
| **稳定性层** | 顺序敏感度 σ | 打乱示例顺序 N 次的指标标准差 | 衡量「敢不敢上线」 | 0.031 → 0.008 |

第三层最容易被跳过，也最容易在生产上出事：一个 macro-F1 0.79 但 σ=0.03 的提示词，上线后你会发现指标天天在 0.76~0.82 之间跳，而没人改过任何东西。

还要注意 **小样本陷阱** ：500 条黄金集上 0.01 的 macro-F1 差异，置信区间大概 ±0.015—— **不要为 1pp 的差异改提示词** ，先扩大评测集或做多次采样。

### 7.2 落地示例：黄金集与 CI 门禁

一条 few-shot 回归用例的样子：

```yaml
id: gs-ic-0031
version: v2026.09.1
task: intent_routing
shot_bank: shots@v2026.09.1
input: "订单还没发货，能换成别的颜色吗？"
expected: { "intent": "exchange" }
checks:
  - type: equals
    field: intent
    value: exchange
  - type: json_parseable          # 格式层：示例风格漂移会在这里先炸
  - type: label_in_enum
  - type: not_contains            # 历史误判，永远不许再出现
    value: "logistics"
severity: S2
source: rq-40988
```

CI 里跑三件事（缺一不可）：

```text
1. lintShotBank(示例库)            → 结构、一致性、覆盖、分布（见 2.5）
2. evaluate(黄金集)                → macro-F1 ≥ 基线 - 0.005，格式不合规率 ≤ 0.5%
3. orderSensitivity(示例, 20 次)   → σ ≤ 0.015 且极差 ≤ 5pp
```

### 7.3 落地示例：三周排期与工具栈

把本文所有零件排成三周（1 算法 + 1 工程，标注为兼职）：

| 周 | 动作 | 产出 | 指标变化 |
|----|------|------|----------|
| **W1** | 清理示例库（统一格式、补 3 个类目的典型样本、删重复）；接 `lintShotBank` 进 CI；建 500 条黄金集并接自动评分 | 干净示例库 + 基线 | 0.712 → 0.748，格式 4.8% → 1.1% |
| **W2** | 上标签轮转 + 相似度升序排序（[3.2](#32-落地示例五种排序策略实测)）；示例块移到 user 内并加尾部锚点（[4.3](#43-尾部锚点把最相关示例和检查项顶到生成点前)）；顺序敏感度门禁 | v1.1 全量 | 0.748 → 0.763，σ 0.031 → 0.012 |
| **W3** | 动态选例 k=5（MMR + 配额）；粗类目分桶恢复前缀缓存；留一法淘汰 5 条低贡献示例 | v1.3 全量 | 0.763 → 0.794，成本 $410 → $40/月 |

工具栈：

| 环节 | 工具 | 备注 |
|------|------|------|
| 批量跑分 / A/B | promptfoo、DeepEval | YAML 用例 + 断言，直接接 CI |
| 示例向量检索 | 向量库（pgvector / Qdrant）或内存暴力检索（<1 万条足够） | 示例库通常很小，别一上来就上分布式 |
| 评测指标 | scikit-learn 的 `classification_report` / 自实现 macro-F1 | 分类任务别用「准确率」，类目不均时会骗人 |
| 顺序敏感度 | 自研（[3.4](#34-落地示例顺序敏感度作为上线门禁) 约 30 行） | 没有现成工具，值得自己写 |
| 缓存观测 | 厂商返回的 `cached_tokens` 字段 | 一定要埋，否则你不知道自己的静态块有没有生效 |

之后进入常态： **每月** 跑一次留一法治理示例库 + 从纠错队列挖 20 条困难例； **每季度** 重扫一次 k 曲线（模型和分布都会变，甜区会移动）。

---

## 自检清单

- [ ] 示例集的标签分布均衡（最大类目 ≤ 30%），每类至少 1 条典型样本，含边界与反例；
- [ ] 所有示例格式逐字符一致（分隔符、字段顺序、标签字面量、引号风格）；
- [ ] 至少一半示例来自真实分布采样，不是纯人工编写的「标准句」；
- [ ] 已判断清楚：本任务是示范「格式」还是示范「推理」，没有默认上 CoT；
- [ ] 示例顺序是 **确定的** （有 tie-break、无随机），最相关的示例排在最后；
- [ ] 示例放在 `user` 内、指令之后、问题之前；假多轮只在单轮 + 小 k 时使用；
- [ ] `lintShotBank` 已进 CI，覆盖结构 / 一致性 / 覆盖度 / 分布 / 去重五项；
- [ ] 顺序敏感度（σ 与极差）已测量并设为发布门禁；
- [ ] 用 k 扫描测过边际收益，k 停在甜区（通常 3~5），不是「越多越好」；
- [ ] 每次请求记录了 `shotBankVersion` 与 `shotIds`，事后可复现；
- [ ] 示例库做了贡献度评测（留一法），低贡献示例已淘汰；
- [ ] 成本侧：静态块放前缀并利用 prefix caching，缓存命中率有埋点；
- [ ] 示例库与评测集做了互斥切分，无标签泄漏。

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **CI** | /ˌsiː ˈaɪ/ | Continuous Integration | 持续集成 |
| **CoT** | /ˌsiː əʊ ˈtiː/ | Chain-of-Thought | 思维链 |
| **JSON** | /ˈdʒeɪsən/ | JavaScript Object Notation | 轻量级数据交换格式 |
| **kNN** | /keɪ en ˈen/ | k-Nearest Neighbors | k 近邻 |
| **MMR** | /ˌem em ˈɑːr/ | Maximal Marginal Relevance | 最大边际相关性 |
| **PSI** | /ˌpiː es ˈaɪ/ | Population Stability Index | 群体稳定性指数 |
| **RAG** | /ræɡ/ | Retrieval-Augmented Generation | 检索增强生成 |
| **TS** | /ˌtiː ˈes/ | TypeScript | 本仓库主示例语言 |

## 参考资料

- Brown et al., *Language Models are Few-Shot Learners*（[arXiv:2005.14165](https://arxiv.org/abs/2005.14165)，2020，Few-shot 的出处）
- Zhao et al., *Calibrate Before Use: Improving Few-shot Performance of Language Models*（[arXiv:2102.09690](https://arxiv.org/abs/2102.09690)，2021，多数标签偏见与「无内容输入」探针）
- Lu et al., *Fantastically Ordered Prompts and Where to Find Them: Overcoming Few-Shot Prompt Order Sensitivity*（[arXiv:2104.08786](https://arxiv.org/abs/2104.08786)，2022，顺序敏感度的系统测量与熵排序法）
- Min et al., *Rethinking the Role of Demonstrations: What Makes In-Context Learning Work?*（[arXiv:2202.12837](https://arxiv.org/abs/2202.12837)，2022，示例真正起作用的是标签空间、输入分布与格式）
- Liu et al., *What Makes Good In-Context Examples for GPT-3?*（[arXiv:2201.10005](https://arxiv.org/abs/2201.10005)，2022，相似 + 多样的选例策略）
- Rubin et al., *Learning to Retrieve Prompts for In-Context Learning*（[arXiv:2112.08633](https://arxiv.org/abs/2112.08633)，2022，动态选例的可训练方案）
- Levy et al., *Diverse Demonstrations Improve In-context Compositional Generalization*（[arXiv:2212.06800](https://arxiv.org/abs/2212.06800)，2022，多样性在泛化上的作用）
- Su et al., *Selective Annotation Makes Language Models Better Few-Shot Learners*（[arXiv:2209.01975](https://arxiv.org/abs/2209.01975)，2022，该标注哪些样本——困难例挖掘的理论依据）
- Liu et al., *Lost in the Middle: How Language Models Use Long Contexts*（[arXiv:2307.03172](https://arxiv.org/abs/2307.03172)，2023，位置偏见的出处）
- [OpenAI Prompt Caching 指南](https://platform.openai.com/docs/guides/prompt-caching)、[Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)（前缀逐 token 匹配的要求与折扣）
- 本仓库：[Lost in the Middle 与位置偏见](01-Lost-in-the-Middle与位置偏见.md)（机制③）、[结构化输出](04-结构化输出.md)（示例示范的格式要靠 schema 兜底）、[Rerank 与混合检索](../03-检索与知识/04-Rerank与混合检索.md)（MMR 的检索侧来源）、[数据飞轮与合成数据](../07-前沿与形态/05-数据飞轮与合成数据.md)（示例库的采集与合成）、[语义缓存](../03-检索与知识/05-语义缓存.md)（与 prefix caching 相邻的另一层缓存）
