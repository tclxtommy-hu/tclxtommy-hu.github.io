# MCP 协议

> 最后修改时间：2026-11-07 12:47

> 一句话定义：MCP 是标准化 LLM 与外部工具/数据源连接的开放协议，被类比为"AI 应用的 USB-C"。

## 1. 定义
Model Context Protocol（MCP）由 Anthropic 于 2024 年开源，标准化客户端与工具/数据源服务器的连接，实现"一次封装，处处可用"。

## 2. 架构
- **Client**：宿主应用（IDE、Agent 框架）。
- **Server**：封装数据源/工具，暴露能力。
- **三大能力**：
  - Resources：可读数据。
  - Tools：可执行函数。
  - Prompts：可复用提示模板。

## 3. 价值
- 解耦：工具与客户端独立演进，消除 M×N 集成地狱。
- 生态复用：社区 Server 一次封装多处用。
- 标准化：统一 schema 与协议。
- 安全：权限与审批集中在客户端。

## 4. 传输
- **stdio**：本地运行，安全，适合 IDE/桌面客户端内嵌 Server。
- **Streamable HTTP**：远程传输标准（2025 年规范起取代早期的 HTTP+SSE 方案），支持流式响应与断线重连，配 OAuth 2.1 鉴权。

## 4.1 规范演进要点（2025 至今）
- **结构化工具输出**：工具可返回带 schema 的结构化数据，不再只有文本。
- **Elicitation**：Server 可反向向用户索要输入（表单式补参）。
- **官方 Registry**：MCP Server 的官方注册中心上线，解决"发现"问题。
- **生态采纳**：OpenAI、Google、Microsoft 等主流厂商相继在自家产品/SDK 中原生支持 MCP；Anthropic 已将 MCP 捐赠给 Linux 基金会旗下的 Agentic AI Foundation，协议走向跨厂商中立治理。

## 5. 与 Function Calling 关系
- Function Calling 是模型厂商私有规范。
- MCP 是开放协议，跨客户端复用。
- MCP 是 Function Calling 的"协议化、可移植"升级。

## 6. 注意事项
- 只用可信 Server，防注入与数据泄露。
- 最小权限暴露工具。
- 简单一次性集成不必上 MCP。

## 7. 学习要点
- MCP 解决工具集成碎片化。
- 一次封装处处可用是核心价值。
- 生态已从早期探索进入主流采纳期：选型优先看官方 Registry 有无现成 Server。
- 与 A2A 互补：MCP 管"Agent ↔ 工具"，A2A 管"Agent ↔ Agent"（见 [A2A 与 Agent 互操作](05-A2A与Agent互操作.html)）。

## 8. 参考资料
- Anthropic, "Introducing the Model Context Protocol"
- modelcontextprotocol.io