import * as readline from "node:readline";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import {
  StateGraph,
  START,
  END,
  Annotation,
  MemorySaver,
} from "@langchain/langgraph";
import { addMessages } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createDeepSeekModel } from "./config.js";
import { getCurrentDateTime, calculator, textTools } from "./tools.js";
import { AgentLogger } from "./logger.js";

/**
 * LangGraph 多智能体示例（MVP）
 *
 * 拓扑：Supervisor（主管 / Hub-and-Spoke）
 *   —— 对应《posts/AI/Agent开发知识/06-多智能体/02-多智能体概念体系与学习要点.md》
 *      的 Hub-and-Spoke / Hierarchical 拓扑与「主管(Supervisor) + 工人(Worker)」角色。
 *
 * 结构：
 *   START → supervisor ─┬─→ math_expert ─→ supervisor
 *                       ├─→ text_expert ─→ supervisor
 *                       └─→ FINISH → END
 *
 * - supervisor 用结构化输出在「math_expert / text_expert / FINISH」间路由；
 * - 各 worker 是独立的 AgentExecutor（与 planningAgent 同款），通过共享 messages 协作（消息传递）；
 * - MAX_ITER 防止无限循环（对应笔记「终止条件 / 失败模式」）。
 *
 * ⚠️ 这是最小可运行版本（MVP）。后续可逐步扩展：
 *   1) 增加 synthesizer（汇总）节点；2) 人在环 interrupt 审核；
 *   3) worker 独立记忆；4) 跨进程 A2A 协作；5) 更多专家角色。
 *
 * 运行：npm run multi
 * 文档：posts/AI/Agent开发知识/06-多智能体/03-多智能体实战示例-LangGraph-Supervisor.md
 */

/** 最多协作轮次（supervisor 调用次数上限），防止无限循环 */
const MAX_ITER = 6;

// ---- 日志器：记录图节点事件 + LLM/工具调用到 logs/ 目录 ----
const logger = new AgentLogger("multi");

// ---- 复用现有模型与工具 ----
const model = createDeepSeekModel({ temperature: 0 });

// 团队角色
type Member = "math_expert" | "text_expert";
const MEMBERS: Member[] = ["math_expert", "text_expert"];

// ---- 构建 worker 执行器（与 planningAgent 完全同款）----
function buildWorkerExecutor(workerTools: any[], systemPrompt: string) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);
  const agent = createToolCallingAgent({ llm: model, tools: workerTools, prompt });
  return new AgentExecutor({ agent, tools: workerTools, verbose: false });
}

const mathExecutor = buildWorkerExecutor(
  [getCurrentDateTime, calculator],
  `你是数学与日期专家。当用户目标需要数值计算或日期处理时，你必须调用工具（get_current_datetime / calculator）获取真实结果，并以工具返回为准，用中文简洁回复。`
);

const textExecutor = buildWorkerExecutor(
  [textTools.countWords, textTools.reverseText],
  `你是文本处理专家。当用户目标涉及字数统计或文本反转时，你必须调用工具（count_words / reverse_text）获取真实结果，并以工具返回为准，用中文简洁回复。`
);

// ---- 共享状态（reducer 决定字段如何合并）----
const MultiAgentState = Annotation.Root({
  // messages：各 Agent 共享的对话上下文，addMessages 负责追加
  messages: Annotation<any[]>({ reducer: addMessages, default: () => [] }),
  // next：supervisor 决定的下一步（仅 supervisor 写）
  next: Annotation<string>({
    reducer: (a, b) => (b === undefined ? a : b),
    default: () => "",
  }),
  // iteration：supervisor 调用计数（终止条件用）
  iteration: Annotation<number>({
    reducer: (a, b) => (b === undefined ? a : b),
    default: () => 0,
  }),
});

// ---- supervisor 节点：结构化输出决定下一步 ----
const supervisorModel = model.withStructuredOutput(
  z.object({
    next: z
      .enum(["math_expert", "text_expert", "FINISH"])
      .describe("下一个行动的成员，或 FINISH 表示任务已完成"),
    reasoning: z.string().describe("简短决策理由（中文）"),
  })
);

async function supervisor(state: any) {
  logger.writeLog(`── 进入 supervisor 节点（第 ${state.iteration + 1} 轮）──`);
  const res = await supervisorModel.invoke(
    [
      {
        role: "system",
        content: `你是团队协作的主管（supervisor）。你管理两名专家：
- math_expert：负责数值计算、日期时间（可调用 calculator / get_current_datetime）
- text_expert：负责文本字数统计、文本反转（可调用 count_words / reverse_text）

请阅读下方完整对话，判断当前应由哪位专家行动，还是任务已经可以结束。
只有在确实需要调用对应工具时才派单；若用户请求已被满足，输出 FINISH。`,
      },
      ...state.messages,
    ],
    { callbacks: [logger], tags: ["supervisor"] }
  );
  logger.writeLog(`supervisor 决策：next=${res.next} | 理由=${res.reasoning}`);
  logger.writeLog("── 离开 supervisor 节点 ──");
  // 返回 next + 自增 iteration（其他节点不返回 iteration，reducer 保留旧值）
  return { next: res.next, iteration: state.iteration + 1 };
}

// ---- 把对话转成文本，作为 worker 的输入上下文（消息传递的核心）----
function formatTranscript(state: any): string {
  return state.messages
    .map((m: any) => {
      const role = m._getType();
      const name = m.name ? `（${m.name}）` : "";
      const text = typeof m.content === "string" ? m.content : "<非文本内容>";
      return `${role}${name}: ${text}`;
    })
    .join("\n");
}

async function runWorker(state: any, name: Member, executor: AgentExecutor) {
  const transcript = formatTranscript(state);
  console.log(`\n🛠️  [${name}] 执行中…`);
  logger.writeLog(`── 进入 ${name} 节点 ──`);
  try {
    const result = await executor.invoke(
      {
        input: `当前团队协作对话记录如下，请基于它完成你的职责：\n${transcript}`,
      },
      { callbacks: [logger], tags: [name] }
    );
    const output = String(result.output ?? "");
    console.log(`   ✅ [${name}] ${output}`);
    logger.writeLog(`[${name}] 结果：${output}`);
    logger.writeLog(`── 离开 ${name} 节点 ──`);
    // worker 产出作为 AIMessage 追加回共享 messages，供 supervisor 与其他 worker 看到
    return { messages: [new AIMessage({ content: output, name })] };
  } catch (e: any) {
    const reason = String(e?.message ?? e);
    console.log(`   ❌ [${name}] 异常：${reason}`);
    logger.writeLog(`❌ [${name}] 异常：${reason}`);
    logger.writeLog(`── 离开 ${name} 节点（异常）──`);
    return {
      messages: [new AIMessage({ content: `（${name} 执行出错：${reason}）`, name })],
    };
  }
}

const mathWorker = (state: any) => runWorker(state, "math_expert", mathExecutor);
const textWorker = (state: any) => runWorker(state, "text_expert", textExecutor);

// ---- 路由：FINISH 或超轮次 → 结束；否则去对应 worker ----
function route(state: any) {
  const dest =
    state.next === "FINISH" || state.iteration >= MAX_ITER ? "FINISH" : state.next;
  logger.writeLog(
    `🔀 路由：next=${state.next}, iteration=${state.iteration}/${MAX_ITER} → ${dest}`
  );
  return dest;
}

// ---- 编译图（checkpointer 持久化状态，便于后续扩展人在环）----
export const multiAgentGraph = new StateGraph(MultiAgentState)
  .addNode("supervisor", supervisor)
  .addNode("math_expert", mathWorker)
  .addNode("text_expert", textWorker)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", route, {
    math_expert: "math_expert",
    text_expert: "text_expert",
    FINISH: END,
  })
  .addEdge("math_expert", "supervisor")
  .addEdge("text_expert", "supervisor")
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
  console.log("🤝 LangGraph 多智能体示例（Supervisor + 2 Workers）");
  console.log("成员：math_expert（计算/日期） | text_expert（字数/反转）");
  console.log("输入 /exit 退出");
  console.log(`📁 日志：${logger.id ? "logs/multi-" + logger.id + ".log" : ""}`);
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

      const threadId = `thread-${Date.now()}`;
      const config = { configurable: { thread_id: threadId } };
      logger.writeLog(`🚀 图执行开始 | 目标=${input} | thread=${threadId}`);

      // 注入用户消息，启动图；supervisor 循环调度，直到 FINISH 或超轮次
      const res: any = await multiAgentGraph.invoke(
        { messages: [new HumanMessage(input)] },
        config
      );

      // 最终回答 = 最后一条 AI 消息（多 Agent 协作结果）
      const aiMessages = res.messages.filter((m: any) => m._getType() === "ai");
      const finalAnswer = aiMessages.length
        ? aiMessages[aiMessages.length - 1].content
        : "（无结果）";

      console.log("\n🤖 最终回答：");
      console.log(finalAnswer);
      console.log(`\n──────── 协作轮次：${res.iteration} ────────\n`);
      logger.writeLog(`🏁 图执行结束 | 轮次=${res.iteration}`);
      logger.writeLog("─".repeat(50));
    }
  } finally {
    rl.close();
    logger.close();
  }
}

main().catch(console.error);
