# Function Calling

> 一句话定义：LLM 输出结构化函数调用（函数名+参数 JSON），由外部代码执行后回传结果，是 Agent 的执行原语。

## 1. 机制
1. 宿主把工具描述（名称/描述/参数 schema）注入。
2. 模型决定调哪个函数、填什么参数。
3. 输出结构化 `{"name":..., "arguments":...}`。
4. 宿主执行真实函数。
5. 结果作为消息回传，模型继续推理。

## 2. 与 Agent 关系
- Function Calling 是"单次行动"。
- Agent 是"多步循环"，每步可能是一次 Function Calling。
- 是 Agent 的最小执行单元。

## 3. 工具设计原则
- **名称与描述清晰**：说明用途、边界、何时用。
- **参数 schema 严格**：用 JSON Schema 约束类型/枚举/必填。
- **危险操作加审批/白名单**。
- **返回裁剪**：长返回只留关键字段，避免上下文膨胀。
- **错误结构化**：失败返回结构化错误，便于模型重试或降级。

## 4. 示例
工具定义：
```json
{
  "name": "get_weather",
  "description": "查询指定城市当前天气",
  "parameters": {
    "type": "object",
    "properties": {
      "city": {"type": "string"},
      "unit": {"type": "string", "enum": ["C","F"], "default": "C"}
    },
    "required": ["city"]
  }
}
```
用户："上海多少度？" → 模型输出 `{"name":"get_weather","arguments":{"city":"上海"}}` → 宿主执行 → 回传 `{"temp":28}` → 模型答"上海 28°C"。

数组参数示例：
```json
{
  "name": "search_cities",
  "description": "批量查询多个城市的天气",
  "parameters": {
    "type": "object",
    "properties": {
      "cities": {
        "type": "array",
        "items": {"type": "string"},
        "description": "要查询的城市列表"
      },
      "tags": {
        "type": "array",
        "items": {"type": "string", "enum": ["hot", "cold", "rainy"]},
        "description": "筛选标签"
      }
    },
    "required": ["cities"]
  }
}
```
模型输出：`{"name":"search_cities","arguments":{"cities":["上海","北京"],"tags":["hot"]}}`

> JSON Schema 完整支持 `array` 类型及 `items`、`minItems`、`maxItems`、`uniqueItems` 等约束，但复杂嵌套数组（数组内含对象）的遵从度取决于模型能力，需实测验证。

## 5. 多函数调用

### 并行调用（Parallel Function Calling）
部分模型（GPT-4+、Claude）支持在一次响应中同时输出多个 function call：
```json
[
  {"name": "get_weather", "arguments": {"city": "上海"}},
  {"name": "get_weather", "arguments": {"city": "北京"}}
]
```
宿主并行执行所有调用，将结果一次性汇总回传：
```json
[
  {"role": "tool", "tool_call_id": "call_1", "content": "{\"temp\": 28}"},
  {"role": "tool", "tool_call_id": "call_2", "content": "{\"temp\": 32}"}
]
```

### 串行调用（Sequential / Chained）
后一个调用依赖前一个的结果，模型分多轮完成：
```
第1轮：模型 → get_user_id({"name": "张三"}) → 结果: {"id": 42}
第2轮：模型 → get_orders({"user_id": 42}) → 结果: {"orders": [...]}
```
宿主必须等前一步结果回传后模型才会发起下一步。

### 异步处理
- **并行调用 + 异步 API**：宿主用 `Promise.all` 并行执行，全部完成后一起回传。
- **并行调用中部分超时**：设超时阈值，超时的返回结构化错误，其余正常回传，模型可基于部分结果继续推理。
- **串行调用 + 异步 API**：顺序 `await`，逐步回传，与单次调用无异。
- 协议本身是同步语义——模型发出调用后等待结果再继续推理，异步是宿主实现层面的事。

> 并非所有模型都支持并行调用，部分开源模型/轻量模型仅支持单次调用。

## 6. 注意事项
- 描述不清会误选/误填参数。
- 模型可能幻觉参数值，需校验。
- 防注入：工具返回内容可能含恶意指令，做隔离。
- 多工具时按场景分组，避免选择困难。
- 数组参数支持但复杂嵌套数组遵从度不稳定，需实测。
- 异步 API 在宿主层正常使用；协议是同步语义，宿主 await 后回传结果即可，注意超时与错误处理。

## 7. LLM 选型要点
Function Calling 不是 LLM 的通用能力，而是需要模型经过专门微调/对齐才能具备的能力，各家支持程度差异很大。

### 关键考察点
- **是否原生支持**：看是否提供结构化 `tool_calls` 字段，而非靠 prompt 模拟在文本里夹 JSON。
- **并行调用能力**：GPT-4 Turbo+、Claude 3.5 支持一次输出多个 function call；部分模型仅支持单次调用。
- **复杂参数遵从度**：数组、嵌套对象、多参数组合场景下模型间差异巨大，需实测。
- **参数幻觉率**：好模型严格按 schema 填充；差模型可能编造字段、填错枚举值、遗漏 required。
- **工具选择准确率**：多工具场景（10+）时是否误选，建议单次注入工具数不超过 10-20 个。
- **格式稳定性**：原生支持输出严格 JSON；prompt 模拟可能格式破损、需正则提取。
- **流式输出**：部分模型流式时 function call 参数分片不完整，需宿主拼接。
- **成本与延迟**：支持 function calling 的多为高阶模型，token 单价更高；工具描述占用 context（每个约 50-200 token）。

### 选型决策表
| 场景 | 推荐方向 |
|------|----------|
| 生产环境、高稳定性 | GPT-4+ / Claude 3.5+ / 国产高阶（Qwen-Max、GLM-4 等） |
| 多工具并行调用 | GPT-4 Turbo+ / Claude 3.5 |
| 本地部署/隐私场景 | Qwen-2.5+ / Llama 3.1+（需选带 tool use 微调的版本） |
| 成本敏感、简单工具 | 小参数模型 + prompt 模拟（接受一定错误率） |
| 复杂嵌套参数 | 必须实测，优先选大参数模型 |

> 选型核心看三点：是否原生支持、复杂参数遵从度、多工具选择准确率。建议准备覆盖数组/嵌套/多工具的标准测试用例，实际跑一遍候选模型再决定。

## 8. 模型锁定风险
Function Calling 没有真正的跨厂商标准——OpenAI 用 `tool_calls`、Anthropic 用 `tool_use` content block、Gemini 用 `functionCall`，schema 描述格式、消息角色、流式分片方式各异。所以"调好的 function calling"本质是针对某个模型版本调好的，换模型几乎必然要重调。

### 核心痛点
> 模型锁定风险
- **格式不通用**：各厂商字段、消息结构不同，代码无法直接复用。
- **遵从度不通用**：即使格式适配好，模型对相同 schema 的遵从度也不同。
- **版本漂移**：厂商静默升级模型可能导致行为变化，已调好的调用突然失效。

### 应对策略
1. **用框架抹平格式差异**：LangChain、LiteLLM、Vercel AI SDK 提供统一抽象层，业务代码写一次，底层换模型时框架适配格式。注意：框架只能抹平格式，抹不平遵从度。
2. **工具层与模型解耦**：
   ```
   业务逻辑 → 工具定义（统一 schema） → 适配层（转各厂商格式） → LLM
   ```
   工具定义和宿主执行函数保持稳定，只让适配层随模型变动。
3. **建立回归测试集**：准备 20-50 个典型调用用例（含数组、嵌套、多工具），换模型时跑一遍量化准确率，达标才上线。
4. **Prompt 兜底**：即使模型原生支持，也建议在 system prompt 写明工具使用规范；模型能力弱时 prompt 引导能显著提升准确率。
5. **降级方案**：检测到模型支持差时，降级为纯 prompt 模拟（模型输出 JSON 文本自行解析），或回退到上一验证过的模型。
6. **锁定模型版本**：生产环境用指定版本（如 `gpt-4-0613` 而非 `gpt-4`），避免静默升级，升级前在测试环境验证。

### 现实判断
Function Calling 目前**不适合"一次开发、永久跨模型"**的期望。更现实的做法：
- 接受"模型绑定"现实，选型时就把 function calling 能力作为核心指标。
- 用框架 + 适配层降低迁移成本，但不追求零成本迁移。
- 关键业务准备 Plan B 模型，提前验证。

> MCP（Model Context Protocol）试图在工具层建立标准，让工具定义与具体模型解耦。但 MCP 解决的是"工具如何暴露"，不是"模型如何调用"，模型遵从度的问题依然存在。

## 9. 学习要点
- Function Calling 让 LLM 从"说"变"做"。
- 工具描述质量决定调用准确率。
- 是 Agent 与 MCP 的底层执行原语。

## 10. 参考资料
- OpenAI / Anthropic Function Calling 文档
- "Toolformer: Language Models Can Teach Themselves to Use Tools"