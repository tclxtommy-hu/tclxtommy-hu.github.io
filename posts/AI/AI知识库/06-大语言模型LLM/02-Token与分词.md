# Token 与分词

> 一句话定义：Token 是 LLM 处理文本的最小单位，分词器把文本切成 token 并映射到词表 ID。

## 1. 什么是 Token
- LLM 不直接处理字符，而是处理 **token**（词片段）。
- 一个 token 可以是词、子词、字符甚至标点。
- 例："ChatGPT 很强" 可能切成 ["Chat","GPT"," 很","强"]。

## 2. 为什么需要 Token
- 把无限文本映射到有限词表，便于模型处理。
- 平衡词表大小与序列长度。

## 3. 分词算法

| 算法 | 原理 | 代表 |
|------|------|------|
| BPE | 按频率合并常见子词 | GPT 系列 |
| WordPiece | 类似 BPE，用于 BERT | BERT |
| Unigram | 概率最大化切分 | T5/Llama |
| SentencePiece | 语言无关，支持无空格语言 | 多语言 LLM |

## 4. 词表（Vocabulary）
- 词表大小：GPT-2 ~50k，Llama ~32k，现代多语言模型 100k+。
- 词表越大，多语言与编码能力越强，但嵌入层参数更多。

## 5. Token 与成本
- API 按 token 计费：输入 token + 输出 token。
- 中文常比英文费 token（一个汉字可能 1-2 token）。
- 上下文窗口以 token 计：如 128k token。

## 6. 特殊 token
- `<bos>`/`<eos>`：起止标记。
- `<pad>`：填充。
- 系统提示、对话角色用特殊 token 分隔。

## 7. 学习要点
- Token 是 LLM 的"原子"，理解它就理解了输入输出与计费。
- BPE 是主流分词法。
- 中文 token 效率影响成本与上下文利用。

## 8. 参考资料
- "Neural Machine Translation of Rare Words with Subword Units"（BPE）
- tiktoken（OpenAI 分词器）