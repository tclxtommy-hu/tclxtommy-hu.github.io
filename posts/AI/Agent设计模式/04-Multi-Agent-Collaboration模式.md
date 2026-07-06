# Multi-Agent Collaboration（多智能体协作）模式

## 概述

Multi-Agent Collaboration 模式将复杂任务分配给**多个专业化的 Agent**，每个 Agent 有自己的角色、能力和职责。Agent 之间通过**对话、消息传递或共享记忆**进行协作，共同完成单个 Agent 难以独立解决的任务。

## 原理

```
┌─────────────────────────────────────────────────────────────┐
│                  Multi-Agent 系统架构                         │
│                                                              │
│                    ┌─────────────┐                           │
│                    │ Orchestrator│  ← 协调/编排               │
│                    │   (编排器)   │                           │
│                    └──┬───┬───┬──┘                           │
│                       │   │   │                              │
│              ┌────────┘   │   └────────┐                     │
│              ▼            ▼            ▼                     │
│        ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│        │ Agent A  │ │ Agent B  │ │ Agent C  │              │
│        │ 角色: 研究员│ │ 角色: 编码员│ │ 角色: 审查员│              │
│        └──────────┘ └──────────┘ └──────────┘              │
│              │            │            │                     │
│              └────────────┼────────────┘                     │
│                           ▼                                  │
│                    ┌─────────────┐                           │
│                    │ Shared      │  ← 共享上下文              │
│                    │ Memory      │                           │
│                    └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

两种主流协作模式：

### 1. 对话式协作（Conversational）
Agent 之间通过自然语言对话进行交互，类似团队讨论

### 2. 编排式协作（Orchestrated）
一个中心化的 Orchestrator 分配任务、收集结果、做出决策

## 使用场景

- **软件开发生命周期**：需求分析 → 架构设计 → 编码 → 测试 → Code Review
- **内容创作流水线**：选题策划 → 素材收集 → 撰写 → 配图 → 审核发布
- **复杂决策**：多个角度（技术、商业、合规）分析同一问题
- **角色扮演/辩论**：让不同立场 Agent 辩论以探索问题全貌
- **数据处理流水线**：数据采集 Agent → 清洗 Agent → 分析 Agent → 报告 Agent
- **客户服务升级**：初级客服 → 专家客服 → 主管逐级升级

## 示例代码

```python
from enum import Enum
from typing import List, Dict, Any, Optional
from queue import Queue
import threading
import json


class MessageType(Enum):
    TASK = "task"
    RESULT = "result"
    QUESTION = "question"
    REVIEW = "review"


class Message:
    """Agent 间通信消息"""
    def __init__(self, sender: str, receiver: str,
                 msg_type: MessageType, content: str):
        self.sender = sender
        self.receiver = receiver
        self.msg_type = msg_type
        self.content = content


class BaseAgent:
    """Agent 基类"""
    def __init__(self, name: str, role: str, llm, tools: Dict = None):
        self.name = name
        self.role = role
        self.llm = llm
        self.tools = tools or {}
        self.memory: List[Message] = []

    def receive(self, message: Message):
        """接收消息"""
        self.memory.append(message)

    def act(self) -> Optional[Message]:
        """执行行动，子类实现"""
        raise NotImplementedError

    @property
    def system_prompt(self) -> str:
        return f"你是 {self.name}，角色是 {self.role}。"


# ========== 预定义专业 Agent ==========

class ResearcherAgent(BaseAgent):
    """研究员 Agent：负责信息搜索和分析"""
    def act(self) -> Optional[Message]:
        if not self.memory:
            return None

        last_msg = self.memory[-1]

        prompt = f"""{self.system_prompt}
你需要研究以下问题，收集相关信息并整理成结构化报告。

用户问题：{last_msg.content}

请使用搜索工具收集信息，然后生成研究报告。
"""
        result = self.llm.generate(prompt)
        return Message(
            sender=self.name,
            receiver="Orchestrator",
            msg_type=MessageType.RESULT,
            content=result
        )


class CoderAgent(BaseAgent):
    """编码 Agent：负责代码编写"""
    def act(self) -> Optional[Message]:
        if not self.memory:
            return None

        # 获取来自 Orchestrator 的任务和研究结果
        context = "\n---\n".join([m.content for m in self.memory])

        prompt = f"""{self.system_prompt}
你是一名资深软件工程师。根据以下需求和上下文，编写高质量代码。

上下文：
{context}

要求：
- 代码包含完整的类型注解和 docstring
- 处理边界条件和异常
- 编写清晰的注释
- 只输出代码，不要额外说明
"""
        result = self.llm.generate(prompt)
        return Message(
            sender=self.name,
            receiver="Orchestrator",
            msg_type=MessageType.RESULT,
            content=result
        )


class ReviewerAgent(BaseAgent):
    """审查员 Agent：负责代码审查和质量检查"""
    def act(self) -> Optional[Message]:
        if not self.memory:
            return None

        last_msg = self.memory[-1]

        prompt = f"""{self.system_prompt}
你是一名严格的代码审查员。审查以下代码，给出评审意见。

代码：
{last_msg.content}

请从以下维度评审：
1. 正确性：逻辑是否正确
2. 可读性：命名、注释、结构
3. 性能：时间和空间复杂度
4. 安全性：是否存在漏洞
5. 测试：是否容易测试

以 JSON 格式返回评审结果，包含 score (0-100) 和 issues 列表。
"""
        result = self.llm.generate(prompt)
        return Message(
            sender=self.name,
            receiver="Orchestrator",
            msg_type=MessageType.REVIEW,
            content=result
        )


class Orchestrator:
    """编排器：协调多个 Agent 协作完成任务"""

    def __init__(self, llm):
        self.llm = llm
        self.agents: Dict[str, BaseAgent] = {}

    def register(self, agent: BaseAgent):
        """注册 Agent"""
        self.agents[agent.name] = agent

    def run(self, task: str) -> str:
        """
        编排多 Agent 协作执行任务
        """
        # Step 1: 分析任务，制定协作计划
        plan = self._plan(task)
        print(f"[Orchestrator] 制定协作计划：")
        for p in plan:
            print(f"  {p['agent']} → {p['action']}")

        # Step 2: 按计划执行
        results = {}
        for step in plan:
            agent_name = step["agent"]
            action = step["action"]

            if agent_name not in self.agents:
                print(f"  [Error] 未找到 Agent: {agent_name}")
                continue

            agent = self.agents[agent_name]

            # 发送任务
            context_msg = self._build_context(results, step)
            task_msg = Message(
                sender="Orchestrator",
                receiver=agent_name,
                msg_type=MessageType.TASK,
                content=context_msg
            )
            agent.receive(task_msg)

            # Agent 执行
            print(f"  [{agent_name}] 执行中...")
            result = agent.act()

            if result:
                results[agent_name] = result.content
                print(f"  [{agent_name}] 完成")

        # Step 3: 汇总最终结果
        return self._summarize(task, results)

    def _plan(self, task: str) -> List[Dict]:
        """制定多 Agent 协作计划"""
        agents_desc = "\n".join([
            f"- {name}: {agent.role}"
            for name, agent in self.agents.items()
        ])

        prompt = f"""可用 Agent：
{agents_desc}

用户任务：{task}

制定这些 Agent 的协作计划。以 JSON 数组格式返回：
[
  {{"agent": "Agent名", "action": "要执行的操作"}},
  ...
]

确保 Agent 的执行顺序合理，充分利用各自的专长。
"""
        response = self.llm.generate(prompt)
        return json.loads(response)

    def _build_context(self, results: Dict, step: Dict) -> str:
        """为当前步骤构建上下文"""
        parts = [f"任务：{step['action']}"]

        if results:
            parts.append("\n前置结果：")
            for agent_name, content in results.items():
                parts.append(f"\n[{agent_name}] 的输出：\n{content[:500]}...")

        return "\n".join(parts)

    def _summarize(self, task: str, results: Dict) -> str:
        """汇总各 Agent 结果"""
        prompt = f"""原始任务：{task}

各 Agent 的执行结果：
{json.dumps(results, ensure_ascii=False, indent=2)}

请整合以上结果，生成最终答案。
"""
        return self.llm.generate(prompt)


# ========== 使用示例：软件开发任务 ==========

# 创建协作系统
orchestrator = Orchestrator(llm=YourLLM())

# 注册专业化 Agent
orchestrator.register(ResearcherAgent(
    name="Alice",
    role="技术研究员",
    llm=YourLLM(),
    tools={"search": search_function}
))
orchestrator.register(CoderAgent(
    name="Bob",
    role="高级后端工程师",
    llm=YourLLM()
))
orchestrator.register(ReviewerAgent(
    name="Charlie",
    role="代码审查专家",
    llm=YourLLM()
))

# 执行任务
result = orchestrator.run(
    "实现一个基于 Redis 的分布式锁，包含自动续期和可重入特性"
)
print("\n" + "=" * 50)
print(result)
```

## 对话式协作示例

```python
class ConversationCollaboration:
    """对话式多 Agent 协作"""

    def __init__(self, agents: List[BaseAgent], max_rounds: int = 5):
        self.agents = agents
        self.max_rounds = max_rounds
        self.chat_history: List[Message] = []

    def discuss(self, topic: str) -> str:
        """发起 Agent 间讨论"""
        # 初始消息
        initial_msg = Message(
            sender="User",
            receiver="all",
            msg_type=MessageType.QUESTION,
            content=topic
        )
        self.chat_history.append(initial_msg)

        for round_num in range(self.max_rounds):
            print(f"\n--- 第 {round_num + 1} 轮讨论 ---")

            for agent in self.agents:
                # 构建当前 agent 的对话上下文
                context = self._build_conversation_context(agent.name)

                prompt = f"""{agent.system_prompt}

你正在参与一个团队讨论。以下是对话历史：

{context}

请发表你的观点。你可以：
- 补充之前发言人遗漏的信息
- 质疑或挑战其他观点
- 提出新的角度
- 综合各方观点形成共识

只回复你的发言，不要模仿其他人的格式。
"""
                response = agent.llm.generate(prompt)

                msg = Message(
                    sender=agent.name,
                    receiver="all",
                    msg_type=MessageType.RESULT,
                    content=response
                )
                self.chat_history.append(msg)
                print(f"  [{agent.name}]: {response[:100]}...")

        # 汇总结论
        return self._build_conclusion(topic)

    def _build_conversation_context(self, current_agent: str) -> str:
        """构建当前 agent 可见的对话上下文"""
        context = []
        for msg in self.chat_history:
            if msg.sender == current_agent:
                continue
            context.append(f"[{msg.sender}]: {msg.content}")
        return "\n\n".join(context)

    def _build_conclusion(self, topic: str) -> str:
        """汇总讨论结论"""
        history_text = "\n".join([
            f"[{msg.sender}]: {msg.content[:200]}..."
            for msg in self.chat_history
        ])

        prompt = f"""原始问题：{topic}

讨论记录：
{history_text}

请综合各方观点，给出最终结论和建议。
"""
        return self.agents[0].llm.generate(prompt)
```

## 常见协作拓扑

```
1. 流水线 (Pipeline)        2. 星型 (Star)          3. 网状 (Mesh)
   A → B → C → D             Orchestrator            A ↔ B
                              /  |  \                ↕   ↕
                             A   B   C               C ↔ D

4. 层级 (Hierarchical)      5. 辩论 (Debate)
   Manager                   Proponent ↔ Opponent
   /      \                       ↘   ↙
  TeamA   TeamB                   Judge
```

## 优点与局限

| 优点 | 局限 |
|------|------|
| 每个 Agent 专注于特定领域，专业性强 | LLM 调用次数大幅增加，成本高 |
| 任务可分解、可并行 | Agent 间可能出现冲突或信息冗余 |
| 天然支持角色分离和权限控制 | 编排策略依赖 prompt 质量 |
| 可扩展，新增 Agent 即可扩展能力 | 上下文在 Agent 间传递可能丢失信息 |
| 模拟真实团队协作流程 | 调试和追踪复杂度高 |

## 框架参考

业界主流多 Agent 框架：
- **AutoGen**（Microsoft）：对话式多 Agent 框架
- **CrewAI**：基于角色的 Agent 编排
- **LangGraph**（LangChain）：状态图驱动的多 Agent 系统
- **MetaGPT**：模拟软件公司的多 Agent 协作
