# RAG 与知识集成

> 一句话定义：把 RAG 作为 Agent 的"知识工具"，让 Agent 在需要时检索外部知识，而非全靠参数记忆。

## 1. Agent 为什么需要 RAG
- LLM 知识有截止日期，不知最新/私有信息。
- Agent 执行任务常需查文档、查数据库、查实时数据。
- RAG 让 Agent 按需检索，把"记忆"外置可更新。

## 2. RAG 作为 Agent 工具
- 把"检索知识库"封装为一个 Tool。
- Agent 在推理中判断需要时调用该 Tool。
- 与其他工具（搜索、API）并列，由 Agent 选择。

## 3. 集成模式

### 单次检索
- Agent 一次检索后基于结果作答/行动。
- 适合简单知识问答。

### 多跳检索（Multi-hop）
- 复杂问题需多次检索，逐步综合。
- 例：先查"X 公司 CEO"再查"该 CEO 学历"。
- 需 Agent 规划检索路径。

### 主动检索（Agentic RAG）
- Agent 自决定是否检索、检索什么、何时停止。
- 比固定 RAG pipeline 更灵活。

## 4. 知识源类型
- 文档库：产品手册、Wiki、论文。
- 结构化数据：数据库、知识图谱。
- 实时数据：搜索 API、新闻。
- 代码库：符号检索（Agent 编程场景）。

## 5. 设计要点
- **检索质量是关键**：召回不准会误导 Agent。
- **切分与重排**：见 RAG 基础（切分、混合检索、rerank）。
- **结果裁剪**：只注入最相关片段，避免上下文膨胀。
- **引用校验**：Agent 引用需核对真实存在。
- **与记忆区分**：RAG 是外部知识，记忆是历史经验，别混用。

## 6. 实战示例
**场景**：客服 Agent 处理产品问题。
1. 用户问"X 型号故障码 E07 怎么办？"
2. Agent 判断需查手册 → 调 `searchManual("X E07")` 工具。
3. RAG 检索返回相关章节 → Agent 基于片段回答并标注引用。
4. 若片段不足 → Agent 二次检索（多跳）或转人工。

## 7. 学习要点
- RAG 是 Agent 的"知识工具"，按需调用。
- Agentic RAG 比固定 pipeline 更灵活。
- 检索质量决定 Agent 知识类任务的上限。

## 8. 参考资料
- "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection"
- GraphRAG（Microsoft）
- LlamaIndex / LangChain RAG + Agent 文档