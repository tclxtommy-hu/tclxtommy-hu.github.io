import * as readline from "node:readline";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createDeepSeekModel } from "./config.js";
import { getCurrentDateTime, calculator, textTools } from "./tools.js";
import { AgentLogger } from "./logger.js";

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log("=".repeat(50));
  console.log("🤖 LangChain Agent 交互模式（DeepSeek）");
  console.log("工具：日期时间 | 计算器 | 字数统计 | 文本反转");
  console.log("输入 /exit 退出，输入 /clear 清空对话");
  console.log("=".repeat(50));

  const rl = createReadline();

  // 创建日志记录器
  const logger = new AgentLogger();
  console.log(`📁 日志记录中 → logs/${logger["sessionId"] || "session"}.log\n`);

  // 创建模型
  const model = createDeepSeekModel({ temperature: 0 });

  // 组装工具集
  const tools = [
    getCurrentDateTime,
    calculator,
    textTools.countWords,
    textTools.reverseText,
  ];

  // Agent 提示词
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个实用工具助手，你必须通过调用工具来获取真实数据。

【核心原则 - 严格遵守】
1. 涉及计算、日期、统计等任务时，你**必须调用工具**，绝对不允许使用自己的知识计算或猜测
2. 工具返回的结果是**唯一权威数据源**，你必须**原样使用**工具返回的结果来回答用户
3. 即使工具返回的结果与你自己的知识不符，也**必须以工具返回为准**，不能修正或忽略
4. 禁止在工具返回后再自行计算或修改结果
5. 用中文简洁回复用户，直接给出工具返回的结论`,
    ],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // 创建 Agent
  const agent = createToolCallingAgent({ llm: model, tools, prompt });

  // 创建执行器
  const executor = new AgentExecutor({
    agent,
    tools,
    verbose: false, // 详细日志由 AgentLogger 写入文件
  });

  // 对话历史
  const chatHistory: (HumanMessage | AIMessage)[] = [];

  console.log("✅ Agent 就绪，开始对话吧！\n");

  // 交互循环
  while (true) {
    const input = await ask(rl, "👤 你：");

    if (!input) continue;
    if (input === "/exit") {
      logger.close();
      console.log("👋 再见！\n");
      break;
    }
    if (input === "/clear") {
      chatHistory.length = 0;
      console.log("🗑️  对话已清空\n");
      continue;
    }

    process.stdout.write("🤖 Agent：");

    // 传入 callbacks，AgentLogger 将记录所有内部事件
    const result = await executor.invoke(
      {
        input,
        chat_history: chatHistory,
      },
      { callbacks: [logger] }
    );

    console.log(result.output);
    console.log();

    // 保存对话历史
    chatHistory.push(new HumanMessage(input));
    chatHistory.push(new AIMessage(result.output));
  }

  rl.close();
}

main().catch(console.error);
