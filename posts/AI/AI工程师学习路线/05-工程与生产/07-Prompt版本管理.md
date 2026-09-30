# Prompt 版本管理

> 最后修改时间：2026-09-30 14:22

> 状态：✅ 已补齐（2026-09-30）  
> 一句话定义：把提示词当 **一等制品** ——版本号、评审、灰度、回滚、与评测集绑定；改一个字也要走发布流程。

## 大纲

1. [为什么改一个字要走发布流程](#一为什么改一个字要走发布流程)
2. [存储：Git / 配置中心 / Prompt 平台](#二存储git--配置中心--prompt-平台)
3. [变更流程：评测门禁 → 灰度 → 全量](#三变更流程评测门禁--灰度--全量)
4. [与模型版本、知识库版本联合变更](#四与模型版本知识库版本联合变更)
5. [实验：同一流量多提示对照](#五实验同一流量多提示对照)
6. [如何证明新提示没伤到旧场景](#六如何证明新提示没伤到旧场景)
7. [端到端落地示例：四周迭代](#七端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [高级提示工程](../../Agent开发知识/13-进阶与工程化/03-高级提示工程.html)——提示设计与技巧
- [可观测性与 LLMOps](../../Agent开发知识/13-进阶与工程化/04-可观测性与LLMOps.html)——提示版本的指标体系
- [评测框架](../../Agent开发知识/13-进阶与工程化/08-评测框架与基准详解.html)——评测门禁
- [模型选型指南](01-模型选型指南.html)——模型版本变更
- [Token 成本估算](02-Token成本估算.html)——提示改动对成本的影响
- [延迟成本质量三角](03-延迟成本质量三角.html)——质量门禁的三角约束
- [LLM 网关与路由](04-LLM网关与路由.html)——灰度在网层的实现

## 学习要点（读后应能回答）

- 提示改一个字为什么要走发布流程？→ 见 [一](#一为什么改一个字要走发布流程)
- 如何证明新提示没伤到旧场景？→ 见 [六](#六如何证明新提示没伤到旧场景)

---

## 〇、贯穿案例：小智的「加一个逗号」事故

电商客服「小智」某日产品经理在线改了 `intent_classify` 提示词，从「请判断意图」改成了「请准确判断意图」——**只多了「准确」两个字**：

| 指标 | 改动前 | 改动后 | 变化 |
|------|:---:|:---:|:---:|
| 工单分类准确率 | 86% | 88% | +2pp |
| 「其他」类兜底率 | 9% | 23% | **+14pp** |
| 转人工率 | 8% | 14% | +6pp |
| 客服日报 | -0.7 CSAT | -0.5 CSAT | -0.3 |

为什么「准确」两个字会让「其他」类暴增？模型从「选最匹配的类」变成「选最准确的类」→ 不确定时就选「其他」。

**教训**：**提示词的行为是非线性的**，微小的改动可能产生巨大漂移——必须用评测门禁 + 灰度来保护。

---

## 一、为什么改一个字要走发布流程

### 1.1 提示词的四个特征

提示词不像传统代码：

| 特征 | 说明 |
|------|------|
| **非线性** | 改一个字可能产生巨大漂移（如案例） |
| **跨模型** | 同一 prompt 在 4o / Sonnet / Qwen 上行为不一致 |
| **依赖上下文** | 与 RAG 文档、工具定义、用户输入一起才生效 |
| **难调试** | 输出错了未必是 prompt 错——可能是检索、模型变了 |

### 1.2 不走流程的五个风险

```text
1. 无版本控制 → 改动丢了谁也不知道
2. 无评测门禁 → 退步上线，回滚都难
3. 无灰度 → 全量上线后发现问题，10 分钟全量体验崩坏
4. 无关联 → 不知道这次出问题是 prompt 改的、模型升级还是数据变了
5. 无审计 → 某些场景（医疗/金融）需要追溯决策依据
```

### 1.3 发布流程的最低标准

无论怎么简化，**这四步不可省**：

```text
改 prompt
  → 提交 PR（带 diff + 评测结果）
  → 评测门禁（不达标不许合并）
  → 灰度上线（5% → 50% → 100%）
  → 全量后存档（版本号 + 评测基线）
```

---

## 二、存储：Git / 配置中心 / Prompt 平台

### 2.1 三种存储方式对比

| 存储 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| **Git 仓库** | 版本控制天然 + 评审机制 + 可 diff | 无可视化、无业务侧参与 | 主要方案 |
| **配置中心**（Nacos/Apollo） | 热更新、运行时切 | 无版本对比、无评审 | 已有配置中心的团队 |
| **专用 Prompt 平台**（Portkey/PromptLayer） | 可视化、A/B、变量模板 | 与主线痛点脱节，需自研集成 | 提示词 200+ 的复杂团队 |

### 2.2 Git 存储的目录结构（推荐）

```text
prompts/
├── customer_service/
│   ├── intent_classify/
│   │   ├── v1.2.0.md       # 当前主版本
│   │   ├── v1.3.0-rc1.md   # 灰度候选
│   │   ├── changelog.md
│   │   └── evals/
│   │       ├── gold.json     # 评测集
│   │       ├── baseline.json # v1.2.0 基线结果
│   │       └── v1.3.0-rc1.json # 候选结果
│   └── ticket_extraction/
│       ├── v2.0.0.md
│       └── evals/
└── code_assistant/
    └── ...
```

每个 prompt 是一个独立文件，**文件名 = 版本号**，**目录名 = 用途**。

### 2.3 Front Matter 携带元信息

每个 prompt 文件带元信息，便于自动化：

```markdown
---
id: intent_classify
version: v1.3.0-rc1
status: stage
author: changergo
createdAt: 2026-09-10
evalSet: evals/gold.json
baselineScore: 0.86
candidateScore: 0.88
targetModel: gpt-4o-2025-01-15
---

# 意图分类提示词 v1.2.0

你是电平台的客服意图分类助手...

## 类别
- refund：退款申请
- ...
```

### 2.4 Prompt 的代码评审 PR 模板

```markdown
## Prompt 改动 PR 模板

### 改动信息
- **Prompt ID**：intent_classify
- **新版本**：v1.3.0
- **目标模型**：gpt-4o-2025-01-15

### diff 摘要
- 加了「准确」二字
- 调整了类别顺序

### 评测结果
| 指标 | v1.2.0 | v1.3.0 | Δ |
|------|:---:|:---:|:---:|
| 准确率 | 86% | 88% | +2pp |
| 召回率 | 91% | 90% | -1pp |
| 「其他」类比例 | 9% | 23% | +14pp ⚠️ |

### 风险
- 「其他」类暴增 14pp，需业务确认

### 上线策略
- 灰度 5% → 50% → 100%
- 告警：CSAT 下降 > 0.2 或转人工率 > 12% 立即回滚
```

---

## 三、变更流程：评测门禁 → 灰度 → 全量

### 3.1 三阶段详解

```text
阶段 1：评测门禁（本地）
  │
  ├── 拉 gold 评测集（500 条）
  ├── 跑 v1.3.0 vs v1.2.0 基线
  ├── 产出对比报告（自动发到 PR 评论）
  └── 检查门禁：
        ├── 主指标不下降 > 1pp
        ├── 无新质量胜败
        └── 无成本骤变

阶段 2：灰度上线（影子 / 5% / 50%）
  │
  ├── 影子流量：新 prompt 不下发，结果与 v1.2.0 对比
  ├── 5% 流量：业务指标观察 ≥ 24h
  ├── 50% 流量：业务指标观察 ≥ 48h
  └── 检查：CSAT / 转人工率 / 成功率 三项都达标

阶段 3：全量 + 存档
  │
  ├── 切 100%
  ├── 记录最终评测基线
  ├── 同步更新 changelog
  └── 下一个迭代可基于 v1.3.0 起点
```

### 3.2 评测门禁的实现

```typescript
interface EvalResult {
  taskId: string;
  candidateVersion: string;
  baselineVersion: string;
  metrics: {
    accuracy: number;
    refusalRate: number;
    costDelta: number;
  };
  passesGuard: number;
}

async function evalGate(id: string, candidate: string, baseline: string): Promise<EvalResult> {
  const goldCases = await loadGold(id);
  const candResults = await runEval(id, candidate, goldCases);
  const baseResults = await runEval(id, baseline, goldCases);

  const passesGuard =
    candResults.accuracy >= baseResults.accuracy - 0.01 &&       // 不退 1pp
    candResults.refusalRate <= baseResults.refusalRate + 0.03 && // 拒答不增 3pp
    candResults.costDelta <= 0.20;                              // 成本不增 20%

  return { taskId: id, candidateVersion: candidate, baselineVersion: baseline, metrics: { ... }, passesGuard };
}
```

### 3.3 灰度配置（与网关协作）

```typescript
// 网关读配置决定是否用新 prompt
interface PromptRolloutConfig {
  taskId: string;
  currentVersion: string;
  candidateVersion?: string;
  rolloutPercent: number;  // 0~100
  bucketKey: "userId";
}

function selectPromptVersion(config: PromptRolloutConfig, userId: string): string {
  if (!config.candidateVersion) return config.currentVersion;
  const bucket = hashToBucket(userId, 100);
  return bucket < config.rolloutPercent
    ? config.candidateVersion
    : config.currentVersion;
}
```

---

## 四、与模型版本、知识库版本联合变更

### 4.1 联合变更的版本耦合问题

```text
prompt v1.3 + gpt-4o + 知识库 v2 → 准确率 88%
prompt v1.3 + gpt-4o-mini + 知识库 v2 → 准确率 78%
prompt v1.3 + gpt-4o + 知识库 v3 → 准确率 85%（文档措辞变了）
```

**任一维度变了，组合结果都不同**——必须联合管理。

### 4.2 解决方案：版本快照

每次发布打一个快照，记录三个维度的版本号：

```typescript
interface VersionSnapshot {
  snapshotId: string;
  createdAt: string;
  promptVersions: Record<string, string>;   // { task: version }
  modelVersions: Record<string, string>;    // { gpt-4o: "2025-01-15" }
  knowledgeBaseVersion: string;
  evalBaseline?: { tag: string; score: number };
}

// 示例：prod-2026-09-15-r3
const PROD_SNAPSHOT: VersionSnapshot = {
  snapshotId: "prod-2026-09-15-r3",
  createdAt: "2026-09-15T10:00:00Z",
  promptVersions: {
    intent_classify: "v1.3.0",
    ticket_extraction: "v2.0.0",
    answer: "v1.1.5",
  },
  modelVersions: {
    "gpt-4o": "2025-01-15",
    "gpt-4o-mini": "2025-01-15",
  },
  knowledgeBaseVersion: "kb-2026-09-12",
  evalBaseline: { tag: "v1.3.0-baseline", score: 0.86 },
};
```

### 4.3 联合变更的纪律

| 规则 | 说明 |
|------|------|
| **同时只改一个维度** | 改 prompt + 升模型同时 → 排错困难 |
| **重大变更隔周** | 改 prompt 这周不升模型 |
| **全量前冻结模型** | prompt 灰度期间禁止后台自动升级 |
| **回滚要一起** | prompt 退回 v1.2.0 + 模型回到老版本 |

---

## 五、实验：同一流量多提示对照

### 5.1 同流量多版本

同一流量同时跑 N 个版本，记录结果差异：

```typescript
interface PromptExperiment {
  taskId: string;
  variants: { version: string; weight: number }[];     // 权重加起来 ≤ 100
  metrics: string[];
  minSamples: number;
  bucketKey: "userId";
}

function selectVariant(exp: PromptExperiment, userId: string): string {
  const bucket = hashToBucket(userId, 100);
  let cum = 0;
  for (const v of exp.variants) {
    cum += v.weight;
    if (bucket < cum) return v.version;
  }
  return exp.variants[0].version;
}
```

### 5.2 实验配置示例

```typescript
// A/B/n 实验：v1.2.0 (50%) vs v1.3.0 (30%) vs v1.3.1-rc (20%)
const EXP_INTENT: PromptExperiment = {
  taskId: "intent_classify",
  variants: [
    { version: "v1.2.0", weight: 50 },
    { version: "v1.3.0", weight: 30 },
    { version: "v1.3.1-rc", weight: 20 },
  ],
  metrics: ["accuracy", "refusal_rate", "cost_usd"],
  minSamples: 1000,
  bucketKey: "userId",
};
```

### 5.3 多提示对照的坑

| 坑 | 规避 |
|----|------|
| **样本不足下结论** | 每组 ≥ 5000 样本 |
| **不 hash 分桶** | 同一用户被切走多次，结果不可信 |
| **指标只看主指标** | 同时看「其他类比例」「成本」等次要指标 |
| **结论太早** | 跑够 7 天再下结论，周一周五流量结构不同 |

---

## 六、如何证明新提示没伤到旧场景

这是本题第二个学习要点的核心——答案是**分层防护 + 全场景回归**。

### 6.1 防护四层

| 层 | 做什么 | 防御什么 |
|----|-------|---------|
| **单元评测** | gold 集 500~5000 条样本 | 主场景退步 |
| **难例回归** | 历史失败 / 边缘案例 100~200 条 | 已知边界场景 |
| **红队 / 对抗** | 注入攻击、越狱、隐私 | 安全与合规 |
| **A/B 灰度** | 真实流量对比 | 评测集未覆盖的场景 |

### 6.2 难例库的维护

```typescript
interface HardCase {
  id: string;
  input: string;
  expectedOutput: unknown;
  category: "edge_case" | "previous_failure" | "user_complaint";
  capturedAt: string;
  capturedReason: string;
}

// 难例来源
const HARD_CASE_SOURCES = [
  // 1. 生产失败案例（命中 fallback / 转人工）
  { filter: (r) => r.status === "fallback", category: "previous_failure" },
  // 2. 用户差评（CSAT < 3）
  { filter: (r) => r.csat < 3, category: "user_complaint" },
  // 3. 主动注入（空输入、超长、特殊符号）
  { filter: (r) => r.isSynthetic && r.failed, category: "edge_case" },
];
```

### 6.3 落地示例：四层防护流水线

```typescript
async function promoteGuard(taskId: string, candidate: string): Promise<{ pass: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const baseline = await getCurrentVersion(taskId);

  // 第 1 层：主评测集
  const mainEval = await evalOn(taskId, candidate, "main");
  if (mainEval.accuracy < getBaselineAccuracy(taskId) - 0.01) {
    reasons.push(`main_eval_regress: ${mainEval.accuracy} < ${getBaselineAccuracy(taskId) - 0.01}`);
  }

  // 第 2 层：难例回归
  const hardCases = await loadHardCases(taskId);
  const hardEval = await evalOnCases(taskId, candidate, hardCases);
  if (hardEval.passRate < 0.90) {
    reasons.push(`hard_cases_regress: ${hardEval.passRate}`);
  }

  // 第 3 层：红队
  const redTeamResults = await runRedTeam(taskId, candidate);
  if (redTeamResults.violations > 0) {
    reasons.push(`red_team_violations: ${redTeamResults.violations}`);
  }

  // 第 4 层：A/B 灰度（异步）
  scheduleABTest(taskId, baseline, candidate);

  return { pass: reasons.length === 0, reasons };
}
```

### 6.4 提示改动的常见回退信号

| 信号 | 阈值 | 行动 |
|------|:---:|------|
| 主指标退步 | > 1pp | 立即回滚 |
| 难例退步 | > 5pp | 立即回滚 |
| 红队违规 | 任何 | 永远回滚 + 安全复盘 |
| CSAT 下降 | > 0.2 | 立即回滚 |
| 转人工率上升 | > 30% | 立即回滚 |
| 成本暴涨 | > 50% | 立即回滚 |

---

## 七、端到端落地示例：四周迭代

小智从「随便改 prompt」到「全流程管控」的 4 周节奏：

| 周 | 任务 | 工具栈 | 完成标准 |
|----|------|--------|----------|
| W1 | Prompt 资产化：所有在用 prompt 落 Git + 版本号 + 评测集 | Git + CI | prompts/ 下至少 5 个 prompt 完整版化 |
| W2 | 评测门禁：每次 PR 自动跑评测 + 贴报告到 PR | GitHub Actions + 评测脚本 | 主 PR 全部过门禁 |
| W3 | 灰度基础设：网关读 rollout 配置 + 哈希分桶 | 网关 + 配置中心 | 可设置 5%/20%/50% 灰度 |
| W4 | 难例库 + 红队 + 回滚 SOP | 难例库 + runbook | 上线后能 30s 回滚 |

**四周后的指标**（小智一年内）：

- 「加一个逗号」类事故：从年 6 起 → 0 起
- Prompt 改动平均上线周期：4 天 → 1 天（评测门禁并行）
- 事故回滚时间：4h → 30s（Feature Flag + 快照）

---

## 参考资料

- [高级提示工程](../../Agent开发知识/13-进阶与工程化/03-高级提示工程.html)
- [可观测性与 LLMOps](../../Agent开发知识/13-进阶与工程化/04-可观测性与LLMOps.html)
- [评测框架](../../Agent开发知识/13-进阶与工程化/08-评测框架与基准详解.html)
- [模型选型指南](01-模型选型指南.html)
- [LLM 网关与路由](04-LLM网关与路由.html)
- PromptLayer（[promptlayer.com](https://promptlayer.com)）——Prompt 平台参考
- LangSmith（[docs.smith.langchain.com](https://docs.smith.langchain.com)）——Prompt 版本管理参考

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **PR** | /ˌpiː ˈɑːr/ | Pull Request | 拉取请求 |
| **CSAT** | /ˌsiː sæt/ | Customer Satisfaction Score | 客户满意度评分 |
| **RC** | /ˌɑːr ˈsiː/ | Release Candidate | 发布候选 |
| **CI** | /ˌsiː ˈaɪ/ | Continuous Integration | 持续集成 |
| **SLA** | /ˌes el ˈeɪ/ | Service Level Agreement | 服务等级协议 |