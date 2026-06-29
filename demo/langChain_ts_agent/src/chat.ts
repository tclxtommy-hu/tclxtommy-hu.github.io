import * as readline from "node:readline";
import { createDeepSeekModel } from "./config.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
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
  console.log("💬 LangChain 多轮对话（DeepSeek）");
  console.log("输入 /exit 退出，输入 /clear 清空上下文");
  console.log("=".repeat(50));

  const rl = createReadline();
  const model = createDeepSeekModel({ temperature: 0.7 });
  const logger = new AgentLogger();

  // 对话上下文
  const messages = [
    new SystemMessage("你是一个友好的AI助手，请用中文回答，言简意赅。"),
  ];

  console.log("✅ 开始对话！\n");

  while (true) {
    const input = await ask(rl, "👤 你：");

    if (!input) continue;
    if (input === "/exit") {
      logger.close();
      console.log("👋 再见！\n");
      break;
    }
    if (input === "/clear") {
      messages.length = 1;
      console.log("🗑️  上下文已清空\n");
      continue;
    }

    messages.push(new HumanMessage(input));
    process.stdout.write("🤖 助手：");

    const response = await model.invoke(messages, { callbacks: [logger] });
    messages.push(response);

    console.log(response.content);
    console.log();
  }

  rl.close();
}

main().catch(console.error);
