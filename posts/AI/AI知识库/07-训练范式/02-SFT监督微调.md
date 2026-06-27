# SFT 监督微调

> 一句话定义：用"指令-回答"对教预训练模型按对话格式与人类期望输出，把"补全器"变"助手"。

## 1. 定义
Supervised Fine-Tuning（SFT，监督微调，又称指令微调 Instruction Tuning）指用人工编写的"指令-理想回答"对，监督训练预训练模型，使其学会遵循指令、按对话格式输出。

## 2. 为什么需要 SFT
- 预训练模型只会"续写"，不会"对话"。
- 输入"中国的首都"它可能续写"是北京，人口…"而非回答问题。
- SFT 教它"被问问题就回答"的助手行为。

## 3. 数据格式
```
{"instruction": "把这句话翻译成英文", "input": "你好", "output": "Hello"}
```
- 转为对话模板：system/user/assistant 角色。
- 只对 assistant 部分算损失。

## 4. 数据要点
- **质量 > 数量**：少量高质量指令对效果优于大量噪声。
- **多样性**：覆盖多种任务类型（问答、写作、代码、推理）。
- **来源**：人工编写、开源数据集（Alpaca、FLAN）、合成数据（用强模型生成）。

## 5. SFT 与 RLHF 的关系
- SFT 教"怎么答"，RLHF 教"答得更好/更安全"。
- 通常顺序：预训练 → SFT → RLHF/DPO。
- SFT 是对齐的第一步。

## 6. 学习要点
- SFT 把续全模型变成对话助手。
- 数据质量与多样性是关键。
- SFT 是对齐 pipeline 的第一步。

## 7. 参考资料
- "Training language models to follow instructions with human feedback"（InstructGPT）