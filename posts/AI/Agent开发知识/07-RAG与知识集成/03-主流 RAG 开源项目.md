# 收藏备用！2026 年所有主流 RAG 开源项目都在这里了

本文按**核心框架、向量数据库、嵌入模型、文档处理、检索增强、评估工具、GraphRAG、低代码平台、Agentic RAG**九大维度，整理2026年RAG技术生态的主流开源项目，便于快速选型与落地。

## 一、核心RAG框架（全流程编排）

| 项目名称         | GitHub星数 | 核心优势                                | 适用场景                        | 开源协议   | GitHub地址                                                   |
| ---------------- | ---------- | --------------------------------------- | ------------------------------- | ---------- | ------------------------------------------------------------ |
| **LangChain**    | 98K+       | 700+集成，多Agent工作流，动态检索链路   | 复杂多步骤AI应用，企业级RAG系统 | MIT        | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain) |
| **LlamaIndex**   | 40K+       | 数据特化型RAG，结构化查询，复杂检索模式 | 文档密集型应用，知识图谱集成    | MIT        | [github.com/run-llama/l…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Frun-llama%2Fllama_index) |
| **Haystack 2.x** | 18K+       | 模块化架构，生产级流水线，企业级部署    | 大规模文档问答，检索排序优化    | Apache-2.0 | [github.com/deepset-ai/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fdeepset-ai%2Fhaystack) |
| **RAGFlow**      | 79.6K+     | 可视化工作流，融合RAG+Agent，多模态支持 | 快速原型开发，企业知识库        | Apache-2.0 | [github.com/infiniflow/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Finfiniflow%2Fragflow) |
| **Dify**         | 55K+       | 无代码/低代码，可视化编辑器，一键部署   | 快速搭建RAG应用，业务人员使用   | MIT        | [github.com/langgenius/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flanggenius%2Fdify) |
| **AnythingLLM**  | 35K+       | 轻量级UI，文档上传即聊天，Docker部署    | 个人/团队知识库，快速检索       | MIT        | [github.com/Mintplex-La…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FMintplex-Labs%2Fanything-llm) |
| **OpenRAG**      | 5K+        | 模块化轻量级，可扩展，易定制            | 研究与实验，定制化RAG系统       | Apache-2.0 | [github.com/linagora/op…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flinagora%2Fopenrag) |
| **Youtu-RAG**    | 8K+        | Agent驱动，长期记忆，跨会话关联         | 智能客服，个性化推荐            | Apache-2.0 | [github.com/TencentClou…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FTencentCloud%2FYoutu-RAG) |
| **RAGLAB**       | 3K+        | 研究导向，算法对比，模块化架构          | RAG算法研究，公平性能测试       | MIT        | [github.com/facebookres…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Ffacebookresearch%2Fraglab) |

## 二、向量数据库（核心记忆层）

| 项目名称         | 核心特性                                   | 规模支持 | 部署方式    | 开源协议      | GitHub地址                                                   |
| ---------------- | ------------------------------------------ | -------- | ----------- | ------------- | ------------------------------------------------------------ |
| **Milvus**       | 云原生架构，存储计算分离，十亿级向量       | 10亿+    | 分布式/K8s  | Apache-2.0    | [github.com/milvus-io/m…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fmilvus-io%2Fmilvus) |
| **Qdrant**       | 点积/余弦/欧氏距离，动态索引，过滤条件丰富 | 亿级     | 单机/分布式 | Apache-2.0    | [github.com/qdrant/qdra…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fqdrant%2Fqdrant) |
| **Weaviate**     | 语义搜索，图结构集成，自动分片             | 亿级     | 单机/分布式 | BSD-3-Clause  | [github.com/weaviate/we…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fweaviate%2Fweaviate) |
| **ChromaDB**     | 轻量级，内存优先，零依赖部署               | 百万级   | 本地/嵌入式 | Apache-2.0    | [github.com/chroma-core…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fchroma-core%2Fchroma) |
| **pgvector**     | PostgreSQL插件，关系+向量混合查询          | 百万级   | 数据库扩展  | PostgreSQL    | [github.com/pgvector/pg…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fpgvector%2Fpgvector) |
| **FAISS**        | Facebook开发，高性能，GPU加速              | 十亿级   | 本地库/服务 | MIT           | [github.com/facebookres…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Ffacebookresearch%2Ffaiss) |
| **Zilliz Cloud** | Milvus托管版，Serverless                   | 按需扩展 | 云服务      | 商业/开源混合 | [github.com/zilliztech/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fzilliztech%2Fzilliz-cloud-sdk) |

## 三、嵌入模型（文本表征）

| 模型名称                       | 发布机构      | 特点                     | 开源协议   | GitHub地址                                                   |
| ------------------------------ | ------------- | ------------------------ | ---------- | ------------------------------------------------------------ |
| **BGE-M3**                     | 智谱AI        | 多粒度，多任务，中文优化 | MIT        | [github.com/FlagOpen/Fl…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FFlagOpen%2FFlagEmbedding) |
| **E5**                         | 微软          | 检索优先，长文本支持     | MIT        | [github.com/microsoft/u…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fmicrosoft%2Funilm%2Ftree%2Fmaster%2Fe5) |
| **all-MiniLM-L6-v2**           | Sentence-BERT | 轻量级，速度快           | MIT        | [github.com/UKPLab/sent…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FUKPLab%2Fsentence-transformers) |
| **Llama-2-7b-chat-hf**         | Meta          | 大模型嵌入，上下文理解强 | Llama 2    | [huggingface.co/meta-llama/…](https://link.juejin.cn?target=https%3A%2F%2Fhuggingface.co%2Fmeta-llama%2FLlama-2-7b-chat-hf) |
| **Mistral-7B-v0.3**            | Mistral AI    | 高效，多语言，低延迟     | Apache-2.0 | [github.com/mistralai/m…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fmistralai%2Fmistral-src) |
| **jina-embeddings-v2-base-en** | Jina AI       | 长文本(8k)，检索精度高   | Apache-2.0 | [github.com/jina-ai/jin…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fjina-ai%2Fjina-embeddings) |

## 四、文档处理工具（解析/分割/加载）

| 工具名称                           | 功能         | 支持格式             | 特点                     | GitHub地址                                                   |
| ---------------------------------- | ------------ | -------------------- | ------------------------ | ------------------------------------------------------------ |
| **Unstructured**                   | 文档解析     | PDF/Word/PPT/HTML等  | 智能提取，布局感知       | [github.com/Unstructure…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FUnstructured-IO%2Funstructured) |
| **PyPDF2**                         | PDF解析      | PDF                  | 轻量级，文本提取         | [github.com/py-pdf/PyPD…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fpy-pdf%2FPyPDF2) |
| **LangChain Document Loaders**     | 多源文档加载 | 网页/数据库/云存储等 | 70+加载器                | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain%2Ftree%2Fmaster%2Flibs%2Fcommunity%2Flangchain_community%2Fdocument_loaders) |
| **LlamaHub**                       | 数据连接器   | 200+数据源           | 一键集成，低代码         | [github.com/run-llama/l…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Frun-llama%2Fllama-hub) |
| **RecursiveCharacterTextSplitter** | 文本分割     | 所有文本             | 递归分割，保持语义       | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain%2Fblob%2Fmaster%2Flibs%2Flangchain%2Flangchain%2Ftext_splitter.py) |
| **SemanticChunker**                | 语义分割     | 长文本               | 基于嵌入相似度，语义完整 | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain%2Fblob%2Fmaster%2Flibs%2Flangchain%2Flangchain%2Ftext_splitter.py) |

## 五、检索增强工具（重排/过滤/生成）

| 工具名称           | 功能           | 技术原理           | 适用场景       | GitHub地址                                                   |
| ------------------ | -------------- | ------------------ | -------------- | ------------------------------------------------------------ |
| **Cohere Rerank**  | 检索结果重排   | 交叉编码器         | 提升Top-K精度  | [github.com/cohere-ai/r…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fcohere-ai%2Frerank-rs) (开源SDK) |
| **ColBERT**        | 上下文感知检索 | 交互式BERT         | 长文档精准匹配 | [github.com/stanford-fu…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fstanford-futuredata%2FColBERT) |
| **Contriever**     | 稠密检索       | 对比学习           | 大规模文档检索 | [github.com/facebookres…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Ffacebookresearch%2Fcontriever) |
| **FlashRank**      | 快速重排       | 轻量级模型         | 低延迟场景     | [github.com/Prithiviraj…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FPrithivirajDamodaran%2FFlashRank) |
| **Rerankers**      | 多模型重排     | 集成多种交叉编码器 | 混合检索系统   | [github.com/allenai/rer…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fallenai%2Frerankers) |
| **LLM-as-a-Judge** | 结果评估       | 大模型评分         | 检索质量判断   | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain%2Fblob%2Fmaster%2Flibs%2Flangchain%2Flangchain%2Fevaluation%2Fqa%2Fllm_as_judge.py) |

## 六、GraphRAG（图结构检索增强）

| 项目名称               | 星数 | 核心能力                         | 适用场景               | GitHub地址                                                   |
| ---------------------- | ---- | -------------------------------- | ---------------------- | ------------------------------------------------------------ |
| **Microsoft GraphRAG** | 31K+ | 社区检测，多跳推理，全局语义分析 | 金融投顾，新闻摘要     | [github.com/microsoft/g…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fmicrosoft%2Fgraphrag) |
| **LightRAG**           | 29K+ | 轻量级图结构，动态构建，高效检索 | 知识图谱问答，快速原型 | [github.com/lightrag-ai…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flightrag-ai%2Flightrag) |
| **KAG (OpenSPG)**      | 8K+  | 知识图谱推理，语义关联，复杂查询 | 企业知识管理           | [github.com/OpenSPG/ope…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FOpenSPG%2Fopenspg) |
| **NebulaGraph**        | 12K+ | 分布式图数据库，毫秒级查询       | 大规模知识图谱         | [github.com/vesoft-inc/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fvesoft-inc%2Fnebula) |
| **Neo4j RAG**          | 10K+ | 图数据库集成，Cypher查询         | 关系密集型应用         | [github.com/neo4j/neo4j…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fneo4j%2Fneo4j-rag-framework) |

## 七、RAG评估工具（质量/性能/成本）

| 工具名称                  | 评估维度                         | 特点                | GitHub地址                                                   |
| ------------------------- | -------------------------------- | ------------------- | ------------------------------------------------------------ |
| **RAGAs**                 | 答案相关性，事实一致性，检索精度 | 轻量级，可扩展      | [github.com/explodinggr…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fexplodinggradients%2Fragas) |
| **DeepEval**              | 自定义指标，LLM评估，人类标注    | 全面评估框架        | [github.com/confident-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fconfident-ai%2Fdeepeval) |
| **TruLens**               | 可解释性，性能监控，成本分析     | 端到端监控          | [github.com/truera/trul…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Ftruera%2Ftrulens) |
| **LangChain Evaluation**  | 内置指标，自定义评估器           | 与LangChain无缝集成 | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flangchain%2Ftree%2Fmaster%2Flibs%2Flangchain%2Flangchain%2Fevaluation) |
| **LlamaIndex Evaluation** | 检索质量，生成质量，综合评分     | 数据导向评估        | [github.com/run-llama/l…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Frun-llama%2Fllama_index%2Fblob%2Fmain%2Fllama_index%2Fevaluation%2F__init__.py) |

## 八、低代码/可视化RAG平台

| 平台名称        | 特点                               | 部署方式      | 适用人群           | GitHub地址                                                   |
| --------------- | ---------------------------------- | ------------- | ------------------ | ------------------------------------------------------------ |
| **Dify**        | 可视化编辑器，一键部署，多模型支持 | Docker/K8s    | 业务人员，开发者   | [github.com/langgenius/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flanggenius%2Fdify) |
| **RAGFlow**     | 拖拽式工作流，多模态支持，权限管理 | Docker/云原生 | 企业团队，快速开发 | [github.com/infiniflow/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Finfiniflow%2Fragflow) |
| **AnythingLLM** | 极简UI，文档上传即聊天，本地部署   | Docker/本地   | 个人/小团队        | [github.com/Mintplex-La…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FMintplex-Labs%2Fanything-llm) |
| **Verba**       | Weaviate原生，语义搜索，聊天界面   | Docker        | Weaviate用户       | [github.com/weaviate/Ve…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fweaviate%2FVerba) |
| **Cognita**     | 企业MLOps，合规知识库，权限控制    | 云/本地       | 企业级应用         | [github.com/cognita-ai/…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fcognita-ai%2Fcognita) |

## 九、Agentic RAG（智能体驱动RAG）

| 项目名称      | 核心能力                         | 智能体类型     | 适用场景             | GitHub地址                                                   |
| ------------- | -------------------------------- | -------------- | -------------------- | ------------------------------------------------------------ |
| **LangGraph** | 状态管理，多Agent协作，循环执行  | 规划/执行/评估 | 复杂推理任务         | [github.com/langchain-a…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flangchain-ai%2Flanggraph) |
| **EDDI**      | 配置驱动，多Agent编排，企业合规  | 对话/工具调用  | 企业级AI助手         | [github.com/labsai/EDDI](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Flabsai%2FEDDI) |
| **Youtu-RAG** | 长期记忆，跨会话关联，个性化     | 规划/执行/记忆 | 智能客服，个性化推荐 | [github.com/TencentClou…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FTencentCloud%2FYoutu-RAG) |
| **AutoGPT**   | 自主任务执行，工具调用，内存管理 | 自主智能体     | 复杂信息收集         | [github.com/Significant…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2FSignificant-Gravitas%2FAutoGPT) |
| **MetaGPT**   | 团队协作，角色分配，任务拆解     | 多角色智能体   | 软件开发，项目管理   | [github.com/geekan/Meta…](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fgeekan%2FMetaGPT) |

## 十、选型指南（快速匹配）

| 应用场景          | 推荐框架            | 推荐向量数据库    | 推荐嵌入模型     | 备注                 |
| ----------------- | ------------------- | ----------------- | ---------------- | -------------------- |
| 企业级知识库      | Haystack/RAGFlow    | Milvus/Qdrant     | BGE-M3/E5        | 注重可扩展性和安全性 |
| 个人/小团队       | Dify/AnythingLLM    | Chroma/pgvector   | all-MiniLM-L6-v2 | 快速部署，低维护成本 |
| 研究/实验         | LlamaIndex/RAGLAB   | FAISS/Chroma      | 自定义模型       | 灵活定制，算法对比   |
| 多跳推理/知识图谱 | Microsoft GraphRAG  | NebulaGraph/Neo4j | BGE-M3           | 图结构增强检索       |
| 低代码/无代码     | Dify/RAGFlow        | 托管向量数据库    | 托管嵌入模型     | 业务人员友好         |
| Agent驱动应用     | LangGraph/Youtu-RAG | Milvus            | E5/BGE-M3        | 状态管理，长期记忆   |

------

## 总结

2026年RAG技术生态已形成**全栈开源体系**，从核心框架到细分工具全面覆盖。选择时建议：

1. 明确应用场景（企业级/个人/研究）
2. 评估技术需求（可扩展性/检索精度/开发效率）
3. 考虑团队技能（低代码/全栈开发）
4. 优先选择活跃社区和长期维护的项目



作者：Cosolar
链接：https://juejin.cn/post/7642718825403809838
来源：稀土掘金
著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。