# LangGraph 核心 API 参考（TypeScript）

> 本文档属于框架/SDK 参考，虽放在 `05-规划与任务分解` 下，但与 `06-多智能体`、`10-框架与工具` 同样相关。
> 所有 API 名称均在你仓库 `demo/langChain_ts_agent/node_modules` 中**实测存在**（@langchain/langgraph `^0.3.12`）。
> 对应示例：`src/multiAgent.ts`（多 Agent）、`src/planningAgent.ts`（规划+人在环）。

---

## 0. LangGraph 在 Agent 里的定位

LangGraph 是**编排层**：用"图（节点+边）"来表达 Agent 的控制流，比单纯 `AgentExecutor` 循环更适合**多步规划、多 Agent 协作、人在环、状态持久化**。你仓库两个示例都建在它之上。

- `@langchain/langgraph`：核心图引擎（状态、节点、边、检查点、中断）。
- `@langchain/langgraph/prebuilt`：开箱即用的 Agent/工具节点。
- `@langchain/langgraph-supervisor`（**独立包，你仓库未安装**）：多 Agent 主管封装。

---

## 1. 速查表

| API | 导入路径 | 作用 | 状态 |
|------|------|------|------|
| `StateGraph` | `@langchain/langgraph` | 图构建器 | ✅ 核心 |
| `Annotation` / `Annotation.Root` | `@langchain/langgraph` | 定义图状态 schema 与合并规则 | ✅ 核心 |
| `MessagesAnnotation` | `@langchain/langgraph` | 内置"messages + addMessages"状态 | ✅ 核心 |
| `addMessages` | `@langchain/langgraph` | 消息数组合并 reducer | ✅ 核心 |
| `START` / `END` | `@langchain/langgraph` | 图入口/出口虚拟节点 | ✅ 核心 |
| `MemorySaver` | `@langchain/langgraph` | 内存检查点（持久化状态） | ✅ 核心 |
| `Command` | `@langchain/langgraph` | 节点返回值，可 `resume` 恢复中断 | ✅ 核心 |
| `interrupt()` | `@langchain/langgraph` | 暂停图执行、把数据交调用方 | ✅ 核心 |
| `isInterrupted()` / `INTERRUPT` | `@langchain/langgraph` | 检测/读取中断 | ✅ 核心 |
| `createReactAgent` | `@langchain/langgraph/prebuilt` | 标准 ReAct Agent（消息式） | ✅ 推荐 |
| `ToolNode` | `@langchain/langgraph/prebuilt` | 把工具包成图节点 | ✅ 推荐 |
| `ToolExecutor` | `@langchain/langgraph/prebuilt` | 运行单个工具 | ✅ |
| `toolsCondition` | `@langchain/langgraph/prebuilt` | 根据有无 tool_calls 路由 | ✅ 推荐 |
| `withAgentName` | `@langchain/langgraph/prebuilt` | 给消息加 Agent 名标签 | ✅ |
| `createSupervisor` | `@langchain/langgraph-supervisor`（未装） | 一行造多 Agent 主管 | ⚪ 可选包 |

---

## 2. 图与状态（最核心的一组）

### 2.1 `StateGraph` + `Annotation`
```ts
import { StateGraph, Annotation, START, END, addMessages } from "@langchain/langgraph";

const State = Annotation.Root({
  messages: Annotation<any[]>({ reducer: addMessages, default: () => [] }),
  next:     Annotation<string>({ reducer: (a, b) => (b === undefined ? a : b), default: () => "" }),
});

const graph = new StateGraph(State)
  .addNode("supervisor", supervisorFn)
  .addNode("worker", workerFn)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", routeFn, { worker: "worker", FINISH: END })
  .addEdge("worker", "supervisor")
  .compile({ checkpointer: new MemorySaver() });
```
- **`Annotation.Root({...})`**：每个字段声明 `reducer`（多节点写同一字段时如何合并）和 `default`。
- **`reducer` 是关键**：`messages` 用 `addMessages` 追加；标量字段常用 `(a,b)=> b===undefined?a:b` 让"写了才覆盖"。
- **`addNode` / `addEdge` / `addConditionalEdges`**：加节点、固定边、条件边（路由函数返回值映射到目标节点或 `END`）。

### 2.2 `MessagesAnnotation`（简化版）
如果你只需要"共享消息"，可用内置注解，省去手写 `Annotation`：
```ts
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", ...)
  .addEdge(START, "agent"); // 所有 StateGraph 入口都是 START（值 "__start__"）
```
> 你 `multiAgent.ts` 用的是自定义 `Annotation`（带 `next`/`iteration`），更直观；`MessagesAnnotation` 适合纯消息流场景。

### 2.3 节点函数签名
- 普通节点：`(state) => PartialState | Command`
- 返回对象会按 `reducer` 合并进全局状态。
- 返回 `new Command({ goto: "node", update: {...} })` 可同时"写状态 + 指定下一步"（高级用法）。

---

## 3. 检查点（`MemorySaver`）
- **`compile({ checkpointer: new MemorySaver() })`**：让图状态可持久化、可恢复。
- 调用时传入 `config = { configurable: { thread_id } }`，同一 `thread_id` 能续跑（多轮对话、断点续跑）。
- 生产可换 `SqliteSaver` / `RedisSaver`（持久化到库）。
- **为何需要**：`interrupt()` 暂停/恢复、跨轮次保留 `messages`，都依赖检查点。

---

## 4. 人在环控制（`Command` + `interrupt`）
这组 API 是你 `planningAgent.ts` 实现"规划后暂停等人确认"的核心：
```ts
import { interrupt, isInterrupted, INTERRUPT, Command } from "@langchain/langgraph";

async function humanReview(state) {
  const decision = interrupt({ plan: state.plan }); // 暂停，把 plan 交给调用方
  return { humanApproved: decision.approved };
}

// 调用方：
let res = await graph.invoke({ goal }, config);   // 跑到 interrupt 暂停
while (isInterrupted(res)) {
  const iv = res[INTERRUPT][0].value;             // 拿到暂停时交出的数据
  const decision = await askUser();               // 收集人工决策
  res = await graph.invoke(new Command({ resume: decision }), config); // 恢复
}
```
- **`interrupt(value)`**：在节点内调用，立刻暂停图，把 `value` 交出去；恢复后函数从 `interrupt()` 处"返回" `decision`。
- ⚠️ **陷阱**：`interrupt()` 之后的代码在恢复时才执行；`interrupt()` 之前的代码在首次进入和每次恢复都会重跑——所以展示类逻辑要放在调用方（`isInterrupted` 分支里）。
- **`Command({ resume })`**：恢复图时把人工决策喂回 `interrupt()`。

---

## 5. prebuilt 开箱件（`@langchain/langgraph/prebuilt`）
- **`createReactAgent({ llm, tools })`**：返回编译好的 ReAct Agent（消息式，原生吃 `messages` 状态）。比 `langchain/agents` 旧版 `createReactAgent` 更现代。
- **`ToolNode(tools)`**：把一组 `tool` 包成图节点，自动执行 `tool_calls`。
- **`toolsCondition`**：路由函数——有 `tool_calls` 就走 `ToolNode`，否则走结束。标准 ReAct 循环的"思考/行动"分流器。
- **`ToolExecutor`**：单次运行一个工具（更细粒度控制时用）。
- **`withAgentName`**：给消息加 `name`，多 Agent 场景下区分是谁说的（你 `multiAgent.ts` 里手动给 `AIMessage` 加 `name` 也是这个目的）。

---

## 6. 多 Agent 主管封装（可选：`@langchain/langgraph-supervisor`）
> ⚠️ **你仓库目前未安装此包**（`npm i @langchain/langgraph-supervisor` 即可）。

```ts
import { createSupervisor } from "@langchain/langgraph-supervisor";
const supervisor = createSupervisor({
  agents: [mathAgent, textAgent],
  llm,
  prompt: "你管理 mathAgent 和 textAgent...",
}).compile();
```
- `createSupervisor` 一行搭出你 `multiAgent.ts` 手写的"主管+工人"结构——本质就是 `StateGraph` + supervisor 路由 + handoff 的语法糖。
- 学习建议：**先用手写 `StateGraph` 版（你已有）理解原理，再用 `createSupervisor` 提效**。

---

## 7. 与你仓库的对应

| 你代码里的用法 | 对应 API |
|------|------|
| `new StateGraph(MultiAgentState).addNode(...).addEdge(...).compile(...)` | `StateGraph` 全套 |
| `Annotation.Root({ messages:{reducer:addMessages}, next, iteration })` | `Annotation` + `addMessages` |
| `.compile({ checkpointer: new MemorySaver() })` | `MemorySaver` |
| `planningAgent` 的 `interrupt()` + `Command({resume})` | `interrupt` / `Command` |
| 多 Agent 的 `route()` + `addConditionalEdges` | 条件路由 |
| 手动给 `AIMessage({ name })` | 等价于 `withAgentName` |
| （未来）`createSupervisor` | `@langchain/langgraph-supervisor` |

---

## 8. 学习路线建议
1. 先懂 `StateGraph` + `Annotation` + `addNode/addEdge`（静态图）。
2. 再学 `addConditionalEdges` + 路由函数（动态流）。
3. 学 `MemorySaver` + `thread_id`（状态持久化）。
4. 学 `interrupt` + `Command`（人在环）。
5. 最后看 `prebuilt`（`createReactAgent`/`ToolNode`/`toolsCondition`）和 `createSupervisor`（多 Agent 速成）。

## 9. 参考资料
- LangGraph JS 官方文档：`StateGraph`、`Human-in-the-loop`、`Multi-agent supervisor`
- 你仓库 `demo/langChain_ts_agent/src/multiAgent.ts`、`src/planningAgent.ts`
