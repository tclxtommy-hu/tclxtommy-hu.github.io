/**
 * MCP Weather Server - HTTP 传输模式（部署到服务器用）
 *
 * 端点: POST http://localhost:3000/mcp
 * 健康检查: GET http://localhost:3000/health
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createWeatherServer } from "./server.js";
import { SERVER_NAME, SERVER_VERSION, PORT } from "./config.js";

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.post("/mcp", async (req, res) => {
  try {
    const server = createWeatherServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  }));
});

app.delete("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  }));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
});

app.listen(PORT, () => {
  console.log(`[${SERVER_NAME}] HTTP Server 已启动: http://localhost:${PORT}/mcp`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
});
