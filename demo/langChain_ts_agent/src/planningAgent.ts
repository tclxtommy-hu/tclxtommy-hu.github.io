import * as readline from "node:readline";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { BufferWindowMemory } from "langchain/memory";
import {
  StateGraph,
  START,
  END,
  Annotation,
  MemorySaver,
  Command,
  interrupt,
  isInterrupted,
  INTERRUPT,
} from "@langchain/langgraph";
import { z } from "zod";
import { createDeepSeekModel } from "./config.js";
import { getCurrentDateTime, calculator, textTools } from "./tools.js";
import { FileChatMessageHistory } from "./file_history.js";
import { AgentLogger } from "./logger.js";

/**
 * LangGraph 规划版 Agent
 *
 * 架构：LangChain 的 AgentExecutor（ReAct 执行器）作为图的"执行节点"，
 *       LangGraph 负责"规划 + 人工审核 + 顺序执行 + 汇总"，对应笔记 §3 一次性规划。
 *       规划产出后暂停等待人工确认（人在环上），对应笔记 §5 人在环上。
 *       子任务失败时自动重规划（replan），对应笔记 §4 重规划。
 *
 * 运行：npm run plan
 */

/** 最多重规划次数，防止无限循环 */
const MAX_REPLAN = 3;

/**
 * executor 是否启用对话记忆（聊天历史）。
 * - false（默认）：子任务独立执行，结果传递由图 State（results 数组）负责，避免历史污染和 token 浪费
 * - true：executor 挂 BufferWindowMemory，跨子任务/跨会话保留上下文（适合子任务间有隐式依赖需靠上下文衔接的场景）
 */
const ENABLE_EXECUTOR_MEMORY = false;
const MEMORY_WINDOW_SIZE = 10;

// ---- 日志器：记录图节点事件 + LLM/工具调用到 logs/ 目录 ----
const logger = new AgentLogger("plan");

// ---- 复用现有工具 + 模型 ----
const tools = [
  getCurrentDateTime,
  calculator,
  textTools.countWords,
  textTools.reverseText,
];
const model = createDeepSeekModel({ temperature: 0 });

// ---- 现有 Agent（ReAct 执行器），作为图的"执行节点" ----
// ENABLE_EXECUTOR_MEMORY=false 时子任务独立执行，结果传递由图 State（results 数组）负责；
// =true 时挂 BufferWindowMemory，跨子任务/跨会话保留上下文（chat_history 持久化到 data/plan_chat_history.json）。
const promptMessages: [string, string][] = [
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
];
if (ENABLE_EXECUTOR_MEMORY) {
  promptMessages.push(["placeholder", "{chat_history}"]);
}
promptMessages.push(["human", "{input}"], ["placeholder", "{agent_scratchpad}"]);

const prompt = ChatPromptTemplate.fromMessages(promptMessages);
const agent = createToolCallingAgent({ llm: model, tools, prompt });

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  memory: ENABLE_EXECUTOR_MEMORY
    ? new BufferWindowMemory({
        chatHistory: new FileChatMessageHistory("./data/plan_chat_history.json"),
        returnMessages: true,
        memoryKey: "chat_history",
        inputKey: "input",
        outputKey: "output",
        k: MEMORY_WINDOW_SIZE,
      })
    : undefined,
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
  humanApproved: Annotation<boolean>({ reducer: (_, b) => b ?? false, default: () => false }),
  finalAnswer: Annotation<string>({ reducer: (_, b) => b ?? "", default: () => "" }),
});

// ---- 规划器节点：一次性产出子任务列表（笔记 §3 一次性规划）----
const plannerModel = model.withStructuredOutput(
  z.object({ plan: z.array(z.string()).describe("按顺序执行的子任务列表") })
);

async function planner(state: any) {
  logger.writeLog("── 进入 planner 节点 ──");
  logger.writeLog(`目标：${state.goal}`);
  const res = await plannerModel.invoke(
    [
      {
        role: "system",
        content:
          "你是任务规划器。把用户目标拆成可独立执行、可验证的子任务列表，每个子任务应能用现有工具完成。",
      },
      { role: "user", content: state.goal },
    ],
    { callbacks: [logger], tags: ["planner"] }
  );
  // 重置执行进度
  console.log("\n📋 规划结果（共 " + res.plan.length + " 步）：");
  res.plan.forEach((t: string, i: number) => console.log(`   ${i + 1}. ${t}`));
  logger.writeLog(`规划结果（共 ${res.plan.length} 步）：`);
  res.plan.forEach((t: string, i: number) => logger.writeLog(`   ${i + 1}. ${t}`));
  logger.writeLog("── 离开 planner 节点 ──");
  return { plan: res.plan, stepIndex: 0, results: [] };
}

// ---- 人工审核节点：规划后暂停，等待人工确认再执行（笔记 §5 人在环上）----
// 使用 interrupt() 暂停图执行：把规划方案交给调用方展示给用户；
// 调用方收集用户决策后，用 Command({ resume: decision }) 恢复，interrupt() 返回 decision。
async function humanReview(state: any) {
  // 注意：interrupt() 恢复时节点函数会从头重新执行，interrupt() 之前的代码运行两次。
  // 所以规划方案展示放到 main() 检测中断时记录，这里只保留 interrupt() 之后的日志。
  const decision = interrupt<{
    goal: string;
    plan: string[];
    replanCount: number;
  }, { approved: boolean; feedback: string }>({
    goal: state.goal,
    plan: state.plan,
    replanCount: state.replanCount,
  });

  // —— 以下仅在恢复后执行一次 ——
  logger.writeLog(
    `humanReview | 用户决策：${decision.approved ? "确认" : "驳回"}${decision.feedback ? `（${decision.feedback}）` : ""}`
  );

  if (decision.approved) {
    console.log("✅ 规划已通过人工审核，开始执行...");
    logger.writeLog("── 离开 humanReview 节点（已通过）──");
    return { humanApproved: true, failedStep: "", failedReason: "" };
  }
  console.log(`❌ 规划被驳回：${decision.feedback}，触发重规划...`);
  logger.writeLog("── 离开 humanReview 节点（已驳回）──");
  return {
    humanApproved: false,
    failedStep: "plan_rejected",
    failedReason: `用户驳回规划：${decision.feedback}`,
  };
}

// ---- 路由：人工审核后，通过→执行；驳回且未超限→重规划；超限→兜底汇总 ----
function routeAfterReview(state: any) {
  const dest = state.humanApproved
    ? "executor"
    : state.replanCount >= MAX_REPLAN
      ? "synthesize"
      : "replanner";
  logger.writeLog(
    `🔀 路由 routeAfterReview: humanApproved=${state.humanApproved}, replanCount=${state.replanCount} → ${dest}`
  );
  return dest;
}

// ---- 执行器节点：复用现有 AgentExecutor 跑单个子任务 ----
// 失败时记录 failedStep/failedReason，触发重规划（笔记 §4）
async function executor(state: any) {
  const task = state.plan[state.stepIndex];
  const idx = state.stepIndex + 1;
  console.log(`\n⚙️  执行子任务 [${idx}/${state.plan.length}]：${task}`);
  logger.writeLog(`── 进入 executor 节点 [${idx}/${state.plan.length}] ──`);
  logger.writeLog(`子任务：${task}`);
  try {
    const result = await agentExecutor.invoke(
      { input: task },
      { callbacks: [logger], tags: ["executor"] }
    );
    const output = String(result.output ?? "");

    // 失败判定：工具明确报错 或 输出含失败语义（启发式，可据需扩展）
    const isFail = /无法计算|无法完成|执行失败|报错|出错|error|exception/i.test(output);
    if (isFail) {
      console.log(`   ❌ 失败：${output}`);
      logger.writeLog(`❌ 执行失败：${output}`);
      logger.writeLog("── 离开 executor 节点（失败）──");
      return {
        failedStep: task,
        failedReason: output,
        stepIndex: state.stepIndex + 1,
      };
    }
    console.log(`   ✅ 结果：${output}`);
    logger.writeLog(`✅ 执行结果：${output}`);
    logger.writeLog("── 离开 executor 节点（成功）──");
    return { results: [output], stepIndex: state.stepIndex + 1, failedStep: "" };
  } catch (e: any) {
    const reason = String(e?.message ?? e);
    console.log(`   ❌ 异常：${reason}`);
    logger.writeLog(`❌ 执行异常：${reason}`);
    logger.writeLog("── 离开 executor 节点（异常）──");
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
  logger.writeLog(`── 进入 replanner 节点（第 ${state.replanCount + 1} 次）──`);
  logger.writeLog(`失败步骤：${state.failedStep}`);
  logger.writeLog(`失败原因：${state.failedReason}`);
  logger.writeLog(
    `已完成结果：${state.results.length ? state.results.map((r: string, i: number) => `${i + 1}. ${r}`).join(" | ") : "（无）"}`
  );
  const res = await replannerModel.invoke(
    [
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
    ],
    { callbacks: [logger], tags: ["replanner"] }
  );
  const newPlan = res.plan ?? [];
  console.log(`📋 重规划后的剩余子任务（共 ${newPlan.length} 步）：`);
  newPlan.forEach((t: string, i: number) => console.log(`   ${i + 1}. ${t}`));
  logger.writeLog(`重规划结果（共 ${newPlan.length} 步）：`);
  newPlan.forEach((t: string, i: number) => logger.writeLog(`   ${i + 1}. ${t}`));
  logger.writeLog("── 离开 replanner 节点 ──");
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
  const dest =
    state.replanCount >= MAX_REPLAN
      ? "synthesize"
      : state.failedStep
        ? "replanner"
        : state.stepIndex >= state.plan.length
          ? "synthesize"
          : "executor";
  logger.writeLog(
    `🔀 路由 routeAfterExecute: failedStep=${state.failedStep || "（无）"}, stepIndex=${state.stepIndex}/${state.plan.length}, replanCount=${state.replanCount} → ${dest}`
  );
  return dest;
}

// ---- 汇总节点：根据各子任务结果生成最终回答 ----
async function synthesize(state: any) {
  logger.writeLog("── 进入 synthesize 节点 ──");
  logger.writeLog(
    `汇总 ${state.results.length} 个子任务结果：${state.results.map((r: string, i: number) => `${i + 1}. ${r}`).join(" | ") || "（无）"}`
  );
  const summary = await model.invoke(
    [
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
    ],
    { callbacks: [logger], tags: ["synthesize"] }
  );
  logger.writeLog(`最终回答：${String(summary.content)}`);
  logger.writeLog("── 离开 synthesize 节点 ──");
  return { finalAnswer: String(summary.content) };
}

// ---- 编译图 ----
// checkpointer: MemorySaver 持久化图状态，使 interrupt() 可暂停/恢复
// 拓扑变化：planner → humanReview → executor（规划后先人工审核再执行）
//           replanner → humanReview（重规划后的方案也需人工确认）
export const planningGraph = new StateGraph(PlanState)
  .addNode("planner", planner)
  .addNode("humanReview", humanReview)
  .addNode("executor", executor)
  .addNode("replanner", replanner)
  .addNode("synthesize", synthesize)
  .addEdge(START, "planner")
  .addEdge("planner", "humanReview")
  .addConditionalEdges("humanReview", routeAfterReview, {
    executor: "executor",
    replanner: "replanner",
    synthesize: "synthesize",
  })
  .addEdge("replanner", "humanReview")
  .addConditionalEdges("executor", routeAfterExecute, {
    executor: "executor",
    replanner: "replanner",
    synthesize: "synthesize",
  })
  .addEdge("synthesize", END)
  .compile({ checkpointer: new MemorySaver() });

// ---- 交互入口 ----
function createReadline() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function main() {
  console.log("=".repeat(50));
  console.log("🧭 LangGraph 规划版 Agent（规划 → 人工审核 → 分步执行 → 失败重规划 → 汇总）");
  console.log("工具：日期时间 | 计算器 | 字数统计 | 文本反转");
  console.log("输入 /exit 退出");
  console.log(`📁 日志文件：${logger.id ? "logs/plan-" + logger.id + ".log" : ""}`);
  console.log("=".repeat(50));

  const rl = createReadline();

  try {
    while (true) {
      const input = await ask(rl, "👤 你：");

      if (!input) continue;
      if (input === "/exit") {
        console.log("👋 再见！\n");
        break;
      }

      process.stdout.write("🤖 Agent：");
      const threadId = `thread-${Date.now()}`;
      const config = { configurable: { thread_id: threadId } };

      logger.writeLog(`🚀 图执行开始 | 目标=${input} | thread=${threadId}`);

      // 启动图 — 会在 humanReview 节点的 interrupt() 处暂停，返回中断状态
      let res: any = await planningGraph.invoke({ goal: input }, config);

      // 人在环上：循环处理规划审核中断，直到图正常结束
      while (isInterrupted(res)) {
        const iv = res[INTERRUPT][0].value as {
          goal: string;
          plan: string[];
          replanCount: number;
        };
        // 日志：规划方案待确认（interrupt 暂停后由 main 记录，只记一次）
        logger.writeLog(
          `── humanReview 中断：规划方案待确认${iv.replanCount > 0 ? `（第 ${iv.replanCount + 1} 版）` : ""} ──`
        );
        iv.plan.forEach((t: string, i: number) => logger.writeLog(`   ${i + 1}. ${t}`));
        logger.writeLog("⏸️ interrupt() 暂停图执行，等待人工确认...");

        console.log(
          `\n📋 规划方案待确认（目标：${iv.goal}${iv.replanCount > 0 ? `，第 ${iv.replanCount + 1} 版` : ""}）：`
        );
        iv.plan.forEach((t: string, i: number) => console.log(`   ${i + 1}. ${t}`));

        const answer = await ask(rl, "\n确认执行此方案？(y=确认 / 其他输入=驳回并附说明)：");
        const decision =
          answer === "y" || answer === "yes" || answer === "确认"
            ? { approved: true, feedback: "" }
            : { approved: false, feedback: answer || "用户未说明原因" };

        if (decision.approved) {
          console.log("✅ 已确认，开始执行...\n");
        } else {
          console.log(`❌ 已驳回（${decision.feedback}），触发重规划...\n`);
        }

        logger.writeLog(
          `📝 人工审核结果：${decision.approved ? "确认" : "驳回"}${decision.feedback ? `（${decision.feedback}）` : ""}`
        );
        logger.writeLog(`▶️ 恢复图执行（Command resume）`);

        // 用 Command({ resume }) 恢复图执行，humanReview 内的 interrupt() 将返回 decision
        res = await planningGraph.invoke(new Command({ resume: decision }), config);
      }

      console.log(res.finalAnswer);
      console.log(
        `\n──────── 本次执行：子任务 ${res.results.length} 个，重规划 ${res.replanCount} 次 ────────\n`
      );
      logger.writeLog(
        `🏁 图执行结束 | 子任务=${res.results.length} | 重规划=${res.replanCount} 次`
      );
      logger.writeLog("─".repeat(50));
    }
  } finally {
    rl.close();
    logger.close();
  }
}

main().catch(console.error);
