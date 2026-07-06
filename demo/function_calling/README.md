# DeepSeek Function Calling 示例

基于 Node.js + TypeScript + DeepSeek API 的 Function Calling 最小可运行示例。

## 什么是 Function Calling

Function Calling 是 LLM 与外部代码交互的唯一编程接口——**让 LLM 决定"什么时候调用哪个函数、传什么参数"**，然后由你的代码实际执行，结果再返还给 LLM 组织回答。

```
用户: "北京今天天气怎么样？"
        ↓
  LLM 决定: 需要调用 get_weather({ city: "北京" })
        ↓
  你的代码: 查询天气数据，返回 { temp: 28, condition: "晴天" }
        ↓
  LLM 组织: "北京今天晴天，温度 28°C"
```

## 内置工具

| 工具 | 功能 | 参数 | 数据来源 |
|------|------|------|----------|
| `get_weather` | 城市天气 | `city: string` | 模拟数据 |
| `get_exchange_rate` | 汇率换算 | `from: string`, `to: string` | 模拟数据 |
| `calculate` | 数学计算 | `expression: string` | 代码执行 |

## 快速开始

### 1. 安装依赖

```bash
yarn install
```

### 2. 配置 API Key

```bash
cp .env.example .env
```

编辑 `.env`，填入 [DeepSeek API Key](https://platform.deepseek.com/api_keys)：

```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. 运行

```bash
yarn start      # 运行示例
yarn dev        # 开发模式（热更新）
```

## 项目结构

```
src/
├── index.ts    # 主入口：DeepSeek 客户端、Function Calling 核心循环、示例对话
└── tools.ts    # 工具定义（JSON Schema）+ 工具执行逻辑
```

## 核心流程

`src/index.ts` 中的 `runConversation()` 实现了完整的多轮循环：

1. 发送用户消息 + 工具列表给 LLM
2. 如果 LLM 返回文本 → 直接输出，结束
3. 如果 LLM 请求调用工具 → 并行执行所有工具，结果返回 LLM
4. 重复步骤 2-3，直到 LLM 生成最终答案或达到最大轮次（5 轮）

## 技术栈

- **Runtime**: Node.js + TypeScript → `tsx` 直接运行
- **LLM SDK**: `openai`（DeepSeek API 完全兼容 OpenAI SDK，只需设置 `baseURL`）
- **源镜像**: `registry.npmmirror.com`（`.yarnrc`）

## 如何添加新工具

在 `src/tools.ts` 中：

1. 在 `TOOLS` 数组中添加工具 Schema（name、description、parameters）
2. 在 `executeTool()` 的 switch 中添加对应执行分支
3. 更新 `ToolName` 类型联合

示例：

```typescript
// 1. Schema
{
  type: "function",
  function: {
    name: "send_email",
    description: "发送邮件",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "收件人邮箱" },
        subject: { type: "string", description: "邮件主题" },
      },
      required: ["to", "subject"],
    },
  },
}

// 2. 执行
case "send_email": {
  const { to, subject } = args as { to: string; subject: string };
  await sendMail(to, subject);
  return `邮件已发送至 ${to}`;
}
```
