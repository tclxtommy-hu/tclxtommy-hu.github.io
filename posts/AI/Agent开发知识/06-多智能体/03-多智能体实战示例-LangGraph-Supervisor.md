# 多智能体实战示例：LangGraph Supervisor（TypeScript）

> ⚠️ **本文档是示例代码 `demo/langChain_ts_agent/src/multiAgent.ts` 的配套说明文档。**
> 代码与本文档同步维护；代码以 `demo/.../src/multiAgent.ts` 为准，本文做概念与运行说明。
> 关联阅读：`01-多智能体协作.md`（入门）、`02-多智能体概念体系与学习要点.md`（概念全景+学习路线）。

---

## 1. 这个示例是什么

用 LangGraph + TypeScript 实现的**最小可运行多智能体（MVP）**：一个 **Supervisor（主管）** 协调两名 **Worker（工人）** 协作完成任务。

```
        ┌──────────────── supervisor（主管 / 路由）────────────────┐
        │  用结构化输出决定下一步：math_expert / text_expert / FINISH │
        └───┬──────────────────────┬───────────────────────────────┘
            │                      │
     math_expert（计算/日期）   text_expert（字数/反转）
      calculator + datetime      count_words + reverse_text
            │                      │
            └──── 共享 messages ────┘（消息传递，循环回到 supervisor）
```

这正是 `02` 文档里 **Hub-and-Spoke（中心化）** 拓扑与 **主管(Supervisor) + 工人(Worker)** 角色的落地版。

## 2. 它对应 `02` 里的哪些概念

| `02` 概念 | 本示例的对应实现 |
|------|------|
| 拓扑：Hub-and-Spoke | `supervisor` 为中心节点，分发并汇总 |
| 角色：Supervisor / Worker | `supervisor` 节点 + `math_expert` / `text_expert` 两个 worker |
| 通信：消息传递 | 各节点通过共享 `messages` 状态协作，`formatTranscript` 把对话转给 worker |
| 调度：路由 | `route()` 按 supervisor 的 `next` 决定流向 |
| 终止条件 | `FINISH` 或 `iteration >= MAX_ITER`（防无限循环） |
| 失败模式：无限循环 | `MAX_ITER` 守卫直接规避 |

> 注意：本 MVP 暂未实现"辩论/投票""人在环审核""worker 独立记忆""A2A 跨进程"，这些在文末扩展路线里。

## 3. 如何运行

### 3.1 前置条件
- Node.js（项目用 `tsx` 直接跑 TS，无需编译）
- 已配置 `demo/langChain_ts_agent/.env`（参考 `.env.example`），至少包含：
  ```
  DEEPSEEK_API_KEY=你的key
  DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
  DEEPSEEK_MODEL=deepseek-chat
  ```

### 3.2 安装与启动
```bash
cd demo/langChain_ts_agent
npm install          # 或 yarn
npm run multi       # 等价于 tsx src/multiAgent.ts
```

### 3.3 交互
```
👤 你：帮我算 23 乘以 17，并把结果这句话反转一下
🛠️  [math_expert] 执行中…
   ✅ [math_expert] 23 * 17 = 391
🛠️  [text_expert] 执行中…
   ✅ [text_expert] 反转结果：193 = 71 * 32
🤖 最终回答：
   193 = 71 * 32
──────── 协作轮次：3 ────────
```
输入 `/exit` 退出。每次运行的节点事件与 LLM/工具调用会写入 `demo/langChain_ts_agent/logs/multi-<时间戳>.log`。

## 4. 代码结构解读（对照 `multiAgent.ts`）

| 部分 | 代码位置 | 作用 |
|------|------|------|
| 共享状态 `MultiAgentState` | `Annotation.Root(...)` | `messages`（共享上下文）/ `next`（路由）/ `iteration`（计数） |
| `buildWorkerExecutor` | 函数 | 用 `createToolCallingAgent` + `AgentExecutor` 造工人（与 `planningAgent` 同款） |
| `supervisor` 节点 | 函数 | `withStructuredOutput` 在 `math_expert/text_expert/FINISH` 中选下一个 |
| `runWorker` | 函数 | 把对话转文本喂给工人，结果包成 `AIMessage` 追加回 `messages` |
| `route` | 函数 | `FINISH` 或超轮次 → `END`，否则去对应 worker |
| 图编译 | `new StateGraph(...).compile(...)` | `MemorySaver` 持久化状态，方便后续加人在环 |
| `main` | 函数 | readline 交互入口，注入 `HumanMessage` 启动图 |

**关键点**：worker 之间不是直接对话，而是都写回同一个 `messages` 状态；supervisor 每次都读完整 `messages` 再决策——这就是多 Agent 的"消息传递"本质。

## 5. 一次执行流程走查
1. 用户输入 → 以 `HumanMessage` 注入 `messages`，图从 `START` 到 `supervisor`。
2. `supervisor` 看完整对话，结构化输出 `next`（如 `math_expert`）。
3. 路由到 `math_expert`，它调用工具算完，把结果作为 `AIMessage` 追加回 `messages`。
4. 回到 `supervisor`，再决策；可能派 `text_expert` 处理后续。
5. `supervisor` 判断已完成 → 输出 `FINISH` → 路由到 `END`。
6. 取最后一条 `AIMessage` 作为最终回答输出。

## 6. MVP 范围与扩展路线图（后续逐步扩展）

当前是**刻意做小**的版本，便于先跑通"多 Agent 协作"的主干。后续可依次加：

| 优先级 | 扩展项 | 对应 `02` 概念 | 做法提示 |
|------|------|------|------|
| P0 | **synthesizer 汇总节点** | 汇总/Synthesize | 在 `FINISH` 前加一个汇总 Agent，生成最终回答而非取最后消息 |
| P1 | **人在环审核** | 人在环 / interrupt | 复用 `planningAgent` 的 `interrupt()` + `Command({resume})` |
| P1 | **worker 独立记忆** | 状态/记忆 | 给每个 worker 挂 `BufferWindowMemory` |
| P2 | **更多专家角色** | 角色粒度 | 加 `researcher` / `critic` 等，更新 supervisor 的枚举 |
| P2 | **辩论/投票** | Debate/Voting | 多 worker 对同一问题作答后投票 |
| P3 | **跨进程 A2A** | A2A 协议 | 不同 worker 跑独立进程，用 A2A 通信 |

## 7. 与 `planningAgent` 的对比（同一仓库的两个示例）

| 维度 | `planningAgent`（单 Agent 规划） | `multiAgent`（多 Agent 协作） |
|------|------|------|
| 主体 | 一个 ReAct 执行器 + 规划/重规划节点 | 多个独立 worker + 主管调度 |
| 协作 | 无（同一 Agent 串行跑子任务） | 有（worker 通过 messages 互相看到产出） |
| 适合 | 目标可一次性规划、子任务相对独立 | 需要不同专长分工、结果需先后衔接 |
| 复杂度 | 低 | 高（多一次调度与通信开销） |

> 这也印证了 `02` 里的核心提醒：**先单 Agent，不够再上多 Agent**。两个示例正好覆盖了"纵向深化（规划）"与"横向扩展（协作）"两条路。

## 8. 参考资料
- 本仓库 `demo/langChain_ts_agent/src/planningAgent.ts`（对照示例）
- `06-多智能体/01-多智能体协作.md`、`02-多智能体概念体系与学习要点.md`
- LangGraph 官方文档：Multi-Agent Supervisor（JS/TS）
- Anthropic, "Building Effective Agents"（多 Agent 审慎使用建议）
