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

## 7. 语义向量与稠密向量

### 7.1 定义对比
- **稠密向量（Dense Vector）**：描述向量的**数据结构**。每个维度都有非零实数值，维度低但全部"有值"，如 `[0.23, -1.45, 0.87, ...]`（768 维）。对立概念是稀疏向量（如 One-hot，绝大多数维度为 0）。
- **语义向量（Semantic Vector）**：描述向量的**信息内涵**。向量空间中语义相近的概念距离也近（如"国王"与"王后"），可用余弦相似度做检索、聚类、推荐。

### 7.2 两者关系
- 在现代 NLP 中，**语义向量几乎都是稠密向量**（稀疏的 One-hot 不含语义）。
- 但反过来不成立：**稠密向量不一定是语义向量**。
  - 随机初始化的 768 维浮点向量是稠密的，但未训练，不含语义。
  - PCA 降维后的向量是稠密的，但不一定保留语义。
- 一句话：**稠密向量是"载体"（形态），语义向量是"内涵"（功能）**。Embedding 的价值在于用稠密向量的形态承载语义向量的内涵。

### 7.3 语义向量的生成方式
| 方法 | 原理 | 特点 |
|------|------|------|
| Word2Vec / GloVe | 共现统计 + 浅层神经网络 | 静态词向量，每词固定向量 |
| ELMo | 双向 LSTM | 上下文相关词向量 |
| BERT / Transformer | 自注意力 + 预训练 | 上下文嵌入，语义更强 |
| 嵌入模型（BGE/E5/OpenAI） | 对比学习 + 微调 | 专为检索优化，语义对齐查询与文档 |

### 7.4 典型使用场景
**稠密向量（非语义用途）的场景：**
- 传统机器学习特征表示（如 PCA 降维、TF-IDF 加权）。
- 数值数据的存储与计算（图像像素、传感器数据）。
- 数据库索引中的数值列存储。

**语义向量（语义用途）的场景：**
- **语义搜索**：用嵌入向量做相似度检索（RAG 基础）。
- **聚类与分类**：向量空间中分组（如客户分群、新闻分类）。
- **推荐系统**：用户/物品嵌入相似度匹配。
- **问答系统**：问题与答案向量对齐（FAQ 检索）。
- **去重与近似匹配**：语义级别的近重复检测。

## 8. 向量维度与模型参数
> 常见误解：LLM 参数量决定 Embedding 向量大小。实际上决定向量维度的是**隐藏维度 d_model**，参数量是 d_model、层数 L、词表 V 共同决定的结果。

### 8.1 决定向量维度的是 d_model
Embedding 向量的维度由模型架构的超参数**隐藏维度 d_model**（hidden size / embedding dim）决定，与总参数量相关但不等同。

| 模型 | d_model（向量维度） | 总参数量 |
|------|---------------------|----------|
| GPT-2 small | 768 | 117M |
| BERT-base | 768 | 110M |
| LLaMA-7B | 4096 | 7B |
| LLaMA-13B | 5120 | 13B |
| GPT-3 175B | 12288 | 175B |

### 8.2 参数量公式
Transformer 的总参数量大致为：

```
Params ≈ V × d  +  L × 12d²
         └──────┘   └────────┘
         Embedding   L 层 Transformer
```

- V：词表大小（如 32000、50000）
- d：隐藏维度（即 Embedding 向量维度）
- L：Transformer 层数

### 8.3 关键澄清：增大参数量 ≠ 增大向量维度
可保持 d 不变，只加层数 L 来增大参数量：
- 模型 A：d=4096, L=32 → 约 7B 参数，向量 4096 维。
- 模型 B：d=4096, L=80 → 约 13B+ 参数，向量仍为 4096 维。

两个模型参数差了近一倍，但生成的稠密向量维度完全相同。**参数量是"果"，d_model 才是直接决定向量维度的"因"**。

### 8.4 常见说法辨析
| 错误说法 | 正确说法 |
|---------|---------|
| LLM 参数决定向量大小 | **隐藏维度 d_model 决定向量维度** |
| 参数越多向量越大 | 参数越多通常 d 越大，但也可通过加层数增大参数而保持 d 不变 |
| 参数 = 向量 | 参数是模型所有权重之和，向量是单个 token 的嵌入表示 |

## 9. LLM 与 Embedding Model 的关系
> 常见误解：LLM 和 Embedding Model 一一对应，或"LLM 提供的 Embedding"是 LLM 的附属功能。实际上两者是**两类不同的模型**。

### 9.1 两类模型，训练目标不同
| 维度 | LLM（大模型） | Embedding Model |
|------|--------------|-----------------|
| 训练目标 | 预测下一个 token（生成式） | 对比学习，拉近相似样本（表示学习） |
| 输出 | token 序列（文字） | 固定维度向量（浮点数组） |
| 用途 | 对话、生成、推理 | 检索、向量化、RAG |
| 权重 | 自有一套权重 | 自有一套权重（通常不同） |

### 9.2 不是一一对应
- **同公司，不同模型**：OpenAI 的 GPT-4（LLM）与 text-embedding-3（embedding）是两个独立模型；一个 LLM 可对应多个 embedding 版本。
- **Embedding 独立存在**：BGE、E5、GTE、jina-embeddings 背后没有对应的"大模型"对话产品。
- **可共用架构但权重不同**：骨干网络（Transformer）可一样，但训练目标不同 → 权重不同 → 是两个模型。
- 选 embedding 看 **MTEB 榜单的检索效果**，不是看"对应哪个大模型"。RAG 中完全可跨厂商组合（如 GPT-4 + BGE）。

### 9.3 三种容易混淆的"Embedding"
| 名称 | 是什么 | 对外暴露 | 能用于检索 |
|------|--------|---------|-----------|
| LLM 厂商的 Embedding API | 专门的 embedding 模型，厂商打包成 API | 是 | 是 |
| LLM 内部的 embedding 层 | LLM 架构里的输入嵌入层，供模型自用 | 否 | 否（非检索训练） |
| LLM 隐藏层输出当向量 | 拿中间层激活当 embedding | 需特殊提取 | 效果一般，不推荐 |

> "LLM 提供的 Embedding" 指第一种——本质仍是专用 Embedding Model，只是挂在 LLM 厂商品牌下（如 OpenAI text-embedding-3），和它家的 LLM 是两个独立模型。

### 9.4 多模态物料向量化
- 多模态物料（图/音/视频）向量化用**多模态嵌入模型**（如 CLIP、ImageBind、Jina-CLIP），不是 LLM。
- CLIP 通过图文对比学习训练，让图像与对应文本的向量靠近。
- 产出的稠密向量，因模型经过语义对齐训练，**同时就是语义向量**（见 7.2）。
- 获取向量用 embedding API，不用 chat API（chat 返回文字，不返回向量）。

### 9.5 RAG 中两者的分工
```
用户问题
   ↓
[Embedding Model] 问题向量化 + 文档向量化（专用模型，如 BGE / text-embedding-3）
   ↓
向量库检索 → 取回相关文档
   ↓
[LLM] 读"问题 + 文档"，生成答案（大模型，如 GPT-4 / Qwen）
   ↓
回答用户
```
- Embedding Model 负责"找"：向量化 + 相似度检索。
- LLM 负责"写"：根据检索到的文档生成自然语言答案。

## 10. 学习要点
- Embedding 把"符号"变"向量"，是连接语言与数学的桥梁。
- 语义相似 = 向量相近，是检索/推荐/聚类的统一原理。
- LLM 的嵌入是上下文相关的，比静态词向量更强。
- 稠密向量是载体，语义向量是内涵；Embedding 让稠密形态承载语义内涵。
- 向量维度由 d_model 决定，不是由参数量决定；参数量是 d_model、层数 L、词表 V 共同的结果。
- LLM 与 Embedding Model 是两类模型，不是一一对应；向量化一律用专用 Embedding Model，LLM 在 RAG 中负责生成答案而非向量化。

## 11. 实战案例：营销活动多模态搜索系统

### 11.1 场景与数据源
- **结构化数据**：活动基础信息（活动名、说明、时间、状态等）存 MySQL。
- **非结构化物料**：组件物料包含多段文本（活动规则、优惠券说明）和图片（商品图、Banner）。
- **搜索目标**：
  - 文本查询命中活动基础信息（如搜"618 大促"找到对应活动）。
  - 文本查询命中图片整体语义（如搜"鞋子"找到包含鞋子的商品图）。
  - 文本查询命中图片细粒度属性（如搜"绿色主色调""带 LOGO"的图）。
  - 支持结构化过滤（如只看进行中的活动）。

### 11.2 数据处理流程（离线建库）

```
① 基础信息向量化
   MySQL 活动 → 拼接"活动名 + 说明" → 文本 Embedding Model（如 BGE）→ 文本向量
   → 存向量库（元数据: activity_id, type=base）

② 物料文本向量化
   组件文本（规则/说明）→ 文本 Embedding Model → 文本向量
   → 存向量库（元数据: activity_id, type=text）

③ 图片直接向量化（整体语义）
   图片文件 → 多模态 Embedding Model（如 CLIP / Jina-CLIP）→ 图片向量
   → 存向量库（元数据: activity_id, type=image, url）

④ 图片图生文 + 文本向量化（细粒度属性）
   图片文件 → 多模态 LLM（如 GPT-4V / Qwen-VL）→ 图片描述/标签
            → 文本 Embedding Model → 文本向量
   → 存文本向量库（元数据: activity_id, type=image_desc, url）
   → 另存结构化标签（颜色/物体/文字）到倒排索引
```

要点：
- 文本和图片用**不同的 embedding model**，向量维度可能不同，建议**分两个 collection/索引**。
- 所有向量带 **activity_id 元数据**，便于回查 MySQL 关联。
- 图片走**双轨**：③ CLIP 直接向量化管整体语义（快、便宜），④ VLM 图生文管细粒度属性（颜色/文字/数量，准但贵）。

### 11.3 检索使用流程（在线查询）

```
用户查询（如"鞋子"或"618 鞋子大促"）
        ↓
[查询向量化]
   - 文本分支：查询文本 → 文本 Embedding → 文本查询向量
   - 图片分支：查询文本 → CLIP 文本编码器 → 图片查询向量
   - 图生文分支：查询文本 → 文本 Embedding → 图片描述查询向量
        ↓
[并行检索]
   - 文本向量库 → topK 文本命中（活动名/说明/规则）
   - 图片向量库 → topK 图片命中（整体语义，如"鞋子"）
   - 图片描述向量库 / 倒排索引 → topK 属性命中（如"绿色主色调""带 LOGO"）
        ↓
[结果合并 + 结构化过滤]
   - 按 activity_id 聚合：一个活动可能同时命中文本和图片
   - 叠加 MySQL 过滤（如 status=进行中、时间范围）
        ↓
[回查 MySQL 补全展示字段]
   - 用命中的 activity_id 回查 MySQL，取活动名、时间、封面等
        ↓
返回：活动卡片 + 命中的图片/文本片段
```

### 11.4 关键设计点
- **双轨向量化**：文本走文本 embedding model，图片走多模态 embedding model，分库存储。
- **图片双轨检索**：CLIP 直接向量化（方案 A）做整体语义粗召，快且便宜；VLM 图生文（方案 B）做细粒度属性精筛，对颜色/图内文字/数量更准。两者非二选一，而是组合。
- **何时用图生文**：检索需求含"主色调""带 LOGO""含某句文案""几个人"等细粒度属性时，CLIP 弱、VLM 强；纯语义级（"鞋子""运动场景"）CLIP 足够。
- **CLIP 的跨模态特性**：CLIP 的文本编码器与图像编码器在同一向量空间，所以"鞋子"文本向量能直接检索图片向量库，无需先把查询转成图片。
- **元数据关联**：所有向量带 activity_id，实现"向量检索 + 关系型回查"的混合架构。
- **结构化过滤不走向量**：时间/状态等条件用 MySQL 或向量库的元数据过滤，不参与向量化。
- **增量更新**：活动/物料变更时只重算对应向量；基础信息变更只重算文本向量，图片不受影响。
- **跨模态检索的本质**：见 9.4——图片向量化用专用多模态模型（非 LLM），产出的稠密向量同时是语义向量。

## 12. Embedding 工具生态
> 选型看 MTEB / C-MTEB 榜单，不要看"对应哪个大模型"。

### 12.1 开源模型（本地部署，免费）
| 模型 | 出处 | 特点 |
|------|------|------|
| BGE 系列 | 智源 | 中文最强之一；bge-large-zh、bge-m3（多语言+多粒度+稠密/稀疏/ColBERT 三合一） |
| GTE 系列 | 阿里达摩院 | 中文友好，gte-large-zh |
| m3e | Moka AI | 中文社区早期常用 |
| E5 / multilingual-e5 | 微软 | 多语言强 |
| jina-embeddings v3 | Jina AI | 支持 8K 长文本 |
| CLIP / OpenCLIP / Chinese-CLIP / Jina-CLIP | OpenAI 等 | 多模态（图文） |
| ImageBind | Meta | 图/音/视频/文本多模态 |

### 12.2 商业 API（云端调用，省事）
| 厂商 | 模型 | 维度 |
|------|------|------|
| OpenAI | text-embedding-3-small / 3-large | 1536 / 3072 |
| Cohere | embed-v3（多语言） | 1024 |
| Voyage AI | voyage-3 / voyage-large | 专为 RAG 优化，榜单常前列 |
| Google | text-embedding-gecko | 768 |
| 阿里云百炼 | text-embedding-v2/v3（GTE） | 1536 |
| 智谱 | embedding-2/3 | 1024/2048 |
| 百度千帆 | Embedding-V1 | 1024 |
| Jina AI | jina-embeddings-v3 API | 1024 |

### 12.3 调用与部署框架
| 框架 | 作用 |
|------|------|
| sentence-transformers | HuggingFace 出品，最流行；统一接口加载本地模型，几行代码出向量 |
| FlagEmbedding | 智源官方库，专跑 BGE |
| HuggingFace Transformers | 直接 AutoModel 加载任意模型 |
| LangChain / LlamaIndex 的 Embedding 封装 | 统一对接各厂商 API，切换模型不改业务代码 |
| TEI（Text Embeddings Inference） | HuggingFace 出品，高性能部署开源模型为 API，推荐 |
| Infinity / vLLM / Ollama / Xinference | 其他部署服务（Ollama 可一键跑 nomic-embed-text、bge-m3） |

### 12.4 向量数据库（存与检索）
| 库 | 类型 |
|------|------|
| Milvus / Zilliz Cloud | 开源标杆，支持多向量、混合检索 |
| Qdrant | Rust 写，快，支持 payload 过滤 |
| Weaviate | 自带混合检索（向量+BM25） |
| Chroma | 轻量，适合原型 |
| pgvector | PostgreSQL 扩展，和业务库同库省事 |
| Pinecone | 商业全托管 |
| Faiss | Meta 的库（纯检索算法，非数据库） |

### 12.5 选型建议
- **中文文本检索**：BGE-M3 / GTE-large-zh（自部署）或 OpenAI text-embedding-3（API）。
- **多语言**：BGE-M3 / multilingual-e5。
- **长文本**：jina-embeddings-v3。
- **图文多模态**：CLIP / Jina-CLIP（整体语义）；GPT-4V / Qwen-VL（图生文细粒度，见 11.2 ④）。
- **省事无运维**：OpenAI / Cohere / Voyage API。
- **数据不出本地**：BGE + TEI 自部署 + Milvus / Qdrant。
- **和业务同库**：pgvector（业务库在 PostgreSQL 时）。
- **多模态营销活动系统**（见 11 节）：BGE（文本）+ CLIP/Jina-CLIP（图片）+ Qwen-VL（图生文）+ Milvus。

## 13. 参考资料
- "Efficient Estimation of Word Representations in Vector Space"（Word2Vec）
- "BERT: Pre-training of Deep Bidirectional Transformers"