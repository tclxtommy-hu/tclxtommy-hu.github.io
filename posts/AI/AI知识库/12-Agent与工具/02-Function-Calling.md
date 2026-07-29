# Function Calling

> 一句话定义：LLM 输出结构化函数调用（函数名+参数 JSON），由外部代码执行后回传结果，让模型能"动手"。

## 1. 机制
1. 宿主把工具描述（名称/描述/参数 schema）注入。
2. 模型决定调哪个函数、填什么参数。
3. 输出结构化 `{"name":..., "arguments":...}`。
4. 宿主执行真实函数。
5. 结果作为消息回传，模型继续。

## 2. 与 Agent / Tools 关系

| | Function Calling | Agent Tools |
|---|---|---|
| 是什么 | 模型输出「函数名 + 参数」的协议/机制 | 具体可执行能力（搜索、读文件、调 API…） |
| 角色 | **怎么调** | **调什么** |
| 粒度 | 单次行动 | 工具目录里的一项 |

- **Tools**：挂在 Agent 上的能力清单（可调函数）。
- **Function Calling**：让模型选中并执行某一项 Tool 的通道。
- Function Calling 是"单次行动"；Agent 是"多步循环"，每步的 act 往往就是一次 Function Calling。
- 没有 Tools，Function Calling 无事可做；没有 Function Calling（或同类机制），Agent 很难稳定"动手"。

一句话：`Agent = LLM + Tools + Memory + Loop`，其中 Tools 的调用方式 ≈ Function Calling。

## 3. Node.js 示例（OpenAI 风格）

一次 Function Calling：定义 tool → 注入 → 模型选工具 → 宿主执行 → 回传结果。

```js
import OpenAI from "openai";

const client = new OpenAI();

// Tools：能力清单（描述 + JSON Schema）
const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "查询某城市当前天气",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名，如 北京" },
        },
        required: ["city"],
      },
    },
  },
];

// 真实执行函数（宿主侧，不是模型执行）
async function getWeather({ city }) {
  // 实际应调天气 API；此处演示
  return { city, temp_c: 28, condition: "晴" };
}

const toolImpl = { get_weather: getWeather };

const messages = [
  { role: "user", content: "北京今天天气怎么样？" },
];

// ① 把 tools 注入，模型可能返回 tool_calls
let res = await client.chat.completions.create({
  model: "gpt-4o",
  messages,
  tools,
});

const msg = res.choices[0].message;
messages.push(msg);

// ② Function Calling：按 name + arguments 执行
for (const call of msg.tool_calls ?? []) {
  const fn = toolImpl[call.function.name];
  const args = JSON.parse(call.function.arguments);
  const result = await fn(args);

  // ③ 结果回传，模型继续生成自然语言回答
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result),
  });
}

res = await client.chat.completions.create({
  model: "gpt-4o",
  messages,
  tools,
});

console.log(res.choices[0].message.content);
// → 例如：「北京今天晴，气温约 28°C。」
```

Agent 循环版：把上面包进 `while`，直到模型不再发 `tool_calls`（或达到步数上限）。

```js
async function runAgent(userText, { maxSteps = 5 } = {}) {
  const messages = [{ role: "user", content: userText }];

  for (let step = 0; step < maxSteps; step++) {
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
    });
    const msg = res.choices[0].message;
    messages.push(msg);

    // 无工具调用 → 本轮结束，返回最终文本
    if (!msg.tool_calls?.length) return msg.content;

    // 每一步 act = 一次（或一批）Function Calling
    for (const call of msg.tool_calls) {
      const fn = toolImpl[call.function.name];
      const args = JSON.parse(call.function.arguments);
      const result = await fn(args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  throw new Error("超出最大步数，需设终止条件");
}
```

## 4. 工具设计原则
- 名称与描述清晰，说明用途与边界。
- 参数用 JSON Schema 约束类型/枚举/必填。
- 危险操作加审批/白名单。
- 返回裁剪，避免上下文膨胀。
- 错误返回结构化，便于模型重试。

## 5. 注意事项
- 描述不清会误选/误填。
- 模型可能幻觉参数值。
- 防注入：工具返回内容可能含恶意指令。
- 多工具时按场景分组。

## 6. 学习要点
- Function Calling 让 LLM 从"说"变"做"。
- Tools 是能力，Function Calling 是调用机制；Agent 用循环把多次调用串起来。
- 工具描述质量决定调用准确率。
- 是 Agent 与 MCP 的底层执行原语。

## 7. 参考资料
- OpenAI Function Calling 文档
- "Toolformer: Language Models Can Teach Themselves to Use Tools"
