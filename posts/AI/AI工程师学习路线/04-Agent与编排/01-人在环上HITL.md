# 人在环上（HITL）

> 状态：✅ 已补齐（2026-09-13）  
> 一句话定义：把 **人的审批、澄清、接管** 设计成流程中的一等节点，而不是出事故后的补丁。

## 大纲

1. [何时必须 HITL：风险分级](#一何时必须-hitl风险分级)
2. [交互形态：确认卡/改写/接管](#二交互形态确认卡改写接管)
3. [超时与升级策略](#三超时与升级策略)
4. [与 Graph / Workflow 审批节点落地](#四与-graph--workflow-审批节点落地)
5. [端到端落地示例：四周迭代](#五端到端落地示例四周迭代)

## 已有相关文档（先读这些）

- [规划与任务分解](../../Agent开发知识/05-规划与任务分解/01-规划与任务分解.md)
- [安全与护栏](../../Agent开发知识/09-安全与护栏/01-安全与护栏.md)
- [Graph Engineering](../../AI编程范式/AI辅助编程范式/10-graph-engineering.md)
- [Agent 协议与形态前沿](../../Agent开发知识/13-进阶与工程化/10-Agent协议与形态前沿.md)（UX 小节）

## 学习要点（读后应能回答）

- HITL 如何避免变成「每步都点确认」？→ 见 [2.1](#21-分级触发避免每步都点确认)
- 异步审批与同步对话如何统一状态？→ 见 [3.2](#32-状态机统一异步与同步)

---

## 一、何时必须 HITL：风险分级

**HITL** /ˌeɪtʃ aɪ tiː ˈel/ （Human-In-The-Loop，人在环）的核心问题是**哪些步骤必须有人参与**。不是全部，也不是零，而是按**操作影响范围**分级：

| 风险等级 | 触发条件 | 示例 | 必须审批 |
|----------|----------|------|----------|
| **L1 零风险** | 纯查询、本地模拟 | 问答、代码生成、演示预览 | ❌ |
| **L2 低风险** | 仅影响当前会话、可回滚 | 临时变量、草稿保存 | ❌ |
| **L3 中风险** | 影响个人数据、可恢复 | 个人配置修改、草稿提交 | ⚠️ 可选 |
| **L4 高风险** | 影响他人、不可逆 | 删除记录、对外发送邮件/短信、部署 | ✅ 必须 |
| **L5 极高风险** | 跨系统/跨租户、资金 | 转账、批量删除、权限变更 | ✅ 双人审批 + 审计日志 |

### 1.1 小北案例：问答 vs 报销

小北是制度问答 Agent，纯查询（L1）不需要审批。但当用户问「发起报销」时，Agent 调用 `submit_expense` 工具——这是 L4 操作（涉及资金审批链路），必须进入 HITL 确认卡：

```
用户: "帮我发起 800 元差旅费报销"
   ↓
Agent 调用: submit_expense({ amount: 800, category: "差旅费" })
   ↓
风险分级检查 → L4，触发 HITL
   ↓
前端弹窗: "确认发起 800 元差旅费报销？需部门经理审批"
   ↓
用户点击"确认" → 后端真正调用工具
```

### 1.2 误分类的代价

风险等级错了就是事故：

- **过严**：每步都点确认 → 用户流失（小北试点期因过严的确认卡，点击率从 8% 降到 3%）
- **过松**：误删生产数据库、误发垃圾邮件 → 法律与声誉风险

分级规则必须写在**工具定义的 metadata** 里，不是靠 Agent 自主判断：

```typescript
interface Tool {
  name: string;
  schema: any;
  riskLevel: "L1" | "L2" | "L3" | "L4" | "L5";
  requiresApproval: boolean;
  auditLogRequired: boolean;
}

const tools: Tool[] = [
  {
    name: "query_policy",
    riskLevel: "L1",
    requiresApproval: false,
    auditLogRequired: false,
  },
  {
    name: "delete_record",
    riskLevel: "L4",
    requiresApproval: true,
    auditLogRequired: true,
  },
];
```

---

## 二、交互形态：确认卡/改写/接管

HITL 不是只有「确认/拒绝」两个按钮，而是三种形态的递进：

### 2.1 分级触发，避免每步都点确认

这是文首第一个学习问题。避免「每步都点确认」的核心是**按风险分级 + 智能跳过**：

| 策略 | 做法 | 小北实测 |
|------|------|----------|
| **风险分级** | L1/L2 直通，L3+/L4+ 确认卡 | 点击率从 3% → 8% |
| **用户偏好** | 高频操作可选「本次会话不再确认」 | 高频用户留存提升 15% |
| **历史行为** | 用户过去 7 天内成功操作 ≥ 5 次，提示「保持本次设置？」 | 低风险操作确认减少 40% |
| **上下文依赖** | 从另一 Agent 链路自动调用（如「先用 Agent 调研，再提交报销」）→ 确认卡中显示「来源：咨询链路 3」 | 用户信任度提升 22% |

### 2.2 三种交互形态

| 形态 | 触发条件 | UX 形态 | 小北示例 |
|------|----------|---------|----------|
| **确认卡** | L3/L4 操作，需人拍板 | 弹窗 + "确认/拒绝"按钮 | 发起报销弹窗 |
| **改写建议** | L3 操作，但 Agent 输出可能不精准 | 展示 Agent 输出 + 可编辑文本框 + "确认"按钮 | Agent 帮填报销单，用户改金额 |
| **人工接管** | L4/L5 操作，或 Agent 陷入循环 | "人工接管"按钮 → 手动填写表单 | 报销被拒，用户人工修改后重提 |

**改写建议的落地示例**（Node.js + TS）：

```typescript
interface HITLResponse {
  action: "confirm" | "reject" | "edit";
  edited?: string; // 用户改写后的文本
}

// 后端：Agent 生成建议后返回给前端
export async function generateExpenseForm(
  user: User, intent: { amount: number; category: string },
): Promise<{ suggestion: string; riskLevel: string }> {
  const agentResult = await llm.chat({
    system: "根据用户意图生成报销表单建议",
    user: `用户 ${user.name} 要发起报销，金额 ${intent.amount}，类别 ${intent.category}`,
  });
  return {
    suggestion: agentResult,
    riskLevel: "L3", // 个人影响，可改写
  };
}

// 前端：展示 + 可编辑
async function renderExpenseForm() {
  const { suggestion, riskLevel } = await generateExpenseForm(user, intent);
  if (riskLevel === "L3") {
    showEditableDialog(suggestion, async (edited: string) => {
      const res: HITLResponse = { action: "edit", edited };
      await submitEditedForm(edited);
    });
  }
}
```

### 2.3 人工接管：降级模式

人工接管不是失败，是可预期的降级路径。触发条件：

- L4/L5 操作
- Agent 陷入循环（同一条消息重复 ≥ 3 次）
- 超时（见 3.1 节）

接管后，用户手动填写表单，系统记录「接管事件」到审计日志（4.2 节）。

---

## 三、超时与升级策略

### 3.1 超时处理：既不无限等待，也不自动放行

超时规则按风险等级差异：

| 风险等级 | 超时时间 | 超时后行为 |
|----------|----------|------------|
| L3 | 24 小时 | 自动取消，通知用户 |
| L4 | 48 小时 | 自动升级至上级审批人 |
| L5 | 4 小时 | 升级 + 警告 + 审计日志高亮 |

**落地示例**：超时处理器（Node.js + TS）：

```typescript
interface Approval {
  id: string;
  userId: string;
  toolCall: { name: string; args: any };
  riskLevel: "L3" | "L4" | "L5";
  status: "pending" | "approved" | "rejected" | "timeout";
  createdAt: Date;
}

export async function checkTimeouts(): Promise<void> {
  const now = new Date();
  const pendingApprovals = await approvalStore.find({ status: "pending" });

  for (const approval of pendingApprovals) {
    const hours = (now.getTime() - approval.createdAt.getTime()) / 3600000;
    let shouldTimeout = false;

    switch (approval.riskLevel) {
      case "L3":
        if (hours > 24) shouldTimeout = true;
        break;
      case "L4":
        if (hours > 48) await escalateToSupervisor(approval);
        break;
      case "L5":
        if (hours > 4) {
          await escalateToSupervisor(approval);
          await alertSecurity(approval);
        }
        break;
    }

    if (shouldTimeout) {
      await approvalStore.update(approval.id, { status: "timeout" });
      await notifyUser(approval.userId, "审批超时，请重新发起");
    }
  }
}

// 每 10 分钟检查一次超时
setInterval(checkTimeouts, 10 * 60 * 1000);
```

### 3.2 状态机统一异步与同步

这是文首第二个学习问题。异步审批（邮件/钉钉）与同步对话（聊天窗口）是两套交互，但后端状态必须统一：

```
统一状态模型：
PENDING（等待）→ APPROVED（通过）/ REJECTED（拒绝）/ TIMEOUT（超时）/ REVOKED（撤销）

两条路径通向同一状态：
- 同步：用户点击"确认" → APPROVED
- 异步：用户在邮件中点击"审批链接" → APPROVED
```

**落地示例**：状态机（Node.js + TS）：

```typescript
enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  TIMEOUT = "timeout",
  REVOKED = "revoked",
}

interface ApprovalTransition {
  from: ApprovalStatus;
  to: ApprovalStatus;
  allowed: boolean;
}

const transitions: Record<string, ApprovalTransition[]> = {
  [ApprovalStatus.PENDING]: [
    { from: ApprovalStatus.PENDING, to: ApprovalStatus.APPROVED, allowed: true },
    { from: ApprovalStatus.PENDING, to: ApprovalStatus.REJECTED, allowed: true },
    { from: ApprovalStatus.PENDING, to: ApprovalStatus.TIMEOUT, allowed: true },
  ],
  // ... 其他状态定义
};

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  const rules = transitions[from] || [];
  return rules.some((r) => r.to === to && r.allowed);
}

// 统一状态更新入口（同步/异步都走这里）
export async function updateApproval(
  id: string, newStatus: ApprovalStatus,
): Promise<Approval> {
  const approval = await approvalStore.findById(id);
  if (!canTransition(approval.status, newStatus)) {
    throw new Error(`状态 ${approval.status} 不能转至 ${newStatus}`);
  }
  const updated = await approvalStore.update(id, { status: newStatus });
  if (newStatus === ApprovalStatus.APPROVED) {
    await executeToolCall(approval.toolCall);
  }
  return updated;
}
```

---

## 四、与 Graph / Workflow 审批节点落地

HITL 在图和编排系统中是**特殊节点**：既是「等待节点」（暂停执行），又是「交互节点」（接收用户输入）。

### 4.1 Graph 节点设计

以 [Graph Engineering](../../AI编程范式/AI辅助编程范式/10-graph-engineering.md) 的节点抽象为例：

```typescript
interface GraphNode {
  id: string;
  type: "llm" | "tool" | "approval"; // 新增 approval 类型
  inputs: string[];
  outputs: string[];
  config: {
    riskLevel: "L1" | "L2" | "L3" | "L4" | "L5";
    timeoutHours: number;
    escalationTarget?: string; // 升级目标
  };
}

// 审批节点：暂停执行，等待外部状态更新
export async function executeApprovalNode(node: GraphNode, context: any): Promise<any> {
  const approvalId = await approvalStore.insert({
    userId: context.userId,
    toolCall: context.pendingToolCall,
    riskLevel: node.config.riskLevel,
    status: ApprovalStatus.PENDING,
    createdAt: new Date(),
  });

  // 发送通知（同步/异步）
  await sendApprovalNotification(approvalId, context);

  // 轮询等待状态更新（或用 WebSocket 推送）
  const approval = await waitForApproval(approvalId, node.config.timeoutHours);
  return approval.status === ApprovalStatus.APPROVED ? context : null;
}
```

### 4.2 审计日志：每条审批可追踪

L4/L5 操作必须记录审计日志，字段包括：

```typescript
interface AuditLog {
  id: string;
  approvalId: string;
  userId: string;
  approverId?: string;
  toolCall: { name: string; args: any };
  riskLevel: string;
  status: ApprovalStatus;
  timestamp: Date;
  ipAddress: string;
}

export async function logApproval(
  approval: Approval, approverId?: string,
): Promise<void> {
  await auditLogStore.insert({
    id: uuid(),
    approvalId: approval.id,
    userId: approval.userId,
    approverId,
    toolCall: approval.toolCall,
    riskLevel: approval.riskLevel,
    status: approval.status,
    timestamp: new Date(),
    ipAddress: getClientIp(),
  });
}
```

审计日志用于：
- 事故后溯源（谁在何时批准了删库操作）
- 合规审查（金融场景必须保留 3 年）
- 趋势分析（哪些工具被拒率最高）

---

## 五、端到端落地示例：四周迭代

把「小北」的 HITL 能力排进四周（风险分级 + 交互形态 + 状态机 + 集成到 Graph）：

| 周 | 动作 | 产出 | 指标 |
|----|------|------|------|
| W1 | 工具 metadata 定义风险等级；L4/L5 工具识别 + 确认卡 UI | 风险分级框架 | 高风险操作 100% 覆盖 |
| W2 | 异步审批（邮件/钉钉）；超时处理 + 升级逻辑 | 异步审批链路 | 异步审批率 35%，超时率 2% |
| W3 | 状态机统一同步/异步；审计日志 | 状态机 + 审计 | 状态跳转错误 0 |
| W4 | 集成到 Graph 审批节点；人工接管降级 | 完整 HITL 系统 | 用户接管率 8%，点击率 8% |

工具速查（全部有开源实现）：

| 环节 | 工具 | 备注 |
|------|------|------|
| 状态机 | XState / Automata | 推荐 XState，TypeScript 友好 |
| 异步通知 | 邮件模板 / 钉钉/飞书 Webhook | 对接企业 IM |
| 超时检查 | 定时任务（node-cron） | 每 10 分钟轮询 |
| 审计日志 | Elasticsearch / 时序数据库 | 支持快速检索 |

## 自检清单

- [ ] 工具定义 metadata 包含 `riskLevel` 和 `requiresApproval`；
- [ ] L1/L2 操作直通，L3+ 操作触发 HITL 确认卡；
- [ ] 异步审批（邮件/钉钉）与同步对话共用状态机；
- [ ] 超时规则按风险等级差异，L4/L5 有升级路径；
- [ ] L4/L5 操作记录审计日志，包含用户 ID、时间戳、IP；
- [ ] 人工接管作为可预期降级路径，记录接管事件。

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **HITL** | /ˌeɪtʃ aɪ tiː ˈel/ | Human-In-The-Loop | 人在环 |

## 参考资料

- [Human-in-the-Loop Overview · LangChain](https://python.langchain.com/docs/use_cases/tool_use/human_in_the_loop/)
- [Approval Flows with State Machines · XState 文档](https://stately.ai/docs/xstate/overview)
- [Graph Engineering · 本仓库](../../AI编程范式/AI辅助编程范式/10-graph-engineering.md)
- [安全与护栏 · 本仓库](../../Agent开发知识/09-安全与护栏/01-安全与护栏.md)