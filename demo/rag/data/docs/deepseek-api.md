# DeepSeek API 实践

DeepSeek 提供了兼容 OpenAI 接口格式的 API，包括 Chat 与 Embedding 两类核心能力。

## Chat 接口

`POST /chat/completions` 用于文本生成、对话、代码补全。支持流式输出，
常用模型为 deepseek-chat。

## Embedding 接口

`POST /embeddings` 用于将文本转换为向量。请求体中传入 model（如 deepseek-embedding）
和 input（单条字符串或字符串数组），返回对应的向量数组。

在 Node.js（18+）中，仅需原生 fetch 即可完成调用，无需引入第三方 LLM 框架：

    const res = await fetch("https://api.deepseek.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-embedding", input: "要向量化的文本" }),
    });

## 费用与限制

Embedding 接口支持批量输入，单次建议不超过 32 条文本；向量维度由模型决定，
调用方无需硬编码。
