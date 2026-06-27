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

## 5. 注意事项
- 描述不清会误选/误填参数。
- 模型可能幻觉参数值，需校验。
- 防注入：工具返回内容可能含恶意指令，做隔离。
- 多工具时按场景分组，避免选择困难。

## 6. 学习要点
- Function Calling 让 LLM 从"说"变"做"。
- 工具描述质量决定调用准确率。
- 是 Agent 与 MCP 的底层执行原语。

## 7. 参考资料
- OpenAI / Anthropic Function Calling 文档
- "Toolformer: Language Models Can Teach Themselves to Use Tools"