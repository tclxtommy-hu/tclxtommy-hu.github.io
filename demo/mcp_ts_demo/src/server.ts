/**
 * MCP Server 核心逻辑 - 注册 Tools / Resources
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SERVER_NAME, SERVER_VERSION, weatherDB, forecastDB } from "./config.js";

/** 创建 MCP Server 实例并注册所有工具/资源 */
export function createWeatherServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Tool: get_weather
  server.tool(
    "get_weather",
    { city: z.string().describe("城市名称，如：北京、上海、深圳") },
    async ({ city }) => {
      const data = weatherDB[city];
      if (!data) {
        return {
          content: [{ type: "text" as const, text: `未找到「${city}」的天气数据，支持的城市：${Object.keys(weatherDB).join("、")}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: `${city}: ${data.desc}，气温 ${data.temp}°C，湿度 ${data.humidity}%` }],
      };
    }
  );

  // Tool: get_forecast
  server.tool(
    "get_forecast",
    { city: z.string().describe("城市名称") },
    async ({ city }) => {
      const forecast = forecastDB[city];
      if (!forecast) {
        return {
          content: [{ type: "text" as const, text: `暂无「${city}」的未来预报，支持的城市：${Object.keys(forecastDB).join("、")}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: `${city}未来三天:\n· 第一天: ${forecast.day1}\n· 第二天: ${forecast.day2}\n· 第三天: ${forecast.day3}` }],
      };
    }
  );

  // Tool: list_cities
  server.tool("list_cities", {}, async () => ({
    content: [{ type: "text" as const, text: `支持的城市: ${Object.keys(weatherDB).join("、")}` }],
  }));

  // Resource: config://server
  server.resource("Server Config", "config://server", async () => ({
    contents: [{
      uri: "config://server",
      text: JSON.stringify({ name: SERVER_NAME, version: SERVER_VERSION }, null, 2),
    }],
  }));

  // Resource: cities://list
  server.resource("City List", "cities://list", async () => ({
    contents: [{
      uri: "cities://list",
      mimeType: "application/json",
      text: JSON.stringify(Object.keys(weatherDB), null, 2),
    }],
  }));

  return server;
}
