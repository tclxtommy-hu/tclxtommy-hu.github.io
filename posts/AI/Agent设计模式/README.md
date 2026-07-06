# Agent 设计模式

> 整理日期：2026-07-06
> 定位：系统梳理常见 Agent 设计模式，含原理、场景、示例代码
> 风格：中文为主，术语保留英文原文；每篇含模式原理、使用场景、完整示例代码、优点与局限

本文件夹收录 **9 种常见的 Agent 设计模式**，是 Agent 开发中可复用的架构范式。每种模式独立成篇，附带可直接参考的 Python 示例代码。

## 模式索引

| 序号 | 模式 | 核心思想 | 适用场景 |
|------|------|----------|----------|
| 00 | [总览](00-总览.md) | 模式关系图、选型指南、组合使用 | 快速定位所需模式 |
| 01 | [ReAct](01-ReAct模式.md) | 思考→行动→观察，交替进行 | 需要工具和外部信息的多步任务 |
| 02 | [Plan-and-Execute](02-Plan-and-Execute模式.md) | 先制定完整计划，再逐步执行 | 复杂多步骤任务，可并行子任务 |
| 03 | [Reflection](03-Reflection模式.md) | 生成→反思→改进，迭代优化 | 需要高质量输出的生成任务 |
| 04 | [Multi-Agent Collaboration](04-Multi-Agent-Collaboration模式.md) | 多专业 Agent 协作完成任务 | 需要多领域协作的复杂项目 |
| 05 | [Tool Use / Function Calling](05-Tool-Use-Function-Calling模式.md) | Agent 调用外部工具获取能力 | 所有需要外部数据/操作的场景 |
| 06 | [Memory-Augmented](06-Memory-Augmented模式.md) | 持久化记忆，跨会话保持上下文 | 个性化助手、长期交互 |
| 07 | [Tree of Thoughts](07-Tree-of-Thoughts模式.md) | 探索多条推理路径，选择最优 | 需要创造性或策略性思考的难题 |
| 08 | [Self-Ask](08-Self-Ask模式.md) | 拆解为子问题，逐步自问自答 | 多跳问答、对比分析 |
| 09 | [Router / Subagent](09-Router-Subagent模式.md) | 意图路由到专业子代理处理 | 多功能平台、多领域服务 |

## 模式分类

```
                          ┌─────────────┐
                          │   基础能力    │
                          │  Tool Use    │
                          └──────┬───────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
   ┌─────────────┐       ┌─────────────┐        ┌─────────────┐
   │  推理与决策   │       │  协作与组织   │        │  记忆与优化   │
   ├─────────────┤       ├─────────────┤        ├─────────────┤
   │ ReAct       │       │ Multi-Agent │        │ Memory      │
   │ Plan-Exec   │       │ Router/Sub  │        │ Reflection  │
   │ Self-Ask    │       │             │        │             │
   │ Tree of     │       │             │        │             │
   │   Thoughts  │       │             │        │             │
   └─────────────┘       └─────────────┘        └─────────────┘
```

## 如何选择

| 需求 | 推荐模式 |
|------|----------|
| 需要调用外部 API | [Tool Use](05-Tool-Use-Function-Calling模式.md) |
| 需要动态调整策略 | [ReAct](01-ReAct模式.md) |
| 需要高质量输出 | [Reflection](03-Reflection模式.md) |
| 需要并行处理 | [Plan-and-Execute](02-Plan-and-Execute模式.md) |
| 需要团队分工 | [Multi-Agent](04-Multi-Agent-Collaboration模式.md) |
| 需要个性化/连续性 | [Memory-Augmented](06-Memory-Augmented模式.md) |
| 需要多路径探索 | [Tree of Thoughts](07-Tree-of-Thoughts模式.md) |
| 需要拆解复杂问题 | [Self-Ask](08-Self-Ask模式.md) |
| 需要领域路由 | [Router/Subagent](09-Router-Subagent模式.md) |

## 阅读建议

- **新手入门**：从 [00-总览](00-总览.md) 开始，了解模式全景 → 再读 [01-ReAct](01-ReAct模式.md) 和 [05-Tool Use](05-Tool-Use-Function-Calling模式.md) 打基础
- **实战开发**：按需查阅具体模式，每篇都有可运行的 Python 示例代码
- **架构设计**：参考 [00-总览](00-总览.md) 中的组合使用案例
- **框架对比**：结合 [Agent开发知识/10-框架与工具](../Agent开发知识/10-框架与工具/01-主流框架对比.md) 了解各框架对模式的支持

## 相关资源

- 上游索引：[AI 知识库总索引](../README.md)
- 互补专题：[Agent 开发知识](../Agent开发知识/README.md) — 从组件视角（LLM/工具/记忆/规划）学习 Agent 构建
- 参考论文：见 [00-总览](00-总览.md) 文末参考文献
