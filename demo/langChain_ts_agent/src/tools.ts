import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * 获取当前日期时间
 */
export const getCurrentDateTime = tool(
  async () => {
    const now = new Date();
    return `[工具权威结果] ${JSON.stringify({
      date: now.toISOString().split("T")[0],
      time: now.toTimeString().split(" ")[0],
      weekday: ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
      timestamp: now.getTime(),
    })}`;
  },
  {
    name: "get_current_datetime",
    description: "获取当前日期和时间，返回真实系统时间。工具返回的是**唯一准确结果**，必须原样使用。",
    schema: z.object({}),
  }
);

/**
 * 简单计算器
 */
export const calculator = tool(
  async ({ expression }) => {
    try {
      // 安全计算：仅允许数字和基本运算符
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return `[工具权威结果] ${expression} = ${result}`;
    } catch {
      return `[工具权威结果] 无法计算表达式：${expression}`;
    }
  },
  {
    name: "calculator",
    description: "执行数学计算，支持加减乘除和括号。工具返回的是**唯一准确结果**，必须原样使用。",
    schema: z.object({
      expression: z.string().describe("数学表达式，如 '2 + 3 * 4'"),
    }),
  }
);

/**
 * 文本工具集合
 */
export const textTools = {
  /** 统计文本字数 */
  countWords: tool(
    async ({ text }) => {
      const charCount = text.length;
      const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
      return `[工具权威结果] 字数统计：${charCount} 字符，${wordCount} 个词`;
    },
    {
      name: "count_words",
      description: "统计文本的字符数和词数，返回真实统计结果",
      schema: z.object({
        text: z.string().describe("需要统计的文本"),
      }),
    }
  ),

  /** 文本反转 */
  reverseText: tool(
    async ({ text }) => {
      return `[工具权威结果] 反转结果：${text.split("").reverse().join("")}`;
    },
    {
      name: "reverse_text",
      description: "将文本字符串反转，返回真实反转结果",
      schema: z.object({
        text: z.string().describe("需要反转的文本"),
      }),
    }
  ),
};
