# 降级与 Fallback

> 最后修改时间：2026-09-30 14:22

> 状态：✅ 已补齐（2026-09-30）  
> 一句话定义：模型超时、限流、质量崩坏时，按预案 **降级** ——更小模型 / 缓存 / 规则 / 人工——而不是整站停掉。

## 大纲

1. [失败模式清单](#一失败模式清单)
2. [两类降级：质量降级 vs 可用性降级](#二两类降级质量降级-vs-可用性降级)
3. [Fallback 链设计](#三fallback-链设计)
4. [熔断与舱壁隔离](#四熔断与舱壁隔离)
5. [用户可见话术设计](#五用户可见话术设计)
6. [何时不该静默切换](#六何时不该静默切换)
7. [端到端落地示例：四周迭代](#七端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [可靠性与成本工程](../../Agent开发知识/13-进阶与工程化/05-可靠性与成本工程.html)——降级、熔断的通用工程原则
- [LLM 网关与路由](04-LLM网关与路由.html)——fallback 链在网关层的实现
- [限流、重试与幂等](06-限流重试与幂等.html)——重试策略与幂等键
- [延迟成本质量三角](03-延迟成本质量三角.html)——质量降级的成本约束
- [工程实践](../../Agent开发知识/11-工程实践/01-工程实践.html)

## 学习要点（读后应能回答）

- 质量降级与可用性降级如何区分？→ 见 [二](#二两类降级质量降级-vs-可用性降级)
- Fallback 何时不该静默切换？→ 见 [六](#六何时不该静默切换)

---

## 〇、贯穿案例：小智的三次降级实录

电商客服「小智」上线 18 个月，三次大降级：

| 间 | 触发 | 降级动作 | 用户感知 | 业务影响 |
|------|------|----------|----------|---------|
| T1 | gpt-4o 全区超时 40min | 切 gpt-4o-mini + 关流式 | 响应变慢但有结果 | 日 CSAT -0.2 |
| T2 | 嵌入 API 限流（5xx） | 退到 BM25 检索 | 答案精度略降 | 命中率 -8pp，CSAT -0.1 |
| T3 | 工单提取失败率跳到 8% | 转人工兜底 | 用户被告知转人工 | 1.2% 请求进人工队列 |

**关键直觉**：**没有任何一次降级是「整个站挂掉」**——这就是降级工程的价值。

---

## 一、失败模式清单

### 1.1 七类典型失败

降级方案的第一行是**识别失败**——不同失败对应不同降级路径：

| 失败模式 | 触发信号 | 降级方向 |
|---------|---------|----------|
| **模型超时** | upstream > 阈值 | 切小模型 / 关流式 |
| **模型限流**（429） | 429 rate limit | 退避 + 切备上游 |
| **模型服务挂**（5xx） | 连续 5xx | 切备上游 / 熔断 |
| **网络分区** | DNS / TCP 失败 | 切备上游 / 转人工 |
| **输出崩坏** | 失败率突增 / 长度异常 | 关 strict / 切小模型 |
| **嵌入失败** | 嵌入 API 异常 | 退到 BM25 |
| **工具失败** | 第三方 API 异常 | 重试 / 跳过 / 替代工具 |

### 1.2 失败的可观测性是降级的前提

没有指标就没有降级——每个失败模式必须有可观测信号：

```typescript
interface FailureSignal {
  name: string;
  detector: () => Promise<boolean>;
  cooldownMs: number;     // 多久后重试探测
  action: FallbackAction;
}

const SIGNALS: FailureSignal[] = [
  {
    name: "model_4o_5xx",
    detector: async () => (await getLast5xxRate("gpt-4o")) > 0.05,
    cooldownMs: 30000,
    action: { type: "switch_model", target: "gpt-4o-mini" },
  },
  {
    name: "embedding_429",
    detector: async () => (await getLastRate("embedding", 429)) > 0.10,
    cooldownMs: 60000,
    action: { type: "switch_tool", target: "bm25" },
  },
  {
    name: "extraction_failure",
    detector: async () => (await getParseFailureRate("ticket-extraction")) > 0.05,
    cooldownMs: 120000,
    action: { type: "downgrade_to_human", reason: "extraction_failure" },
  },
];
```

---

## 二、两类降级：质量降级 vs 可用性降级

### 2.1 定义与区分

这是本题第一个学习要点的核心——答案是**目的不同、用户感知不同**。

| 维度 | 质量降级 | 可用性降级 |
|------|---------|----------|
| **降级目标** | 接受质量下降，保服务可用 | 完全或部分拒绝服务，保核心用户 |
| **用户感知** | 得到答案，但精度/风格变差 | 看到错误页、转人工、排队提示 |
| **触发场景** | 模型崩了、内容质量崩坏 | 资源耗尽、配额耗尽、不可恢复错误 |
| **典型动作** | 切小模型、退 BM25、用缓存答案 | 转人工、限流、排队、关新功能 |
| **业务代价** | CSAT 下降、可解释 | 流量损失、用户跳出 |

### 2.2 决策树

```text
故障发生
  │
  ├── 有替代方案且降级后质量可接受？
  │     │
  │     ├── 是 → 质量降级（切小模型 / 退缓存 / 退 BM25）
  │     │       用户继续得到答案
  │     │
  │     └── 否 → 进入可用性降级决策
  │             │
  │             ├── 核心用户能保？
  │             │     └── 是 → 限流 + 转人工兜底（核心用户全服务，其他人排队）
  │             │
  │             └── 都不能保？
  │                   └── 是 → 全站降级页 + 排队
```

### 2.3 实战对比

| 场景 | 降级类型 | 做法 |
|------|---------|------|
| gpt-4o 超时但 4o-mini 健康 | 质量降级 | 切到 mini，告知用户「当前是简化模式」 |
| 全模型挂，缓存有 60% 答案 | 质量降级 | 缓存兜底，剩下 40% 转人工 |
| 嵌入 API 挂，BM25 不准 | 质量降级 | BM25 兜底，明示「答案精度可能下降」 |
| 全平台配额耗尽 | 可用性降级 | 排队 + 提示用户稍后重试 |
| 工具调用全挂，用户需求工具 | 可用性降级 | 拒绝 + 转人工 |
| 检测到内容安全事件 | 可用性降级 | 全站暂停 + 告警 + 排查 |

---

## 三、Fallback 链设计

### 3.1 链的定义

Fallback 链是从 **最优 → 最次 → 转人工** 的有序序列：

```text
gpt-4o → gpt-4o-mini → 缓存答案 → 规则模板 → 转人工
   ↓         ↓             ↓           ↓
 最优     质量降级      质量降级      可用性降级
```

每一级**前置条件不满足**才进下一级，而不是并行尝试。

### 3.2 落地示例：Fallback 链配置

```typescript
interface FallbackStep {
  id: string;
  type: "model" | "cache" | "rule" | "human";
  config: Record<string, unknown>;
  conditions?: { maxLatencyMs?: number; minQualityScore?: number };
  timeoutMs: number;
}

interface FallbackChain {
  task: string;
  steps: FallbackStep[];
  globalTimeoutMs: number;
}

const CHAINS: FallbackChain[] = [
  {
    task: "ticket_extraction",
    globalTimeoutMs: 8000,
    steps: [
      { id: "primary", type: "model", config: { model: "gpt-4o", strict: true }, timeoutMs: 4000 },
      { id: "mini",    type: "model", config: { model: "gpt-4o-mini", strict: false }, timeoutMs: 3000 },
      { id: "cache",   type: "cache", config: { threshold: 0.85 }, timeoutMs: 200 },
      { id: "human",   type: "human", config: { queue: "extraction-fallback" }, timeoutMs: Infinity },
    ],
  },
  {
    task: "intent_classify",
    globalTimeoutMs: 2000,
    steps: [
      { id: "primary", type: "model", config: { model: "gpt-4o-mini" }, timeoutMs: 1500 },
      { id: "rule",    type: "rule",  config: { matchers: ["keyword_classifier"] }, timeoutMs: 50 },
      { id: "default", type: "rule",  config: { default: "consult" }, timeoutMs: 10 },
    ],
  },
];
```

### 3.3 Fallback 的「短路」原则

每一级要带**成功判据**，不要「返回就行」：

| 级 | 成功判据 |
|----|---------|
| 模型 | 解析通过 + 业务校验通过 |
| 缓存 | 相似度 ≥ 阈值（如 0.85） |
| 规则 | 模板匹配命中 |
| 人工 | 用户进入排队 |

**反例**：模型返回一堆乱码也算「成功」进了下一级——必须 schema 校验 + 业务校验都过。

### 3.4 何时跳过 Fallback 链

不是所有请求都该跑完整链：

- **健康请求** 只跑第一级（主模型）就返回——别浪费资源；
- **已知必死场景**（如上游已熔断）直接跳到缓存 / 人工；
- **明确高 SLA 的请求）跳过所有降级 → 失败）——见 [六](#六何时不该静默切换)。

---

## 四、熔断与舱壁隔离

### 4.1 熔断（Circuit Breaker）

**触发条件**：某上游失败率 / 延迟超阈值 → 暂时熔断 → 快速失败 → 周期性探测恢复。

```typescript
class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failureCount = 0;

  constructor(
    private threshold: number,    // 失败次数阈值
    private cooldownMs: number,  // 熔断时长
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.openAt < this.cooldownMs) {
        throw new CircuitOpen();   // 快速失败，不调上游
      }
      this.state = "half-open";    // 探测
    }

    try {
      const result = await fn();
      this.failureCount = 0;
      this.state = "closed";
      return result;
    } catch (err) {
      this.failureCount++;
      if (this.failureCount >= this.threshold) {
        this.state = "open";
        this.openAt = Date.now();
      }
      throw err;
    }
  }
}
```

**小智实战参数**：

| 上游 | 阈值 | 冷却 | 理由 |
|------|------|------|------|
| gpt-4o | 5 次连续失败 | 30s | 不可短，避免抖动；不可长，故障感知慢 |
| 嵌入 API | 10 次 / min | 60s | 容忍偶发，重试足够 |
| 语音 ASR | 3 次连续 | 120s | 重资源，避免反复尝试 |

### 4.2 舱壁隔离（Bulkhead）

**目的**：A 租户 / A 任务挂了不连累 C 租户 / C 任务。

```typescript
// 池化限流：每租户独立信号量
class TenantBulkhead {
  private semaphores = new Map<string, Semaphore>();

  constructor(
    private maxConcurrent: number,  // 单租户最大并发
    private acquireTimeoutMs: number,
  ) {}

  async acquire(tenantId: string): Promise<void> {
    if (!this.semaphores.has(tenantId)) {
      this.semaphores.set(tenantId, new Semaphore(this.maxConcurrent));
    }
    const sem = this.semaphores.get(tenantId)!;
    await sem.acquire(this.acquireTimeoutMs);
  }

  release(tenantId: string): void {
    this.semaphores.get(tenantId)?.release();
  }
}

// 使用
const bulkhead = new TenantBulkhead(5, 2000); // 每租户最多 5 并发，超 2s 等不到就拒
await bulkhead.acquire("tenant_a");
try {
  const resp = await callLLM(req);
  return resp;
} finally {
  bulkhead.release("tenant_a");
}
```

**避免的悲剧**：某租户的脚本触发死循环，把整个 LLM 配额烧光 → 其他租户全瘫。

详见[《限流、重试与幂等》](06-限流重试与幂等.html) 和[《多租户与隔离》](08-多租户与隔离.html)。

---

## 五、用户可见话术设计

### 5.1 话术的三原则

| 原则 | 说明 |
|------|------|
| **诚实** | 不要伪装「我在帮你查」其实在转人工 |
| **可预期** | 告诉用户要等多久、能不能重试 |
| **可退出** | 给用户退出选项，不强留 |

### 5.2 各类降级的话术模板

| 场景 | 话术模板 |
|------|----------|
| **切小模型** | 「系统当前较忙，为你启动简洁模式，回答可能略简化」 |
| **缓存兜底** | 「以下是类似问题的历史答案，供参考」 |
| **BM25 退路** | 「（答案可能不够精准，建议补充关键词重试）」 |
| **排队** | 「当前请求较多，正在为你排队，预计等待 X 分钟」 |
| **转人工** | 「智能助手暂时无法处理，已为你转接人工客服，预计等待 X 分钟」 |
| **全站降级** | 「服务正在升级，预计 X 分钟恢复，给你带来不便敬请谅解」 |

### 5.3 避免的话术

| 反例 | 为什么错 |
|------|---------|
| 「正在帮你查询」（实际在兜底） | 撒谎，破坏信任 |
| 「抱歉出错了」（用户不知怎么办） | 没给下一步 |
| 「稍后重试」（用户没耐心等） | 没给等待时间 |
| 静默切小模型不告知 | 用户发现质量掉了更失望 |

---

## 六、何时不该静默切换

这是本题第二个学习要点的核心——**降级必须可见、可解释**。

### 6.1 静默切换的四个禁区

| 场景 | 为什么不静默 |
|------|-------------|
| **医疗 / 金融 / 法律** | 错误代价大，用户必须知道答案质量打折 |
| **付费承诺质量** | 收的是高质量的钱，不能偷偷降 |
| **不可逆操作** | 已退款 / 已发邮件，不能假装在做实际是缓存 |
| **合规审计场景** | 审计要求每次模型决策可追溯 |

### 6.2 可见性等级设计

```typescript
type DegradeNoticeLevel = "silent" | "subtle" | "explicit" | "blocking";

function getNoticeLevel(task: string): DegradeNoticeLevel {
  // 客服闲聊可以静默提
  if (task === "intent_classify") return "silent";
  // 简单问答摸中等到最轻提示
  if (task === "faq_answer") return "subtle";
  // 工单提取不可逆，必须明示
  if (task === "ticket_extraction") return "explicit";
  // 金融决策必须告诉用户答案可能不准确
  if (task === "loan_advice") return "blocking"; // 用户必须勾「我理解答案仅供参考」才能继续
}
```

### 6.3 必须告警的场景

降级触发即告警——不是事后看日志，是实时：

| 信号 | 告警级别 | 通知对象 |
|------|:---:|---------|
| Fallback 触发率 > 10% | 警告 | 工程群 |
| Fallback 触发率 > 30% | 严重 | Oncall |
| 转人工率 > 2% | 严重 | 产品 + 工程群 |
| 全站降级页开启 | 紧急 | 全员 |
| 熔断器打开 | 警告 | 工程群 |

---

## 七、端到端落地示例：四周迭代

小智从「全站挂了才知道」到「分级降级 + 自动恢复」的 4 周节奏：

| 周 | 任务 | 工具栈 | 完成标准 |
|----|------|--------|----------|
| W1 | 失败模式清单：列七类 + 配可观测信号 | 内部 wiki + 监控 | 失败清单文档 + 每类信号埋点 |
| W2 | Fallback 链配置：每个任务配 3~4 级链 | 配置中心 | 4 条主链路 + 短路人 |
| W3 | 熔断 + 舱壁 + 话术 | 中间件 + UI | 熔断 + 租户隔离 + 话术上线 |
| W4 | 降级演练 + 告警 + 复盘 | runbook + Grafana | 每月演练一次 + 告警全链路 |

**四周后的指标**（小智一年内）：

- 全站不可用时间：从 4.2h → 8min（-97%）
- 用户转人工无通知投诉：12 起 → 0 起
- 降级触发到恢复时间：平均 8min → 38s

---

## 参考资料

- [可靠性与成本工程](../../Agent开发知识/13-进阶与工程化/05-可靠性与成工程.html)——降级、熔断的工程基础
- [LLM 网关与路由](04-LLM网关与路由.html)——fallback 在网关层的实现
- [限流、重试与幂等](06-限流重试与幂等.html)——重试与幂等
- [多租户与隔离](08-多租户与隔离.html)——舱壁隔离的租户实现
- [工程实践](../../Agent开发知识/11-工程实践/01-工程实践.html)
- Michael Nygard《Release It!》——降级与熔断的经典参考

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **CSAT** | /ˌsiː sæt/ | Customer Satisfaction Score | 客户满意度评分 |
| **API** | /ˌeɪ piː ˈaɪ/ | Application Programming Interface | 应用程序接口 |
| **DNS** | /ˌdiː en ˈes/ | Domain Name System | 域名系统 |
| **TCP** | /ˌtiː siː ˈpiː/ | Transmission Control Protocol | 传输控制协议 |
| **ACL** | /əˈsiː el ˈeɪ/ | Access Control List | 访问控制列表 |
| **SLO** | /ˌes el ˈəʊ/ | Service Level Objective | 服务等级目标 |