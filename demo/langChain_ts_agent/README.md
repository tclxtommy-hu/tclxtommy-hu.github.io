# LangChain TypeScript Agent（DeepSeek）

基于 **LangChain.js** + **TypeScript** 的标准 Agent 项目，使用 **DeepSeek** 作为 LLM。

## 项目结构

```
langChain_ts_agent/
├── src/
│   ├── config.ts      # DeepSeek 模型配置（ChatOpenAI 适配）
│   ├── tools.ts       # Agent 工具集（日期、计算器、文本处理）
│   ├── chat.ts        # 基础多轮对话示例
│   ├── agent.ts       # Agent + 工具调用示例
│   └── index.ts       # 入口文件
├── .env.example       # 环境变量模板
├── tsconfig.json
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

复制 `.env.example` 文件为 `.env` 文件：

编辑 `.env` 文件，填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys)：

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

### 3. 运行

```bash
npm run chat    # 基础多轮对话
npm run agent   # Agent + 工具调用
```

## 核心概念

| 概念 | 文件 | 说明 |
|------|------|------|
| **ChatModel** | `config.ts` | 通过 `@langchain/openai` 适配 DeepSeek（兼容 OpenAI 接口） |
| **Tool** | `tools.ts` | 用 `tool()` + `zod` 定义可调用工具 |
| **Agent** | `agent.ts` | `createToolCallingAgent` 创建具备推理+工具调用能力的 Agent |
| **AgentExecutor** | `agent.ts` | Agent 执行循环，管理推理→调用→观察→输出 |

## 内置工具

| 工具 | 功能 |
|------|------|
| `get_current_datetime` | 获取当前日期、时间、星期 |
| `calculator` | 安全数学表达式计算 |
| `count_words` | 统计文本字符数和词数 |
| `reverse_text` | 反转文本字符串 |

## 技术栈

- **运行时**: Node.js + TypeScript
- **框架**: LangChain.js v0.3
- **模型**: DeepSeek（通过 OpenAI 兼容接口）
- **工具校验**: Zod
- **开发工具**: tsx（热重载）

## 为什么用 DeepSeek？

- API 与 OpenAI 完全兼容，零切换成本
- 推理能力优秀，适合 Agent 场景
- 性价比高，适合开发调试和批量调用

## 自定义 Agent

1. 在 `tools.ts` 中定义新工具
2. 在 `agent.ts` 的 `tools` 数组中注册
3. 根据需要在 prompt 中添加使用规则

```ts
// 自定义工具示例
const myTool = tool(
  async ({ param }) => `结果：${param}`,
  {
    name: "my_tool",
    description: "工具描述",
    schema: z.object({ param: z.string() }),
  }
);
```
