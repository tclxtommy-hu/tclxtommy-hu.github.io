import * as readline from "node:readline";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDeepSeekModel } from "./config.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { AgentLogger } from "./logger.js";
import { loadSkillsFromDir, type SkillPackage } from "./skillLoader.js";

// 会话级技能缓存开关：默认关闭（每轮重新路由，随话题切换技能），设为 "true" 才启用粘性
import "dotenv/config"; // 确保 .env 在本模块被直接运行时也已加载
const STICKY_SESSION = process.env.SKILL_SESSION_CACHE === "true";

// 与其它 demo 共用同一份「动态技能源」：扫 ./skills 目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../skills");

// 基础 system prompt（无技能时的默认人格）
const BASE_SYSTEM_PROMPT = "你是一个友好的AI助手，请用中文回答，言简意赅。";

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

/** 路由：让大脑(LLM)决策选哪个 skill。
 * 优先用 withStructuredOutput 让模型返回受约束枚举（name | "none"），
 * 取代脆弱的字符串硬匹配；若模型不支持结构化输出，自动回退到关键词提取解析。 */
async function selectSkillByLLM(
  model: any,
  skills: SkillPackage[],
  input: string,
  logger?: AgentLogger
): Promise<SkillPackage | null> {
  if (skills.length === 0) return null;
  const names = skills.map((s) => s.name);
  const routerPrompt =
    `你是技能路由器。可用技能：\n` +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n") +
    `\n只回复最合适技能的 name；没有合适的只回复 none。\n用户需求：` + input;
  const opts = logger ? { callbacks: [logger], tags: ["router"] } : undefined;

  // 1) 优先：结构化输出（受约束枚举，鲁棒性最高）
  try {
    const SkillSchema = z.object({
      skill: z.enum([...names, "none"] as unknown as [string, ...string[]]),
    });
    const structured = await model.withStructuredOutput(SkillSchema).invoke(routerPrompt, opts);
    const picked = structured?.skill;
    if (!picked || picked === "none") return null;
    return skills.find((s) => s.name.toLowerCase() === picked.toLowerCase()) ?? null;
  } catch {
    // 2) 回退：自由文本解析（兼容不支持 structured output 的模型）
    const res = await model.invoke(routerPrompt, opts);
    const raw = String(res.content).trim().toLowerCase();
    const name =
      (raw.match(/[a-z0-9_-]+/g) ?? []).find((t) => names.includes(t) || t === "none") ?? raw;
    if (name === "none") return null;
    return skills.find((s) => s.name.toLowerCase() === name) ?? null;
  }
}

/** 把技能正文注入 system prompt —— Skill 在 LLM 中的核心用法 */
function buildSystemPrompt(base: string, skill: SkillPackage | null): string {
  if (!skill) return base;
  return `${base}\n\n【已加载技能：${skill.name} | runtime=${skill.runtime}】\n${skill.instructions}`;
}

async function main() {
  console.log("=".repeat(50));
  console.log("💬 LangChain 多轮对话（DeepSeek）— 已集成 Skill 自动路由");
  console.log("技能源：动态扫描 ./skills 目录（含 text-stats 等）");
  console.log("输入 /skills 查看技能，/skill <name> 手动加载，/clear 清空，/exit 退出");
  console.log("=".repeat(50));

  const rl = createReadline();
  const model = createDeepSeekModel({ temperature: 0.7 });
  const logger = new AgentLogger("chat");

  // 对话上下文（仅存 Human/AI 轮次，每轮重新拼 system）
  const messages: (HumanMessage | AIMessage)[] = [];
  const skills = loadSkillsFromDir(SKILLS_DIR);
  let activeSkill: SkillPackage | null = null;

  console.log(`✅ 已动态加载 ${skills.length} 个技能：${skills.map((s) => s.name).join(", ") || "（无）"}`);
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
      console.log("🗑️  上下文与技能已清空\n");
      continue;
    }
    if (input === "/skills" || input.toLowerCase() === "skills") {
      console.log("📚 可用技能：");
      for (const s of skills) console.log(`  - ${s.name} (${s.runtime}, entry=${s.entry})：${s.description}`);
      continue;
    }
    if (input.startsWith("/skill ")) {
      const name = input.slice(7).trim();
      activeSkill = skills.find((s) => s.name === name) ?? null;
      console.log(
        activeSkill
          ? `🎯 已手动加载技能：${activeSkill.name}`
          : `⚠️ 未找到技能：${name}`
      );
      continue;
    }

    // 1) 大脑决策：让 LLM 选技能（可被 /skill 手动覆盖）
    //    - STICKY_SESSION=true ：仅当未激活时才路由（会话级粘性，原默认行为）
    //    - STICKY_SESSION=false：每轮都重新路由，话题变了技能也跟着变（避免武断锁定）
    const shouldRoute = STICKY_SESSION ? !activeSkill : true;
    if (shouldRoute) {
      const picked = await selectSkillByLLM(model, skills, input, logger);
      if (picked !== activeSkill) {
        activeSkill = picked;
        if (picked) console.log(`🧠 大脑选择技能：${picked.name}`);
      }
    }
    // 2) 四肢执行：把技能正文注入 system prompt
    const systemText = buildSystemPrompt(BASE_SYSTEM_PROMPT, activeSkill);
    // 3) 每轮重建 system（含 skill），对话上下文正常保留
    const payload = [new SystemMessage(systemText), ...messages, new HumanMessage(input)];

    process.stdout.write("🤖 助手：");

    const response = await model.invoke(payload, { callbacks: [logger], tags: ["chat"] });
    messages.push(new HumanMessage(input));
    messages.push(response);

    console.log(response.content);
    console.log();
  }

  rl.close();
}

main().catch(console.error);
