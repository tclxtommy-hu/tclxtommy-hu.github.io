# OpenAI API 协议详解

> 一句话定义：OpenAI API 协议已成为大模型服务的事实标准，几乎所有主流 LLM 服务商都提供与其兼容的接口。

---

## 1. 为什么 OpenAI API 成为事实标准？

2023 年 ChatGPT 爆火后，OpenAI 率先推出了成熟的 Chat Completions API。由于其设计简洁、文档完善、生态丰富，迅速被社区广泛接受。后续发布的几乎每一家大模型（无论是开源还是闭源）都选择了**兼容 OpenAI API 格式**，让开发者可以零成本切换模型。

核心优势：
- **先发优势**：第一个被大规模采用的 LLM API 格式。
- **设计合理**：请求/响应结构清晰，易于理解和实现。
- **生态绑定**：LangChain、LlamaIndex、AutoGen 等主流框架都原生支持。
- **降低迁移成本**：换模型 = 改 `base_url` + `model`，代码不用动。

---

## 2. 核心端点

### 2.1 Chat Completions（对话补全）

最核心的端点，Agent 调用模型的主要入口。

```
POST https://api.openai.com/v1/chat/completions
```

### 2.2 其他常用端点

| 端点 | 路径 | 用途 |
|------|------|------|
| Chat Completions | `/v1/chat/completions` | 对话补全（核心） |
| Embeddings | `/v1/embeddings` | 文本向量化 |
| Models | `/v1/models` | 列出可用模型 |
| Files | `/v1/files` | 文件管理 |
| Audio | `/v1/audio/transcriptions` | 语音转文字 |

---

## 3. 消息结构（Messages）

每条消息由 `role` 和 `content` 组成，支持四种角色：

```json
[
  { "role": "system",    "content": "你是一个 helpful assistant" },
  { "role": "user",      "content": "什么是 Agent？" },
  { "role": "assistant", "content": "Agent 是能自主使用工具的 AI 系统" },
  { "role": "tool",      "content": "{...}", "tool_call_id": "call_xxx" }
]
```

| 角色 | 说明 |
|------|------|
| `system` | 系统提示词，定义 Agent 的行为与边界 |
| `user` | 用户输入 |
| `assistant` | 模型回复（包括工具调用请求） |
| `tool` | 工具执行结果（函数返回值） |

> **最佳实践**：system 消息放在最前面，user/assistant 交替排列，tool 消息紧跟在 assistant（含 tool_calls）之后。

---

## 4. 核心请求参数

```json
{
  "model": "gpt-4o",
  "messages": [...],
  "temperature": 0.7,
  "max_tokens": 4096,
  "top_p": 1.0,
  "stream": false,
  "tools": [...],
  "tool_choice": "auto"
}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型名称（必填） |
| `messages` | array | 对话消息列表（必填） |
| `temperature` | float | 随机性控制，0-2，越高越随机 |
| `max_tokens` | int | 最大输出 token 数（可选） |
| `top_p` | float | 核采样，通常与 temperature 二选一 |
| `stream` | bool | 是否流式返回 |
| `stop` | string/array | 停止词 |
| `tools` | array | 工具定义列表（见下文） |
| `tool_choice` | string/object | 工具选择策略："auto"/"none"/"required"/指定工具 |
| `response_format` | object | 结构化输出，如 `{"type": "json_object"}` |

---

## 5. 工具调用（Tool Calling / Function Calling）

这是 Agent 开发中最关键的特性。让模型输出结构化的函数调用请求，而不是纯文本。

### 5.1 工具定义

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称，如 Beijing"
            },
            "unit": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"],
              "description": "温度单位"
            }
          },
          "required": ["city"]
        }
      }
    }
  ]
}
```

### 5.2 模型返回的工具调用

当模型决定调用工具时，assistant 消息中会包含 `tool_calls`：

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\":\"Beijing\"}"
      }
    }
  ]
}
```

### 5.3 返回工具结果

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"temperature\": 25, \"condition\": \"sunny\"}"
}
```

整个流程：**用户消息 → 模型请求调工具 → 执行工具 → 返回结果 → 模型生成最终回复**。

---

## 6. 流式响应（Streaming）

设置 `"stream": true` 后，响应以 SSE（Server-Sent Events）格式逐块返回：

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Agent"},"index":0}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"是"},"index":0}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{},"finish_reason":"stop","index":0}]}

data: [DONE]
```

每个 chunk 的 `delta` 字段包含增量内容（而非全量 messages）。流式工具调用时，`tool_calls` 也会分片传输，需要客户端自行拼接。

---

## 7. 结构化输出（Structured Outputs）

OpenAI 支持通过 `response_format` 让模型按指定 JSON Schema 输出，这对 Agent 的可控性至关重要。

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather_response",
      "schema": {
        "type": "object",
        "properties": {
          "temperature": { "type": "number" },
          "condition": { "type": "string" },
          "humidity": { "type": "number" }
        },
        "required": ["temperature", "condition"]
      }
    }
  }
}
```

> 多数兼容 OpenAI 协议的服务商也支持 `response_format: {"type": "json_object"}`，但不一定支持 `json_schema` 模式。

---

## 8. 支持 OpenAI 兼容协议的 LLM 一览

几乎所有主流 LLM 服务商都提供了 OpenAI 兼容接口：

### 8.1 国产大模型

| 服务商 | 模型 | Base URL | 备注 |
|--------|------|----------|------|
| DeepSeek | deepseek-chat / deepseek-reasoner | `https://api.deepseek.com/v1` | 完全兼容 |
| 通义千问（阿里） | qwen-turbo / qwen-plus / qwen-max | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 兼容模式 |
| 智谱（GLM） | glm-4 / glm-4-flash | `https://open.bigmodel.cn/api/paas/v4` | 完全兼容 |
| 月之暗面（Moonshot） | moonshot-v1-8k/32k/128k | `https://api.moonshot.cn/v1` | 完全兼容 |
| 百川（Baichuan） | baichuan4 / baichuan3-turbo | `https://api.baichuan-ai.com/v1` | 完全兼容 |
| MiniMax | abab6.5s / abab7 | `https://api.minimax.chat/v1` | 完全兼容 |
| 零一万物（Yi） | yi-large / yi-medium | `https://api.lingyiwanwu.com/v1` | 完全兼容 |
| 讯飞星火 | spark-xxx | 兼容层需要适配 | 部分兼容 |

### 8.2 国际模型

| 服务商 | 模型 | Base URL | 备注 |
|--------|------|----------|------|
| OpenAI | gpt-4o / gpt-4-turbo / o1 / o3 等 | `https://api.openai.com/v1` | 原创协议 |
| Anthropic | Claude 系列 | 需用 Anthropic Messages API | **不兼容 OpenAI 协议** |
| Google | Gemini 系列 | 原生用 Gemini API，但可通过兼容层 | 第三方适配 |
| Mistral | mistral-large / mixtral | `https://api.mistral.ai/v1` | 完全兼容 |
| Groq | llama-3 / mixtral（推理加速） | `https://api.groq.com/openai/v1` | 完全兼容 |
| Together AI | 多种开源模型 | `https://api.together.xyz/v1` | 完全兼容 |
| Fireworks | 多种开源模型 | `https://api.fireworks.ai/inference/v1` | 完全兼容 |
| Perplexity | 搜索增强模型 | `https://api.perplexity.ai` | 基本兼容 |

### 8.3 本地/私有化部署

| 方案 | 说明 |
|------|------|
| **vLLM** | 高性能推理引擎，内置 OpenAI 兼容 Server |
| **Ollama** | 桌面端一键部署，默认提供 OpenAI 兼容接口 |
| **LocalAI** | 专门做 OpenAI API 模拟的本地推理方案 |
| **llama.cpp server** | 启动 server 模式后提供 OpenAI 兼容 API |
| **LM Studio** | 图形化本地推理，内置兼容 API Server |
| **Xinference** | 国产开源推理平台，OpenAI 兼容 |

---

## 9. 兼容性差异（魔鬼在细节）

虽然都宣称"兼容 OpenAI API"，但实际支持程度各不相同：

| 特性 | 兼容情况 |
|------|----------|
| 基础 Chat Completions | 几乎所有服务都支持 |
| `stream: true` | 绝大部分支持 |
| Tool Calling | 主流模型支持，但参数格式细节有差异 |
| `response_format: json_object` | 大多数支持 |
| `response_format: json_schema` | 仅少数支持（OpenAI 原创功能） |
| Vision（多模态图片输入） | 部分支持 |
| `logprobs` / `top_logprobs` | 较少支持 |
| `seed`（固定随机种子） | 部分支持 |
| `n`（一次返回多个回复） | 较少支持 |
| 并行 Tool Calling | 部分支持 |

> **实践建议**：切换模型前，先验证你用到的高级特性是否被目标服务支持。

---

## 10. 代码示例

### Python（OpenAI SDK）

```python
from openai import OpenAI

# 只需改 base_url 和 api_key 就能切换模型
client = OpenAI(
    base_url="https://api.deepseek.com/v1",  # 换成任意兼容服务
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "你是一个 helpful assistant"},
        {"role": "user", "content": "什么是 Agent？"}
    ],
    temperature=0.7,
    stream=False
)

print(response.choices[0].message.content)
```

### Python（流式调用）

```python
stream = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "讲一个笑话"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Python（带工具调用）

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "获取天气",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名"}
            },
            "required": ["city"]
        }
    }
}]

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "北京天气怎么样？"}],
    tools=tools,
    tool_choice="auto"
)

# 提取工具调用
tool_calls = response.choices[0].message.tool_calls
for tc in tool_calls:
    print(f"调用工具: {tc.function.name}, 参数: {tc.function.arguments}")
```

---

## 11. 在 Agent 开发中的意义

OpenAI API 协议的标准化让 Agent 开发获得了三大便利：

1. **模型无关性**：Agent 框架只需对接一套接口，即可调用所有兼容模型。这是 LangChain、CrewAI 等框架能"即插即用"不同模型的基础。
2. **成本优化**：开发阶段用便宜的模型（如 DeepSeek），上线后用高性能模型，代码零改动。
3. **本地开发友好**：Ollama / vLLM 提供兼容接口，本地开发和线上生产使用同一套代码。

> 深入理解这个协议，是成为 Agent 开发者的基本功。几乎所有 Agent 框架的模型调用层，本质上就是对这个协议的封装。

---

## 12. 参考资料

- [OpenAI API 官方文档](https://platform.openai.com/docs/api-reference)
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs)
- [Ollama OpenAI 兼容文档](https://ollama.com/blog/openai-compatibility)
- [vLLM OpenAI 兼容 Server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html)
