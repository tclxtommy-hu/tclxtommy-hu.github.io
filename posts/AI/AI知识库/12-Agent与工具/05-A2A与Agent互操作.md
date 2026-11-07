---
title: A2A 协议与 Agent 互操作
date: 2026-11-07
tags: [AI, Agent, A2A, 协议, 多智能体]
---

# A2A 协议与 Agent 互操作

> 最后修改时间：2026-11-07 12:47

> 一句话定义：**A2A** /ˌeɪ tuː ˈeɪ/ （ **Agent-to-Agent Protocol** /ˈeɪdʒənt tə ˈeɪdʒənt ˈprəʊtəkɒl/ ，智能体间通信协议）是 Google 于 2025 年 4 月发起、后捐赠给 Linux 基金会的开放协议，让不同厂商、不同框架构建的 Agent 能像"同事"一样互相发现、委派任务、交换产物。

## 1. 为什么有了 MCP 还需要 A2A

一句话区分：

- **MCP** 管"Agent ↔ 工具"：纵向，模型调用无自主意志的工具/数据源（查数据库、读文件）。
- **A2A** 管"Agent ↔ Agent"：横向，两个各有自主能力的 Agent 协作（一个会订票、一个会报销）。

工具是"手"，Agent 是"同事"。当你公司的"行政 Agent"要委托供应商的"差旅 Agent"订票时，双方都是黑盒、都有状态、任务可能跑几小时——这不是一次函数调用能表达的，需要任务生命周期管理，这正是 A2A 的领域。

## 2. 核心概念

| 概念 | 作用 |
|------|------|
| **Agent Card** | Agent 的"名片"：能力、技能、端点、鉴权方式，发布在 `/.well-known/agent.json` |
| **Task** | 一次委派的工单，有完整生命周期（submitted → working → completed/failed/canceled） |
| **Message** | 任务内的对话消息（role + parts），用于澄清、追问 |
| **Artifact** | 任务的产出物（文件、报表、结构化数据） |
| **Streaming** | 长任务通过 SSE 推送进度 |
| **Push Notification** | 超长任务（小时级）完成后 webhook 回调 |

**Agent Card 真实样子**（具体数据样例）：

```json
{
  "name": "差旅订票 Agent",
  "url": "https://travel-agent.example.com/a2a",
  "version": "1.2.0",
  "capabilities": { "streaming": true, "pushNotifications": true },
  "skills": [
    {
      "id": "book-flight",
      "name": "机票预订",
      "description": "按日期/城市/舱位查询并下单国内国际机票",
      "inputModes": ["text", "data"],
      "outputModes": ["data"]
    },
    {
      "id": "refund-ticket",
      "name": "退改签",
      "description": "按订单号办理退票或改签",
      "inputModes": ["data"],
      "outputModes": ["data"]
    }
  ],
  "securitySchemes": ["oauth2"]
}
```

调用方 Agent 拿到这张卡，就知道"它能干什么、怎么调、要不要登录"——**发现与协商是标准化的，实现是黑盒的** 。

## 3. 一次完整交互（贯穿案例）

场景：员工对公司的"行政总管 Agent"说"帮我订下周一去上海的高铁并走报销"。

```text
员工
 └─▶ 行政总管 Agent（本单位自研）
      │  1. 拆解：订票 + 报销两个子任务
      │  2. GET https://travel.example.com/.well-known/agent.json
      │     → 发现对方有 book-flight 技能
      │  3. POST /tasks  { skill: "book-flight", message: "下周一 北京→上海" }
      │     ◀─ SSE 推送：working… "二等座 G1 次 08:00 有票，553 元，确认？"
      │  4. 追问确认后 → completed，返回 Artifact（电子票订单）
      │
      │  5. 同理委派给"财务报销 Agent"（另一个供应商）
      │     → 2 小时后 push notification 回调：报销单已提交
      └─▶ 汇总结果回复员工
```

注意第 3 步里的追问：A2A 的 Message 机制支持"任务中途来回对话"，这是它与一次性 RPC 的本质区别。

## 4. 与 MCP 的协作关系

```text
        ┌─────────────┐   A2A（水平）  ┌─────────────┐
        │  行政 Agent  │ ◀──────────▶ │  差旅 Agent  │
        └──────┬──────┘               └──────┬──────┘
               │ MCP（垂直）                  │ MCP（垂直）
        ┌──────▼──────┐               ┌──────▼──────┐
        │ 日历/邮件工具 │               │ 航旅 API 工具 │
        └─────────────┘               └─────────────┘
```

现实系统里两者几乎总是一起用：**对外协作走 A2A，对内调工具走 MCP** 。相关协议还有 **AG-UI** /ˌeɪ dʒiː juː ˈaɪ/ （Agent-User Interaction，Agent 与前端 UI 的交互协议），三者分别覆盖 Agent 的三个边界：对 Agent、对工具、对人。

## 5. 注意事项

- **信任是硬问题**：把任务委派给外部 Agent，等于把数据送出去；鉴权、数据脱敏、可审计日志一个都不能少。
- **幂等与取消**：任务可能跑几小时，网络抖动重试不能重复下单；务必支持 cancel 与状态查询。
- **不要过度设计**：两个 Agent 同团队、同代码库，直接函数调用/SDK 集成更简单，A2A 解决的是 **跨组织、跨厂商** 的边界。
- **生态现状（2026）**：规范由 Linux 基金会托管，Google、Microsoft、SAP 等参与，SDK 覆盖 Python / TypeScript / Java 等主流语言。

## 6. 学习要点

- MCP 纵向调工具，A2A 横向联 Agent，AG-UI 面向人——三个协议各管一条边界。
- Agent Card 是发现机制的精髓：能力自描述，调用方零硬编码。
- 任务生命周期 + 流式 + 回调，是为"长时程、异步、有状态"的协作设计的。

## 7. 参考资料

- A2A Protocol 官方规范与 GitHub 仓库（google-a2a / a2aproject）
- Google, "Announcing the Agent2Agent Protocol"（2025-04）
- 本知识库相关篇： [MCP 协议](03-MCP协议.html) 、 [多智能体](04-多智能体.html)

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **A2A** | /ˌeɪ tuː ˈeɪ/ | Agent-to-Agent Protocol | 智能体间通信协议 |
| **MCP** | /ˌɛm siː ˈpiː/ | Model Context Protocol | 模型上下文协议 |
| **AG-UI** | /ˌeɪ dʒiː juː ˈaɪ/ | Agent-User Interaction Protocol | Agent-用户交互协议 |
| **SSE** | /ˌɛs ɛs ˈiː/ | Server-Sent Events | 服务器推送事件 |
| **RPC** | /ˌɑːr piː ˈsiː/ | Remote Procedure Call | 远程过程调用 |
| **SDK** | /ˌɛs diː ˈkeɪ/ | Software Development Kit | 软件开发工具包 |
