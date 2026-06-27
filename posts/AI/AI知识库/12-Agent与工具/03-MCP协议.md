# MCP 协议

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
- stdio：本地运行，安全。
- HTTP/Streamable HTTP：远程，需鉴权加密。

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
- 生态仍在早期但增长快。

## 8. 参考资料
- Anthropic, "Introducing the Model Context Protocol"
- modelcontextprotocol.io