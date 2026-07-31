# AI WorkFlow（工作流）知识库

> 整理日期：2026-07-31
> 定位：梳理 AI 工作流（Workflow）的概念边界，以及主流编排/自动化工具
> 风格：中文为主，术语保留英文原文；后续按工具/专题持续补文档

本文件夹收录 **AI WorkFlow** 相关笔记：侧重「触发 → 编排 → 执行 → 交付」的流水线式自动化，而非多轮对话本身。

## 一句话定义

**WorkFlow（工作流）** ：以节点/边构图的方式，把 LLM、工具、API、数据源串成可复用流水线；通常由事件/定时/Webhook 触发，面向批处理、集成与后台自动化。

与 [ChatFlow](../ChatFlow/README.md) 的区别：WorkFlow 以 **任务编排** 为中心；ChatFlow 以 **会话交互** 为中心。

## 目录

| 文件 | 主题 |
|------|------|
| [00-什么是WorkFlow.md](00-什么是WorkFlow.md) | 定义、核心组件、与 Agent/ChatFlow 边界 |
| [01-主流工具全景.md](01-主流工具全景.md) | n8n、Dify Workflow、Make、Zapier、Flowise、Langflow 等 |

## 阅读建议

- **先建立概念** ：读 [00-什么是WorkFlow](00-什么是WorkFlow.md)。
- **做选型对比** ：读 [01-主流工具全景](01-主流工具全景.md)。
- **对话式应用** ：转到 [ChatFlow](../ChatFlow/README.md)。
- **代码级 Agent 框架** ：见 [Agent 开发知识 · 框架与工具](../Agent开发知识/10-框架与工具/01-主流框架对比.md)。

## 后续计划

本目录将陆续补充各工具的安装、节点设计、实战案例与踩坑笔记。
