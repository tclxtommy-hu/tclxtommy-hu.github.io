# LoRA 原理

> 一句话定义：LoRA 用低秩矩阵近似权重更新，只训少量参数即可达到接近全参微调的效果。

## 1. 核心思想
- 假设微调的权重更新 $\Delta W$ 是**低秩**的。
- 把 $\Delta W = BA$，其中 $B \in \mathbb{R}^{d \times r}$，$A \in \mathbb{R}^{r \times k}$，秩 $r \ll \min(d,k)$。
- 冻结原权重 $W$，只训 $A$ 和 $B$。
- 参数量从 $d \times k$ 降到 $r(d+k)$，大幅减少。

## 2. 前向计算
$$y = Wx + BAx$$
- 原权重 $W$ 不变，加一个低秩旁路 $BA$。

## 3. 优势
- **显存大降**：只存少量参数梯度。
- **可插拔**：一个基座 + 多个 LoRA 适配器，按需切换。
- **防遗忘**：原权重冻结，通用能力保留。
- **效果接近全参**：很多任务上差距很小。

## 4. QLoRA
- 在 LoRA 基础上把基座模型**量化**（4-bit）。
- 进一步降显存，可在单卡微调大模型。
- 训练时反量化计算，存储用低精度。

## 5. 关键超参
- **秩 r**：越大容量越大，常用 8/16/64。
- **alpha**：缩放因子，$\frac{\alpha}{r}$ 调节更新强度。
- **target_modules**：对哪些层加 LoRA（q_proj/v_proj 等）。

## 6. 学习要点
- LoRA = 低秩近似权重更新，参数高效。
- 是中小团队微调大模型的事实标准。
- QLoRA 让单卡微调 70B 成为可能。

## 7. 参考资料
- "LoRA: Low-Rank Adaptation of Large Language Models"（Hu et al.）
- "QLoRA: Efficient Finetuning of Quantized LLMs"