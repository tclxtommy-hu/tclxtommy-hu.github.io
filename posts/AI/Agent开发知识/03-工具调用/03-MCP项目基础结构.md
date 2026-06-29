# MCP 项目基础结构

> 一句话定义：用官方 SDK（Python/TypeScript）搭建一个可被任意 MCP 客户端消费的 Server 项目——目录、依赖、代码骨架、运行、调试一条龙。

## 1. 选 SDK

官方维护两个主力 SDK，二选一即可：

| SDK | 语言 | 适合场景 |
|-----|------|----------|
| `mcp` (Python) | Python | 数据/AI 团队，复用 Python 生态（pandas、DB 驱动等） |
| `@modelcontextprotocol/sdk` (TypeScript) | Node.js | 前端/全栈团队，与 JS 生态贴合 |

社区另有 Go、Rust、Java 等实现，原理一致，本文以官方两个为例。

## 2. 项目目录结构

### Python（推荐 uv + FastMCP）
```
my-mcp-server/
├── pyproject.toml          # 依赖与入口声明
├── README.md
├── src/
│   └── my_server/
│       ├── __init__.py
│       ├── __main__.py     # 入口：python -m my_server
│       ├── server.py       # FastMCP 实例 + 注册工具/资源
│       └── tools/
│           ├── __init__.py
│           └── calc.py     # 具体工具实现
└── tests/
    └── test_calc.py
```

### TypeScript
```
my-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts            # 入口：创建 transport 并 connect
│   ├── server.ts           # McpServer 实例 + 注册
│   └── tools/
│       └── calc.ts
└── tests/
```

> 约定：工具/资源/Prompt 按职责拆文件，集中在 `server` 聚合注册，避免单文件膨胀。

## 3. 依赖与初始化

### Python（uv）
```bash
uv init my-mcp-server
cd my-mcp-server
uv add "mcp[cli]"
```
`pyproject.toml` 关键字段：
```toml
[project]
name = "my-mcp-server"
version = "0.1.0"
dependencies = ["mcp[cli]"]

[project.scripts]
my-server = "my_server.__main__:main"
```

### TypeScript
```bash
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node tsx
```
`package.json` 关键字段：
```json
{
  "type": "module",
  "bin": { "my-server": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js"
  }
}
```

## 4. 代码骨架

### Python（FastMCP 装饰器风格）
`src/my_server/server.py`：
```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")


@mcp.tool()
def add(a: int, b: int) -> int:
    """两数相加"""
    return a + b


@mcp.resource("config://{key}")
def get_config(key: str) -> str:
    """读取配置项"""
    return f"value-of-{key}"


@mcp.prompt()
def code_review(code: str) -> str:
    """生成代码审查提示"""
    return f"请审查以下代码：\n{code}"
```

`src/my_server/__main__.py`：
```python
from my_server.server import mcp


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
```

### TypeScript（低层 SDK）
`src/server.ts`：
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const server = new McpServer({ name: "my-server", version: "0.1.0" });

server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
}));

server.resource(
  "config",
  "config://{key}",
  async (uri) => ({
    contents: [{ uri: uri.href, text: `value-of-${uri.href.split("/").pop()}` }],
  })
);
```

`src/index.ts`：
```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";

const transport = new StdioServerTransport();
await server.connect(transport);
```

## 5. 三大能力的注册要点

| 能力 | 作用 | 关键约定 |
|------|------|----------|
| Tool | 可执行函数 | 描述写清"做什么+何时用"；参数用 schema 约束 |
| Resource | 可读数据 | URI 需稳定唯一；只读，不放写操作 |
| Prompt | 提示模板 | 参数化；可作为团队共享的提示资产 |

- **Tool 命名**：小写连字符（`get_weather`、`search-docs`）。
- **Resource URI**：用稳定 scheme（`file://`、`db://`、自定义 `xxx://`）。
- **返回裁剪**：长结果只回关键字段，避免撑爆客户端上下文。

## 6. 运行方式

### 本地 stdio（最常用）
```bash
# Python
python -m my_server
# 或装好后直接
my-server

# TypeScript
npm run dev        # 开发（tsx）
npm run build && npm start   # 生产
```
客户端通过 `command` + `args` 拉起进程，经 stdin/stdout 通信。

### HTTP / Streamable HTTP（远程）
Python FastMCP：
```python
mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```
适合多客户端共享、需要鉴权的部署场景，务必加鉴权与 TLS。

## 7. 调试

### MCP Inspector（官方可视化调试器）
```bash
# Python
mcp dev src/my_server/server.py
# 或指定 server 对象
mcp dev my_server/server.py:mcp

# 通用（npx，任意语言 server 都能用）
npx @modelcontextprotocol/inspector <启动命令>
```
Inspector 提供 GUI：列工具/资源/Prompt、手动调用、看 JSON-RPC 报文，是开发期首选。

### 日志
- stdio 模式下**不要往 stdout 打日志**（会污染协议流），日志写 stderr 或文件。
- Python 用 `logging` 输出到 stderr；TS 用 `console.error`。

## 8. 测试
- 工具函数本身是普通函数，直接单测（断言输入输出）。
- 协议层可用 `mcp dev` 或 Inspector 手动验证。
- 建议为每个工具准备正例/异常/边界用例，形成回归集。

Python 示例：
```python
from my_server.tools.calc import add

def test_add():
    assert add(1, 2) == 3
    assert add(-1, 1) == 0
```

## 9. 打包发布
- **Python**：`uv build` 生成 wheel，发 PyPI；用户 `uvx my-mcp-server` 即跑。
- **Node**：`npm run build` 后 `npm publish`；用户 `npx my-mcp-server` 即跑。
- 发布后客户端配置只需 `command: "uvx"` / `command: "npx"` + 包名，零安装。

## 10. 注意事项
- stdio 通信严禁污染 stdout，日志走 stderr。
- 危险工具（删除/部署）加确认语义，Server 不自作主张执行不可逆操作。
- 最小暴露：只注册必要工具，减少误选与攻击面。
- 鉴权只用于远程模式；本地 stdio 默认信任宿主进程。
- 版本化：破坏性变更走主版本号，避免静默变更导致客户端失效。

## 11. 学习要点
- 官方 Python/TS 两 SDK，结构一致：实例 → 注册能力 → 绑 transport → run。
- 工具/资源/Prompt 分文件组织，集中注册。
- 开发期用 MCP Inspector 调试；stdio 模式日志走 stderr。
- 打包发布后客户端 `uvx`/`npx` 即可拉起，零安装消费。

## 12. 参考资料
- modelcontextprotocol.io（Python / TypeScript SDK 文档与 Quickstart）
- `@modelcontextprotocol/inspector`（调试器）
- FastMCP 装饰器 API 文档
