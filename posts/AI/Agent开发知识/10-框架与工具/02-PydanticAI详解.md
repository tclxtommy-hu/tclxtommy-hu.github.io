# PydanticAI 详解：类型安全的 Agent 框架

> 一句话定义： **PydanticAI** /ˌpaɪˈdæntɪk eɪ ˈaɪ/ 是 Pydantic 团队出品的 Python Agent 框架，用类型注解与运行时校验把「FastAPI 式」开发体验带到 GenAI / Agent 场景。

## 你为什么要学这个

近两年 Agent 框架爆炸式增长：有人先堆生态（ **LangChain** /ˈlæŋ tʃeɪn/ ），有人先画状态图（ **LangGraph** /ˈlæŋ ɡræf/ ）。 **PydanticAI** 走的是第三条路—— **先保证边界正确** ：依赖注入可测、工具参数可校验、输出结构可类型化。团队若已用 **FastAPI** /fæst eɪ piː ˈaɪ/ + Pydantic，上手成本往往最低；若你在做「单 Agent + 强结构化结果」的生产服务，它经常比「先上大而全编排」更省心。

学完应能：说清 PydanticAI 的定位与核心抽象；用最小代码跑通 Agent + 工具 + 结构化输出；并在 LangChain、LangGraph 之间做出选型（或组合）判断。

---

## 1. 它是什么、从哪来

### 1.1 背景

几乎所有主流 Python **LLM** /ˌel el ˈem/ （ **Large Language Model** /lɑːdʒ ˈlæŋɡwɪdʒ ˈmɒdl/ ，大语言模型）/ Agent 库底层都在用 **Pydantic** /ˌpaɪˈdæntɪk/ 做校验，但「像 FastAPI 一样写 Agent」长期缺位。Pydantic 团队在自用 **Logfire** /ˈlɒɡfaɪə/ （可观测平台）时感到同样缺口，于是做出 PydanticAI：把类型提示、依赖注入、结构化输出做成一等公民。

时间线（便于对齐社区讨论）：

| 节点 | 说明 |
|------|------|
| 2024 末 | 公开发布，强调 type-safe Agent |
| 2025 中后期 | 走向 1.x，能力面扩展（协议化工具、Evals、Graph、Capabilities 等） |
| 2026 | 社区常把它与 LangGraph 对照：一个偏 **边界校验** ，一个偏 **流程编排** |

### 1.2 设计目标（一句话）

> 让构建生产级 **GenAI** /ˌdʒen eɪ ˈaɪ/ （生成式 AI）应用时，像写 FastAPI 一样： **类型先到位，错误尽量前移到写代码时，运行时再用 Pydantic 兜底。**

官方口号可概括为： *GenAI Agent Framework, the Pydantic way* 。

### 1.3 核心卖点速览

1. **类型安全** ： `Agent[Deps, Output]` 泛型；静态检查 + 运行时校验。
2. **模型无关** ：OpenAI / Anthropic / Gemini / 本地与各类网关均可接入。
3. **依赖注入** ：工具与动态 instructions 通过 `RunContext[Deps]` 拿 DB、配置、用户身份——利于单测。
4. **结构化输出** ： `output_type=YourModel` ，失败可反射重试。
5. **Capabilities** /ˌkeɪpəˈbɪlətiz/ 组合：思考、联网搜索、 **MCP** /ˌem siː ˈpiː/ （ **Model Context Protocol** /ˈmɒdl ˈkɒntekst ˈprəʊtəkɒl/ ，模型上下文协议）、工具搜索等可插拔打包。
6. **可观测与评测** ：深度集成 Logfire（基于 **OpenTelemetry** /ˌəʊpən ˌteləˈmetrɪ/ ，亦称 **OTel** /ˌəʊ ˈtel/ ）；自带 Evals。
7. **生产向能力** ：人在环工具审批、持久执行、流式结构化输出；复杂流程可用自带 Graph。

---

## 2. 核心概念地图

```text
                  ┌─────────────────────────┐
   用户输入 ───►  │  Agent（模型 + 指令）     │
                  │  + tools / capabilities │
                  │  + deps / output_type   │
                  └───────────┬─────────────┘
                              │ agent loop
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
            调工具/MCP     结构化校验     继续推理
                 │            │            │
                 └────────────┴────────────┘
                              ▼
                     result.output（类型确定）
```

| 概念 | 作用 |
|------|------|
| **Agent** /ˈeɪdʒənt/ | 中心对象：绑定模型、instructions、工具、输出类型、依赖类型 |
| **instructions** | 静态或动态系统级指令；动态版可读 `deps` |
| **tool** | 供模型调用的 Python 函数；参数由类型注解生成 schema |
| **deps / RunContext** | 依赖注入：把 DB、配置等安全传入工具与指令 |
| **output_type** | 最终结果的 Pydantic 模型（或简单类型） |
| **capabilities** | 可组合能力包（Thinking、WebSearch、MCP…） |
| **Graph** （可选） | 用类型提示描述复杂控制流，补足「纯 Agent 循环」不够用的场景 |

---

## 3. 最小上手

### 3.1 安装

```bash
pip install pydantic-ai
# 或按需选择厂商额外依赖，例如：
# pip install "pydantic-ai[openai]"
```

### 3.2 Hello World

```python
from pydantic_ai import Agent

agent = Agent(
    'anthropic:claude-sonnet-4-6',  # 也可换成 openai:... / 其他 provider
    instructions='Be concise, reply with one sentence.',
)

result = agent.run_sync('Where does "hello world" come from?')
print(result.output)
```

无密钥时可用内置测试模型（离线）：

```python
from pydantic_ai import Agent

agent = Agent('test')
result = agent.run_sync('ping')
print(result.output)
```

### 3.3 结构化输出 + 工具 + 依赖注入

下面是官方风格的「银行客服」骨架，体现 PydanticAI 的典型写法：

```python
from dataclasses import dataclass
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

@dataclass
class SupportDependencies:
    customer_id: int
    db: object  # 真实项目换成你的 DB 客户端

class SupportOutput(BaseModel):
    support_advice: str = Field(description='给用户的建议')
    block_card: bool = Field(description='是否建议冻结卡片')
    risk: int = Field(description='风险 0-10', ge=0, le=10)

support_agent = Agent(
    'openai:gpt-4o',
    deps_type=SupportDependencies,
    output_type=SupportOutput,
    instructions='你是银行一线客服，给出建议并评估风险。',
)

@support_agent.tool
async def customer_balance(
    ctx: RunContext[SupportDependencies],
    include_pending: bool,
) -> float:
    """返回客户当前余额。"""
    return await ctx.deps.db.customer_balance(
        id=ctx.deps.customer_id,
        include_pending=include_pending,
    )

# result = await support_agent.run('我的余额多少？', deps=deps)
# result.output 的类型是 SupportOutput
```

要点：

- 工具参数与返回值靠 **类型注解** 进 schema，不必手写大段 **JSON** /ˈdʒeɪsən/ （ **JavaScript Object Notation** /ˌdʒɑːvəskrɪpt ˈɒbdʒɪkt nəʊˈteɪʃn/ ） Schema。
- `output_type` 保证调用方拿到的是校验后的对象，而不是「可能长得像 JSON 的字符串」。
- `deps` 不进模型上下文明文（除非你自己写进 instructions），便于权限与密钥隔离。

### 3.4 Capabilities（能力组合）

新版本强调用 capabilities 拼装能力，而不是把一切塞进一个巨型 Agent 类：

```python
from pydantic_ai import Agent
from pydantic_ai.capabilities import Thinking, WebSearch

agent = Agent(
    'anthropic:claude-sonnet-4-6',
    instructions='简明回答，一句话。',
    capabilities=[Thinking(), WebSearch(local='duckduckgo')],
)
```

内置 / 生态常见能力包括：思考链、网页搜索与抓取、图像生成、MCP、工具搜索、以及 Harness 库中的代码执行、护栏、子 Agent 等。按产品需要勾选，保持主 Agent 精瘦。

---

## 4. 与 LangChain、LangGraph 对比

先分清三者解决的 **主问题** ；表中 **HITL** /ˌeɪtʃ aɪ tiː ˈel/ （ **Human-in-the-Loop** /ˌhjuːmən ɪn ðə ˈluːp/ ，人在环路）指关键步骤需人工确认。


| | **PydanticAI** | **LangChain** | **LangGraph** |
|--|----------------|---------------|---------------|
| 一句话 | 类型安全的单 Agent / 强边界 | 最大生态与集成胶水 | 显式状态图编排 |
| 主战场 | 结构化输出、 **DI** /ˌdiː ˈaɪ/ （ **Dependency Injection** /dɪˈpendənsi ɪnˈdʒekʃn/ ，依赖注入）、可测 Agent | 链式调用、工具/检索组件海量 | 分支、循环、持久化、多 Agent |
| 心智模型 | FastAPI 风格的 Agent API | Chain / Runnable / LCEL | 节点 + 边 + checkpointer |
| 类型与校验 | 一等公民（设计原点） | 有，但历史包袱重 | 状态 Annotation / schema 偏编排 |
| 编排复杂度 | Agent loop + 可选 Graph | 偏链与工具拼装 | 最强（生产级控制流） |
| 多 Agent | 有能力组合 / 子 Agent，非主叙事 | 多种实验抽象 | Supervisor 等模式成熟 |
| 可观测 | Logfire / OTel 原生友好 | LangSmith 生态 | LangSmith 深度集成 |
| HITL | 工具级审批等 | 视组件而定 | interrupt / resume 成熟 |
| 语言 | Python 为主 | Python + TypeScript | Python + TypeScript |
| 学习曲线 | 低～中（会 Pydantic 更低） | 中（抽象多、版本变迁快） | 中～高（图与状态要练） |

### 4.1 和 LangChain：别拿「全家桶」比「手术刀」

- **LangChain** 强在：模型适配、检索、文档加载、第三方集成「几乎都有现成块」，适合快速原型与异构系统粘合。
- **PydanticAI** 强在：API 面更小、类型更硬、测试与生产边界更清晰；不追求「什么组件都内置」。
- 实践建议：若你的痛点是「工具参数乱、输出 JSON 老坏、单测难写」，优先 PydanticAI；若痛点是「要接 20 种数据源 / 向量库」，LangChain 生态仍有优势。

### 4.2 和 LangGraph：经常是互补，不是互斥

社区共识越来越清晰：

- **PydanticAI** ：保证 **单个智能步骤** 在接口边界上正确（工具参数、输出模型、依赖注入）。
- **LangGraph** ：保证 **整条流程** 在时间轴上可控（状态、分支、重试、人在环、检查点恢复）。

常见生产架构：

```text
LangGraph（编排：路由 / 状态 / 持久化 / HITL）
    ├── 节点 A：PydanticAI Agent（结构化抽取）
    ├── 节点 B：PydanticAI Agent（带工具的业务动作）
    └── 节点 C：纯代码 / 人工审批
```

不必二选一：复杂工作流用图，图节点内部用类型安全 Agent。

### 4.3 选型速查

| 你的情况 | 更合适的起点 |
|----------|--------------|
| FastAPI 团队，要稳定结构化 **API** /ˌeɪ piː ˈaɪ/ 响应 | **PydanticAI** |
| 单 Agent + 工具 + 强校验，流程不复杂 | **PydanticAI** |
| 要快速拼 **RAG** /ˌɑːr eɪ ˈdʒiː/ （ **Retrieval-Augmented Generation** /rɪˈtriːvl ˈɔːɡməntɪd ˌdʒenəˈreɪʃn/ ，检索增强生成）/ 文档 Loader / 一堆集成 | **LangChain** |
| 多步分支、长时任务、检查点、多 Agent 主管 | **LangGraph** |
| 既要流程可控，又要节点输出可信 | **LangGraph + PydanticAI** |
| 仓库已有 **TS** /ˌtiː ˈes/ （ **TypeScript** /ˈtaɪpskrɪpt/ ） LangGraph 示例、团队偏 TS | 继续 **LangGraph** （PydanticAI 以 Python 为主） |

本仓库相关文档：

- 总览对比：[01-主流框架对比.md](01-主流框架对比.md)
- LangGraph API：[../05-规划与任务分解/03-LangGraph核心API参考.md](../05-规划与任务分解/03-LangGraph核心API参考.md)
- LangChain API：[../05-规划与任务分解/02-LangChain核心API参考.md](../05-规划与任务分解/02-LangChain核心API参考.md)
- Supervisor 实战：[../06-多智能体/03-多智能体实战示例-LangGraph-Supervisor.md](../06-多智能体/03-多智能体实战示例-LangGraph-Supervisor.md)

---

## 5. 工程落地注意点

1. **先定输出契约** ：用 Pydantic 模型定义「成功长什么样」，再写 tools；契约稳定后，评测与前端才跟得上。
2. **deps 承载敏感上下文** ：用户 ID、权限、连接池放 `deps`，不要全塞进 prompt。
3. **工具要短、错要结构化** ：返回裁剪字段；失败返回可解析错误，便于模型重试或降级。
4. **接上可观测** ：生产务必打开 tracing（Logfire 或其他 OTel backend），否则多轮 tool 调用几乎不可调试。
5. **别过早上图** ：单循环够用就别上 Graph/LangGraph；一旦出现「多状态 + 长时 + 审批」，再升编排层。
6. **评测当回归** ：用框架 Evals 或自建用例锁住关键路径（尤其是 `block_card` 这类高风险字段）。

---

## 6. 学习路径建议

1. 官方概览与安装： [https://ai.pydantic.dev/](https://ai.pydantic.dev/)
2. 跑通 Hello World → 结构化 `output_type` → 一个真实 tool + `deps`
3. 加 Logfire（或任意 OTel）看清一轮 agent loop
4. 需要 MCP 时接 MCP capability；需要复杂编排时再学 Graph 或接入 LangGraph
5. 回头对照本目录 [01-主流框架对比.md](01-主流框架对比.md) 做团队选型纪要

---

## 7. 小结

| 记住一句 |
|----------|
| **PydanticAI** = 用 Pydantic 把 Agent 的输入/输出/依赖「钉死」 |
| **LangChain** = 生态与集成广度 |
| **LangGraph** = 状态图与长期流程正确性 |
| 生产上常见赢法是 **编排用图、节点用类型安全 Agent** ，而不是信仰单一框架 |

---

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **LLM** | /ˌel el ˈem/ | Large Language Model | 大语言模型 |
| **MCP** | /ˌem siː ˈpiː/ | Model Context Protocol | 模型上下文协议 |
| **API** | /ˌeɪ piː ˈaɪ/ | Application Programming Interface | 应用程序接口 |
| **HITL** | /ˌeɪtʃ aɪ tiː ˈel/ | Human-in-the-Loop | 人在环路 |
| **OTel** | /ˌəʊ ˈtel/ | OpenTelemetry | 开放遥测（可观测标准） |
| **DI** | /ˌdiː ˈaɪ/ | Dependency Injection | 依赖注入 |
| **RAG** | /ˌɑːr eɪ ˈdʒiː/ | Retrieval-Augmented Generation | 检索增强生成 |
| **TS** | /ˌtiː ˈes/ | TypeScript | TypeScript 语言 |
| **JSON** | /ˈdʒeɪsən/ | JavaScript Object Notation | JS 对象表示法 |
| **GenAI** | /ˌdʒen eɪ ˈaɪ/ | Generative AI | 生成式人工智能 |

## 参考资料

- Pydantic AI 官方文档： [https://ai.pydantic.dev/](https://ai.pydantic.dev/)
- Pydantic Logfire： [https://pydantic.dev/logfire](https://pydantic.dev/logfire)
- LangGraph 文档： [https://langchain-ai.github.io/langgraph/](https://langchain-ai.github.io/langgraph/)
- 本目录：[01-主流框架对比.md](01-主流框架对比.md)
