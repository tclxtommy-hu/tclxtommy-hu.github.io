import * as fs from "node:fs";
import * as path from "node:path";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { AgentAction, AgentFinish } from "@langchain/core/agents";
import type { ChainValues } from "@langchain/core/utils/types";
import type { LLMResult } from "@langchain/core/outputs";

const LOGS_DIR = path.resolve(process.cwd(), "logs");

// 确保 logs 目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// 两位补零
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 获取当前时间字符串（本地时区，非 UTC）：YYYY-MM-DD HH:MM:SS
function now(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" + pad(d.getMonth() + 1) +
    "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) +
    ":" + pad(d.getMinutes()) +
    ":" + pad(d.getSeconds())
  );
}

// 文件名用的本地时间戳：YYYY-MM-DDTHH-MM-SS（保留 T 分隔符）
function nowFileStamp(): string {
  return now().replace(" ", "T").replace(/:/g, "-");
}

// 截断长文本
function truncate(text: string, maxLen = 200): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

/**
 * LangChain 自定义回调处理器
 * 记录 LLM 调用、工具使用、Agent 决策等所有事件到日志文件
 */
export class AgentLogger extends BaseCallbackHandler {
  name = "AgentLogger";
  private sessionId: string;
  private logFilePath: string;

  /** 暴露 sessionId 供上层生成日志路径等用途（避免直接访问私有字段） */
  get id(): string {
    return this.sessionId;
  }
  private stream: fs.WriteStream;
  private stepCount = 0;
  private llmCallCount = 0;
  private toolCallCount = 0;
  private module: string;

  /**
   * @param module 模块名（如 chat / skill / sandbox），用于日志分类：
   *   - 写入独立文件 `<module>-<timestamp>.log`
   *   - 每条 LLM 调用带上「方法 tag」（通过 invoke 的 tags 选项传入，如 router / chat）
   */
  constructor(module = "agent") {
    super();
    this.module = module;
    ensureLogDir();

    const dateStr = nowFileStamp();
    this.sessionId = dateStr;
    this.logFilePath = path.join(LOGS_DIR, `${this.module}-${this.sessionId}.log`);
    this.stream = fs.createWriteStream(this.logFilePath, { flags: "a" });

    this.log("=".repeat(60));
    this.log(`📋 会话开始 | 模块=${this.module} | ${now()}`);
    this.log("=".repeat(60));
  }

  /** 写入日志（同时输出到控制台简要信息） */
  private log(message: string) {
    const line = `[${now()}] ${message}`;
    this.stream.write(line + "\n");

    // 关键事件也输出到控制台（带缩进，与交互区分）
    if (
      message.includes("🔧") ||
      message.includes("🤔") ||
      message.includes("💬") ||
      message.includes("✅")
    ) {
      console.log(`  ${message}`);
    }
  }

  /** 关闭日志流 */
  close() {
    this.log("=".repeat(60));
    this.log(
      `📋 会话结束 | LLM调用: ${this.llmCallCount}次 | 工具调用: ${this.toolCallCount}次 | 总步骤: ${this.stepCount}步`
    );
    this.log("=".repeat(60));
    this.log(`📁 日志已保存到: ${this.logFilePath}`);
    this.stream.end();
  }

  // ========== LLM 调用 ==========

  async handleLLMStart(
    _llm: Serialized,
    prompts: string[],
    _runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    tags?: string[],
    _metadata?: Record<string, unknown>,
    _name?: string
  ) {
    this.llmCallCount++;
    this.stepCount++;
    // 方法级分类：invoke 时通过 tags 选项传入（如 ["router"] / ["chat"]）
    const tagStr = tags && tags.length ? ` [${this.module}/${tags.join("/")}]` : ` [${this.module}]`;
    this.log(`🤔 [LLM调用 #${this.llmCallCount}]${tagStr} 发送请求（完整上下文如下）...`);

    // 记录完整 prompt（不截断，便于事后复盘所有喂给大模型的内容）
    for (let i = 0; i < prompts.length; i++) {
      this.log(`   ── Prompt #${i + 1} ───────────────────────────────`);
      this.log(prompts[i]);
      this.log(`   ───────────────────────────────────────────────────`);
    }
  }

  async handleLLMEnd(
    output: LLMResult,
    _runId: string,
    _parentRunId?: string
  ) {
    const gen = output.generations?.[0]?.[0] as unknown as Record<string, any> | undefined;
    let content = "";

    // 1) 普通文本响应（chat 等）
    if (typeof gen?.text === "string" && gen.text.trim()) {
      content = gen.text;
    } else {
      const msg = gen?.message as Record<string, any> | undefined;
      if (msg) {
        const mc = msg.content;
        if (typeof mc === "string" && mc.trim()) {
          content = mc;
        } else if (Array.isArray(mc)) {
          // content 可能是多模态块数组，提取其中的文本
          content = mc
            .map((p: any) => (typeof p === "string" ? p : (p?.text ?? "")))
            .join("");
        }
        // 2) 结构化输出 / 工具调用：从 tool_calls 的 args 还原
        //    （router 选技能用的是 withStructuredOutput，决策就藏在 args 里）
        const toolCalls = msg.tool_calls ?? (output.llmOutput as any)?.tool_calls;
        if (!content && Array.isArray(toolCalls) && toolCalls.length) {
          content = toolCalls
            .map((tc: any) => {
              const args = tc?.function?.arguments ?? tc?.args;
              return typeof args === "string" ? args : JSON.stringify(args);
            })
            .join("\n");
        }
      }
    }

    if (!content) content = "(无内容)";
    this.log(`💬 [LLM响应 #${this.llmCallCount}] ${content}`);

    // 工具调用明细（结构化输出的决策一目了然）
    const toolCalls =
      (gen?.message as any)?.tool_calls ?? (output.llmOutput as any)?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length) {
      this.log(`   📌 LLM 决定调用工具/结构化输出: ${JSON.stringify(toolCalls)}`);
    }
  }

  async handleLLMError(
    err: Error,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(`❌ [LLM错误 #${this.llmCallCount}] ${err.message}`);
  }

  // ========== 工具调用 ==========

  async handleToolStart(
    tool: Serialized,
    input: string,
    _runId: string,
    _parentRunId?: string
  ) {
    this.toolCallCount++;
    this.log(
      `🔧 [工具调用 #${this.toolCallCount}] ${tool.id?.join(".") ?? tool.name} | 参数: ${truncate(input, 200)}`
    );
  }

  async handleToolEnd(
    output: string,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(`📤 [工具返回 #${this.toolCallCount}] ${truncate(output, 300)}`);
  }

  async handleToolError(
    err: Error,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(`❌ [工具错误 #${this.toolCallCount}] ${err.message}`);
  }

  // ========== Agent 决策 ==========

  async handleAgentAction(
    action: AgentAction,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(
      `🎯 [Agent决策] 选择工具: ${action.tool} | 输入: ${truncate(action.toolInput as string, 300)}`
    );
    this.log(
      `   💡 推理: ${truncate(action.log, 300)}`
    );
  }

  async handleAgentFinish(
    finish: AgentFinish,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(
      `✅ [Agent完成] 最终输出: ${truncate(JSON.stringify(finish.returnValues), 500)}`
    );
  }

  // ========== Chain 生命周期 ==========

  async handleChainStart(
    chain: Serialized,
    _inputs: ChainValues,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(`⛓️  [Chain开始] ${chain.id?.join(" → ") ?? chain.name}`);
  }

  async handleChainEnd(
    _outputs: ChainValues,
    _runId: string,
    _parentRunId?: string
  ) {
    // Chain 结束偏内部，不逐条记录以免日志过多
  }

  async handleChainError(
    err: Error,
    _runId: string,
    _parentRunId?: string
  ) {
    this.log(`❌ [Chain错误] ${err.message}`);
  }

  // ========== 文本输出 ==========

  async handleText(text: string, _runId: string, _parentRunId?: string) {
    if (text.trim()) {
      this.log(`📝 [文本输出] ${truncate(text, 300)}`);
    }
  }
}
