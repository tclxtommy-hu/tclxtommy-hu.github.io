# MCP Weather Server

天气查询 MCP Server，提供 Tools（get_weather / get_forecast / list_cities）和 Resources。

## 项目结构

```
mcp_ts_demo/
├── src/
│   ├── config.ts        # 配置与模拟数据
│   ├── server.ts        # 共享的 MCP Server 注册逻辑
│   ├── stdio.ts         # stdio 传输（CodeBuddy/Cursor 客户端用）
│   └── http.ts          # HTTP 传输（远程部署用）
├── scripts/postbuild.mjs
├── package.json
├── tsconfig.json
└── README.md
```

## 使用方式

### 1. 本地开发（CodeBuddy 测试）

```bash
npm install
npm run build
npm run dev            # tsx src/stdio.ts
```

### 2. 全局安装（推荐 — CodeBuddy 自动发现）

```bash
npm run build
npm link               # 在全局 npm 目录注册 mcp-weather-server 命令
```

完成后 `mcp-weather-server` 命令出现在 PATH 中，CodeBuddy MCP 面板自动识别并显示。

卸载：`npm uninstall -g mcp-weather-server`

### 3. 部署到服务器（HTTP 模式）

```bash
npm run build
PORT=3000 node dist/http.mjs
```

端点：
- `POST /mcp` — MCP Streamable HTTP
- `GET /health` — 健康检查

### 4. 发布到 npm

```bash
npm run build
npm publish
```

## 暴露的能力

| 类型 | 名称 | 说明 |
|------|------|------|
| Tool | `get_weather` | 查询城市当前天气 |
| Tool | `get_forecast` | 查询未来三天预报 |
| Tool | `list_cities` | 列出支持的城市 |
| Resource | `config://server` | 服务器配置信息 |
| Resource | `cities://list` | 城市列表 JSON |

## 技术栈

- `@modelcontextprotocol/sdk` — MCP TypeScript SDK
- `express` — HTTP Server（HTTP 模式）
- `zod` — 工具参数 Schema
- TypeScript + ESM
