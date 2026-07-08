import type { ChatOpenAI } from "@langchain/openai";

/**
 * Skill 数据模型（与 MCP "Prompt" 原语对齐）
 *
 * 在 Agent / LLM 语境中，"Skill" 与 "Tool" 处于不同层次：
 *   Tool（工具） — 一个可被 LLM 直接「调用」的原子函数（function calling）。
 *   Skill（技能）— 一段「被注入上下文的专业知识 / 标准流程(SOP)」。
 *                   LLM 读懂后用自己的推理「遵循」它，过程中可再调用 Tool。
 *
 * 数据模型（行业共识的 shape，对应 MCP Prompt / agents.md / 子 Agent handoff）：
 *   - name / description 是「元数据」：给路由器(大脑)用于"选"
 *   - instructions 是「正文」：注入 LLM 上下文，给"大脑"遵循
 *   - tools 是「可选依赖」：给"四肢(运行时)"执行的工具
 *
 * 分工（本项目核心教学目标）：
 *   大脑 = LLM（读 SOP、决策选技能）
 *   四肢 = Agent 运行时（把技能注入 prompt、执行携带的 tools、跑循环）
 */
export interface Skill {
  name: string;
  description: string;
  instructions: string;
  tools?: unknown[];
}

// 技能注册表（最小化示例，纯指令型，零额外依赖）
export const SKILLS: Skill[] = [
  {
    name: "email_drafter",
    description: "当用户需要起草/润色正式邮件、商务沟通时",
    instructions: `你是专业邮件撰写助手，遵循：
1. 先给主题(Subject)，再写正文；
2. 专业且友好，正文不超过 3 段；
3. 结尾给出明确下一步行动。`,
  },
  {
    name: "code_explainer",
    description: "当用户需要解释代码、讲解原理、做代码教学时",
    instructions: `你是耐心的代码讲解员，遵循：
1. 先用一句话概括这段代码做了什么；
2. 分点拆解关键逻辑（结合行号/函数名）；
3. 点出可能的坑或可优化点。`,
  },
  {
    name: "translator",
    description: "当用户需要中英互译、或要求用某种语言回答时",
    instructions: `你是翻译专家。严格按以下格式逐行输出，不要输出格式说明本身、不要加多余解释：
原文：<原文照抄，一字不改>
译文：<目标语言译文>
说明：<仅当原文有歧义/多义时，用一句话说明取舍；否则只写"无">

示例：
用户输入：帮我翻译下：you are a beautiful girl
原文：you are a beautiful girl
译文：你是个美丽的女孩。
说明：无`,
  },
];

export function getSkill(name: string): Skill | undefined {
  return SKILLS.find((s) => s.name === name);
}

export function listSkills(): Skill[] {
  return SKILLS;
}

/**
 * 把技能正文注入 system prompt —— 这就是 Skill 在 LLM 中的核心用法。
 * 运行时(四肢)负责拼接，LLM(大脑)只消费最终这段文本。
 */
export function buildSystemPrompt(base: string, skill: Skill | null): string {
  if (!skill) return base;
  return `${base}\n\n【已加载技能：${skill.name}】\n${skill.instructions}`;
}

/**
 * 路由：让大脑(LLM)决策选哪个 skill（当前主流做法，如 handoffs / router）。
 * 只回复技能的 name（或 none），四肢再据此加载。
 */
const ROUTER_PROMPT = `你是技能路由器。可用技能：
${SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n")}
只回复最合适技能的 name；没有合适的只回复 none。\n用户需求：`;

export async function selectSkillByLLM(
  model: ChatOpenAI,
  input: string
): Promise<Skill | null> {
  const res = await model.invoke(ROUTER_PROMPT + input);
  const name = String(res.content).trim().toLowerCase();
  if (name === "none") return null;
  return getSkill(name) ?? null;
}

/**
 * 确定性 fallback：关键词匹配（不想多一次 LLM 调用时使用）。
 * 注意：这是让"四肢"替"大脑"做了判断的简化版，仅作对照/降级用。
 */
export function selectSkillByKeyword(input: string): Skill | null {
  const text = input.toLowerCase();
  for (const s of SKILLS) {
    const keywords = [s.name.replace(/_/g, " "), ...s.description.split(/[，。、/ ]/)];
    if (keywords.some((k) => k && text.includes(k.toLowerCase()))) return s;
  }
  return null;
}
