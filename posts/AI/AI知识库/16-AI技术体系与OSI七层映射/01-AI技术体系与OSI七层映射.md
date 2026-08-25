---
title: AI 技术体系与 OSI 七层模型映射
date: 2026-08-25
tags: [AI, 体系, OSI, 分层, 心智模型]
---

# AI 技术体系与 OSI 七层模型映射

> 一句话定义：把 **OSI** /ˌoʊ ɛs ˈaɪ/ （ **Open Systems Interconnection** /ˈoʊpən ˈsɪstəmz ɪntərkəˈnekʃn/ ，开放系统互连）七层参考模型的"分层解耦"思想，借来给 AI 技术栈（ **LLM** /ˌɛl ɛl ˈɛm/ 、 **Agent** /ˈeɪdʒənt/ 、 **RAG** /ræɡ/ 等）做一次自顶向下的归位，帮助建立全局心智模型。

## 为什么用 OSI 来类比 AI

**OSI** 本是国际标准化组织提出的网络通信分层模型（物理层→应用层）。它真正的价值不是协议细节，而是 **"每层只关心自己的职责，向上提供服务、向下调用能力"** 的解耦哲学。

AI 技术栈同样可以这么看：底层是算力与模型权重，往上是推理、上下文、工具、编排，最顶层才是面向用户的智能应用。借用 **OSI** 的分层语言，我们能更清楚地回答" **RAG** 在哪一层"" **Agent** 跨了哪几层"" **MCP** 解决什么层的问题"。

> **重要提醒** ：这是 **类比** ，不是标准。AI 栈与网络栈的职责并不一一等价，下文映射是为了 **归类与记忆** ，不要反过来用网络术语硬套 AI 工程。

## OSI 七层与 AI 技术栈总览

| OSI 层 | 网络职责 | AI 类比层 | 典型技术 / 概念 |
|--------|----------|-----------|------------------|
| 7 应用层 | 用户可直接使用的服务 | **智能应用层** | 对话机器人、Copilot、Workflow、ChatFlow、多 Agent 产品 |
| 6 表示层 | 数据格式、编码、加密 | **表示与交互层** | 多模态编解码、提示词模板、结构化输出（JSON Schema）、Safety/护栏 |
| 5 会话层 | 会话建立、保持、管理 | **会话与记忆层** | 上下文工程、对话状态、Memory、Session 路由 |
| 4 传输层 | 端到端可靠传输 | **编排与通信层** | Agent 循环、ReAct、多 Agent 通信（A2A）、任务调度 |
| 3 网络层 | 寻址与路由 | **工具与路由层** | Function Calling、 **MCP** /ˌɛm siː ˈpiː/ （ **Model Context Protocol** /ˈmɒdl ˈkɒntekst ˈprəʊtəkɒl/ ，模型上下文协议）、RAG 检索路由 |
| 2 数据链路层 | 相邻节点可靠帧传输 | **上下文与检索层** | Embedding、向量库、Chunking、Rerank、知识库接入 |
| 1 物理层 | 物理介质与比特流 | **模型与算力层** | Transformer 权重、GPU/TPU、推理框架（vLLM）、量化 |

> 箭头方向：上层依赖下层。例如"应用层"的 Agent 产品，必然向下穿越会话层、编排层、工具层，最终在模型算力层完成一次推理。

## 逐层拆解与知识补全

### L1 物理层 → 模型与算力层

最底层是 **模型本身的"物理实体"** ：训练好的权重文件、承载它的硬件、把它变成 token 的推理引擎。

- **LLM** （大语言模型）整体驻留这一层：它不关心"用户想干嘛"，只负责"给定输入 token 序列，输出下一个 token 概率分布"。
- 关键技术： **Transformer** /trænsˈfɔːmə/ 架构、 **KV Cache** （键值缓存）、量化（INT8/FP8）、投机解码。
- 代表组件：vLLM、TensorRT-LLM、SGLang、Ollama；硬件 GPU/TPU/NPU。

> 类比：就像网卡把比特流送上线路， **LLM** 把张量运算"送上"概率分布。

> **硬件是 L1 的物理实体，值得单独一篇** ：上面对"算力"的阐述偏向"权重 + 推理框架"的软件视角，真正的芯片、显存、卡间互联、服务器与集群被一笔带过。详见姊妹篇 → [02-物理层硬件：芯片与算力底座](02-物理层硬件：芯片与算力底座.md) ，把 L1 落到硅与电：为什么是 GPU 不是 CPU、HBM 带宽为何比峰值算力更关键、NVLink/PCIe/IB 如何决定并行效率、集群与 PUE 如何决定真成本。

### L2 数据链路层 → 上下文与检索层

网络的数据链路层负责"相邻节点之间可靠地传一帧"。在 AI 栈里，这一步对应 **把外部知识可靠地接进模型可理解的表示** —— 也就是 RAG 的底层。

- **Embedding** （嵌入）：把文本/图像编码成向量，是 AI 世界的"帧格式"。
- **向量数据库** ：FAISS、Milvus、Qdrant、pgvector，提供 ANN（近似最近邻）索引。
- 流程： **Chunking** （切分）→ Embedding → 向量检索 → **Rerank** （重排）。

> 这一层回答" **RAG** 在哪一层"：RAG 横跨 L2（检索表示）与 L3（路由到哪段知识），但 **检索内核** 落在 L2。

### L3 网络层 → 工具与路由层

网络层解决"数据包去哪、怎么走"。AI 栈里对应 **模型决定调用什么外部能力、把请求路由到哪里** 。

- **Function Calling** （函数调用）：模型输出结构化调用描述，由框架路由到具体 API。
- **MCP** （模型上下文协议）：把"工具/资源/提示"标准化为可寻址的远端服务，等价于给 AI 世界一套统一的"IP 地址 + 端口"寻址方案。
- **RAG 检索路由** ：决定查哪个知识库、用哪种检索策略（向量/全文/图谱）。

> **MCP** 与 **Function Calling** 的区别：前者是"工具和资源的传输/寻址协议"（层职责），后者是"模型发起调用的语法动作"。MCP 让 Function Calling 可插拔、可跨进程。

### L4 传输层 → 编排与通信层

传输层保证端到端可靠（TCP 的握手、重传、拥塞控制）。AI 栈里对应 **Agent 的执行循环与多体通信** —— 确保"任务从发起到完成"这条端到端链路可靠。

- **Agent Loop** ：Think → Act → Observe 反复迭代（ReAct 范式）。
- **多 Agent 通信** ： **A2A** /ˌeɪ tuː ˈeɪ/ （ **Agent-to-Agent** /ˈeɪdʒənt tə ˈeɪdʒənt/ ，智能体间通信）协议、消息总线、共享黑板。
- 可靠性工程：重试、降级、熔断（对应拥塞控制）、超时与回溯。

> **Agent** 不是一个"单层组件"，它主要栖身 L4（编排循环），但会 **向下调用 L3 工具、向上消费 L5 会话、对外呈现于 L7 应用** 。这正是 Agent 难测、难排的原因：它跨越了多个层。

### L5 会话层 → 会话与记忆层

会话层管理"一次会话的建立、保持与拆除"。AI 栈对应 **跨轮次的状态与记忆** 。

- **上下文工程** （Context Engineering）：每轮动态拼装 System/History/Tool 结果。
- **Memory** ：短期（本轮窗口）、长期（向量库/文件持久化）、工作记忆（Scratchpad）。
- **Session 路由** ：多用户、多租户下的状态隔离与恢复。

> 类比：会话层让"断线重连还能接着聊"，记忆层让"关掉网页明天还能记得你"。

### L6 表示层 → 表示与交互层

表示层负责数据格式转换、加密。AI 栈对应 **输入输出的规范化与安全防护** 。

- **提示词模板** ：把业务参数渲染成模型能懂的 Prompt（"编码"）。
- **结构化输出** ：用 JSON Schema / 函数签名约束模型输出（"解码"为机器可读格式）。
- ** Safety ** / 护栏：敏感词、越狱防护、输出合规过滤（类比"加密/校验"）。

### L7 应用层 → 智能应用层

最顶层，用户直接消费。AI 栈对应 **把上面所有层打包成产品** 。

- 对话型：ChatFlow、Bot、Copilot。
- 流程型：WorkFlow、n8n、Dify Workflow。
- 自主型：多 Agent 系统、Coding Agent、Research Agent。

> 这一层的技术含量最低（相对），价值密度最高——它把 L1–L6 的能力"翻译"成用户愿意付钱的场景。

## 一张图看懂"一个请求穿越哪些层"

以"用户问：帮我查上月销售并写周报"为例：

```text
L7 应用层     : ChatFlow 收到自然语言诉求
L6 表示层     : 解析意图 → 渲染成结构化任务 JSON
L5 会话层     : 载入用户记忆、历史偏好、本轮 Session
L4 传输层     : Agent 循环启动：规划 → 调用工具 → 观察结果
L3 网络层     : 经 MCP 路由到「数据库工具」+「文档生成工具」
L2 数据链路层 : 先 RAG 检索上月销售知识，Embedding 向量召回并 Rerank
L1 物理层     : LLM 在 GPU 上完成 token 生成，vLLM 返回结果
```

完整跑通后，结果沿 L1→L7 逐层回传，最终在应用层渲染成周报。

## 用这个模型能解决什么困惑

| 常见困惑 | 用 OSI 类比怎么答 |
|----------|-------------------|
| RAG 算哪一层？ | 检索内核在 L2，路由决策在 L3，整体是"L2–L3 的能力组合" |
| MCP 是什么层？ | L3 网络层——定义工具/资源的"寻址与传输协议" |
| Agent 在哪个层？ | 主体是 L4 编排层，但向下穿透 L3、向上依赖 L5、对外是 L7 |
| 微调（Fine-tuning）放哪？ | 属于 L1 物理层——改变模型权重这个"物理实体"本身 |
| 提示工程（Prompt）放哪？ | 主要在 L6 表示层（把意图编码成模型输入） |
| 多模态（视觉/语音）放哪？ | 跨越 L1（多模态底座）与 L6（模态编解码/对齐） |

## 与现有知识库的衔接

本文是横向"归类"视角，纵向深入请回对应模块：

- L1 模型与算力 → [06 大语言模型 LLM](../06-大语言模型LLM/01-什么是LLM.html) 、 [11 推理与部署](../11-推理与部署/03-推理框架.html)
- L2 检索表示 → [09 RAG 与上下文](../09-RAG与上下文/01-RAG检索增强生成.html) 、 [03 Embedding](../06-大语言模型LLM/03-Embedding与表示.html)
- L3 工具路由 → [12 Agent 与工具 · MCP](../12-Agent与工具/03-MCP协议.html)
- L4 编排通信 → [Agent 开发知识](../../Agent开发知识/README.html) 、 [Agent 设计模式](../../Agent设计模式/README.html)
- L5 会话记忆 → [Agent 开发知识 · 记忆系统](../../Agent开发知识/04-记忆系统/01-记忆系统.html)
- L6 表示交互 → [08 提示工程](../08-提示工程/01-提示工程基础.html) 、 [14 评估与安全 · 护栏](../14-评估与安全/02-对齐与安全.html)
- L7 智能应用 → [AI 编程范式 · 应用开发](../../AI编程范式/README.html) 、 [WorkFlow](../../WorkFlow/README.html) 、 [ChatFlow](../../ChatFlow/README.html)

> 注意：本文是 `posts/AI/AI知识库/` 下的普通 post（非 README），故跨目录链接使用 `.html` 写法。若直接在 GitHub 源仓阅读 `.md` ，请将 `.html` 改回 `.md` 。

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **OSI** | /ˌoʊ ɛs ˈaɪ/ | Open Systems Interconnection | 开放系统互连 |
| **LLM** | /ˌɛl ɛl ˈɛm/ | Large Language Model | 大语言模型 |
| **RAG** | /ræɡ/ | Retrieval-Augmented Generation | 检索增强生成 |
| **MCP** | /ˌɛm siː ˈpiː/ | Model Context Protocol | 模型上下文协议 |
| **A2A** | /ˌeɪ tuː ˈeɪ/ | Agent-to-Agent | 智能体间通信 |
| **KV Cache** | /ˌkeɪ ˈviː ˈkæʃ/ | Key-Value Cache | 键值缓存 |
| **Embedding** | /ɪmˈbedɪŋ/ | Embedding | 嵌入（向量化表示） |
| **Rerank** | /ˌriːˈræŋk/ | Re-rank | 重排序 |
| **Chunking** | /ˈtʃʌŋkɪŋ/ | Chunking | 文本分块 |
| **Transformer** | /trænsˈfɔːmə/ | Transformer | 变换器（注意力架构） |
| **GPU** | /ˌdʒiː piː ˈjuː/ | Graphics Processing Unit | 图形处理器 |
| **TPU** | /ˌtiː piː ˈjuː/ | Tensor Processing Unit | 张量处理单元 |
| **NPU** | /ˌɛn piː ˈjuː/ | Neural Processing Unit | 神经网络处理器 |
| **VRAM** | /vɪ ˈræm/ | Video Random Access Memory | 显存 |
| **HBM** | /ˌeɪtʃ biː ˈem/ | High Bandwidth Memory | 高带宽内存 |
| **FLOPS** | /ˈflɒps/ | Floating Point Operations Per Second | 每秒浮点运算数 |
| **NVLink** | /ˌɛn viː lɪŋk/ | （NVIDIA 高速 GPU 互联） | NVIDIA 高速互联 |
| **PCIe** | /ˌpiː siː ˈaɪ iː/ | Peripheral Component Interconnect Express | 高速外设总线 |
| **IB** | /ˌaɪ ˈbiː/ | InfiniBand | 无限带宽网络 |
| **PUE** | /ˌpiː juː ˈiː/ | Power Usage Effectiveness | 电源使用效率 |
