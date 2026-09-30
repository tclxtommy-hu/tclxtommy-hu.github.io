# LLM 网关与路由

> 最后修改时间：2026-09-30 14:22

> 状态：✅ 已补齐（2026-09-30）  
> 一句话定义：在应用与多家模型 API 之间加 **统一网关** ——鉴权、限流、路由、观测、fallback、日志一站式——业务代码只看到「调一个 chat」。

## 大纲

1. [为何需要网关](#一为何需要网关)
2. [网关的核心职责](#二网关的核心职责)
3. [路由策略：任务类型、复杂度、成本、区域](#三路由策略)
4. [开源网关对照：LiteLLM / Portkey / 自建](#四开源网关对照)
5. [网关该不该改写 prompt](#五网关该不该改写-prompt)
6. [日志与 trace 贯通](#六日志与-trace-贯通)
7. [路由错误如何快速回滚](#七路由错误如何快速回滚)
8. [端到端落地示例：四周迭代](#八端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [可靠性与成本工程](../../Agent开发知识/13-进阶与工程化/05-可靠性与成本工程.html)（模型路由小节）
- [模型服务化](../../AI知识库/11-推理与部署/02-模型服务化.html)
- [可观测性与 LLMOps](../../Agent开发知识/13-进阶与工程化/04-可观测性与LLMOps.html)
- [模型选型指南](01-模型选型指南.html)——路由策略的输入
- [降级与 Fallback](05-降级与Fallback.html)——路由失败的兜底
- [限流、重试与幂等](06-限流重试与幂等.html)——网关层的限流实现
- [延迟成本质量三角](03-延迟成本质量三角.html)——路由决策的三角约束

## 学习要点（读后应能回答）

- 网关层该不该改写 prompt？→ 见 [五](#五网关该不该改写-prompt)
- 路由错误如何快速回滚到单一模型？→ 见 [七](#七路由错误如何快速回滚)

---

## 〇、贯穿案例：小智网关 v2.0 的诞生

小智 v1 直接在业务代码里写 OpenAI SDK，三处痛点：
1. **三处调用 SDK**——加个日志要改三个文件；
2. **模型换了一家，三个月内迁移代码翻车**——密钥散落各处，有 2 处漏改；
3. **某天 OpenAI 限流**，没有 fallback，整个产品停摆 40 分钟。

上 LiteLLM 网关后：

- 业务代码只 `import { chat } from "@/lib/gateway"`；
- 加路由 / fallback / 限流不动业务代码；
- 某上游挂了，自动切走，零感知；
- 三个月内加 4 个新模型，平均迁移成本 < 1 人时。

---

## 一、为何需要网关

### 1.1 没有网关的四个典型痛

| 痛 | 现象 | 后果 |
|---|------|------|
| **多 SDK 维护** | 业务里同时 import `openai`、`@anthropic-ai/sdk`、`@qwen-sdk` | 每次升级 API 要改 N 处 |
| **密钥泄露** | 密钥散落 12 个配置文件 | 一个泄漏 = 全公司重置 |
| **路由散落** | 每个调用点自己写「if 简单就走 mini」 | 路由策略不一致，难调 |
| **观测盲区** | 各家 SDK 日志格式不同 | 没法做统一看板 |

### 1.2 网关的五大收益

1. **统一接口**：业务只对一套 SDK，模型切换零代码改动；
2. **统一密钥**：密钥只在网关环境，业务代码完全不接触；
3. **路由集中**：路由策略一处配，全应用生效；
4. **观测聚合**：所有调用日志格式一致，统一看板；
5. **容错落地**：fallback、限流、重试在网关层做，业务零感知。

### 1.3 何时不需要网关

| 场景 | 建议 |
|------|------|
| 个人 Demo / 一次性脚本 | 直接调 SDK，不复杂 |
| 只有 1 个模型 + 1 个上游 | 直调即可 |
| 日均调用 < 1000 | 自建成本不划算 |
| **生产 + 多模 / 多上游 / 多团队** | **必须上网关** |

小智 v1 阶段是「1 模型 + 1 上游 + 日均 2000 调用」——可以直调。v2 阶段「3 模型 + 3 上游 + 日均 2 万 + 4 个业务方」——必须上网关。

---

## 二、网关的核心职责

### 2.1 六大职责清单

| 职责 | 输入 | 输出 |
|------|------|------|
| **鉴权** | API Key、JWT、租户标识 | 通过 / 拒绝 |
| **限流** | QPS / RPM / TPM / 用户配额 | 接受 / 429 |
| **路由** | 请求参数 + 路由策略 | 上游选择 |
| **可观测** | 所有调用 | 日志、指标、trace |
| **重试 / Fallback** | 失败请求 | 退避重试、切备 |
| **成本聚合** | 调用 token × 单价 | 实时成本看板 |

### 2.2 落地示例：网关请求生命周期

```typescript
async function gatewayHandle(req: ChatRequest, ctx: GatewayContext): Promise<ChatResponse> {
  // 1. 鉴权
  const auth = await checkAuth(ctx.apiKey);
  if (!auth.ok) throw new Unauthorized();

  // 2. 限流（用户级 + 平台级）
  await Promise.all([
    rateLimit(`user:${auth.userId}`, req.tokens),
    rateLimit(`platform:total`, req.tokens),
  ]);

  // 3. 路由决策
  const target = route(req, ctx.routingTable);

  // 4. 可观测埋点
  const traceId = newTraceId();
  logStart(traceId, auth.userId, target.model, req);

  try {
    // 5. 调用上游（含重试 + fallback）
    const resp = await callUpstreamWithRetry(target, req, { maxRetries: 2 });

    // 6. 计费 + 日志落盘
    recordCost(traceId, auth.userId, target.model, resp.usage);
    logEnd(traceId, "ok", resp);
    return resp;
  } catch (err) {
    logEnd(traceId, "error", err);

    // 7. fallback：路由表配置的备选模型
    if (target.fallbackModel) {
      const fallbackResp = await callUpstream(target.fallbackModel, req);
      recordCost(traceId, auth.userId, target.fallbackModel, fallbackResp.usage);
      return fallbackResp;
    }
    throw err;
  }
}
```

### 2.3 限流的四类粒度

| 粒度 | 用途 | 示例 |
|------|------|------|
| **平台级 TPM** | 防止月度预算爆 | 平台总 TPM < 5M |
| **用户级 QPS** | 防止单用户滥用 | 单用户 QPS < 10 |
| **租户级配额** | 多租户 SaaS 计费 | 高级租户 100 RPM，普通 10 RPM |
| **路由级** | 防某模型被打爆 | gpt-4o QPS < 500 |

详见[《限流、重试与幂等》](06-限流重试与幂等.html)。

---

## 三、路由策略

### 3.1 路由的四类输入

```text
路由决策 = f(
  任务类型,        // intent / extraction / answer
  请求复杂度,      // 由分类器预估
  用户配额,        // 剩余 budget
  模型可用性,      // 上游健康度
)
```

### 3.2 路由策略类型表

| 策略 | 适用 | 优点 | 缺点 |
|------|------|------|------|
| **任务路由** | 不同子任务用不同模型 | 简单清晰 | 需业务侧分类 |
| **复杂度路由** | 简单走 mini，复杂走 4o | 成本友好 | 复杂度分类本身会出错 |
| **预算路由** | 预算不足走小模型 | 兜底成本 | 体验有跳变 |
| **健康度路由** | 某上游挂了切备 | 韧性 | 健康度探测有延迟 |
| **区域路由** | 国内走 DashScope，海外走 OpenAI | 合规友好 | 配置复杂 |

### 3.3 落地示例：多策略复合路由

```typescript
interface RoutingContext {
  task: "intent" | "extraction" | "answer" | "dispute" | "summary";
  userTier: "free" | "pro" | "enterprise";
  userQuotaRemaining: number;
  upstreamHealth: Record<string, "healthy" | "degraded" | "down">;
  estimatedComplexity: "simple" | "moderate" | "complex";
}

function route(ctx: RoutingContext, models: ModelCard[]): ModelCard {
  // 1. 健康度过滤
  const healthy = models.filter((m) => ctx.upstreamHealth[m.name] !== "down");
  if (healthy.length === 0) throw new AllUpstreamsDown();

  // 2. 任务级硬路由
  if (ctx.task === "dispute") {
    return healthy.find((m) => m.name.includes("r1")) ?? healthy[0];
  }

  // 3. 用户配额过滤（预算路由）
  const affordable = ctx.userQuotaRemaining < 0.1
    ? healthy.filter((m) => m.inputPricePer1k < 0.001)
    : healthy;

  // 4. 复杂度路由
  if (ctx.estimatedComplexity === "simple") {
    return affordable.find((m) => m.name.includes("mini") || m.name.includes("7b"))
      ?? affordable[0];
  }

  // 5. 兜底：第一个可用的
  return affordable[0];
}
```

### 3.4 路由的可调试性

**路由决策必须可观测**——否则线上出问题排查不了：

```typescript
// 网关每次路由都打这条结构化日志
log.info("route_decision", {
  traceId,
  requestId,
  task: ctx.task,
  selectedModel: target.name,
  reason: "task=dispute, healthy_filter_passed=3, affordability_ok",
  candidatesConsidered: candidates.map((c) => ({ name: c.name, score: c.score, dropped: c.dropReason })),
});
```

---

## 四、开源网关对照

### 4.1 三家主流方案

| 方案 | 语言 | 部署 | 路由策略 | 适配模型 | 观测 | 学习曲线 |
|------|------|------|---------|---------|------|---------|
| **LiteLLM** | Python | Docker / K8s | 配置文件 + 路由键 | 100+ | 内置日志 + 可对接 OTEL | 低 |
| **Portkey** | TypeScript | Cloud / Self-host | 代码 SDK + 控制台 | 50+ | 内置看板 | 低 |
| **OpenRouter** | — | SaaS | API 透传 | 50+ | 自带 | 无（纯托管） |
| **自建** | 任意 | 任意 | 自写 | 任意 | 自写 | 高 |

### 4.2 LiteLLM 配置（最流行）

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o-2025-01-15
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: qwen-local
    litellm_params:
      model: openai/qwen2.5-7b-instruct
      api_base: http://vllm.internal:8000/v1
      api_key: "EMPTY"

  - model_name: deepseek-r1
    litellm_params:
      model: deepseek/deepseek-reasoner
      api_key: os.environ/DEEPSEEK_API_KEY

router_settings:
  num_retries: 2
  timeout: 30
  fallbacks:
    - gpt-4o: [claude-sonnet, qwen-local]
    - claude-sonnet: [gpt-4o, qwen-local]

litellm_settings:
  drop_params: true
  set_verbose: false
  telemetry: false
```

### 4.3 Portkey 代码风格（更灵活）

```typescript
import { Portkey } from "portkey-sdk";

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  config: "pc-basic-xxx", // 控制台路由策略 ID
});

const resp = await portkey.chat.completions.create({
  messages: [{ role: "user", content: "Hello" }],
  // 路由策略由 Portkey 控制台决定，无需代码
});
```

### 4.4 选型决策

```text
需要快速落地 + 多模型支持    → LiteLLM
需要细粒度路由控制 + 托管    → Portkey Cloud
需要完全自定义 + 团队有 Python → 自建
不想运维任何东西 + 调用量小  → OpenRouter SaaS
```

小智 v2→v3 选了 LiteLLM 自托管，理由：

- 适配模型多（含自托管 vLLM）
- 配置文件即路由，改路由无需发版
- 可对接 OpenTelemetry，日志进 ClickHouse

---

## 五、网关该不该改写 prompt

### 5.1 立场：**默认不该** ，少数特定优化可以

这是本题第一个学习要点的核心——答案是 **基本不该**。

| 场景 | 是否改 | 理由 |
|------|:---:|------|
| **系统提示插 PII 脱敏** | ✅ | 安全保障 |
| **追加统一的 few-shot 示例** | ⚠️ 可选 | 跨模型一致，但增 token |
| **改写业务自定义的 prompt** | ❌ | 破坏业务语义 |
| **自动加当前时间** | ⚠️ 可选 | 场景相关（如「今天日期」） |
| **自动插思考链提示** | ❌ | 模型相关，小模型会变糟 |
| **重写敏感词** | ✅ | 合规要求 |

### 5.2 为什么网关不该改 prompt

1. **业务语义破坏**：业务侧精心设计的 prompt 网关动了 → 行为变了，难排查；
2. **模型依赖**：某 prompt 在 4o 上好用，迁到 Claude 可能变糟；
3. **版本管理噩梦**：网关的 prompt 改版本，业务不知道 → 行为波动；
5. **可观测盲区**：网关改的 prompt 不在调用日志里 → 出问题复盘困难。

### 5.3 例外场景的处理

如果非要改，写在 **middleware 层** 而非网关层：

```typescript
// 业务中间件
const sanitizePII = (msg: ChatMessage): ChatMessage => {
  if (typeof msg.content !== "string") return msg;
  return {
    ...msg,
    content: msg.content.replace(
      /\d{17}[\dXx]/g, // 身份证号
      "[ID_REDACTED]",
    ),
  };
};

const messages = req.messages.map(sanitizePII);
const resp = await gateway.chat(messages); // 网关不动 prompt
```

---

## 六、日志与 trace 贯通

### 6.1 日志的四层结构

| 层 | 内容 | 例子 |
|----|------|------|
| **请求元数据** | traceId、userId、routeKey | `traceId=abc123, user=u_456, task=extraction` |
| **调用参数** | model、messages 摘要、temperature | `model=gpt-4o, msgs=3, temp=0.2` |
| **响应结果** | content、usage、cost | `tokens=820, cost=$0.0068, latency=1.4s` |
| **决策路径** | 路由选择、健康度、fallback | `route:task→extraction, healthy:3/3, fallback:none` |

### 6.2 落地示例：结构化日志

```typescript
interface GatewayLog {
  ts: string;
  traceId: string;
  userId: string;
  model: string;
  task?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  status: "ok" | "error" | "fallback";
  errorCode?: string;
  routeDecision: string;
  isCacheHit?: boolean;
}

function logCall(log: GatewayLog) {
  // 输出 JSON Lines 到 stdout / ClickHouse / OpenTelemetry
  console.log(JSON.stringify(log));
}
```

### 6.3 trace ID 贯通

网关 traceId 必须传给上游，再回传给业务：

```typescript
// 业务侧发起
const traceId = crypto.randomUUID();
const resp = await gateway.chat(req, { traceId });

// 网关侧传递
await fetch(upstreamUrl, {
  headers: {
    "x-trace-id": traceId,  // 关键：网关加 header 让上游记录
    "authorization": `Bearer ${apiKey}`,
  },
  body: JSON.stringify(req),
});

// 上游日志侧回传
// OpenAI / Claude 都会在响应 header 回 x-request-id
// 网关把它和 traceId 关联起来
```

### 6.4 看板最小集

| 看板 | 维度 | 指标 |
|------|------|------|
| **请求量** | 时间 / 路由 / 模型 | RPM |
| **延迟** | 时间 / 路由 / 模型 | P50 / P95 / P99 |
| **成本** | 时间 / 用户 / 模型 | USD / hour |
| **错误率** | 时间 / 上游 / 错误码 | % |
| **Fallback 触发率** | 时间 / 主→备 | % |

---

## 七、路由错误如何快速回滚

这是本题第二个学习要点的核心——答案是 **路由表 + Feature Flag 双保险**。

### 7.1 三层回滚方案

| 层 | 机制 | 速度 | 适用 |
|----|------|:---:|------|
| **路由表版本** | 改配置文件 + 热重载 | < 1 min | 一般路由调整 |
| **Feature Flag** | 业务代码读 flag | < 30s | 紧急回滚（v3 → v2） |
| **熔断自动降级** | 上游失败率超阈值 | < 10s | 某上游挂了 |

### 7.2 路由表热重载（LiteLLM 示例）

```bash
# 改完 litellm.yaml 不用重启
curl -X POST http://litellm.local:4000/config/update \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d @new-routing.yaml
```

或者直接挂载到 K8s ConfigMap + Reloader Sidecar。

### 7.3 Feature Flag 紧急回滚

```typescript
const ROUTES_V3_ENABLED = await flags.get("route-v3");

function getRoute(req: ChatRequest): RouteRule {
  if (!ROUTES_V3_ENABLED) {
    return ROUTES_V2[req.task]; // 紧急回滚到 v2 路由
  }
  return ROUTES_V3[req.task];
}

// 一行关 v3
await flags.set("route-v3", false);
```

### 7.4 熔断自动降级

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureAt = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private threshold: number = 5,
    private cooldownMs: number = 30000,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureAt < this.cooldownMs) {
        throw new CircuitOpen();
      }
      this.state = "half-open"; // 探测
    }

    try {
      const result = await fn();
      this.failureCount = 0;
      this.state = "closed";
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureAt = Date.now();
      if (this.failureCount >= this.threshold) {
        this.state = "open";
      }
      throw err;
    }
  }
}
```

熔断触发后，路由自动切到 fallback 模型——见[《降级与 Fallback》](05-降级与Fallback.html)。

### 7.6 回滚检查清单

每次重大路由变更前后必做：

- [ ] 路由表版本号 + git commit 记录
- [ ] Feature Flag 当前值记录
- [ ] 最近 1 小时主路径调用成功率 + 延迟 P95
- [ ] Fallback 路径冒烟测试（手工发 10 条请求）
- [ ] 告警阈值更新（对新路由的健康度阈值）
- [ ] 回滚 SOP（谁来决定、谁来执行、如何验证）

---

## 八、端到端落地示例：四周迭代

小智从「业务代码直调 SDK」到「网关 + 路由」的 4 周节奏：

| 周 | 任务 | 工具栈 | 完成标准 |
|----|------|--------|----------|
| W1 | 网关选型 + 部署：LiteLLM 自托管 | Docker + LiteLLM | 三上游全部接通 |
| W2 | 业务迁移：SDK 调用 → gateway 调用 | 业务代码改造 | 业务代码 0 直接接触密钥 |
| W3 | 路由策略 + 限流 + 熔断 | 配置文件 + 中间件 | 路由策略文档化 |
| W4 | 监控告警 + 灰度 + 回滚 | Grafana + Feature Flag | 3 层回滚就绪 |

**四周后的指标**：

- 业务代码密钥：散落 12 处 → 0 处
- 路由调整耗时：6 小时 → 30 秒（改 YAML 热重载）
- 上游故障恢复时间：40 分钟 → 30 秒（自动熔断 + fallback）
- 月均故障时间：4.2 小时 → 8 分钟

---

## 参考资料

- [可靠性与成本工程](../../Agent开发知识/13-进阶与工程化/05-可靠性与成本工程.html)
- [模型服务化](../../AI知识库/11-推理与部署/02-模型服务化.html)
- [可观测性与 LLMOps](../../Agent开发知识/13-进阶与工程化/04-可观测性与LLMOps.html)
- [降级与 Fallback](05-降级与Fallback.html)
- [限流、重试与幂等](06-限流重试与幂等.html)
- LiteLLM 文档（[docs.litellm.ai](https://docs.litellm.ai)）
- Portkey 文档（[portkey.ai/docs](https://portkey.ai/docs)）

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **SDK** | /ˌes diː ˈkeɪ/ | Software Development Kit | 软件开发工具包 |
| **TPM** | /ˌtiː piː ˈem/ | Tokens Per Minute | 每分钟 token 数 |
| **QPS** | /ˌkjuː piː ˈes/ | Queries Per Second | 每秒查询数 |
| **RPM** | /ˌɑːr piː ˈem/ | Requests Per Minute | 每分钟请求数 |
| **PII** | /ˌpiː aɪ aɪ ˈtiː/ | Personally Identifiable Information | 个人可识别信息 |
| **P95** | /ˌpiː naɪn tiː faɪv/ | 95th Percentile | 第 95 百分位数 |
| **OTEL** | /əʊˈtel/ | OpenTelemetry | 开放遥测标准 |
| **SOP** | /ˌes əʊ ˈpiː/ | Standard Operating Procedure | 标准操作流程 |
| **K8s** | /ˌkeɪ eɪts/ | Kubernetes | 容器编排平台 |