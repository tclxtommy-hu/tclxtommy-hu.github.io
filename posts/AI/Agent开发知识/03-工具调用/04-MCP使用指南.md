# MCP 使用指南

> 一句话定义：把 MCP Server 接入各类客户端（VSCode/Copilot、Claude Desktop、Cursor、Cline、自研 Agent）的配置方法与排查思路。

## 1. 通用配置模型

几乎所有 MCP 客户端的配置都遵循同一模型：

```
mcpServers / servers:
  <服务名>:
    command: <可执行命令>        # npx / uvx / node / python ...
    args: [<拉起 server 的参数>]
    env: { <环境变量> }           # 可选，传 API Key 等
```

- **stdio 模式**（本地）：客户端用 `command`+`args` 拉起 server 子进程，经 stdin/stdout 通信。
- **HTTP/SSE 模式**（远程）：用 `url` 字段指向远程端点，部分客户端需显式 `type: "sse"` / `type: "http"`。

> 配置文件路径与字段名随客户端略异，下文逐个说明。各客户端版本迭代快，**字段细节以官方文档为准**。

## 2. 在 VSCode 中使用

VSCode（1.102+）原生支持 MCP，Copilot Chat 的 Agent 模式可直接调用 MCP 工具。

### 2.1 工作区级配置（随项目走）
新建 `.vscode/mcp.json`：
```json
{
  "servers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  }
}
```
> 该文件可提交到仓库，团队成员克隆后自动生效，适合项目专属工具（如本项目脚手架、文档检索）。

### 2.2 用户级配置（全局）
在 `settings.json` 中：
```json
{
  "mcp.servers": {
    "my-server": {
      "command": "uvx",
      "args": ["my-mcp-server"]
    }
  }
}
```
适合个人通用工具（如文件系统、搜索），跨所有工作区可用。

### 2.3 启用与使用
1. 确认 Copilot Chat 切到 **Agent**（Ask/Editor 模式不调工具）。
2. 在 Chat 输入框点工具图标（或 `#`），可看到/启用已配置的 MCP 工具。
3. 提问时 Agent 会按需自动调用工具；调用前通常需在工具图标处确认授权。

> 远程 server 用 `{"type": "http", "url": "https://..."}`。

## 3. 在 GitHub Copilot（Agent 模式）中使用

Copilot 的 Agent 能力运行在 VSCode（及后续其他宿主）内，MCP 配置即上面的 VSCode 配置，无需额外步骤：

- 配好 `.vscode/mcp.json` 或用户 settings。
- Copilot Chat 选 Agent 模式。
- Agent 推理时自动选 MCP 工具执行，结果回传继续推理。

要点：
- **授权**：首次调用某工具会提示确认；可在设置中调整自动授权策略。
- **可见性**：工具面板会列出所有已连接 server 的工具，可单独开关。
- **跨客户端复用**：同一个 server 配置在 VSCode、Cursor、Cline 里几乎通用，只是文件位置不同。

## 4. 在 Claude Desktop 中使用

配置文件 `claude_desktop_config.json`：
- **macOS**：`~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-mcp-server"],
      "env": {
        "API_KEY": "xxx"
      }
    }
  }
}
```
- 改完需**完全退出并重启** Claude Desktop（不是最小化重开）。
- 启动后在对话框能看到工具/资源入口；工具调用前会弹确认。

## 5. 在 Cursor 中使用

配置文件 `~/.cursor/mcp.json`（用户级，全局）：
```json
{
  "mcpServers": {
    "my-server": {
      "command": "uvx",
      "args": ["my-mcp-server"]
    }
  }
}
```
- Cursor Agent / Composer 模式可调用 MCP 工具。
- 也可在 `Settings → MCP` 面板图形化查看连接状态与工具列表。

## 6. 在 Cline / Continue 等 Agent 中使用

### Cline（VSCode 扩展）
- 图形化配置：`Cline 面板 → MCP Servers → Add`，填 command/args/env。
- 也可直接编辑其底层配置文件，字段同通用模型。

### Continue
- 在 `config.json`（`~/.continue/config.json`）加 `mcpServers` 字段：
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  }
}
```

> 这些 Agent 类客户端的共性：MCP 是其工具来源之一，配好即用，配置格式高度一致。

## 7. 在自研 Agent 框架中消费 MCP

若自研 Agent，用对应语言的 MCP Client SDK 连接 server：

```python
# Python: 连接一个 stdio server
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

params = StdioServerParameters(command="npx", args=["-y", "my-mcp-server"])

async with stdio_client(params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
        result = await session.call_tool("add", {"a": 1, "b": 2})
        print(result.content)
```

集成要点：
- 启动时 `initialize` 握手，拉取 `list_tools` / `list_resources` / `list_prompts`。
- 把 MCP 工具转成自家 Agent 的工具描述格式注入 LLM。
- LLM 决定调用后，`call_tool` 执行，结果回传上下文继续推理。
- 多个 server 各起一个 client session，工具按来源命名空间隔离避免冲突。

## 8. 配置示例速查

以一个本地 stdio server（`my-mcp-server`）为例，各客户端最小配置：

| 客户端 | 文件位置 | 根字段 |
|--------|----------|--------|
| VSCode（工作区） | `.vscode/mcp.json` | `servers` |
| VSCode（用户） | `settings.json` | `mcp.servers` |
| Claude Desktop | `claude_desktop_config.json` | `mcpServers` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` |
| Continue | `~/.continue/config.json` | `mcpServers` |
| 自研（SDK） | 代码内 `StdioServerParameters` | — |

> 字段值（command/args/env）跨客户端通用，只是外层键名和路径不同。

## 9. 排查清单

- **server 没连上**：先用 `mcp dev` / Inspector 单独跑通 server，再接客户端；确认 `command` 在客户端环境变量 PATH 中可执行（GUI 应用常缺 shell PATH，必要时写绝对路径）。
- **工具不出现**：检查配置文件 JSON 语法；确认重启了客户端；看客户端日志有无启动报错。
- **调用失败**：server 日志走 stderr，开 verbose 看堆栈；常见是 env 里缺 API Key、参数类型不符。
- **stdout 被污染**：stdio 模式下 server 往 stdout 打印非协议内容会导致客户端解析失败，日志务必走 stderr。
- **PATH 问题**：GUI 客户端（Claude Desktop、Cursor）启动环境精简，`npx`/`uvx`/`node` 可能找不到，用绝对路径或 `env.PATH` 显式指定。

## 10. 安全注意
- 只接可信 server，server 能执行任意代码/访问数据。
- `env` 里的密钥不要提交到公开仓库（`.vscode/mcp.json` 可提交时，把含密钥的放用户级配置）。
- 危险工具调用务必保留人工确认（多数客户端默认开启）。
- 远程 server 必须启用鉴权 + HTTPS。

## 11. 学习要点
- MCP 配置跨客户端高度一致：`command`+`args`+`env` 三件套。
- VSCode 用 `.vscode/mcp.json`（随项目）或 settings（全局），Copilot Agent 模式自动消费。
- Claude Desktop / Cursor / Cline / Continue 各有配置文件，字段模型相同。
- 自研 Agent 用 Client SDK 连接，把 MCP 工具转成自家工具描述注入 LLM。
- 排查从"server 单独能跑"+"客户端 PATH/配置语法"两端查起。

## 12. 参考资料
- modelcontextprotocol.io → “Example Servers” / “Quickstart”
- VSCode MCP 文档（`code.visualstudio.com`）
- Claude Desktop / Cursor / Cline / Continue 官方 MCP 配置说明
- `@modelcontextprotocol/inspector`（调试器）
