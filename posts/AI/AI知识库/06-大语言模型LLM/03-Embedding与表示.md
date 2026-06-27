# Embedding 与表示

> 一句话定义：Embedding 把离散 token 映射为稠密向量，使语义相近的词在向量空间中相近。

## 1. 定义
Embedding（嵌入）是把 token ID 映射到一个固定维度的实数向量。模型通过训练学习这些向量，使其承载语义信息。

## 2. 词嵌入的直觉
- "国王" 与 "王后" 向量相近。
- "国王 - 男人 + 女人 ≈ 王后"（经典词向量类比）。
- 语义相似 = 向量距离近（余弦相似度）。

## 3. 演化
| 阶段 | 方法 | 特点 |
|------|------|------|
| 传统 | One-hot | 稀疏、无语义 |
| Word2Vec/GloVe | 静态词向量 | 每词固定向量 |
| ELMo | 上下文词向量 | 同词不同语境不同向量 |
| Transformer | 上下文嵌入 | LLM 的嵌入层 + 注意力 |

## 4. LLM 中的 Embedding
- **输入嵌入层**：token ID → 向量（查表）。
- **位置编码**：注入位置信息（与词嵌入相加或旋转）。
- **上下文表示**：经多层 Transformer 后，每个位置向量承载上下文语义。

## 5. 应用
- **语义搜索**：用嵌入向量做相似度检索（RAG 基础）。
- **聚类分类**：向量空间中分组。
- **推荐**：物品/用户嵌入相似度。

## 6. 嵌入模型
- 专门训练用于检索的嵌入模型：BGE、E5、OpenAI text-embedding、Cohere embed。
- 用于 RAG 的文档与查询向量化。

## 7. 学习要点
- Embedding 把"符号"变"向量"，是连接语言与数学的桥梁。
- 语义相似 = 向量相近，是检索/推荐/聚类的统一原理。
- LLM 的嵌入是上下文相关的，比静态词向量更强。

## 8. 参考资料
- "Efficient Estimation of Word Representations in Vector Space"（Word2Vec）
- "BERT: Pre-training of Deep Bidirectional Transformers"