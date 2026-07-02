# DeepSeek LLM 语义标签 → 向量检索示例

使用 **DeepSeek Chat API** 让 LLM 先理解内容，再在自定义的语义维度上打分，将打分结果当作向量存储到 JSON 文件，实现相似度检索和 RAG 问答。

> **注意**：这不是传统 Embedding（模型内部隐式语义表示），而是 **LLM 语义标签 → 向量化存储**——LLM 的语义理解发生在打分阶段，向量只是分析结果的标签化载体。

## 打分原理

```
文本 → DeepSeek Chat API
     → System Prompt 定义 8 个语义维度（如：技术性、实用性、AI相关性...）
     → LLM 理解内容后，显式评价每个维度，输出评分 [0.00 ~ 1.00]
     → 8 维分数向量 → JSON 文件存储
```

8 个维度：技术性、实用性、理论性、AI/ML相关、前端相关、后端相关、入门友好度、创新性

## 与真正 Embedding 的区别

| | 真正 Embedding | 本方案 |
|---|---|---|
| **本质** | 模型的潜层语义表示 | LLM 显式推理后的属性标注 |
| **语义来源** | 向量本身就是语义的数学表达 | LLM 先理解，再"汇报"打分 |
| **维度含义** | 黑盒（768 维，不可解释） | 白盒（8 维，每维有名称） |
| **准确度** | 高（专门训练） | 中（多一层翻译损耗） |
| **优势** | 通用语义搜索 | 可解释、跨模态、灵活调维度 |

## 目录结构

```
demo/deepseek_ts_embedding/
├── .env.example
├── package.json
├── tsconfig.json
└── src/
    ├── config.ts          # 配置 + API Key 校验
    ├── embed.ts           # LLM 语义打分（prompt 定义维度）
    ├── vectorstore.ts     # JSON 存储 + 余弦相似度检索
    ├── index.ts           # 文档入库（7 篇示例文档）
    ├── search.ts          # 语义搜索（交互式 / 命令行参数）
    ├── query.ts           # RAG 问答（标签检索 → DeepSeek 生成）
    └── demo.ts            # 一键演示
```

## 快速开始

```bash
cd demo/deepseek_ts_embedding
cp .env.example .env   # 编辑填入 DEEPSEEK_API_KEY
npm install
```

| 命令 | 说明 |
|------|------|
| `npm run demo` | 一键演示：入库 → 3 组搜索 |
| `npm run index` | 入库 7 篇示例文档 |
| `npm run search` | 交互式语义搜索 |
| `npm run query "问题"` | RAG 问答 |

## 核心设计

- **纯 DeepSeek** — 语义打分和 RAG 生成都用 DeepSeek Chat API
- **LLM 语义标签** — System Prompt 定义维度，temperature=0 保证确定性打分
- **JSON 文件即向量库** — `data/vectors.json` + `data/docs.json`
- **暴力余弦相似度** — 全量计算，简单透明
- **零第三方依赖** — 只用 `dotenv` + 原生 `fetch`

## 工作流程

```
入库：文档 → DeepSeek Chat (语义打分) → 8维标签 → JSON
搜索：查询 → DeepSeek Chat (语义打分) → 余弦相似度 → Top-K
RAG ：检索到的标签 + DeepSeek Chat (生成回答)
```
