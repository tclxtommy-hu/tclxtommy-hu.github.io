# Agent 概念与关键词大全一览表

> 用途：一张表速览与 Agent 相关的所有核心概念与关键词，配合 `01-什么是Agent.md` / `02-Agent核心组件.md` 及后续模块交叉阅读。每条仅做极简定义，想深入请跳对应模块。

## 一、基础与定义

| 概念 / 关键词 | 极简说明 |
|------|------|
| **Agent（智能体）** | 以 LLM 为大脑、能循环感知环境并调用工具达成目标的系统。 |
| **LLM Agent** | 特指以大语言模型为推理核心的 Agent（区别于规则/强化学习 Agent）。 |
| **Agent = LLM + Tools + Memory + Loop** | Agent 四大要素的黄金公式。 |
| **自主性（Autonomy）** | Agent 无需逐步人工干预即可推进任务的程度。 |
| **代理 / 智能代理** | Agent 的中文别称。 |
| **具身智能（Embodied Agent）** | 有物理/虚拟身体、能与环境交互的 Agent（机器人、游戏角色）。 |
| **软件 Agent** | 纯软件形态、运行在数字环境中的 Agent。 |
| **Agentic** | 形容词，表示"具备 Agent 特性的"（如 agentic workflow）。 |
| **Agentic AI** | 强调系统整体具备自主行动能力的范式，区别于单一模型。 |
| **聊天机器人（Chatbot）** | 多轮问答，被动响应，一般不改环境——Agent 的前身形态。 |
| **Copilot（副驾）** | 人主导、AI 辅助的半自主形态，强调"人在环"。 |
| **自主智能体（Autonomous Agent）** | 端到端自主完成任务、人只验收结果的 Agent。 |

## 二、核心组件

| 概念 / 关键词 | 极简说明 |
|------|------|
| **推理（Reasoning）** | LLM 分解与推导问题的过程（如 CoT）。 |
| **规划（Planning）** | 把目标拆成有序步骤/子任务的过程。 |
| **执行（Acting）** | 调用工具落实规划、改变环境。 |
| **感知（Perception）** | 从环境/工具反馈获取观测结果。 |
| **行动循环（Action Loop）** | 感知→推理→行动→观测 的持续迭代。 |
| **工具（Tool）** | 供 Agent 调用的外部能力（API/函数/命令）。 |
| **记忆（Memory）** | 跨步骤/跨会话保存与召回信息的能力。 |
| **大脑（Brain）** | 对 LLM 核心推理模块的拟人化称呼。 |
| **手脚（Hands/Feet）** | 对工具调用能力的拟人化称呼。 |

## 三、推理与规划范式

| 概念 / 关键词 | 极简说明 |
|------|------|
| **CoT（Chain-of-Thought）** | 思维链，让模型一步步显式推理。 |
| **Zero-shot / Few-shot CoT** | 无示例 / 给少量示例触发思维链。 |
| **ReAct** | 推理（Reason）与行动（Act）交替的范式，最经典 Agent 循环。 |
| **Thought / Action / Observation** | ReAct 的三元组：思考、行动、观测。 |
| **Reflection（反思）** | 让 Agent 自我评价并修正输出。 |
| **Self-Correction（自纠）** | 基于反馈自动修正错误。 |
| **Self-Consistency** | 多采样投票提升推理稳定性。 |
| **ToT（Tree of Thoughts）** | 树状搜索多路径推理。 |
| **GoT（Graph of Thoughts）** | 图状推理，节点间可聚合。 |
| **Plan-and-Execute** | 先整体规划，再逐步执行。 |
| **任务分解（Task Decomposition）** | 把大任务拆成可管理的子任务。 |
| **子目标（Sub-goal）** | 分解后的中间目标。 |
| **反思循环（Reflexion）** | 带记忆的反思框架（ verbal + 情景记忆）。 |

## 四、工具调用与协议

| 概念 / 关键词 | 极简说明 |
|------|------|
| **Function Calling（函数调用）** | 模型按 schema 输出结构化调用请求。 |
| **Tool Calling** | 同 Function Calling，泛指工具调用。 |
| **Tool Schema / JSON Schema** | 描述工具入参的规范，模型据此生成调用。 |
| **MCP（Model Context Protocol）** | Anthropic 提出的统一工具/资源/提示接入协议。 |
| **MCP Server / Client** | 提供能力的服务端 / 消费能力的客户端。 |
| **MCP Resource / Prompt / Tool** | MCP 暴露的三类原语。 |
| **Tool Use / Tool Result** | 工具调用的请求与返回。 |
| **A2A（Agent-to-Agent）** | Google 提出的 Agent 间通信协议。 |
| **API 集成** | 通过外部接口扩展 Agent 能力。 |
| **Computer Use（电脑操作）** | Agent 直接操作 GUI/屏幕（如点击、输入）。 |
| **GUI Agent** | 基于界面视觉操作软件的 Agent。 |

## 五、记忆系统

| 概念 / 关键词 | 极简说明 |
|------|------|
| **短期记忆（Short-term）** | 当前上下文窗口内的临时信息。 |
| **长期记忆（Long-term）** | 跨会话持久化存储。 |
| **情景记忆（Episodic）** | 记录"发生过什么"的具体经历。 |
| **语义记忆（Semantic）** | 抽取的事实性知识。 |
| **程序性记忆（Procedural）** | "怎么做"的操作性知识。 |
| **向量记忆（Vector Store）** | 用 embedding 做相似度召回。 |
| **Memory Bank** | 把关键信息落盘文件供后续加载。 |
| **Scratchpad（草稿本）** | 中间推理暂存区。 |
| **遗忘 / 淘汰（Eviction）** | 控制记忆容量、丢弃低价值信息。 |
| **压缩（Compression）** | 将长记忆摘要化以省 token。 |
| **召回（Retrieval）** | 从记忆库取回相关片段。 |

## 六、多智能体

| 概念 / 关键词 | 极简说明 |
|------|------|
| **多智能体（Multi-Agent）** | 多个 Agent 分工协作完成复杂任务。 |
| **角色（Role）** | 给每个 Agent 设定职责（如规划者/执行者）。 |
| **编排（Orchestration）** | 调度多 Agent 的协同与消息流。 |
| **主管 / 经理（Manager/Supervisor）** | 负责分发与汇总的中枢 Agent。 |
| **工作者（Worker）** | 执行具体子任务的从属 Agent。 |
| **通信协议（Message Passing）** | Agent 间消息格式与通道。 |
| **辩论（Debate）** | 多个 Agent 互相反驳以提升答案质量。 |
| **共识（Consensus）** | 多 Agent 达成一致的机制。 |
| **黑盒 / 白盒协作** | 只看结果 vs 共享内部过程。 |
| **Agent 网络（Agent Network）** | 多 Agent 互联成网的结构。 |

## 七、知识增强（RAG）

| 概念 / 关键词 | 极简说明 |
|------|------|
| **RAG（检索增强生成）** | 先检索外部知识再生成，缓解幻觉与时效问题。 |
| **Embedding（向量化）** | 把文本转成可比较的向量。 |
| **向量数据库（Vector DB）** | 存储与检索向量的数据库。 |
| **切分（Chunking）** | 把文档切成检索单元。 |
| **混合检索（Hybrid Search）** | 关键词 + 向量结合。 |
| **重排序（Re-ranking）** | 对召回结果再打分排序。 |
| **Self-RAG** | 让模型自决何时检索、是否够用。 |
| **GraphRAG** | 用知识图谱增强检索的 RAG 变体。 |
| **知识库（Knowledge Base）** | Agent 可检索的私有知识来源。 |
| **上下文污染（Context Poisoning）** | 注入有害内容影响检索结果。 |

## 八、工程化、可观测与评估

| 概念 / 关键词 | 极简说明 |
|------|------|
| **LLMOps** | 面向 LLM/Agent 的运维体系。 |
| **可观测性（Observability）** | 通过 Trace/Span/Metric 看清内部运行状态。 |
| **Trace / Span** | 一次运行的完整链路 / 链路中的一段。 |
| **日志（Logging）** | 记录运行过程的文本。 |
| **评估（Evaluation）** | 量化 Agent 表现的过程。 |
| **基准（Benchmark）** | 标准化测试集（如 WebArena、τ-bench）。 |
| **回归测试** | 改动后验证不退化。 |
| **Prompt 版本管理** | 对提示词做版本与实验追踪。 |
| **提示缓存（Prompt Caching）** | 缓存前缀以降低重复调用成本。 |
| **批处理（Batch API）** | 离线批量调用以省成本。 |
| **模型路由（Model Routing）** | 按难度选便宜/强模型。 |
| **降级（Degradation）** | 失败时退回安全/简单路径。 |

## 九、可靠性与成本

| 概念 / 关键词 | 极简说明 |
|------|------|
| **重试（Retry）** | 失败自动再试。 |
| **指数退避（Exponential Backoff）** | 重试间隔递增，避免压垮服务。 |
| **熔断（Circuit Breaker）** | 错误率过高时暂停调用。 |
| **超时（Timeout）** | 限制单次调用最长耗时。 |
| **幂等（Idempotency）** | 重复执行不产生副作用。 |
| **人在环（Human-in-the-loop）** | 关键步骤需人工确认。 |
| **速率限制（Rate Limit）** | 单位时间调用上限。 |
| **Token 成本** | 按 token 计费的开销。 |
| **Token 预算** | 单次运行的上下文上限规划。 |

## 十、安全与护栏

| 概念 / 关键词 | 极简说明 |
|------|------|
| **护栏（Guardrail）** | 约束 Agent 行为的边界与过滤器。 |
| **输入校验（Input Validation）** | 过滤/校验用户与工具输入。 |
| **输出校验（Output Validation）** | 检查生成结果合规再外流。 |
| **提示注入（Prompt Injection）** | 通过输入劫持 Agent 意图。 |
| **投毒（Poisoning）** | 在"数据/知识/记忆"阶段埋入恶意内容，使系统行为被暗中操控（区别于运行时的提示注入）。 |
| **数据投毒（Data Poisoning）** | 在训练或微调数据里掺入恶意样本，污染模型本身。 |
| **知识库投毒（Corpus Poisoning）** | 向 RAG 检索库植入有害文档，污染召回结果（见第七节）。 |
| **提示投毒（Prompt Poisoning）** | 在记忆/系统提示等持久内容中埋入恶意指令，长期生效。 |
| **越狱（Jailbreak）** | 绕过模型安全限制。 |
| **权限最小化（Least Privilege）** | 只给 Agent 必需权限。 |
| **沙箱（Sandbox）** | 隔离执行环境防破坏。 |
| **红队（Red Teaming）** | 主动攻击测试弱点。 |
| **OWASP LLM Top 10** | LLM 应用的十大安全风险清单。 |
| **数据泄露（Data Exfiltration）** | 敏感信息被外传。 |
| **内容审核（Moderation）** | 对输入输出做合规过滤。 |

## 十一、设计模式与工作流

| 概念 / 关键词 | 极简说明 |
|------|------|
| **Workflow（工作流）** | 预定义路径、LLM 按步执行（可预测）。 |
| **Agent 模式** | LLM 自主决定流程与工具（更灵活）。 |
| **Prompt Chaining（提示链）** | 串行串联多步提示。 |
| **Routing（路由）** | 按输入分类分发到不同处理分支。 |
| **Parallelization（并行）** | 同一任务多份并行处理/投票。 |
| **Orchestrator-Worker（编排-工）** | 中枢拆解、工人执行。 |
| **Evaluator-Optimizer（评估-优化）** | 一模型生成、一模型评估迭代。 |
| **Reflection（反思）模式** | 产出后自我审视改进。 |
| **ReAct 模式** | 推理+行动交替（见第三节）。 |

## 十二、上下文工程

| 概念 / 关键词 | 极简说明 |
|------|------|
| **上下文工程（Context Engineering）** | 系统地设计送入模型的上下文内容。 |
| **选择（Selection）** | 挑哪些信息进上下文。 |
| **压缩（Compression）** | 缩减上下文长度。 |
| **分层（Layering）** | 不同层级信息分门别类组织。 |
| **淘汰（Eviction）** | 实时丢弃过期/低价值内容。 |
| **系统提示（System Prompt）** | 设定角色与规则的顶层指令。 |
| **上下文窗口（Context Window）** | 模型单次可处理的最大 token 量。 |

## 十三、框架与生态

| 概念 / 关键词 | 极简说明 |
|------|------|
| **LangChain** | 主流 Agent/LLM 应用编排框架。 |
| **LangGraph** | 基于图的有状态 Agent 工作流框架。 |
| **AutoGen** | 微软多 Agent 对话框架。 |
| **CrewAI** | 角色化多 Agent 协作框架。 |
| **MetaGPT** | 将软件工程 SOP 注入多 Agent 的框架。 |
| **LlamaIndex** | 以数据/RAG 为中心的 Agent 框架。 |
| **OpenAI Agents SDK** | OpenAI 官方轻量 Agent 框架。 |
| **Crew（团队）** | CrewAI 中对一组协作 Agent 的称呼。 |
| **Skill（技能）** | 可复用的能力包（如 WorkBuddy 技能）。 |

## 十四、前沿形态

| 概念 / 关键词 | 极简说明 |
|------|------|
| **Voice Agent（语音 Agent）** | 语音输入输出的实时 Agent。 |
| **Realtime Agent** | 低延迟流式对话 Agent。 |
| **Computer-Use Agent** | 直接操作图形界面的 Agent。 |
| **Coding Agent** | 专注写/改代码的 Agent（如 Devin）。 |
| **Agent UX** | Agent 产品的人机交互设计。 |
| **Agent 治理（Governance）** | 对 Agent 行为合规与责任的管控。 |
| **Agent 市场（Agent Marketplace）** | 分发/复用 Agent 与技能的平台。 |
| **长程任务（Long-horizon Task）** | 跨多步、多轮次的复杂任务。 |
| **Agent Memory Standard** | 跨 Agent 记忆互操作的标准探索。 |

---

### 速查建议
- 想理解"是什么" → 第一节 + `01-什么是Agent.md`
- 想理解"由什么组成" → 第二节 + `02-Agent核心组件.md`
- 想搭系统但不确定模式 → 第十一节 + `13-进阶与工程化/01-Agent设计模式与工作流.md`
- 想深入工程化闭环 → `13-进阶与工程化/` 各专题
