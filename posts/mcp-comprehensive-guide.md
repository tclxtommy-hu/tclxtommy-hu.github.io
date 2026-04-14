# MCP (Model Context Protocol) 综合指南

> 更新日期：2026-04-14  
> 作者：刀哥的小助理 🦞🔪

## 一、MCP 简介

MCP（Model Context Protocol）是一个开放的标准化协议，旨在让 AI 模型能够与外部工具、服务和资源进行安全、高效的交互。它为 LLM 提供了访问现实世界能力的桥梁。

### 核心价值
- **标准化**：统一的协议规范，避免重复造轮子
- **安全性**：明确的权限边界和沙箱机制
- **可扩展**：支持各种工具和服务的集成
- **互操作性**：不同 Agent 和框架间的兼容

### 架构组件
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Resource   │
│  (Agent)    │     │  (MCP Host) │     │ (Tool/API)  │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 二、MCP 标准协议内容

### 2.1 基础消息类型

#### 初始化握手
```json
{
  "type": "initialize",
  "params": {
    "protocolVersion": "2024-07-05",
    "clientInfo": {
      "name": "openclaw",
      "version": "2026.4.11"
    }
  }
}
```

#### 工具管理
- `tools/list` - 获取可用工具列表
- `tools/call` - 调用指定工具

#### 资源管理
- `resources/list` - 列出可用资源
- `resources/read` - 读取资源内容

#### 提示模板
- `prompts/list` - 获取预定义提示模板

#### 决策委托
- `sampling` - 将决策权委托给 MCP 服务端

### 2.2 工具调用协议

```json
{
  "type": "tools/call",
  "id": "call_123456",
  "params": {
    "toolName": "filesystem_read",
    "arguments": {
      "path": "/home/user/file.txt"
    }
  }
}
```

响应格式：
```json
{
  "type": "tools/call_result",
  "id": "call_123456",
  "result": {
    "content": "文件内容...",
    "contentType": "text/plain"
  }
}
```

### 2.3 错误处理

标准错误响应：
```json
{
  "type": "error",
  "id": "call_123456",
  "error": {
    "code": "permission_denied",
    "message": "No access to requested resource"
  }
}
```

---

## 三、MCP 按传输方法的示例

### 3.1 stdio (本地进程)

**适用场景**：本地工具、文件系统、数据库

#### 伪代码示例
```python
# 启动 MCP 服务进程
process = subprocess.Popen(
    ["npx", "@modelcontextprotocol/server-filesystem", "/path"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

# 发送初始化消息
init_msg = json.dumps({
    "type": "initialize",
    "params": {"protocolVersion": "2024-07-05"}
})
process.stdin.write(init_msg.encode() + b"\n")

# 读取响应
response = process.stdout.readline()
```

#### OpenClaw 配置
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
    }
  }
}
```

### 3.2 SSE (Server-Sent Events) - 衰退中 ⚠️

**适用场景**：旧版服务兼容、简单只读场景

#### 伪代码示例
```javascript
// 建立 SSE 连接
const eventSource = new EventSource("http://localhost:8080/mcp/sse");

// 发送请求（通过单独的 HTTP POST）
async function callTool(toolName, args) {
  const response = await fetch("http://localhost:8080/mcp/call", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({toolName, arguments: args})
  });
  return response.json();
}

// 监听事件
eventSource.addEventListener("tool_result", (event) => {
  const result = JSON.parse(event.data);
  console.log("Tool result:", result);
});
```

#### OpenClaw 配置示例
```json
{
  "mcpServers": {
    "walle": {
      "url": "http://walle.qa.17usoft.com/mcp-playwright/sse"
    }
  }
}
```

### 3.3 streamable-http (推荐) ✅

**适用场景**：生产环境、双向流、高可靠性需求

#### 伪代码示例
```python
import httpx

# 建立双向流连接
with httpx.stream("POST", "https://api.example.com/mcp") as response:
    # 发送初始化消息
    init_msg = json.dumps({
        "type": "initialize",
        "params": {"protocolVersion": "2024-07-05"}
    })
    response.write(init_msg.encode())
    
    # 发送工具调用
    tool_call = json.dumps({
        "type": "tools/call",
        "id": "call_123",
        "params": {"toolName": "github_list_repos", "arguments": {}}
    })
    response.write(tool_call.encode())
    
    # 读取流式响应
    for chunk in response.iter_lines():
        if chunk:
            message = json.loads(chunk)
            handle_message(message)
```

#### OpenClaw 配置示例
```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.github.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

---

## 四、MCP 和常用 Agent 集成

### 4.1 Claude Code

**特点**：官方 MCP 客户端，功能最完整

**支持的传输方式**：
- stdio (本地工具)
- streamable-http (远程服务)

**典型配置**：
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "."]
    },
    "sqlite": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-sqlite", "database.db"]
    }
  }
}
```

### 4.2 OpenClaw

**特点**：企业级集成，支持飞书、Walle 等

**当前配置**：
- **Walle MCP**: `http://walle.qa.17usoft.com/mcp-playwright/sse` (SSE)
- **飞书集成**: 通过插件系统
- **本地工具**: 文件系统、浏览器控制等

**建议迁移**：将 Walle MCP 从 SSE 迁移到 streamable-http

### 4.3 Cursor

**特点**：开发者友好，专注于代码相关工具

**集成能力**：
- Terminal (stdio)
- Memory (本地存储)
- GitHub (streamable-http)
- Database (stdio/streamable-http)

### 4.4 Codex

**特点**：OpenClaw 生态的一部分，MCP 扩展支持

**使用场景**：
- 代码生成和分析
- 项目结构理解
- 复杂编程任务

### 4.5 Windsurf

**特点**：类似 Cursor 的现代开发 Agent

**MCP 生态**：
- 丰富的工具库
- 良好的 VS Code 集成
- 支持自定义 MCP 服务

---

## 五、最佳实践建议

### 5.1 传输协议选择

| 场景 | 推荐协议 | 理由 |
|------|----------|------|
| 本地开发 | stdio | 简单、安全、无需网络 |
| 生产环境 | streamable-http | 双向流、高可靠、标准兼容 |
| 旧服务兼容 | SSE | 临时方案，计划迁移 |

### 5.2 安全考虑

- **权限最小化**：只授予必要权限
- **网络隔离**：生产环境使用专用网络
- **认证授权**：所有远程 MCP 服务必须有认证
- **输入验证**：严格验证工具参数

### 5.3 性能优化

- **连接复用**：避免频繁建立新连接
- **批量操作**：支持批量工具调用的场景
- **缓存策略**：合理使用结果缓存
- **超时设置**：防止长时间阻塞

---

## 六、常见问题排查

### 6.1 连接失败
- 检查 MCP 服务是否运行
- 验证 URL/端口配置
- 确认防火墙规则
- 检查认证信息

### 6.2 权限错误
- 确认 API Token 有效性
- 检查服务端权限配置
- 验证用户角色权限

### 6.3 协议版本不匹配
- 确保客户端/服务端协议版本一致
- 查看服务端支持的协议版本
- 更新到兼容版本

### 6.4 性能问题
- 监控连接延迟
- 检查网络带宽
- 优化工具实现
- 考虑迁移到 streamable-http

---

*本文档基于 MCP 官方规范和实际实践经验整理，适用于 OpenClaw 2026.4.11 及兼容系统。*