# LlamaIndex Agents

> 整理日期：2026-08-21
> 定位：以 RAG 与数据为核心的 LLM 应用框架，及其 Agent / Workflows 能力
> 风格：中文为主，术语保留英文原文；介绍框架定位、核心概念与基本用法

LlamaIndex（原 GPT Index）是以 **数据接入与检索增强（RAG）** 见长的 LLM 应用框架。除强大的索引 / 检索能力外，它也提供完整的 Agent 能力：从经典的 ReAct Agent、Function Agent，到多智能体（SubQuestionQueryEngine、AgentRunner），再到事件驱动的 **Workflows** 编排范式，适合"以数据 / 知识为中心"的 Agent 应用。

## 核心概念

| 概念 | 说明 |
|------|------|
| **Index / Retriever** | 文档索引与检索，RAG 的核心基础设施 |
| **ReAct Agent** | 基于 ReAct 推理-行动循环的 Agent |
| **Function Agent / Tool** | 通过工具函数扩展能力；`ToolSpec` 批量封装工具 |
| **SubQuestionQueryEngine** | 将复杂问题拆为子问题，分发给子查询引擎（多 Agent 雏形） |
| **AgentRunner** | 驱动多步 Agent 执行与记忆管理 |
| **Workflows（工作流）** | 事件驱动编排，用 `@step` 装饰器与事件（Event）串联异步步骤 |

## 架构与编排模型

LlamaIndex 以数据索引为底，Agent 在检索之上做推理与工具调用；Workflows 用事件驱动替代线性链。

```mermaid
flowchart TD
    D[(数据 / 索引)] --> R[Retriever 检索]
    R --> A[Agent<br/>ReAct / Function]
    A -->|工具调用| T[Tool / ToolSpec]
    T --> A
    A -->|结果| O[输出]
    W1[@step StartEvent] --> W2[@step 中间事件]
    W2 --> W3[@step StopEvent]
```

## 关键能力

- **RAG 一等公民**：业界领先的索引、检索、混合搜索与 Agents + RAG 结合。
- **多种 Agent 形态**：从单 Agent 到多智能体、子问题分解。
- **Workflows 事件驱动**：异步、可观测、易组合的编排，避免脆弱的链式调用。
- **数据源广泛**：支持文档、数据库、API、知识图谱等。

## 典型工作流

1. 加载数据并构建 `Index`（Vector / Summary / Keyword 等）。
2. 定义 `Tool` / `ToolSpec` 与 `QueryEngine`。
3. 用 `ReActAgent` 或 `FunctionAgent` 包装，配置 `AgentRunner`。
4. 复杂流程用 `Workflow` 的 `@step` + 自定义 Event 编排。
5. 运行并基于检索结果生成答案。

## 适用场景

知识库问答、企业文档智能、数据驱动的 Agent、需要强 RAG 能力的应用。

## 相关资源

- 上游索引：[Harness 总览](../../README.md)
- RAG 基础：[Agent开发知识 / RAG与知识集成](../Agent开发知识/07-RAG与知识集成/01-RAG与知识集成.md)
- 官网：https://www.llamaindex.ai/
