# Token 成本估算

> 最后修改时间：2026-09-30 14:22

> 状态：✅ 已补齐（2026-09-30）  
> 一句话定义：把 **输入/输出 token、缓存命中、工具轮次、多模态** 算进 **单位请求成本** 与月度预算——估不准就一定超预算。

## 大纲

1. [计费单位与隐藏成本](#一计费单位与隐藏成本)
2. [单请求成本估算公式](#二单请求成本估算公式)
3. [Agent 多步为何比 Chat 贵一个数量级](#三agent-多步为何比-chat-贵一个数量级)
4. [缓存对账本的影响：Prompt Caching 与语义缓存](#四缓存对账本的影响)
5. [成本告警、限额与「单次任务成本上限」](#五成本告警限额与单次任务成本上限)
6. [端到端落地示例：四周迭代](#六端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [Token 与分词](../../AI知识库/06-大语言模型LLM/02-Token与分词.html)——token 怎么算出来的、为什么中文更费 token
- [模型选型指南](01-模型选型指南.html)——不同档位模型的价格区间
- [可靠性与成本工程](../../Agent开发知识/13-进阶与工程化/05-可靠性与成本工程.html)——降级、熔断、限额的工程基础
- [LLM 网关与路由](04-LLM网关与路由.html)——网关层的成本聚合与路由
- [延迟成本质量三角](03-延迟成本质量三角.html)——成本与延迟、质量的耦合约束
- [工程实践](../../Agent开发知识/11-工程实践/01-工程实践.html)

## 学习要点（读后应能回答）

- Agent 多步为何比单轮 Chat 贵一个数量级？→ 见 [三](#三agent-多步为何比-chat-贵一个数量级)
- 如何设「单次任务成本上限」？→ 见 [5.2](#52-单次任务的硬上限设计)

---

## 〇、贯穿案例：小智的账本

电商客服「小智」日均 2 万请求，账本演化（与[《模型选型指南》](01-模型选型指南.html) 〇节同一案例）：

| 版本 | 单请求成本 | 日成本 | 月成本 | 触发调整 |
|------|:---:|:---:|:---:|---------|
| v1.0 全 gpt-4o | $0.0036 | $72 | $2,160 | — |
| v2.0 加路由 | $0.0029 | $58 | $1,740 | 引入 mini 系列 |
| v3.0 加缓存 + 自托管 | $0.0020 | $41 | $1,230 | 加 Prompt Cache + Qwen 自托管 |

月节省 $930（43%）——但这是**看清账本之后**才有的优化。本文给你这个看清账本的方法。

---

## 一、计费单位与隐藏成本

### 1.1 标准计费：input / output token

大多数模型按 token 计费，分输入和输出两档：

```text
请求成本 = input_tokens × input_price + output_tokens × output_price
```

但**输出比输入贵 3~5 倍**，这是多数账本超支的根因——长输出悄悄烧钱。

```typescript
interface ModelPricing {
  model: string;
  inputPer1k: number;   // USD per 1k input tokens
  outputPer1k: number;  // USD per 1k output tokens
}

const PRICING: ModelPricing[] = [
  { model: "gpt-4o",         inputPer1k: 0.0025,  outputPer1k: 0.010 },
  { model: "gpt-4o-mini",    inputPer1k: 0.00015, outputPer1k: 0.0006 },
  { model: "claude-sonnet",  inputPer1k: 0.003,   outputPer1k: 0.015 },
  { model: "deepseek-v3",    inputPer1k: 0.00014, outputPer1k: 0.00028 },
];

function calc(p: ModelPricing, inTok: number, outTok: number): number {
  return (inTok * p.inputPer1k + outTok * p.outputPer1k) / 1000;
}

calc(PRICING.gpt-4o, 800, 400);  // 单请求 $0.0060
```

### 1.2 六类隐藏成本（90% 团队漏算）

除了 LLM 主调用，还有六块账常被忽略：

| 隐藏成本 | 计费方式 | 小智 v1 月费 | 占比 |
|----------|----------|:---:|:---:|
| **嵌入模型** | 按 token 计费，~$0.00002/1k | $120 | 5.6% |
| **重排模型** | 按 query 计费，~$0.002/query | $180 | 8.3% |
| **语音 ASR/TTS** | 按秒或字符，~$0.0001/15s | $90 | 4.2%（上线后） |
| **工具/API 调用** | 第三方 API（搜索、订单查询） | $45 | 2.1% |
| **缓存存储** | Redis / 向量库存储费 | $30 | 1.4% |
| **网关与日志** | 自托管 LiteLLM、ClickHouse | $60 | 2.8% |
| **小计** | | **$525** | **24.4%** |

**结论**：光算 LLM 是不够的，完整账本要把上下游六块都加起来。

### 1.3 多模态的特殊计费

图像、音频、视频的计费单位不同：

| 类型 | 主流厂商做法 | 示例 |
|------|-------------|------|
| **图像输入** | 按张 + 分辨率分档 | gpt-4o：低 85 tokens、高 170 tokens/张 |
| **音频输入** | 按秒或按 token | gpt-4o-realtime：$40/1M audio tokens（≈ $0.06/分钟） |
| **PDF/文档** | 按页 + token | Claude：每页约 1.5k tokens |
| **视频** | 按帧采样 | gpt-4o：每秒抽 1 帧，按图计费 |

多模态一定要在**产品上线前**做 P95 单次成本测算——一不小心比纯文本贵 50 倍。

---

## 二、单请求成本估算公式

### 2.1 通用公式

```text
单请求成本 = LLM 成本 + 嵌入 + 重排 + 工具 + 缓存读 + 缓存写 + 其他
```

把每个组件拆开后，账本就清楚了一大半。

### 2.2 落地示例：成本估算函数

```typescript
interface RequestCostBreakdown {
  llm: { input: number; output: number; subtotal: number };
  embedding: number;
  rerank: number;
  tools: number;
  cache: { read: number; write: number };
  total: number;
}

function estimateCost(input: {
  inputMsgCount: number;
  avgInputTokens: number;
  outputTokens: number;
  embeddingQueries: number;
  rerankQueries: number;
  toolCalls: number;
  cacheReads: number;
  cacheWrites: number;
  pricing: ModelPricing,
}): RequestCostBreakdown {
  const llmIn = input.inputMsgCount * input.avgInputTokens * input.pricing.inputPer1k / 1000;
  const llmOut = input.outputTokens * input.pricing.outputPer1k / 1000;
  const embed = input.embeddingQueries * 0.00002;        // $0.00002 per query
  const rerank = input.rerankQueries * 0.002;            // $0.002 per query
  const tools = input.toolCalls * 0.001;                 // $0.001 per tool call (avg)
  const cacheR = input.cacheReads * 0.00005;             // 读 cache 极便宜
  const cacheW = input.cacheWrites * 0.0001;
  return {
    llm: { input: llmIn, output: llmOut, subtotal: llmIn + llmOut },
    embedding: embed,
    rerank,
    tools,
    cache: { read: cacheR, write: cacheW },
    total: llmIn + llmOut + embed + rerank + tools + cacheR + cacheW,
  };
}
```

### 2.3 日 / 月成本推导

```text
日成本 = 日均请求数 × P95 请求成本 + 固定开销（自托管 GPU / 网关）
月成本 = 日成本 × 30 + 峰值日系数（× 1.3~1.5）
```

**固定开销**别忘了：自托管 Qwen-7B 跑推理，A100 一张 $1.5/h，3 张 × 24h × 30 = $3,240——比租 API 还贵，除非请求量上 5 万/日。

### 2.4 小智真实测算示例

| 请求类型 | 比例 | LLM 成本 | 嵌入 | 重排 | 工具 | 总计 |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| 简单意图分类 | 35% | $0.0003 | — | — | — | **$0.0003** |
| 工单提取 | 20% | $0.0060 | $0.0001 | — | — | **$0.0061** |
| 自由问答 | 30% | $0.0050 | $0.0001 | $0.0008 | $0.0010 | **$0.0069** |
| 退款争议 | 5% | $0.04 | $0.0001 | — | $0.0005 | **$0.0406** |
| 摘要 | 10% | $0.0008 | — | — | — | **$0.0008** |

加权平均 = $0.36 × 35% + $0.61 × 20% + $0.69 × 30% + $4.06 × 5% + $0.08 × 10% ≈ **$0.0043** ——

等等，这里为什么和 v3 的 $0.0020 差 2 倍？因为 $0.0043 是**单次 LLM 调用**的成本，Agent 多步会再涨 1.5~3 倍。下一节详细讲。

---

## 三、Agent 多步为何比 Chat 贵一个数量级

### 3.1 单轮 Chat 的成本结构

```text
Chat 成本 ≈ 1 次 LLM 调用 + input prompt + output reply
```

简单直接。

### 3.2 Agent 多步的成本爆炸

Agent 一次任务会跑 **N 轮 LLM + N 次工具 + 累积上下文**，N 常见在 5~15 之间：

```text
Agent 任务成本 = Σ(第 i 轮 LLM 调用成本) + Σ(第 j 次工具调用成本) + 重试加成
```

更糟的是**上下文累积**：第 N 轮要把前 N-1 轮的对话 + 工具结果全塞进 input，每轮 input 线性增长。

### 3.3 真实数字对比

小智两类任务实测：

| 任务 | 轮数 | 平均 input tok | 平均 output tok | 总 token | 单任务成本 |
|------|:---:|:---:|:---:|:---:|:---:|
| 单轮「查天气」 | 1 | 250 | 80 | 330 | $0.0007 |
| Agent「帮我查订单并退款」 | 8 | 累进 250→4800 | 累进 80→600 | 12,800 | $0.0180 |
| Agent「分析退款争议并出报告」 | 14 | 累进 300→8200 | 累进 100→1200 | 31,400 | $0.0540 |

**关键数字**：Agent 多步任务成本是单轮 Chat 的 **25~75 倍**，而且每加一轮**不是加常数**——是**加累积上下文**。

### 3.4 Agent 成本的三大杠杆

| 杠杆 | 节省幅度 | 实现成本 |
|------|:---:|---------|
| **缩短系统提示** | -20~40% input | 中（影响能力） |
| **早期截断**：工具结果只回前 N 条 | -30~60% input | 低 |
| **上下文压缩**：每隔 3 轮让模型总结前文 | -40~70% input | 中（影响连贯性） |
| **并行工具调用** | 减少轮数 -30% | 低（OpenAI/Anthropic 原生支持） |
| **换小模型做中间环节** | -60~90% | 低（路由层） |

小智 v3 的实战组合拳：

```typescript
// 上下文压缩：每 3 轮跑一次摘要
async function compressContext(messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (messages.length < 6) return messages;
  const recent = messages.slice(-6);
  const older = messages.slice(0, -6);
  const summary = await client.chat.completions.create({
    model: "gpt-4o-mini",  // 用小模型压缩，省钱
    messages: [
      { role: "system", content: "请将以下对话历史压缩为 200 字以内的摘要" },
      { role: "user", content: older.map((m) => m.content).join("\n") },
    ],
  });
  return [
    { role: "system", content: `历史摘要：${summary.choices[0].message.content}` },
    ...recent,
  ];
}
```

效果：复杂 Agent 任务平均成本从 $0.054 降到 $0.026，月节省 ~$210。

---

## 四、缓存对账本的影响

### 4.1 Prompt Caching（服务端 prefix cache）

Anthropic、OpenAI、DeepSeek 都支持——同一前缀的多次请求，命中 cache 的部分按 **10% 折扣** 计费。

```typescript
// OpenAI Prompt Caching 示例
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: LONG_SYSTEM_PROMPT }, // 这部分会被 cache
    { role: "user", content: userMessage },
  ],
  // 自动启用：重复 system prompt 命中 cache
});
```

**适用场景**：

- 系统提示很长（> 1k tokens）且固定
- 多用户请求用同一前缀（如同一 RAG 文档）
- 客服 Agent、代码助手、长文档问答

小智系统提示 3.2k tokens + 私域知识 4k tokens = 7.2k 前缀，日均 2 万请求 → **输入侧节省 45%**（$648 → $324）。

### 4.2 语义缓存（客户端）

把「相似 query + 模型输出」缓存到向量库，命中相似问题直接返回，省 LLM 调用。

```typescript
import { createClient } from "@redis/client";
import { embed } from "./embedding";

const redis = createClient();

async function semanticCacheLookup(query: string): Promise<string | null> {
  const vec = await embed(query);
  const cached = await redis.ft.search("semantic-cache", {
    query: `*=>[KNN 1 @embedding $vec AS score]`,
    params: { vec: JSON.stringify(vec) },
    SORTBY: { BY: "score", DIRECTION: "ASC" },
  });
  if (cached.total > 0 && cached.documents[0].value.score < 0.08) {
    return cached.documents[0].value.answer;
  }
  return null;
}

async function cachedChat(query: string): Promise<string> {
  const hit = await semanticCacheLookup(query);
  if (hit) {
    return hit;  // 命中：返回缓存，0 LLM 成本
  }
  const answer = await callLLM(query);
  await redis.json.set(`cache:${hash(query)}`, "$", {
    query,
    embedding: await embed(query),
    answer,
    createdAt: Date.now(),
  });
  return answer;
}
```

**适用场景**：

- 客服 FAQ 类高频重复问题
- 总结模板化的报告
- 代码补全（同一项目反复补全类似代码）

**注意**：语义缓存命中率 > 30% 才划算，否则嵌入成本 > 节省。

### 4.3 缓存账本对比

小智 v2→v3 三个缓存动作的节省（按月）：

| 动作 | 命中率 | 月省 | 实现成本 | 净收益 |
|------|:---:|:---:|:---:|:---:|
| Prompt Caching | 85% | $324 | $0（厂商自带） | **+$324** |
| 语义缓存 | 22% | $148 | $30（Redis + 嵌入） | **+$118** |
| 上下文压缩 | 100%（固定跑） | $210 | $0（仅增加小模型调用） | **+$210** |
| **合计** | | **+$852** | **+$30** | **+$652/月** |

**结论**：缓存是 ROI 最高的成本优化手段——优先上 Prompt Caching（零成本），其次上下文压缩，最后语义缓存。

---

## 五、成本告警、限额与「单次任务成本上限」

### 5.1 三道成本防线

| 防线 | 粒度 | 触发动作 | 实现位置 |
|------|------|----------|----------|
| **单请求上限** | 一次请求 | 超额 → 强制截断 / 拒绝 / 降级 | 网关 |
| **用户/会话上限** | 一段时间 | 超额 → 限流 | 网关 |
| **全平台告警** | 日/小时 | 超预算 → 告警 + 切小模型 | 监控 |

### 5.2 单次任务的硬上限设计

这是本题第二个学习要点的核心——**必须在请求发起前设硬上限**，不能事后追。

```typescript
interface TaskBudget {
  maxInputTokens: number;     // 硬上限
  maxOutputTokens: number;
  maxCostUsd: number;
  maxLatencyMs: number;
  onExceed: "truncate" | "downgrade" | "reject";
}

async function callWithBudget(
  messages: ChatMessage[],
  budget: TaskBudget,
  router: ModelRouter,
): Promise<string> {
  // 1. 预估成本
  const estInput = estimateTokens(messages);
  const estCost = router.estimateCost(estInput, budget.maxOutputTokens);

  if (estCost > budget.maxCostUsd) {
    if (budget.onExceed === "downgrade") {
      // 切小模型
      router.downgrade();
    } else if (budget.onExceed === "reject") {
      throw new BudgetExceeded(`预估 $${estCost.toFixed(4)} > 上限 $${budget.maxCostUsd}`);
    } else {
      // truncate：截短到能负担的 input 长度
      messages = truncateMessages(messages, budget.maxInputTokens);
    }
  }

  // 2. 实际调用 + 实时监控
  const start = Date.now();
  let totalCost = 0;
  const stream = await router.callStreamed(messages, {
    maxOutputTokens: budget.maxOutputTokens,
    onChunk: (chunk) => {
      totalCost += chunk.costUsd;
      if (totalCost > budget.maxCostUsd) throw new BudgetExceededMidway();
      if (Date.now() - start > budget.maxLatencyMs) throw new LatencyExceeded();
    },
  });

  return stream.content;
}
```

### 5.3 限额的三层设计

```typescript
// 第一层：单用户会话级限额
interface UserQuota {
  userId: string;
  windowHours: number;       // 窗口长度
  maxCostUsd: number;        // 窗口内上限
  currentCostUsd: number;    // 已用
}

// 第二层：全平台级日上限
interface PlatformDailyBudget {
  date: string;              // YYYY-MM-DD
  budgetUsd: number;
  spentUsd: number;
  onExhausted: "downgrade" | "reject";  // 超额动作
}

// 第三层：告警阈值
const ALERT_THRESHOLDS = {
  warn: 0.7,    // 用到 70% 告警
  critical: 0.9,
  downgrade: 0.95,  // 切小模型
};
```

### 5.4 告警可视化最小集

| 看板指标 | 数据源 | 刷新频率 |
|---------|--------|---------|
| **当前小时成本 / 同期比** | LLM 日志 | 5 min |
| **P95 单请求成本** | LLM 日志 | 实时 |
| **Top N 贵请求用户** | 网关日志 | 实时 |
| **缓存命中率** | 网关日志 | 5 min |
| **路由分布** | 网关日志 | 5 min |

---

## 六、端到端落地示例：四周迭代

小智从「月底才知超支」到「实时看账本」的 4 周节奏：

| 周 | 任务 | 工具栈 | 完成标准 |
|----|------|--------|----------|
| W1 | 账本盘点：把 LLM + 嵌入 + 重排 + 工具 + 缓存五块逐项估算 | 内部 wiki + 估算表 | 输出完整账本表 |
| W2 | 上 Prompt Caching + 单请求上限 | 网关 + zod | 月省 $324、零超限请求 |
| W3 | 加语义缓存 + 上下文压缩 | Redis + 嵌入 API | 命中率 > 20% |
| W4 | 监控告警 + 用户配额 | Grafana + webhook | 70%/90% 两级告警 |

**四周后的指标**：

- 月成本：$1,740 → $1,230（-29%）
- 超限请求：每周 200+ → 0
- 账本误差：±30% → ±5%

---

## 参考资料

- [Token 与分词](../../AI知识库/06-大语言模型LLM/02-Token与分词.html)
- [模型选型指南](01-模型选型指南.html)
- [可靠性与成本工程](../../Agent开发知识/13-进阶与工程化/05-可靠性与成本工程.html)
- [LLM 网关与路由](04-LLM网关与路由.html)
- [延迟成本质量三角](03-延迟成本质量三角.html)
- OpenAI Pricing（[openai.com/api/pricing](https://openai.com/api/pricing)）
- Anthropic Prompt Caching（[docs.anthropic.com/docs/build-with-claude/prompt-caching](https://docs.anthropic.com/docs/build-with-claude/prompt-caching)）

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **LLM** | /ˌel el ˈem/ | Large Language Model | 大语言模型 |
| **PII** | /ˌpiː aɪ aɪ ˈtiː/ | Personally Identifiable Information | 个人可识别信息 |
| **P95** | /ˌpiː naɪn tiː faɪv/ | 95th Percentile | 第 95 百分位数 |
| **P99** | /ˌpiː ˈnaɪn tiː naɪn/ | 99th Percentile | 第 99 百分位数 |
| **RAG** | /ræɡ/ | Retrieval-Augmented Generation | 检索增强生成 |
| **FAQ** | /ˌef eɪ ˈkjuː/ | Frequently Asked Questions | 高频问题 |
| **GPU** | /ˌdʒiː piː ˈjuː/ | Graphics Processing Unit | 图形处理器 |
| **ASR** | /ˌeɪ es ˈɑːr/ | Automatic Speech Recognition | 自动语音识别 |
| **TTS** | /ˌtiː tiː ˈes/ | Text-To-Speech | 文本转语音 |
| **ROI** | /ˌɑːr əʊ ˈaɪ/ | Return On Investment | 投资回报率 |