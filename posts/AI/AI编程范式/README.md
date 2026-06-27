# AI 编程范式（Paradigms）全景指南

> 整理日期：2026-06-26
> 范围：当下最流行的「AI 辅助编程范式」与「AI 应用开发范式」两大类
> 深度：每篇 1500 字以上，含定义、原理、工作流、优缺点、实战示例、注意事项、对比与参考

本仓库将当下主流的 AI 编程模式（范式）分为两大类，分别归档到对应子目录。

## 一、AI 辅助编程范式（AI-Assisted Programming Paradigms）

聚焦"人类如何用 AI 来写代码"——即开发者与 LLM/Agent 协作完成软件工程的不同姿态。

| 文件 | 范式 | 一句话定位 |
|------|------|-----------|
| [01-vibe-coding.md](AI辅助编程范式/01-vibe-coding.md) | Vibe Coding（氛围编程） | 自然语言驱动，"凭感觉"让 AI 生成代码，弱审查 |
| [02-agentic-coding.md](AI辅助编程范式/02-agentic-coding.md) | Agentic Coding（智能体编程） | AI 自主规划-执行-迭代，人监督而非逐行写 |
| [03-pair-programming.md](AI辅助编程范式/03-pair-programming.md) | AI Pair Programming（结对编程） | 人机实时协作，AI 作为副驾驶补全/建议 |
| [04-spec-driven-development.md](AI辅助编程范式/04-spec-driven-development.md) | Spec-Driven Development（规格驱动） | 先写规格/计划，AI 按规格实现 |
| [05-context-engineering.md](AI辅助编程范式/05-context-engineering.md) | Context Engineering（上下文工程） | 精心编排上下文，让模型在正确信息下推理 |
| [06-loop-engineering.md](AI辅助编程范式/06-loop-engineering.md) | Loop Engineering（循环工程） | 把 Agent 的 think-act-observe 循环本身作为工程对象 |
| [07-openspec.md](AI辅助编程范式/07-openspec.md) | OpenSpec（开放规格驱动开发） | 轻量级 SDD 落地框架，以"变更制品"驱动 explore→propose→apply→archive 闭环 |
| [08-superpowers.md](AI辅助编程范式/08-superpowers.md) | Superpowers（超能力技能驱动开发） | 以可组合"技能"自动触发 brainstorming→planning→TDD→review 工作流 |

## 二、AI 应用开发范式（AI Application Development Paradigms）

聚焦"如何用 AI 构建应用"——即把 LLM 作为核心组件时采用的架构与设计模式。

| 文件 | 范式 | 一句话定位 |
|------|------|-----------|
| [02-rag.md](AI应用开发范式/02-rag.md) | RAG（检索增强生成） | 检索外部知识注入上下文，缓解幻觉 |
| [03-agent.md](AI应用开发范式/03-agent.md) | Agent（智能体工作流） | LLM + 工具 + 循环，自主完成多步任务 |
| [04-cot-react.md](AI应用开发范式/04-cot-react.md) | CoT / ReAct（思维链/推理-行动） | 显式推理链与行动交错 |
| [05-mcp.md](AI应用开发范式/05-mcp.md) | MCP（模型上下文协议） | 标准化模型与外部资源/工具的连接 |
| [06-fine-tuning.md](AI应用开发范式/06-fine-tuning.md) | Fine-tuning（微调） | 在基座模型上继续训练以适配领域 |
| [07-function-calling.md](AI应用开发范式/07-function-calling.md) | Function Calling（函数调用） | 模型输出结构化调用，连接外部 API |
| [08-multi-agent.md](AI应用开发范式/08-multi-agent.md) | Multi-Agent（多智能体） | 多个 Agent 分工协作完成复杂任务 |
| [09-llm-api.md](AI应用开发范式/09-llm-api.md) | LLM API 接口与调用实例 | 主流厂商 API 形态与 Node.js/Python 最小可运行示例 |

## 阅读建议

- **想快速了解全貌**：先读每篇的「定义」与「核心特点」两节。
- **想落地实践**：重点看「工作流程」「实战示例」「注意事项」。
- **想做技术选型**：参考各篇末尾的「对比与选型建议」与「参考资料」。

## 术语约定

- 正文中文为主，专有名词、协议名、模型名保留英文原文（如 LLM、RAG、MCP、ReAct）。
- 范式之间常有重叠（如 Agentic Coding 与 Agent 工作流），文中会标注边界与区别。