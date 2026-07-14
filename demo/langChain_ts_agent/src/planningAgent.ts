import * as readline from "node:readline";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { BufferWindowMemory } from "langchain/memory";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { createDeepSeekModel } from "./config.js";
import { getCurrentDateTime, calculator, textTools } from "./tools.js";
import { FileChatMessageHistory } from "./file_history.js";

/**
 * LangGraph 规划版 Agent
 *
 * 架构：LangChain 的 AgentExecutor（ReAct 执行器）作为图的"执行节点"，
 *       LangGraph 负责"规划 + 顺序执行 + 汇总"，对应笔记 §3 一次性规划。
 *       子任务失败时自动重规划（replan），对应笔记 §4 重规划。
 *
 * 运行：npm run plan
 */

const MEMORY_WINDOW_SIZE = 10;
/** 最多重规划次数，防止无限循环 */
const MAX_REPLAN = 3;

// ---- 复用现有工具 + 模型 ----
const tools = [
  getCurrentDateTime,
  calculator,
  textTools.countWords,
  textTools.reverseText,
];
const model = createDeepSeekModel({ temperature: 0 });

// ---- 现有 Agent（ReAct 执行器），作为图的"执行节点" ----
const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是实用工具助手，你必须通过调用工具来获取真实数据。

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

const agent = createToolCallingAgent({ llm: model, tools, prompt });

const chatHistory = new FileChatMessageHistory("./data/plan_chat_history.json");
const memory = new BufferWindowMemory({
  chatHistory,
  returnMessages: true,
  memoryKey: "chat_history",
  inputKey: "input",
  outputKey: "output",
  k: MEMORY_WINDOW_SIZE,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  memory,
  verbose: false,
});

// ---- 规划状态（reducer 决定字段如何合并）----
const PlanState = Annotation.Root({
  goal: Annotation<string>({ reducer: (_, b) => b ?? "", default: () => "" }),
  plan: Annotation<string[]>({ reducer: (_, b) => b ?? [], default: () => [] }),
  stepIndex: Annotation<number>({ reducer: (_, b) => b ?? 0, default: () => 0 }),
  results: Annotation<string[]>({
    reducer: (a, b) => (b ? [...a, ...b] : a),
    default: () => [],
  }),
  failedStep: Annotation<string>({ reducer: (_, b) => b ?? "", default: () => "" }),
  failedReason: Annotation<string>({ reducer: (_, b) => b ?? "", default: () => "" }),
  replanCount: Annotation<number>({ reducer: (_, b) => b ?? 0, default: () => 0 }),
  finalAnswer: Annotation<string>({ reducer: (_, b) => b ?? "", default: () => "" }),
});

// ---- 规划器节点：一次性产出子任务列表（笔记 §3 一次性规划）----
const plannerModel = model.withStructuredOutput(
  z.object({ plan: z.array(z.string()).describe("按顺序执行的子任务列表") })
);

async function planner(state: any) {
  const res = await plannerModel.invoke([
    {
      role: "system",
      content:
        "你是任务规划器。把用户目标拆成可独立执行、可验证的子任务列表，每个子任务应能用现有工具完成。",
    },
    { role: "user", content: state.goal },
  ]);
  // 重置执行进度
  console.log("\n📋 规划结果（共 " + res.plan.length + " 步）：");
  res.plan.forEach((t: string, i: number) => console.log(`   ${i + 1}. ${t}`));
  return { plan: res.plan, stepIndex: 0, results: [] };
}

// ---- 执行器节点：复用现有 AgentExecutor 跑单个子任务 ----
// 失败时记录 failedStep/failedReason，触发重规划（笔记 §4）
async function executor(state: any) {
  const task = state.plan[state.stepIndex];
  const idx = state.stepIndex + 1;
  console.log(`\n⚙️  执行子任务 [${idx}/${state.plan.length}]：${task}`);
  try {
    const result = await agentExecutor.invoke({ input: task });
    const output = String(result.output ?? "");

    // 失败判定：工具明确报错 或 输出含失败语义（启发式，可据需扩展）
    const isFail = /无法计算|无法完成|执行失败|报错|出错|error|exception/i.test(output);
    if (isFail) {
      console.log(`   ❌ 失败：${output}`);
      return {
        failedStep: task,
        failedReason: output,
        stepIndex: state.stepIndex + 1,
      };
    }
    console.log(`   ✅ 结果：${output}`);
    return { results: [output], stepIndex: state.stepIndex + 1, failedStep: "" };
  } catch (e: any) {
    const reason = String(e?.message ?? e);
    console.log(`   ❌ 异常：${reason}`);
    return {
      failedStep: task,
      failedReason: reason,
      stepIndex: state.stepIndex + 1,
    };
  }
}

// ---- 重规划器节点：根据已完成结果 + 失败步骤，重新规划剩余子任务（笔记 §4）----
const replannerModel = model.withStructuredOutput(
  z.object({
    plan: z
      .array(z.string())
      .describe("重新规划后【剩余】要执行的子任务列表，不要包含已完成部分；若已无需继续则为空数组"),
  })
);

async function replanner(state: any) {
  console.log(`\n🔁 重规划（第 ${state.replanCount + 1} 次）…`);
  const res = await replannerModel.invoke([
    {
      role: "system",
      content:
        "你是任务重规划器。根据已完成结果和失败步骤，重新规划【剩余】需要执行的子任务。不要重复已完成部分；若原目标已无法达成或无需继续，返回空列表。",
    },
    {
      role: "user",
      content: `原始目标：${state.goal}
已完成结果：
${state.results.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") || "（无）"}
失败步骤：${state.failedStep}
失败原因：${state.failedReason}
请输出重新规划后的剩余子任务列表。`,
    },
  ]);
  const newPlan = res.plan ?? [];
  console.log(`📋 重规划后的剩余子任务（共 ${newPlan.length} 步）：`);
  newPlan.forEach((t: string, i: number) => console.log(`   ${i + 1}. ${t}`));
  // 保留已完成 results，重置 plan/stepIndex/failed，replanCount +1
  return {
    plan: res.plan ?? [],
    stepIndex: 0,
    failedStep: "",
    failedReason: "",
    replanCount: state.replanCount + 1,
  };
}

// ---- 路由：失败→重规划；超限或完成→汇总；否则继续 ----
function routeAfterExecute(state: any) {
  if (state.replanCount >= MAX_REPLAN) return "synthesize";
  if (state.failedStep) return "replanner";
  if (state.stepIndex >= state.plan.length) return "synthesize";
  return "executor";
}

// ---- 汇总节点：根据各子任务结果生成最终回答 ----
async function synthesize(state: any) {
  const summary = await model.invoke([
    {
      role: "system",
      content: "你是总结器。根据各子任务的执行结果，给出针对原始目标的最终回答（中文）。",
    },
    {
      role: "user",
      content: `原始目标：${state.goal}\n\n子任务结果：\n${state.results
        .map((r: string, i: number) => `${i + 1}. ${r}`)
        .join("\n")}`,
    },
  ]);
  return { finalAnswer: String(summary.content) };
}

// ---- 编译图 ----
export const planningGraph = new StateGraph(PlanState)
  .addNode("planner", planner)
  .addNode("executor", executor)
  .addNode("replanner", replanner)
  .addNode("synthesize", synthesize)
  .addEdge(START, "planner")
  .addEdge("planner", "executor")
  .addConditionalEdges("executor", routeAfterExecute, {
    executor: "executor",
    replanner: "replanner",
    synthesize: "synthesize",
  })
  .addEdge("replanner", "executor")
  .addEdge("synthesize", END)
  .compile();

// ---- 交互入口 ----
function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function main() {
  console.log("=".repeat(50));
  console.log("🧭 LangGraph 规划版 Agent（规划 → 分步执行 → 失败重规划 → 汇总）");
  console.log("工具：日期时间 | 计算器 | 字数统计 | 文本反转");
  console.log("输入 /exit 退出");
  console.log("=".repeat(50));

  const rl = createReadline();

  while (true) {
    const input = await ask(rl, "👤 你：");

    if (!input) continue;
    if (input === "/exit") {
      console.log("👋 再见！\n");
      break;
    }

    process.stdout.write("🤖 Agent：");
    const res = await planningGraph.invoke({ goal: input });
    console.log(res.finalAnswer);
    console.log(
      `\n──────── 本次执行：子任务 ${res.results.length} 个，重规划 ${res.replanCount} 次 ────────\n`
    );
  }

  rl.close();
}

main().catch(console.error);
