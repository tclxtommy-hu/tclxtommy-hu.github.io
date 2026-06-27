# Scaling Laws

> 一句话定义：模型损失随参数量、数据量、算力按幂律可预测下降，是"越大越好"的科学依据。

## 1. Kaplan Scaling Laws（OpenAI，2020）
- 损失 $L$ 随参数 $N$、数据 $D$、算力 $C$ 按幂律下降：
  $L \propto N^{-\alpha}, D^{-\beta}, C^{-\gamma}$
- 结论：投更多算力到更大模型收益最大。

## 2. Chinchilla Scaling Laws（DeepMind，2022）
- 修正 Kaplan：**数据与模型应等比例放大**。
- 计算最优：给定算力 $C$，最优参数 $N$ 与数据 $D$ 比例约 1:20（每参数约 20 token）。
- 启示：很多大模型"训练不足"（数据太少）。
- 催生 Llama 等用更多数据训中等模型的高效路线。

## 3. 三要素权衡
| 要素 | 影响 |
|------|------|
| 参数量 N | 模型容量 |
| 数据量 D | 训练充分度 |
| 算力 C | 总 FLOPs |

Chinchilla：N 与 D 平衡增长才计算最优。

## 4. 后续发展
- **Inference Scaling**：推理时算力（如 o1 的 test-time 计算）也能换性能。
- **数据质量 > 数量**：高质量数据收益更高。
- **涌现 vs 平滑**：部分能力是否突变存争议。

## 5. 实践意义
- 指导预训练资源分配：算多少参数配多少数据。
- 解释为何大厂持续投更大模型。
- 也指出"小模型 + 多数据"路线可行（Llama）。

## 6. 学习要点
- Scaling Laws 让"越大越好"可量化预测。
- Chinchilla 修正：数据与模型要平衡。
- 推理时 scaling 是新前沿（test-time compute）。

## 7. 参考资料
- Kaplan et al., "Scaling Laws for Neural Language Models"（2020）
- Hoffmann et al., "Training Compute-Optimal Large Language Models"（Chinchilla, 2022）