# AI ChatFlow（对话流）知识库

> 整理日期：2026-07-31
> 定位：梳理 AI 对话流（ChatFlow）的概念边界，以及主流对话编排/机器人搭建工具
> 风格：中文为主，术语保留英文原文；后续按工具/专题持续补文档

本文件夹收录 **AI ChatFlow** 相关笔记：侧重「多轮对话 + 会话状态 + 编排节点」的交互式应用，而非纯后台批处理流水线。

## 一句话定义

**ChatFlow（对话流）** ：以会话为中心的可视化/声明式编排，把用户输入、LLM、工具、知识库串成可持续多轮交互的对话应用。

与 [WorkFlow](../WorkFlow/README.md) 的区别：ChatFlow 以 **对话体验** 为中心；WorkFlow 以 **任务自动化** 为中心。

## 目录

| 文件 | 主题 |
|------|------|
| [00-什么是ChatFlow.md](00-什么是ChatFlow.md) | 定义、核心组件、与 WorkFlow/Agent 边界 |
| [01-主流工具全景.md](01-主流工具全景.md) | Dify Chatflow、Coze、FastGPT、Botpress、MaxKB 等 |

## 阅读建议

- **先建立概念** ：读 [00-什么是ChatFlow](00-什么是ChatFlow.md)。
- **做选型对比** ：读 [01-主流工具全景](01-主流工具全景.md)。
- **后台自动化** ：转到 [WorkFlow](../WorkFlow/README.md)。
- **Agent 原理与代码框架** ：见 [Agent 开发知识](../Agent开发知识/README.md)。

## 后续计划

本目录将陆续补充各工具的搭建、提示词设计、知识库接入、渠道发布与实战案例。
