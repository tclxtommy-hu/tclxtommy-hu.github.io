import * as readline from "node:readline";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeepSeekModel } from "./config.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentLogger } from "./logger.js";
import { loadSkillsFromDir, type SkillPackage } from "./skillLoader.js";
import { runSkillScript, SANDBOX_TIMEOUT_MS } from "./sandbox.js";

// 与 skillSandboxAgent 共用同一份「动态技能源」：扫 ./skills 目录，
// 做到「新增技能 = 丢一个文件夹进去」，不再有写死的技能表。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../skills");

// 基础 system prompt（无技能时的默认人格）
const BASE_SYSTEM_PROMPT = "你是一个友好的AI助手，请用中文回答，言简意赅。";

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}

/** 把所有技能 SOP 注入 system prompt —— Skill 在 LLM 中的核心用法（与 sandbox 版一致） */
function buildSystemPrompt(base: string, skill: SkillPackage | null, scriptOutput?: string): string {
  let text = base;
  if (skill) {
    text += `\n\n【已加载技能：${skill.name} | runtime=${skill.runtime}】\n${skill.instructions}`;
  }
  if (scriptOutput !== undefined) {
    text += `\n\n【沙盒权威结果】这是该技能在沙盒中真实执行的输出，你必须原样引用，不得自行估算或重新计算：\n${scriptOutput}`;
  }
  return text;
}

/** 路由：让大脑(LLM)决策选哪个 skill。只回复技能的 name（或 none） */
async function selectSkillByLLM(
  model: any,
  skills: SkillPackage[],
  input: string,
  logger?: AgentLogger
): Promise<SkillPackage | null> {
  if (skills.length === 0) return null;
  const routerPrompt =
    `你是技能路由器。可用技能：\n` +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n") +
    `\n只回复最合适技能的 name；没有合适的只回复 none。\n用户需求：` + input;
  const opts = logger ? { callbacks: [logger], tags: ["router"] } : undefined;
  const res = await model.invoke(routerPrompt, opts);
  const name = String(res.content).trim().toLowerCase();
  if (name === "none") return null;
  return skills.find((s) => s.name.toLowerCase() === name) ?? null;
}

async function main() {
  console.log("=".repeat(50));
  console.log("🎯 LangChain Skill 演示（DeepSeek）— 大脑 LLM / 四肢 运行时");
  console.log("技能源：动态扫描 ./skills 目录（含 text-stats 等）");
  console.log("输入 /skills 查看技能，/skill <name> 手动加载，/clear 清空，/exit 退出");
  console.log("=".repeat(50));

  const rl = createReadline();
  const model = createDeepSeekModel({ temperature: 0.7 });
  const logger = new AgentLogger("skill");

  const skills = loadSkillsFromDir(SKILLS_DIR);
  console.log(`✅ 已动态加载 ${skills.length} 个技能：${skills.map((s) => s.name).join(", ") || "（无）"}\n`);

  let activeSkill: SkillPackage | null = null;
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
    // 同时支持 /skills 与缺省斜杠的 skills
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
    if (!activeSkill) {
      const picked = await selectSkillByLLM(model, skills, input, logger);
      if (picked) {
        activeSkill = picked;
        console.log(`🧠 大脑选择技能：${picked.name}`);
      }
    }

    // 2) 四肢执行：脚本型技能先在沙盒里跑出权威结果 → 注入 system prompt
    let scriptOutput: string | undefined;
    if (activeSkill?.entry) {
      const res = await runSkillScript(activeSkill, input);
      if (!res.ok) {
        scriptOutput = res.timedOut
          ? `[沙盒拦截] 脚本执行超过 ${SANDBOX_TIMEOUT_MS}ms，已被强制终止（防 DoS）。${res.error ?? ""}`.trim()
          : `[沙盒执行失败] ${res.error ?? "未知错误"}`;
      } else {
        scriptOutput = res.output;
      }
    }

    // 3) 把技能正文 + 沙盒结果注入 system（Skill 在 LLM 中的核心用法）
    const systemText = buildSystemPrompt(BASE_SYSTEM_PROMPT, activeSkill, scriptOutput);
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
