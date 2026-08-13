# MCP 协议

> 一句话定义： **MCP** /ˌem siː ˈpiː/ （ **Model Context Protocol** /ˈmɒdl ˈkɒntekst ˈprəʊtəkɒl/ ，模型上下文协议）是标准化 LLM 与外部工具/数据源连接的开放协议，被类比为"AI 应用的 USB-C"。

## 1. 定义
Model Context Protocol（MCP）由 Anthropic 于 2024 年开源，标准化客户端与工具/数据源服务器的连接，实现"一次封装，处处可用"。

## 2. 架构
- **Client**：宿主应用（IDE、Agent 框架、聊天应用）。
- **Server**：封装数据源/工具，暴露能力。
- **三大能力**：
  - **Resources**：可读数据（文件、DB 记录、API 结果）。
  - **Tools**：可执行函数（带 schema）。
  - **Prompts**：可复用提示模板。

## 3. 价值
- **解耦**：工具与客户端独立演进，消除 M×N 集成地狱。
- **生态复用**：社区 Server 一次封装多处用。
- **标准化**：统一 schema 与协议。
- **安全**：权限与审批集中在客户端。

## 4. 传输
- **stdio**：本地运行，安全。
- **HTTP / Streamable HTTP**：远程，需鉴权加密。

## 5. 与 Function Calling 关系
- Function Calling 是模型厂商私有规范。
- MCP 是开放协议，跨客户端复用。
- MCP 是 Function Calling 的"协议化、可移植"升级。

## 6. 在 Agent 中的角色
- Agent 可通过 MCP 接入任意工具生态。
- 一个 Agent 框架支持 MCP 即可消费所有社区 Server。
- 降低 Agent 工具集成成本。

## 7. 调用链路与可观测

MCP 把工具拆到独立进程/远端后，排查必须能回答：「慢在 Client、传输、Server，还是下游 API？」

推荐 Span 嵌套：

```text
agent.run → skill.execute → mcp.client.call_tool
                              └── mcp.server.handle_call
                                  └── downstream.http
```

要点：

- **传播 trace context**：HTTP 用 **W3C** /ˌdʌbljuː θriː ˈsiː/ `traceparent`；stdio 用 env/元数据传 `TRACE_ID`，避免 Client/Server 各记一条互不相关的链路。
- **每一跳记耗时与错误码**：才能区分「MCP 配置问题」与「下游限流」。
- **结果体大小**：超长返回会炸 Agent 上下文，建议进 Metric。

端到端时序图、埋点表与排查口诀见 [可观测性与 LLMOps · §4 MCP 工具调用链路](../13-进阶与工程化/04-可观测性与LLMOps.md)。

## 8. 注意事项
- 只用可信 Server，防注入与数据泄露。
- 最小权限暴露工具。
- 危险操作加审批。
- 简单一次性集成不必上 MCP。
- 生产环境务必打通 MCP 链路追踪，否则跨进程故障不可归因。

## 9. 学习要点
- MCP 解决工具集成碎片化。
- 一次封装处处可用是核心价值。
- 生态仍在早期但增长快，是 Agent 工具生态的方向。
- 可观测：Client → Server → 下游必须落在同一 `trace_id` 上。

## 10. 参考资料
- Anthropic, "Introducing the Model Context Protocol"
- modelcontextprotocol.io
- [可观测性与 LLMOps](../13-进阶与工程化/04-可观测性与LLMOps.md)