import * as readline from "node:readline";
import { createDeepSeekModel } from "./config.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentLogger } from "./logger.js";
import {
  SKILLS,
  selectSkillByLLM,
  getSkill,
  listSkills,
  buildSystemPrompt,
} from "./skills.js";

// 基础 system prompt（无技能时的默认人格）
const BASE_SYSTEM_PROMPT = "你是一个友好的AI助手，请用中文回答，言简意赅。";

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}

async function main() {
  console.log("=".repeat(50));
  console.log("🎯 LangChain Skill 演示（DeepSeek）— 大脑 LLM / 四肢 运行时");
  console.log("输入 /skills 查看技能，/skill <name> 手动加载，/clear 清空，/exit 退出");
  console.log("=".repeat(50));

  const rl = createReadline();
  const model = createDeepSeekModel({ temperature: 0.7 });
  const logger = new AgentLogger();

  let activeSkill: (typeof SKILLS)[number] | null = null;
  const messages: any[] = [];

  console.log("✅ 开始对话！大脑(LLM)会自动匹配技能。\n");

  while (true) {
    const input = await ask(rl, "👤 你：");
    if (!input) continue;
    if (input === "/exit") {
      logger.close();
      console.log("👋 再见！\n");
      break;
    }
    if (input === "/clear") {
      messages.length = 0;
      activeSkill = null;
      console.log("🗑️ 上下文与技能已清空\n");
      continue;
    }
    if (input === "/skills") {
      console.log("📚 可用技能：");
      for (const s of listSkills()) console.log(`  - ${s.name}：${s.description}`);
      continue;
    }
    if (input.startsWith("/skill ")) {
      const name = input.slice(7).trim();
      activeSkill = getSkill(name) ?? null;
      console.log(
        activeSkill
          ? `🎯 已手动加载技能：${activeSkill.name}`
          : `⚠️ 未找到技能：${name}`
      );
      continue;
    }

    // 1) 大脑决策：让 LLM 选技能（可被 /skill 手动覆盖）
    if (!activeSkill) {
      const picked = await selectSkillByLLM(model, input);
      if (picked) {
        activeSkill = picked;
        console.log(`🧠 大脑选择技能：${picked.name}`);
      }
    }
    // 2) 四肢执行：把技能正文注入 system prompt（Skill 在 LLM 中的核心用法）
    const systemText = buildSystemPrompt(BASE_SYSTEM_PROMPT, activeSkill);
    // 3) 每轮重建 system（含 skill），对话上下文正常保留
    const payload = [new SystemMessage(systemText), ...messages, new HumanMessage(input)];

    process.stdout.write("🤖 助手：");
    const response = await model.invoke(payload, { callbacks: [logger] });
    messages.push(new HumanMessage(input));
    messages.push(response);
    console.log(response.content);
    console.log();
  }
  rl.close();
}

main().catch(console.error);
