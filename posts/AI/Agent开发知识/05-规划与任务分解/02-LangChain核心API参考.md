# LangChain 核心 API 参考（TypeScript）

> 本文档属于框架/SDK 参考，虽放在 `05-规划与任务分解` 下，但与 `06-多智能体`、`10-框架与工具` 同样相关。
> 所有 API 名称均在你仓库 `demo/langChain_ts_agent/node_modules` 中**实测存在**（langchain `^0.3` / @langchain/core `^0.3`）。
> 对应示例：`src/planningAgent.ts`、`src/multiAgent.ts`、`src/agent.ts`。

---

## 0. 先回答一个问题

**`createToolCallingAgent` 是 LangChain 的标准 SDK API 吗？**

✅ **是，而且是当前（langchain ≥ 0.2）官方推荐构建工具调用 Agent 的标准方式。**

它的"前身/兄弟"们现在的状态：

| API | 状态 | 说明 |
|------|------|------|
| `createToolCallingAgent` | ✅ **现行标准** | 基于 `tool_calls`，适配所有支持 function calling 的模型 |
| `createOpenAIFunctionsAgent` | ⚠️ 旧版（OpenAI 专用） | 仅 OpenAI functions 语义，逐步淘汰 |
| `createStructuredChatAgent` | ⚠️ 旧版 | XML/结构化输出风格 |
| `initializeAgentExecutorWithOptions` | ⚠️ 旧版便捷函数 | 隐藏细节，不推荐新项目用 |
| `ZeroShotAgent` / `XMLAgent` 等类 | ⚠️ 旧版 | 类式写法，已被函数式取代 |

> 你 `planningAgent.ts` / `multiAgent.ts` 用的就是 `createToolCallingAgent` + `AgentExecutor`，正是推荐写法。

---

## 1. 速查表（最重要的 API）

| API | 导入路径 | 作用 | 状态 |
|------|------|------|------|
| `createToolCallingAgent` | `langchain/agents` | 用工具调用模型 + prompt 造 Agent | ✅ 标准 |
| `AgentExecutor` | `langchain/agents` | 驱动 Agent 循环执行（ReAct） | ✅ 标准 |
| `tool` | `@langchain/core/tools` | 把函数包装成工具（带 schema/描述） | ✅ 标准 |
| `StructuredTool` | `@langchain/core/tools` | 类式定义工具 | ✅ 标准 |
| `ChatPromptTemplate` | `@langchain/core/prompts` | 构建聊天提示（系统/人/占位符） | ✅ 标准 |
| `MessagesPlaceholder` | `@langchain/core/prompts` | 占位符，承接 `{chat_history}`/`{agent_scratchpad}` | ✅ 标准 |
| `ChatOpenAI` | `@langchain/openai` | OpenAI 兼容聊天模型（DeepSeek 也用它） | ✅ 标准 |
| `HumanMessage` / `AIMessage` / `SystemMessage` / `ToolMessage` | `@langchain/core/messages` | 消息对象 | ✅ 标准 |
| `BaseCallbackHandler` | `@langchain/core/callbacks/base` | 自定义回调（日志/可观测） | ✅ 标准 |
| `withStructuredOutput` | 聊天模型实例方法 | 让模型按 zod/JSON schema 结构化输出 | ✅ 标准 |
| `Runnable` / `RunnableSequence` 等 | `@langchain/core/runnables` | LCEL 可组合原语（管道） | ✅ 标准 |
| `StringOutputParser` / `StructuredOutputParser` | `@langchain/core/output_parsers` | 输出解析 | ✅ 标准 |

---

## 2. 分组详解

### 2.1 模型层（`@langchain/openai` + `@langchain/core`）
- **`ChatOpenAI`**：`new ChatOpenAI({ model, temperature, apiKey, configuration:{ baseURL } })`。DeepSeek 接口兼容 OpenAI，所以你的 `config.ts` 用它 + `baseURL` 指向 DeepSeek。
- **`withStructuredOutput(schema)`**：返回新 Runnable，调用时直接产出结构化对象（你 `plannerModel`/`supervisorModel` 都在用）。支持的 schema：Zod 对象 或 JSON schema。
- **`invoke(messages, options?)`**：统一调用入口，`options.callbacks`/`options.tags` 用于日志分类。

### 2.2 工具层（`@langchain/core/tools`）
- **`tool(fn, { name, description, schema })`**：最常用，把异步函数包成工具。`schema` 用 Zod 定义入参。你 `tools.ts` 里的 `calculator`、`getCurrentDateTime`、`countWords`、`reverseText` 全是这个。
- **`StructuredTool`**：需要更复杂控制（如 `returnDirect`）时用类式继承。
- **`DynamicTool` / `DynamicStructuredTool`**：运行时动态生成工具。
- **`BaseToolkit`**：把一组工具打包成 toolkit（如向量库 toolkit）。

### 2.3 提示层（`@langchain/core/prompts`）
- **`ChatPromptTemplate.fromMessages([...])`**：传入 `[role, content]` 元组数组，`role` 可为 `"system"|"human"|"ai"|"placeholder"`。
- **`MessagesPlaceholder("{chat_history}")`**：运行时被真实历史替换（你 `ENABLE_EXECUTOR_MEMORY=true` 时用到）。
- **`PromptTemplate`**：非聊天场景的纯文本模板。

### 2.4 消息层（`@langchain/core/messages`）
- **`HumanMessage` / `AIMessage` / `SystemMessage` / `ToolMessage`**：图的 `messages` 状态里流动的就是这些对象。
- 常用工具：`filterMessages`、`trimMessages`、`mergeMessageRuns` —— 控制上下文长度（对应"上下文工程"压缩/淘汰）。
- `m._getType()` 取角色，`m.content` 取内容，`m.name` 给消息打标签（你多 Agent 里用 `name` 区分工人）。

### 2.5 Agents（`langchain/agents`）
- **`createToolCallingAgent({ llm, tools, prompt })`**：造 Agent。返回 Runnable，被 `AgentExecutor` 驱动。
- **`new AgentExecutor({ agent, tools, memory?, verbose? })`**：执行器。负责"思考→调工具→观察→再思考"循环。你两个示例都这么用。
- ⚠️ 注意：`langchain/agents` 里还有一个 **`createReactAgent`**，但那是**旧版**；新项目请用 `langgraph/prebuilt` 里的 `createReactAgent`（见 `03-LangGraph核心API参考.md`）。

### 2.6 可组合层 LCEL（`@langchain/core/runnables`）
- **`RunnableSequence` / `.pipe()`**：把 提示 → 模型 → 解析器 串成链。示例里 `prompt.pipe(model)` 这类写法即 LCEL。
- **`RunnablePassthrough` / `RunnableParallel` / `RunnableLambda` / `RunnableBranch`**：分支、并行、自定义步骤。
- **`RunnableWithMessageHistory`**：给链挂对话历史（比 `BufferWindowMemory` 更 LCEL 化）。

### 2.7 回调 / 可观测（`@langchain/core/callbacks/base`）
- **`BaseCallbackHandler`**：继承后实现 `handleLLMStart/End`、`handleToolStart/End`、`handleChainStart/End` 等钩子。你 `logger.ts` 的 `AgentLogger` 就是它——把每次 LLM/工具调用写进 `logs/`。这是接入 LLMOps 的可观测基础（见 `13-进阶/04-可观测性`）。

### 2.8 输出解析（`@langchain/core/output_parsers`）
- **`StringOutputParser`**：取纯文本。
- **`StructuredOutputParser` / `JsonMarkdownStructuredOutputParser`**：解析结构化输出（旧式；新项目优先用模型的 `withStructuredOutput`）。
- 列表类：`CommaSeparatedListOutputParser` 等。

---

## 3. 与你仓库的对应

| 你代码里的用法 | 对应 API |
|------|------|
| `config.ts` 的 `createDeepSeekModel` | `ChatOpenAI` + `withStructuredOutput` |
| `tools.ts` 的 `calculator` 等 | `tool()` |
| `planningAgent.ts` / `multiAgent.ts` 造 worker | `createToolCallingAgent` + `AgentExecutor` |
| `planner` / `supervisor` 的结构化决策 | `model.withStructuredOutput(z.object(...))` |
| `logger.ts` | `BaseCallbackHandler` |
| 多 Agent 的 `messages` 状态 | `HumanMessage` / `AIMessage` |

---

## 4. 版本与弃用提醒
- langchain ≥ 0.2 后统一走"函数式 + LCEL"，类式 `Agent` 基本退役。
- 选模型用 `ChatOpenAI`（聊天）而非旧的 `OpenAI`（补全）。
- 结构化输出优先 `withStructuredOutput`，而非 `StructuredOutputParser`。

## 5. 参考资料
- LangChain JS 官方文档：`langchain/agents`、`@langchain/core`
- 你仓库 `demo/langChain_ts_agent/src/*.ts`（最贴近你习惯的活例子）
