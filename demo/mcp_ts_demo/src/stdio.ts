/**
 * MCP Weather Server - stdio 传输模式
 *
 * 供 CodeBuddy / Cursor / Claude Desktop 等本地客户端通过 stdio 连接。
 * 通过 `npm link` 全局安装后，会在 PATH 中暴露 `mcp-weather-server` 命令。
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWeatherServer } from "./server.js";
import { SERVER_NAME } from "./config.js";

const server = createWeatherServer();
const transport = new StdioServerTransport();
await server.connect(transport);

// stdio 模式日志写 stderr，避免污染 JSON-RPC
console.error(`[${SERVER_NAME}] MCP Server 已启动 (stdio)`);
