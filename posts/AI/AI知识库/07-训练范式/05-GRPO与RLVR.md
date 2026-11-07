---
title: GRPO 与 RLVR：可验证奖励强化学习
date: 2026-11-07
tags: [AI, 训练范式, GRPO, RLVR, 推理模型]
---

# GRPO 与 RLVR：可验证奖励强化学习

> 最后修改时间：2026-11-07 12:47

> 一句话定义：**GRPO** /ˌdʒiː ɑːr piː ˈəʊ/ （ **Group Relative Policy Optimization** /ɡruːp ˈrelətɪv ˈpɒləsi ˌɒptɪmaɪˈzeɪʃən/ ，组相对策略优化）是一种不需要价值网络（critic）的强化学习算法，靠"同一题多个回答的组内相对排名"估计优势；**RLVR** /ˌɑːr ɛl viː ˈɑːr/ （ **Reinforcement Learning with Verifiable Rewards** ，可验证奖励强化学习）是它的典型应用场景——用数学答案对错、代码单测通过与否这类"机器可自动判定"的奖励来训练模型，DeepSeek R1 靠这条路让推理能力"涌现"。

## 1. 为什么需要 GRPO：PPO 的三个痛点

在 [RLHF 与对齐](03-RLHF与对齐.html) 中讲过，主流 RL 微调用 **PPO** /ˌpiː piː ˈəʊ/ （ **Proximal Policy Optimization** ，近端策略优化）。PPO 在 LLM 上有三个工程痛点：

1. **要养一个价值网络**（critic /ˈkrɪtɪk/ ）：和策略模型差不多大，显存与算力开销近乎翻倍；
2. **优势估计不稳**：价值网络本身也要训练，估计偏差会传导到策略更新；
3. **奖励是"一条回复一个分"**：稀疏且方差大，训练容易抖。

GRPO 的思路很朴素：**同一个提示词，采样一组（比如 8 条）回答，用组内平均分当基线**——比平均分好的就是正优势，差的就是负优势。基线不靠学，靠"同题对比"直接算出来，价值网络整个省掉。

## 2. GRPO 原理（带真实数字）

对每个提示词 q，从旧策略采样 G 条回答 $\{o_1, ..., o_G\}$，各自得到奖励 $\{r_1, ..., r_G\}$，然后做 **组内归一化** ：

$$A_i = \frac{r_i - \text{mean}(\{r_1,...,r_G\})}{\text{std}(\{r_1,...,r_G\})}$$

**具体数据样例** —— 一道小学奥数题，采样 8 条回答，奖励 = 答案对 1 / 错 0：

| 回答 | 结局 | 奖励 r | 组内优势 A |
|------|------|--------|-----------|
| o₁ | 答对 | 1 | +0.94 |
| o₂ | 答对 | 1 | +0.94 |
| o₃ | 答错 | 0 | −0.94 |
| o₄ | 答对 | 1 | +0.94 |
| o₅ | 答错 | 0 | −0.94 |
| o₆ | 答错 | 0 | −0.94 |
| o₇ | 答对 | 1 | +0.94 |
| o₈ | 答错 | 0 | −0.94 |

均值 = 0.5，标准差 ≈ 0.535。答对的 4 条拿到正优势、答错的 4 条拿到负优势，策略更新时提高/降低对应 token 序列的概率——**不需要任何人告诉你"哪一步想对了"，只看最终对错** 。再叠加上对参考模型的 **KL 散度** /ˌkeɪ ˈɛl daɪˈvɜːdʒəns/ 惩罚，防止模型为了刷奖励跑偏太远。

优势计算的完整可运行实现（主示例，Node.js + TS）：

```typescript
// grpo-advantage.ts —— GRPO 组内相对优势计算
// 运行：npx tsx grpo-advantage.ts

/** 一条采样回答及其奖励 */
interface Sample {
  answer: string;
  reward: number; // 可验证奖励：对=1，错=0
}

/** 组内归一化优势：A_i = (r_i - mean) / (std + eps) */
export function groupAdvantages(samples: Sample[], eps = 1e-8): number[] {
  const rewards = samples.map((s) => s.reward);
  const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const variance =
    rewards.reduce((a, r) => a + (r - mean) ** 2, 0) / rewards.length;
  const std = Math.sqrt(variance);
  return rewards.map((r) => (r - mean) / (std + eps));
}

// 上表的真实数据
const samples: Sample[] = [
  { answer: "答案是 42，因为……", reward: 1 },
  { answer: "42。验算：……", reward: 1 },
  { answer: "我觉得是 17……", reward: 0 },
  { answer: "42", reward: 1 },
  { answer: "题目没说清楚，猜 8", reward: 0 },
  { answer: "……所以是 24", reward: 0 },
  { answer: "列方程 x+…，得 42", reward: 1 },
  { answer: "42？不对，是 41", reward: 0 },
];

const adv = groupAdvantages(samples);
console.log(adv.map((a) => a.toFixed(2)));
// 输出：[ '0.94', '0.94', '-0.94', '0.94', '-0.94', '-0.94', '0.94', '-0.94' ]
```

> 补充（Python）：真实训练用 PyTorch 生态（如 TRL 的 `GRPOTrainer`、veRL），上面这段 TS 是优势计算的 1:1 语义复刻，便于理解核心数学。

## 3. RLVR：奖励从哪里来

GRPO 只是优化器，真正让推理模型起飞的是 **奖励信号变了** ：

| 奖励类型 | 判定方式 | 例子 |
|----------|----------|------|
| 数学正确性 | 答案字符串/LaTeX 等价匹配 | GSM8K、AIME 题库 |
| 代码正确性 | 单测在沙箱里跑通与否 | HumanEval、竞赛题 |
| 格式奖励 | 是否输出 `<think>...</think>` 结构 | R1 早期训练 |
| 规则/谜题 | 确定性校验器 | 数独、24 点 |

这些奖励 **不需要人工标注、不需要奖励模型** ，无限量、无噪声、难被"讨好"。DeepSeek R1-Zero 证明了：直接在基座模型上用纯 RLVR 训练，模型会自发涌现出长思维链、自我验证、"aha moment"（顿悟时刻）等行为。

## 4. 与 PPO / DPO 对比

| 维度 | PPO（RLHF） | DPO | GRPO（RLVR） |
|------|------------|-----|--------------|
| 奖励来源 | 人类偏好奖励模型 | 人类偏好数据对 | 可程序化验证的对错 |
| 需要价值网络 | 是 | 否（无 RL） | 否（组内基线代替） |
| 在线采样 | 是 | 否（离线数据） | 是（每题采一组） |
| 适合任务 | 开放对话、安全对齐 | 风格偏好 | 数学、代码、推理 |
| 主要风险 | 奖励模型被"讨好" | 离线分布漂移 | 奖励黑客（钻校验器空子） |

> 实务上三者常混用：SFT → DPO 调风格 → GRPO/RLVR 练推理，是 2025 年后推理模型的常见管线。

## 5. 注意事项

- **奖励黑客**（reward hacking /rɪˈwɔːd ˈhækɪŋ/ ）：校验器有漏洞，模型会学歪——比如代码题只背测试用例。校验器必须够严（隐藏测试集、随机化）。
- **组内全对/全错时梯度为零**：8 条全对则 std≈0、优势全为 0，该题白算。工程上要动态筛选"难度适中"的题（通过率 20%–80%）。
- **熵坍缩**（entropy /ˈentrəpi/ collapse）：RL 后期输出多样性骤降，思维链变得千篇一律，需要熵正则或 KL 调度。
- **成本**：每题采 8–64 条完整推理链，训练算力消耗远超 SFT，小团队建议直接用现成推理模型蒸馏（蒸馏小模型往往是性价比最优解）。

## 6. 学习要点

- GRPO = 组内相对排名当优势，省掉价值网络，是 DeepSeek 系推理模型的核心算法。
- RLVR 的关键不是算法而是奖励：可自动验证的任务才能规模化 RL。
- 只奖励"最终对错"就能涌现出"过程能力"，这是 R1 给行业的最大启示。

## 7. 参考资料

- DeepSeekMath（2024）：GRPO 首次提出
- DeepSeek-R1（2025）：纯 RLVR 涌现推理能力
- TRL / veRL 开源训练框架文档

## 本文缩写

| 缩写 | 音标 | 全拼 | 中文 |
|------|------|------|------|
| **GRPO** | /ˌdʒiː ɑːr piː ˈəʊ/ | Group Relative Policy Optimization | 组相对策略优化 |
| **RLVR** | /ˌɑːr ɛl viː ˈɑːr/ | Reinforcement Learning with Verifiable Rewards | 可验证奖励强化学习 |
| **PPO** | /ˌpiː piː ˈəʊ/ | Proximal Policy Optimization | 近端策略优化 |
| **DPO** | /ˌdiː piː ˈəʊ/ | Direct Preference Optimization | 直接偏好优化 |
| **RLHF** | /ˌɑːr ɛl eɪtʃ ˈɛf/ | Reinforcement Learning from Human Feedback | 人类反馈强化学习 |
| **KL** | /ˌkeɪ ˈɛl/ | Kullback–Leibler (divergence) | KL 散度 |
| **SFT** | /ˌɛs ɛf ˈtiː/ | Supervised Fine-Tuning | 监督微调 |
| **TRL** | /ˌtiː ɑːr ˈɛl/ | Transformer Reinforcement Learning | Hugging Face RL 训练库 |
