# Transformer 架构

> 一句话定义：基于自注意力的"注意力 + 前馈 + 残差 + 归一化"堆叠模块，是现代 LLM 的统一骨架。

## 1. 整体结构
原始 Transformer（2017）为 Encoder-Decoder，用于翻译：
- **Encoder**：编码源序列。
- **Decoder**：自回归生成目标序列，带交叉注意力。

## 2. 核心组件

### 注意力层
- Self-Attention（见上一篇）。
- Decoder 还有 Cross-Attention：关注 Encoder 输出。

### 前馈网络 FFN
- 每个位置独立的两层 MLP（升维→激活→降维）。
- 增加非线性容量。

### 残差连接 + LayerNorm
- 每个子层：`LayerNorm(x + Sublayer(x))`。
- 稳定深层训练。
- 现代变体有 Pre-LN / Post-LN / RMSNorm。

### 位置编码（Positional Encoding）
- 注意力本身无位置感知，需注入位置信息。
- 方式：正弦/余弦编码、可学习编码、RoPE（旋转位置编码，现代 LLM 主流）、ALiBi。

## 3. 三种架构变体

| 变体 | 结构 | 代表 | 用途 |
|------|------|------|------|
| Encoder-only | 仅编码器 | BERT | 理解任务 |
| Decoder-only | 仅解码器 | GPT | 生成任务 |
| Encoder-Decoder | 双塔 | T5/BART | 翻译/seq2seq |

现代 LLM 几乎都是 **Decoder-only**（GPT 系）。

## 4. Decoder 的自回归生成
- 一次生成一个 token，把新 token 加入输入再生成下一个。
- 用因果掩码（causal mask）防止看到未来 token。

## 5. 学习要点
- Transformer = 注意力 + FFN + 残差 + 归一化，反复堆叠。
- 位置编码补足注意力的"无序"缺陷。
- Decoder-only 是当代 LLM 主流架构。

## 6. 参考资料
- "Attention is All You Need"（2017）
- "The Illustrated Transformer"（Jay Alammar）
- RoPE: "RoFormer: Enhanced Transformer with Rotary Position Embedding"