# CrewAI

> 整理日期：2026-08-21
> 定位：面向"角色扮演 + 流程编排"的多智能体框架（独立于 LangChain）
> 风格：中文为主，术语保留英文原文；介绍框架定位、核心概念与基本用法

CrewAI 是一个以 **角色（Role）和流程（Process）** 为核心的多智能体框架，语言简洁、上手快，且**不依赖 LangChain**，可独立运行。它通过"组建一支有分工的团队（Crew）"来协作完成复杂任务，并新增了事件驱动的 **Flows** 能力以补充传统顺序 / 层级流程。

## 核心概念

| 概念 | 说明 |
|------|------|
| **Agent（智能体）** | 扮演特定角色（如"研究员""作家"），拥有 `role` / `goal` / `backstory` |
| **Task（任务）** | 具体工作单元，可指定 `description` / `expected_output` / 负责 Agent |
| **Crew（团队）** | 由多个 Agent 与 Task 组成，是执行的最小整体 |
| **Process（流程）** | 任务执行方式：`sequential`（顺序）/ `hierarchical`（层级，设 manager） |
| **Flow（流）** | 事件驱动的编排，用 `@start` / `@listen` / `@router` 装饰器串联 Crews 与函数 |
| **Tool / Knowledge** | 工具与知识库，给 Agent 提供外部能力 |

## 架构与编排模型

CrewAI 先以"角色 + 任务 + 流程"组织团队，再以 Process 或 Flow 驱动执行。

```mermaid
flowchart TD
    C[Crew 团队] --> P{Process}
    P -->|sequential| S1[Agent-A 任务1] --> S2[Agent-B 任务2] --> S3[Agent-C 任务3]
    P -->|hierarchical| M[Manager Agent] --> H1[子任务分配给成员]
    C -.->|Flows 事件驱动| F1[@start] --> F2[@listen] --> F3[@router]
```

## 关键能力

- **角色化建模**：用自然语言描述角色背景与目标，贴合真实团队协作。
- **灵活流程**：顺序与层级两种 Process，外加 Flow 支持条件分支与事件触发。
- **丰富工具生态**：内置搜索、RAG、代码执行等工具，支持自定义 Tool。
- **独立轻量**：无 LangChain 依赖，部署简单，适合产品化。

## 典型工作流

1. 定义若干 `Agent`（设定角色与目标）。
2. 定义 `Task` 并指派负责 Agent。
3. 将 Agents 与 Tasks 组装成 `Crew`，指定 `process`。
4. `crew.kickoff(inputs=...)` 启动执行。
5. 复杂编排用 `Flow` 的 `@start/@listen/@router` 串接多个 Crew。

## 适用场景

内容生产流水线、市场调研、自动化报告生成、需要清晰角色分工的业务流程自动化。

## 相关资源

- 上游索引：[Harness 总览](../../README.md)
- 对比参考：[Agent开发知识 / 主流框架对比](../Agent开发知识/10-框架与工具/01-主流框架对比.md)
- 官网：https://www.crewai.com/
