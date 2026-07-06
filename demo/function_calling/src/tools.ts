import type { ChatCompletionTool } from "openai/resources/chat/completions";

/**
 * 工具定义 —— 告诉 LLM 有哪些可调用函数及其参数
 */

// ── Tool 类型定义（与 OpenAI function calling 兼容）──────────────────

export type ToolName = "get_weather" | "get_exchange_rate" | "calculate";

export interface ToolCallResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

// ── 工具 Schema 声明 ──────────────────────────────────────────────────

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "获取指定城市的实时天气信息，返回温度、天气状况和湿度",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "城市名称，如 '北京'、'上海'、'深圳'",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exchange_rate",
      description: "查询两种货币之间的实时汇率，返回当前汇率和更新时间",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "源货币代码，如 'CNY'、'USD'、'EUR'",
          },
          to: {
            type: "string",
            description: "目标货币代码，如 'CNY'、'USD'、'EUR'",
          },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "执行数学计算，支持四则运算。比 LLM 自己算更准确，尤其是大数或复杂表达式",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "数学表达式，如 '123 * 456'、'(100 + 200) / 3'",
          },
        },
        required: ["expression"],
      },
    },
  },
];

// ── 工具执行函数 ──────────────────────────────────────────────────────

/**
 * 执行具体函数，返回字符串结果
 * 实际项目中可替换为真实 API 调用
 */
export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "get_weather": {
      const city = args.city as string;
      // 模拟天气数据
      const mockWeather: Record<string, { temp: number; condition: string; humidity: number }> = {
        北京: { temp: 28, condition: "晴天", humidity: 45 },
        上海: { temp: 32, condition: "多云", humidity: 65 },
        深圳: { temp: 30, condition: "阵雨", humidity: 80 },
        广州: { temp: 31, condition: "雷阵雨", humidity: 78 },
        杭州: { temp: 29, condition: "阴天", humidity: 70 },
        成都: { temp: 26, condition: "小雨", humidity: 75 },
      };
      const data = mockWeather[city] ?? {
        temp: 25,
        condition: "未知（模拟数据）",
        humidity: 50,
      };
      return `城市: ${city}\n温度: ${data.temp}°C\n天气: ${data.condition}\n湿度: ${data.humidity}%`;
    }

    case "get_exchange_rate": {
      const from = (args.from as string).toUpperCase();
      const to = (args.to as string).toUpperCase();
      // 模拟汇率数据
      const rates: Record<string, number> = {
        USD_CNY: 7.25,
        CNY_USD: 0.138,
        EUR_CNY: 7.89,
        CNY_EUR: 0.127,
        USD_EUR: 0.92,
        EUR_USD: 1.09,
      };
      const key = `${from}_${to}`;
      const rate = rates[key] ?? 1.0;
      return `汇率: 1 ${from} = ${rate} ${to}\n更新时间: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    }

    case "calculate": {
      const expression = args.expression as string;
      try {
        // 安全计算：只允许数字和基本运算符
        if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
          return `错误: 表达式包含不允许的字符。仅支持数字和 + - * / ( ) . % 运算符`;
        }
        // eslint-disable-next-line no-eval
        const result = Function(`"use strict"; return (${expression})`)();
        return `计算结果: ${expression} = ${result}`;
      } catch (err) {
        return `错误: 无法计算表达式 "${expression}"，请检查格式`;
      }
    }

    default:
      return `未知工具: ${name}`;
  }
}
