# 从 Transformer 到 LLM

> 一句话定义：LLM 是把 Decoder-only Transformer 放大到百亿万亿参数、用海量文本自监督预训练的产物。

## 1. 演化路径
1. **Transformer（2017）**：Encoder-Decoder，翻译。
2. **GPT-1（2018）**：Decoder-only + 预训练 + 微调。
3. **BERT（2018）**：Encoder-only + 掩码预训练，理解任务。
4. **GPT-3（2020）**：175B 参数，展示 in-context few-shot 能力。
5. **ChatGPT（2022）**：GPT-3.5 + RLHF，对齐人类偏好。
6. **GPT-4 / Claude / Gemini（2023+）**：多模态、推理增强、Agent 化。

## 2. Decoder-only 为何成为主流
- 生成任务通用性强（对话、写作、代码、推理）。
- 架构简单，易扩展。
- 自回归生成天然适配语言建模。
- Scaling 实验证明其规模收益稳定。

## 3. LLM 的关键设计
- **层数 / 隐藏维度 / 头数**：决定模型容量。
- **上下文窗口**：能处理多长输入。
- **词表**：token 数量，影响多语言与编码能力。
- **位置编码**：RoPE 主流，支持长上下文扩展。
- **激活**：GELU → SwiGLU（现代 LLM 常用）。
- **归一化**：LayerNorm → RMSNorm（Llama 系）。

## 4. 训练三阶段
1. **预训练**：海量文本，下一 token 预测。
2. **SFT**：指令微调，学对话格式。
3. **RLHF/DPO**：对齐人类偏好。
（详见 07 模块）

## 5. 涌现能力（Emergent Abilities）
- 规模到一定程度后出现小模型没有的能力。
- 例：in-context learning、思维链推理、指令遵循。
- 争议：是否真"涌现"还是评测度量问题。

## 6. 学习要点
- LLM = 大 Decoder-only Transformer + 自监督预训练 + 对齐。
- Decoder-only 因通用性与可扩展性胜出。
- 规模 + 数据 + 对齐三者共同造就现代 LLM。

## 7. 参考资料
- "Language Models are Few-Shot Learners"（GPT-3）
- "LLaMA: Open and Efficient Foundation Language Models"
- "Emergent Abilities of Large Language Models"