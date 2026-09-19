# Agent.md 与 Memory.md 规范

> 一句话定义：Agent.md 是描述 Agent 身份/能力/边界的配置文件；Memory.md 是 Agent 持久化记忆的 Markdown 存储——两者都是用 Markdown 组织 Agent 元信息的轻量实践。
>
> 缩写与术语：英文术语与缩写首次出现附音标/全拼，汇总见 §8。

---

## 1. Agent.md

### 1.1 定义
Agent.md 是一个 Markdown 文件，用结构化文本描述一个 Agent 的**身份、职责、能力、边界、工具、行为规范、输出格式、失败处理**，作为 Agent 的"配置 + 说明 + 系统提示来源"。

它本质上是**声明式 Agent 定义**：把原本散落在系统提示、配置文件、代码硬编码里的 Agent 行为约束，统一收敛到一个可读、可版本化、可评审的 Markdown 文件中。

### 1.2 典型内容（完整模板）

```markdown
# Agent: 代码审查员

## 身份
你是资深代码审查员，专注代码质量与安全。
风格：直接、有依据、分级清晰，避免空泛评价。

## 职责
- 审查代码变更（PR diff）
- 指出 bug、安全、性能、可维护性问题
- 给出可执行的改进建议

## 能力 / 工具
- 静态分析工具（eslint/semgrep）
- 代码库检索（grep/语义检索）
- 规范知识库（团队编码规范）

## 边界
- 不直接修改代码，只给建议
- 不审查超出本仓库的代码
- 不对业务正确性做最终裁决（需人工确认）

## 输入约定
- 输入：PR diff + 上下文文件路径
- 不接受：二进制文件、超 10k 行的单次输入

## 输出格式
按严重程度分级，每条附位置与示例：
- [critical] 路径:行号 — 问题描述 — 建议
- [major]    ...
- [minor]    ...
末尾给一句总体结论。

## 行为规范
- 每条建议必须可执行（给出代码或具体步骤）
- 不确定时明确标注"需人工确认"，不臆测
- 优先级：安全 > 正确性 > 性能 > 风格

## 失败处理
- 工具调用失败：重试 1 次，仍失败则降级为人工提示
- 输入不完整：先请求补全，不自行假设
```

### 1.3 字段规范建议

| 字段 | 必填 | 作用 | 写作要点 |
|---|---|---|---|
| 身份 | ✅ | 定调语气与视角 | 一句话角色 + 风格描述 |
| 职责 | ✅ | 划定做什么 | 用动词开头，可枚举 |
| 能力/工具 | ✅ | 声明可用手段 | 列具体工具名，避免"各种工具" |
| 边界 | ✅ | 划定不做什么 | 与职责对称，显式否定 |
| 输入约定 | ⭐ | 约束入口 | 格式、规模、不接受项 |
| 输出格式 | ⭐ | 约束出口 | 结构化、可解析 |
| 行为规范 | ⭐ | 细化风格 | 可量化优先级与规则 |
| 失败处理 | ⭐ | 健壮性 | 降级、重试、人工兜底 |

> ✅ = 强烈建议，⭐ = 进阶建议

### 1.4 价值
- **声明式配置**：用 Markdown 声明 Agent 行为，易读易改，无需改代码。
- **可版本化**：随代码库管理，可追溯 Agent 行为演进。
- **团队共享**：非工程人员（PM/法务/安全）也能读懂与评审 Agent 行为。
- **可组合**：多个 Agent.md 定义不同角色，配合多 Agent 系统。
- **可测试**：Agent.md 即"行为契约"，可据此做回归评测。
- **可移植**：跨 IDE/框架复用（VS Code、Cursor、Claude Code 等都支持类似约定）。

### 1.5 最佳实践

**写作层面**
- **身份要"窄"**：一个 Agent 只扮演一个清晰角色，避免"全能助手"式定义。
- **职责与边界对称**：每条职责尽量配一条"不做"，防止越界。
- **用动词、可量化**：写"按严重程度分级并附行号"，而非"认真审查"。
- **显式否定**：把常见误用写成边界，如"不臆测业务逻辑"。
- **输出可解析**：约定结构化格式（JSON/分级列表），便于下游消费。
- **示例驱动**：复杂规范附 1-2 个正例/反例，比纯描述更有效。

**工程层面**
- **分层组织**：根目录放全局 `Agent.md`，子模块放局部覆盖；遵循"就近原则"。
- **applyTo 精确**：若平台支持作用域（如 VS Code `applyTo`），按文件模式精确匹配，避免污染无关场景。
- **与系统提示解耦**：Agent.md 是"源"，系统提示由它生成/注入，不要反向在提示里硬编码。
- **纳入评审**：Agent.md 变更走 PR 评审，像改代码一样改 Agent 行为。
- **加版本与变更日志**：文件头注明版本与最后更新日期，便于追溯。
- **做评测**：用 Agent.md 作为行为契约，构建回归用例集，防止行为漂移。

**安全层面**
- **最小工具集**：只声明真正需要的工具，避免过度授权。
- **敏感操作显式约束**：如"删除/部署类操作必须人工确认"。
- **不存密钥**：Agent.md 是公开配置，绝不放密钥/Token。

### 1.6 反模式
- ❌ **全能 Agent**：一个文件塞满所有职责，边界模糊。
- ❌ **空泛形容词**："认真、专业、友好"——不可执行、不可测试。
- ❌ **隐藏硬编码**：行为约束散落在代码里，Agent.md 形同虚设。
- ❌ **从不更新**：Agent.md 与实际行为脱节，变成过期文档。
- ❌ **过度授权**：为图方便给所有工具权限，放大风险。

### 1.7 实践生态
- VS Code Copilot：`.instructions.md` / `copilot-instructions.md` / `.prompt.md`
- 通用约定：`AGENTS.md`（多 Agent 协作中的 Agent 描述文件）
- Cursor：`.cursorrules`
- Claude Code：`CLAUDE.md`
- 本质相同：用 Markdown 组织 Agent 元信息。

---

## 2. Memory.md

### 2.1 定义
Memory.md 是用 Markdown 文件持久化 Agent 记忆的轻量实践——把关键事实、决策、偏好以结构化文本存盘，跨会话复用。

它解决的是 **LLM** /ˌel el ˈem/ （ **Large Language Model** /lɑːdʒ ˈlæŋɡwɪdʒ ˈmɒdl/ ，大语言模型） **无状态** 的问题：每次会话默认"失忆"，Memory.md 让 Agent 能"记住"跨会话的关键信息，而无需数据库。

### 2.2 典型内容（分层模板）

```markdown
# Memory

> 维护人：Agent 自动写入 + 人工定期整理
> 最后更新：2026-06-27
> 注入策略：用户偏好全量注入；项目事实按需；历史决策摘要注入

## 用户偏好（高频硬约束，全量注入）
- 偏好简洁回答，少用客套
- 代码风格：TypeScript + 2 空格 + 单引号
- 回答语言：中文

## 项目事实（稳定硬事实，按需注入）
- 主分支: main
- 测试命令: npm test
- 部署: vLLM on k8s
- 关键依赖: React 18 / Node 20

## 历史决策（低频参考，摘要注入）
- 2026-06-20: 选 vLLM 部署，因成本与吞吐（详见 ADR-001）
- 2026-06-25: 弃用 X 工具，因不稳定

## 待办 / 临时（短期，定期清理）
- [ ] 待确认：API 限流策略
- [ ] 临时：本周用 staging 环境测试

## 过期归档（保留但不再注入）
- 2026-05-01: 旧部署方案（已废弃）
```

### 2.3 记忆分层模型

| 层级 | 内容 | 更新频率 | 注入策略 | 示例 |
|---|---|---|---|---|
| L1 用户偏好 | 稳定个人/团队偏好 | 低 | 全量注入 | "用 TypeScript" |
| L2 项目事实 | 稳定项目硬事实 | 低 | 按需注入 | "主分支 main" |
| L3 历史决策 | 关键决策与理由 | 中 | 摘要注入 | "选 vLLM 因成本" |
| L4 待办/临时 | 短期任务状态 | 高 | 按需注入 | "待确认限流" |
| L5 过期归档 | 历史但不再活跃 | 极低 | 不注入 | "旧部署方案" |

> 原则：**越稳定越靠前，越易变越靠后；越靠前越全量注入，越靠后越按需/不注入。**

### 2.4 价值
- **轻量持久化**：无需数据库，Markdown 即可。
- **人可读**：人与 Agent 都能读写，可人工纠错。
- **可版本化**：随仓库管理，记忆演进可追溯。
- **可检索**：可配合向量检索或直接全文注入。
- **低成本**：相比向量库，无嵌入/检索开销，适合少量关键事实。

### 2.5 与向量记忆的关系

| 维度 | Memory.md | 向量记忆库 |
|---|---|---|
| 适合内容 | 结构化、少量、高频硬约束 | 大量、非结构化、按语义检索 |
| 检索方式 | 全量注入 / 关键词 | 语义相似度 Top-K |
| 成本 | 低（无嵌入） | 高（嵌入+检索） |
| 精确度 | 高（显式事实） | 近似（语义召回） |
| 更新 | 直接编辑 | 重新嵌入 |
| 可读性 | 人可读 | 需工具查看 |

**协同模式**：
- Memory.md 放"必读硬约束"（偏好、项目事实、当前决策）。
- 向量库放"按需召回的历史"（过往对话、长文档片段）。
- 注入时：Memory.md 全量/分层注入系统提示，向量库按 query 召回补到上下文。

> 工程化落地：腾讯开源的 TencentDB Agent Memory 把「结构化硬约束 + 语义召回」做成了独立服务，见 §3。

### 2.6 最佳实践

**写入层面**
- **只记关键**：记"会反复用到的硬事实"，不记一次性闲聊。
- **结构化**：用分层 + 列表，避免大段散文，便于注入与检索。
- **带时间与来源**：每条决策附日期与依据，便于追溯与过期判断。
- **原子化**：一条记忆一个事实，避免"既…又…"的复合条目。
- **可证伪**：写"主分支是 main"，而非"分支管理很规范"。

**维护层面**
- **定期整理**：每日/每周清理 L4 待办，归档 L5 过期项。
- **去重**：同一事实只保留一处，避免注入时冲突。
- **纠错**：发现错误立即更新，旧值移入归档而非删除（保留审计）。
- **设过期**：临时项标注有效期，到期自动降级到归档。
- **容量上限**：建议单文件 < 200 行，超限则拆分或迁移到向量库。

**隐私与安全**
- **敏感信息不入**：密钥、Token、个人隐私绝不写入。
- **脱敏**：必须记的业务数据做脱敏处理。
- **访问控制**：Memory.md 随仓库权限管理，公开仓库慎写内部信息。
- **审计**：记忆变更走版本控制，可追溯谁改了什么。

**注入层面**
- **分层注入**：L1 全量、L2 按需、L3 摘要、L4 按需、L5 不注入。
- **预算控制**：注入总 token 不超上下文预算的 10-20%，留空间给对话。
- **优先级**：冲突时 L1 > L2 > L3，高优先级覆盖低优先级。
- **可观测**：记录每次注入了哪些记忆，便于调试"为什么这么回答"。

### 2.7 反模式
- ❌ **什么都记**：把每次对话都塞进 Memory.md，迅速膨胀且噪声大。
- ❌ **从不整理**：过期信息堆积，注入污染上下文。
- ❌ **散文式**：大段叙述，难以注入与检索。
- ❌ **存密钥**：把敏感信息当"记忆"持久化。
- ❌ **全量注入**：不分层，把所有记忆都塞进系统提示，挤占上下文。
- ❌ **与向量库重复**：同一事实两边都存，增加维护成本与不一致风险。

---

## 3. 工程化实例：TencentDB Agent Memory

> **一句话** ：腾讯云数据库团队把本篇的「Memory.md 分层 + 注入策略」做成了一套独立服务——开源的团队级 Agent 记忆中枢 **TencentDB Agent Memory** /ˈtensənt ˈeɪdʒənt ˈmeməri/ ，采用 **MIT** /ˌem aɪ ˈtiː/ （ **Massachusetts Institute of Technology** /ˌmæsəˈtʃuːsɪts ˌɪnstɪtjuːt əv ˌtekˈnɒlədʒi/ ，此处指其发布的宽松开源协议）协议、TypeScript /ˈtaɪpskrɪpt/ 实现，GitHub 约 2.6 万 Star（2026-09 数据）。口号是 **Agents Remember. Humans Innovate.**（Agent 负责记忆，人类专注创新）。

### 3.1 为什么把它放进这一篇

Memory.md 的四个软肋，一旦从「一个人一个文件」放大到「一个团队多个 Agent」，会立刻暴露；TencentDB Agent Memory 基本是逐个补的：

| Memory.md 的软肋 | 放大后的表现 | 它的解法 |
|---|---|---|
| 单文件存储 | 单文件建议 < 200 行，多人并发写入必冲突 | 分层存储 + 服务化读写 |
| 全量注入 | 记忆一多就把上下文挤爆 | 上下文卸载 + 分层检索 |
| 无权限模型 | 团队里谁都能读、谁都能改 | `private` / `team` / `restricted` / `agent` 四档可见性 + **ACL** /ˌeɪ siː ˈel/ （ **Access Control List** /ˈækses kənˈtrəʊl lɪst/ ，访问控制列表） |
| 只记「事实」 | 记不住「这件事该怎么做」 | 把经验沉淀为 **Skill** /skɪl/ 资产（带版本与校验规则） |

一句话： **Memory.md 是单机版，TencentDB Agent Memory 是团队版** 。本篇讲的规则——分层、去重、预算、脱敏——在它的机制里几乎原样出现，只是从「人工纪律」变成了「服务默认行为」。

### 3.2 四层记忆：L0–L3

Chat Memory 部分把记忆分成四层，L0 先落盘，再由**异步流水线**逐层提炼：

| 层级 | 存什么 | 用途 | 对应本篇分层 |
|---|---|---|---|
| **L0** Conversation /ˌkɒnvəˈseɪʃn/ | 带完整上下文的原始对话 | 核对原话、时间戳与来源 | 无对应（留在会话日志） |
| **L1** Atom /ˈætəm/ | 抽取出的事实、偏好、约束、事件 | 精确召回可执行信息 | L2 项目事实 |
| **L2** Scenario /səˈnɑːriəʊ/ | 按项目/场景组织的知识块 | 快速恢复工作上下文 | L3 历史决策 |
| **L3** Persona /pəˈsəʊnə/ | 长期画像、稳定模式、高层认知 | 让 Agent 快速进入用户与团队语境 | L1 用户偏好 |

> ⚠️ **注意编号方向相反**：本篇 L1 是「最该全量注入的偏好」，它的 L3 才是「最稳定的画像」。引用时先说清是「哪种编号」。

生成与检索都是分层的：平时 L2/L3 负责快速上下文引导；需要具体事实时，用 **BM25** /ˌbiː em t ˈwenti faɪv/ （ **Best Matching 25** /best ˈmætʃɪŋ ˈtwenti faɪv/ ）+ 向量检索 + **RRF** /ˌɑːr ɑːr ˈef/ （ **Reciprocal Rank Fusion** /rɪˈsɪprəkl ræŋk ˈfjuːʒn/ ，倒数排名融合）回退到 L1/L0。召回结果还受**条目数上限、字符预算、超时限制**三重约束——这正是本篇 2.6 节「预算控制」的服务化版本。

### 3.3 四种记忆资产

它把 Agent 工作中产生的信息固化成交付物，而不只是一堆对话记录：

| 资产 | 形态 | 解决的问题 |
|---|---|---|
| **Chat Memory** | L0–L3 分层的对话记忆 | 跨会话记住偏好、事实、决策、交互历史 |
| **Skill** | 带版本、资源文件、触发边界、执行步骤、校验规则的可执行经验 | 把「做过一遍的流程」变成「下次直接调用」 |
| **Wiki** | 文档转成的结构化页面 + 链接图（Link Graph） | 新 Agent 不必从第一页重读全部文档（受 **Andrej Karpathy** /ˈændreɪ kɑːrˈpæθi/ 的「LLM Wiki」思路启发） |
| **CodeGraph** | 代码符号、文件、调用关系、影响路径 | 改代码前先看 callers / callees 与影响范围 |

资产之间靠**可见性 + 归属治理**隔离：`private`（默认，仅 Owner，连团队管理员都不可读）、`team`（团队成员可读）、`restricted`（User / Role / Agent 级 ACL 精确授权）、`agent`（给某个 Agent 定向装备）。每个 Agent 创建后自动拥有自己的 Chat Memory。

### 3.4 三个关键机制

1. **上下文卸载（ Context Offloading /ˈkɒntekst ˌɒfˈləʊdɪŋ/ ）+ Mermaid 任务画布**：把原始工具结果卸载到外部存储，把任务结构折叠成一张 **Mermaid** /ˈmɜːmeɪd/ 任务图——节点带 ID，细节留在图外的文件里，上下文只保留摘要与索引，实现「原文不丢、结构可查、Token 不线性增长」。
2. **记忆即装备**：所有资产在 Memory Hub 注册为 Memory Asset，用固定绑定（Fixed Binding）+ ACL 决定「哪个 Agent 能用哪些资产」；先按 Team / User / Agent / 可见性收窄范围，再按当前 query 检索。换框架只需重新装备，不必重训模型或重灌提示。
3. **Proxy 零代码接入**：把 Agent 的接口基址（配置项 `base_url` ）指向 **Proxy** /ˈprɒksi/ 即可，不需要插件、Hook 或 **MCP** /ˌem siː ˈpiː/ （ **Model Context Protocol** /ˈmɒdl ˈkɒntekst ˈprəʊtəkɒl/ ，模型上下文协议）。已适配 **Claude Code** /klɔːd kəʊd/、**Codex** /ˈkəʊdeks/、**CodeBuddy** /kəʊd ˈbʌdi/、**OpenClaw** /ˈəʊpən klɔː/、**Hermes** /ˈhɜːmiːz/、**DeepSeek Harness** /ˈdiːpsiːk ˈhɑːnɪs/ 等客户端，管理面板默认在 `http://localhost:8125`。

### 3.5 落地示例

**3.5.1 示例 A：一条记忆的完整生命周期**

场景：4 人团队在做 Java 支付服务，Agent 在某次会话里听到「我们不用 TypeScript」。

```text
[L0] 2026-09-12 10:03:20  user: 我们不用 TypeScript，项目统一用 Java
      ↓ 异步流水线（提取 → 聚合 → 蒸馏）
[L1] { "type": "constraint", "text": "项目统一用 Java，不用 TypeScript", "confidence": 0.95, "source": "L0#1024" }
[L2] 场景块「支付模块重构」：技术栈约束 = Java 17；主分支 = main；测试 = ./gradlew test
[L3] 用户画像：偏好直接结论、不客套；关注性能与成本；团队 4 人
```

L1 原子事实落盘长这样（一行一条，便于增量追加）：

```jsonl
{"id":"atom_1024","layer":"L1","type":"constraint","subject":"tech-stack","text":"项目统一用 Java，不用 TypeScript","confidence":0.95,"source_turn":"L0#1024","created_at":"2026-09-12T10:03:20+08:00"}
```

而它同步给 Agent 的「人可读版本」，其实就是本篇的 Memory.md 片段—— **两者同构，一个给机器，一个给人** ：

```markdown
## 项目事实（稳定硬事实，按需注入）
- 项目统一用 Java，不用 TypeScript —— 来源 L0#1024，2026-09-12，置信度 0.95
```

**3.5.2 示例 B：Proxy 接入 + 分层注入预算（可运行代码）**

零代码接入部分：

```typescript
import OpenAI from "openai";

// 唯一改动：把接口基址指向 Memory Proxy，业务代码不用动
const client = new OpenAI({
  baseURL: process.env.MEMORY_PROXY_URL ?? "http://localhost:8125/v1",
  apiKey: process.env.MODEL_API_KEY ?? "",
});
```

分层注入的预算控制（ **Token** /ˈtəʊkən/ 指计费与上下文的最小文本单位）：

```typescript
interface MemoryItem {
  layer: "L1" | "L2" | "L3"; // L1 偏好 / L2 项目事实 / L3 历史决策（本篇语义）
  text: string;
  tokens: number;
}

/** 中文按 1 字 ≈ 1 token，英文按 4 字符 ≈ 1 token 粗估 */
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

/**
 * 分层注入：L1 偏好优先 → L2 项目事实 → L3 历史决策
 * 总预算默认取上下文窗口的 15%（对应本篇 2.6 节的 10%~20% 建议）
 */
export function buildMemoryBlock(
  items: MemoryItem[],
  contextWindow = 128_000,
  ratio = 0.15,
): { block: string; used: number; dropped: string[] } {
  const budget = Math.floor(contextWindow * ratio); // 128k → 19200 token
  const lines: string[] = [];
  const dropped: string[] = [];
  let used = 0;

  for (const layer of ["L1", "L2", "L3"] as const) {
    for (const item of items.filter((i) => i.layer === layer)) {
      if (used + item.tokens > budget) {
        dropped.push(`${layer}:${item.text}`); // 超预算 → 转按需召回，不硬塞系统提示
        continue;
      }
      lines.push(`- [${layer}] ${item.text}`);
      used += item.tokens;
    }
  }

  return { block: lines.join("\n"), used, dropped };
}
```

代入上面「4 人支付团队」的真实数字（上下文窗口 128k，预算 15% = 19200 token）：

| 层 | 条目数 | 需要 token | 实际处理 |
|---|---|---|---|
| L1 偏好 | 3 | 386 | 全部注入（386 token） |
| L2 项目事实 | 40 | 7 820 | 全部注入（累计 8 206 token） |
| L3 历史决策 | 200 | 10 912 | 只放得下 9 条，其余 191 条进 `dropped` |

→ 进 `dropped` 的 191 条改走按需召回（BM25 + 向量 + RRF），而不是硬塞进系统提示。这就是「分层注入」在工程上的落地形态。

**3.5.3 示例 C：四周接入排期与验收数字**

| 周 | 目标 | 动作 | 验收数字 |
|---|---|---|---|
| W1 | 环境与接入 | `git clone` → `deploy/global-images` → 填 `.env` 两组 LLM 参数 → `./start-all.sh` ；把 Agent 的 `base_url` 指向 Proxy | 面板 `http://localhost:8125` 可访问，健康检查返回 ready |
| W2 | 冷启动「读档」 | 导入项目文档 → Wiki；导入代码库 → CodeGraph；导入历史会话 → Chat Memory | Wiki / CodeGraph 转 ready；L1 原子事实 ≥ 50 条 |
| W3 | 沉淀 Skill | 挑 3 条高频流程写成 Skill（版本 + 资源文件 + 触发边界 + 执行步骤 + 校验规则） | 新会话「重复解释」次数下降一半 |
| W4 | 度量与灰度 | 用 WideSearch / SWE-bench 子集跑接入前后对比，先给 2 个 Agent 装备资产 | Token 下降 ≥ 30%，成功率不低于基线 |

官方在 OpenClaw 上公布的接入前后实测：

| 记忆类型 | Benchmark /ˈbentʃmɑːk/ | 指标 | 接入前 | 接入后 | 变化 |
|---|---|---|---|---|---|
| 短期 | WideSearch | 任务成功率 | 33% | 50% | **+51.5%** |
| 短期 | WideSearch | Token 消耗 | 221.31M | 85.64M | **−61.4%** |
| 短期 | SWE-bench | 任务成功率 | 58.4% | 64.2% | +9.9% |
| 短期 | SWE-bench | Token 消耗 | 3 474.1M | 2 375.4M | −33.1% |
| 短期 | AA-LCR | 任务成功率 | 44.0% | 47.5% | +8.0% |
| 短期 | AA-LCR | Token 消耗 | 112.0M | 77.3M | −31.0% |
| 长期 | PersonaMem | 准确率 | 48% | 76% | **+59%** |

> 数据来自项目官方文档与腾讯云开发者社区文章；调研阶段建议先在小样本子集上复现，再决定是否全量推广。

### 3.6 选型：Memory.md 还是 TencentDB Agent Memory

| 维度 | Memory.md | TencentDB Agent Memory |
|---|---|---|
| 适用规模 | 单人 / 单 Agent | 团队 / 多 Agent / 多框架 |
| 记忆量级 | 几十条硬约束 | 万级对话与文档 |
| 部署成本 | 0（就是一个 md 文件） | Docker + **Node.js** /nəʊd ˌdʒeɪ ˈes/ ≥ 22.16，需两组 LLM 参数 |
| 长任务上下文膨胀 | 无解，只能人工精简 | 上下文卸载 + Mermaid 画布直接压缩 |
| 权限与共享 | 随仓库权限 | 四档可见性 + ACL + 版本治理 |
| 运行成本 | 几乎为零 | 记忆提取组 + 代理组两次 LLM 调用 |
| 调试方式 | `git diff` 直接看 | Memory Panel 可视化 |

实践建议： **先用 Memory.md 把「纪律」跑通，再按需上服务**。两者可并存——Memory.md 作为「必读硬约束 + 人工可审的兜底」，TencentDB Agent Memory 负责长尾事实与团队共享。

### 3.7 注意事项

- 仍处 **Beta** /ˈbiːtə/ （当前 v2.0.0）， **API** /ˌeɪ piː ˈaɪ/ （ **Application Programming Interface** /ˌæplɪˈkeɪʃn ˈprəʊɡræmɪŋ ˈɪntəfeɪs/ ，应用程序编程接口）与目录结构迭代较快，接入前锁版本。
- 需配置两组 LLM 参数（记忆提取组 + 代理组），会产生额外 Token 成本。
- Wiki 与 CodeGraph 是**异步构建**，导入后要等 ready；CodeGraph 目前优先支持公有 HTTPS 仓库，私有仓库与凭据支持仍在完善。
- 全自动记忆路由仍在迭代，Hub 目前以手动绑定资产为主。
- 隐私红线不变：`private` 是默认值，密钥与个人隐私仍不应写入任何一层的记忆。

---

## 4. Agent.md 与 Memory.md 的关系

### 4.1 分层定位
- **Agent.md = 静态配置**：定义"Agent 是谁、能做什么、怎么做"——相对稳定，随版本发布。
- **Memory.md = 动态记忆**：记录"Agent 经历了什么、学到了什么"——持续演化，跨会话累积。

### 4.2 生命周期对比

| 维度 | Agent.md | Memory.md |
|---|---|---|
| 变更频率 | 低（随版本） | 高（随会话） |
| 变更主体 | 人工（PR 评审） | Agent 自动 + 人工整理 |
| 注入时机 | 会话开始全量注入系统提示 | 分层按需注入 |
| 回滚 | 走 Git 版本 | 走 Git 版本 + 归档 |
| 评测 | 作为行为契约做回归 | 作为上下文影响评测 |

### 4.3 协同工作流
1. 会话开始：加载 Agent.md → 生成系统提示；按策略注入 Memory.md 分层内容。
2. 会话中：Agent 根据交互判断是否写入 Memory.md（新偏好/决策/待办）。
3. 会话结束/定期：触发整理——去重、归档过期、纠错。
4. 评审周期：人工 review Memory.md 变更，必要时回写 Agent.md（如偏好固化为规范）。

---

## 5. 设计要点总览

- **分层**：Agent.md 是"静态配置"，Memory.md 是"动态记忆"。
- **更新策略**：Memory.md 需定期整理、去重、纠错、过期；Agent.md 走 PR 评审。
- **隐私**：敏感信息不入 Memory.md，或脱敏；Agent.md 不存密钥。
- **注入策略**：Agent.md 全量注入系统提示；Memory.md 分层按需注入。
- **容量**：Memory.md 单文件 < 200 行，超限拆分或迁移向量库。
- **可观测**：记录注入内容与记忆变更，便于调试与审计。
- **评测**：Agent.md 作行为契约做回归；Memory.md 变更纳入评测影响分析。

---

## 6. 学习要点
- Agent.md / Memory.md 是用 Markdown 组织 Agent 元信息的轻量实践。
- 声明式配置 + 人可读持久化，降低 Agent 工程门槛。
- Agent.md 重"静态契约"，Memory.md 重"动态累积"，两者分层互补。
- 与向量记忆互补：结构化硬约束用 md，海量历史用向量库。
- 关键在"纪律"：定期整理、分层注入、最小授权、隐私脱敏。
- 规模放大后的两条路：自建靠纪律（Memory.md），团队化靠服务（TencentDB Agent Memory 的 L0–L3 + 资产治理 + Proxy 接入）。
- 记忆工程的三个通用抓手：分层存储、预算化注入、权限与归属——换任何实现都不变。

---

## 7. 参考资料
- VS Code Copilot `.instructions.md` / `copilot-instructions.md` 实践
- `AGENTS.md` 约定（多 Agent 协作中的 Agent 描述文件）
- Cursor `.cursorrules` / Claude Code `CLAUDE.md`
- "Generative Agents"（记忆/反思机制）
- ADR（Architecture Decision Records）——历史决策记录的成熟范式
- TencentDB Agent Memory：https://github.com/Tencent/TencentDB-Agent-Memory
- 开源说明《TencentDB Agent Memory 正式开源：让 Agent 沉淀经验，让人专注创造》，腾讯云开发者社区
- 安装与接入文档：仓库内 `INSTALL.md` / `INSTALL_CN.md`（含 Proxy + Claude Code / CodeBuddy 用法）
- PersonaMem 评测集：https://github.com/bowen-upenn/PersonaMem

---

## 8. 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|---|---|---|---|
| **ACL** | /ˌeɪ siː ˈel/ | Access Control List | 访问控制列表 |
| **API** | /ˌeɪ piː ˈaɪ/ | Application Programming Interface | 应用程序编程接口 |
| **ADR** | /ˌeɪ diː ˈɑːr/ | Architecture Decision Record | 架构决策记录 |
| **BM25** | /ˌbiː em t ˈwenti faɪv/ | Best Matching 25 | 经典概率检索模型 |
| **IDE** | /ˌaɪ diː ˈiː/ | Integrated Development Environment | 集成开发环境 |
| **JSON** | /ˈdʒeɪsən/ | JavaScript Object Notation | JSON 数据交换格式 |
| **LLM** | /ˌel el ˈem/ | Large Language Model | 大语言模型 |
| **MCP** | /ˌem siː ˈpiː/ | Model Context Protocol | 模型上下文协议 |
| **MIT** | /ˌem aɪ ˈtiː/ | Massachusetts Institute of Technology | 麻省理工学院（此处指其开源协议） |
| **PR** | /ˌpiː ˈɑːr/ | Pull Request | 合并请求 |
| **RRF** | /ˌɑːr ɑːr ˈef/ | Reciprocal Rank Fusion | 倒数排名融合 |