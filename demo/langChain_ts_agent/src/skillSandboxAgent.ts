import * as readline from "node:readline";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BufferWindowMemory } from "langchain/memory";
import { createDeepSeekModel } from "./config.js";
import { AgentLogger } from "./logger.js";
import { FileChatMessageHistory } from "./file_history.js";
import { loadSkillsFromDir, type SkillPackage } from "./skillLoader.js";
import { runSkillScript, SANDBOX_TIMEOUT_MS } from "./sandbox.js";

/**
 * 动态技能 + 沙盒 交互 Demo
 * ──────────────────────────────────────────────────────────────
 * 大脑(LLM) 路由选技能 → 四肢(运行时) 注入 skill.md 正文 →
 * LLM 调 run_skill_script 工具 → 四肢在沙盒执行脚本 → 权威结果回传 → 作答
 *
 * 启动即扫描 ./skills 目录，做到「动态注入」：加一个新技能 = 丢一个文件夹。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../skills");

function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}
function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}

/** 把所有技能的 SOP 注入 system prompt（这就是 Skill 在 LLM 中的核心用法） */
function buildSkillSystemPrompt(base: string, skills: SkillPackage[]): string {
  if (skills.length === 0) return base + "\n\n（当前没有任何技能包，仅作基础助手）";
  const blocks = skills.map((s) => {
    const head = `【技能 ${s.name} | runtime=${s.runtime}${s.entry ? ` | entry=${s.entry}` : " | type=instruction-only"}】\n${s.instructions}`;
    // 只有带脚本的技能才需要调用 run_skill_script；纯指令型技能直接遵循 SOP 即可
    return s.entry
      ? `${head}\n→ 需要真实数据时调用工具 run_skill_script(skillName="${s.name}", input=<用户原始文本>)`
      : head;
  });
  return [
    base,
    "",
    "可用技能（SOP 已注入，按需要调用 run_skill_script）：",
    "",
    blocks.join("\n\n"),
    "",
    "【核心原则】run_skill_script 返回的【沙盒权威结果】是唯一可信数据源，你必须原样引用，不得自行估算或重新计算。",
  ].join("\n");
}

function makeExecutor(skills: SkillPackage[], logger: AgentLogger) {
  const runSkillScriptTool = tool(
    async ({ skillName, input }) => {
      const skill = skills.find((s) => s.name === skillName);
      if (!skill) {
        return `未找到技能：${skillName}。可用：${skills.map((s) => s.name).join(", ") || "（无）"}`;
      }
      const res = await runSkillScript(skill, input);
      if (!res.ok) {
        if (res.timedOut) {
          return `[沙盒拦截] 脚本执行超过 ${SANDBOX_TIMEOUT_MS}ms，已被强制终止（防 DoS）。${res.error ?? ""}`.trim();
        }
        return `[沙盒执行失败] ${res.error ?? "未知错误"}`;
      }
      return `[沙盒权威结果] ${res.output}`;
    },
    {
      name: "run_skill_script",
      description:
        "在沙盒中执行指定技能携带的脚本并获取真实计算结果。" +
        "参数 skillName 为技能名；input 为需要处理的原始文本。" +
        "可用技能：" + (skills.map((s) => `${s.name}(${s.runtime})`).join(", ") || "无"),
      schema: z.object({
        skillName: z.string().describe("技能名，例如 text-stats"),
        input: z.string().describe("传给脚本的输入文本，通常是用户的原文"),
      }),
    }
  );

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      buildSkillSystemPrompt("你是一个带「动态技能 + 沙盒」的助手，用中文简洁回答。", skills),
    ],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = createToolCallingAgent({
    llm: createDeepSeekModel({ temperature: 0 }),
    tools: [runSkillScriptTool],
    prompt,
  });

  const memory = new BufferWindowMemory({
    chatHistory: new FileChatMessageHistory("./data/sandbox_chat_history.json"),
    returnMessages: true,
    memoryKey: "chat_history",
    inputKey: "input",
    outputKey: "output",
    k: 10,
  });

  const executor = new AgentExecutor({ agent, tools: [runSkillScriptTool], memory, verbose: false });
  return { executor, memory };
}

async function main() {
  console.log("=".repeat(60));
  console.log("📦 动态技能 + 沙盒演示（DeepSeek）");
  console.log("启动即扫描 ./skills 目录，动态加载技能包（含可执行脚本）");
  console.log("命令：/skills /reload /clear /exit");
  console.log("=".repeat(60));

  const rl = createReadline();
  const logger = new AgentLogger();

  let skillPackages = loadSkillsFromDir(SKILLS_DIR);
  console.log(
    `✅ 已动态加载 ${skillPackages.length} 个技能：${skillPackages.map((s) => s.name).join(", ") || "（无）"}\n`
  );

  let { executor, memory } = makeExecutor(skillPackages, logger);

  while (true) {
    const input = await ask(rl, "👤 你：");
    if (!input) continue;
    if (input === "/exit") {
      logger.close();
      console.log("👋 再见！\n");
      break;
    }
    if (input === "/clear") {
      await memory.clear();
      console.log("🗑️ 记忆已清空\n");
      continue;
    }
    if (input === "/skills") {
      console.log("📚 动态技能包：");
      for (const s of skillPackages)
        console.log(`  - ${s.name} (${s.runtime}, entry=${s.entry})：${s.description}`);
      continue;
    }
    if (input === "/reload") {
      // 重新扫描目录：演示「丢一个文件夹进去就生效」的动态注入
      skillPackages = loadSkillsFromDir(SKILLS_DIR);
      ({ executor, memory } = makeExecutor(skillPackages, logger));
      console.log(
        `🔄 已重新扫描技能目录，当前 ${skillPackages.length} 个：${skillPackages.map((s) => s.name).join(", ") || "（无）"}\n`
      );
      continue;
    }

    process.stdout.write("🤖 Agent：");
    const result = await executor.invoke({ input }, { callbacks: [logger] });
    console.log(result.output);
    console.log();
  }
  rl.close();
}

main().catch(console.error);
