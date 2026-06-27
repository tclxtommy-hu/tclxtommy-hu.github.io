# DPO 与偏好优化

> 一句话定义：DPO 直接用偏好对优化模型，跳过显式奖励模型与 RL，更简单稳定。

## 1. 定义
DPO（Direct Preference Optimization，直接偏好优化）用"人类偏好对（chosen vs rejected）"直接微调模型，无需训练奖励模型、无需 PPO，把对齐简化为监督学习。

## 2. 与 RLHF 对比

| 维度 | RLHF | DPO |
|------|------|-----|
| 奖励模型 | 需要 | 不需要 |
| 强化学习 | PPO | 无 |
| 复杂度 | 高 | 低 |
| 稳定性 | 难调 | 较稳 |
| 效果 | 强 | 接近，部分场景更优 |

## 3. DPO 原理（直觉）
- RLHF 的最优解可表示为模型自身概率的函数。
- DPO 推导出：直接用偏好对优化模型 log 概率差即可，等价于隐式优化奖励。
- 损失：让 chosen 回答概率相对 rejected 更高。

## 4. 数据格式
```
{"prompt": "...", "chosen": "好回答", "rejected": "差回答"}
```
- 来自人工排序或 AI 排序（RLAIF）。

## 5. 变体
- **RLAIF**：用 AI（强模型）代替人做偏好标注，降成本。
- **IPO / KTO / SimPO**：DPO 的改进变体，解决其偏差问题。

## 6. 何时用 DPO
- 想简化对齐 pipeline。
- 资源有限，不想训 RM + PPO。
- 偏好数据充足。
- 现代开源模型常用 SFT + DPO 组合。

## 7. 学习要点
- DPO 把 RLHF 简化为监督学习，更易上手。
- 无需 RM 与 PPO，稳定性更好。
- RLAIF 用 AI 标注进一步降成本。

## 8. 参考资料
- "Direct Preference Optimization: Your Language Model is Secretly a Reward Model"
- "Constitutional AI: Harmlessness from AI Feedback"（RLAIF）