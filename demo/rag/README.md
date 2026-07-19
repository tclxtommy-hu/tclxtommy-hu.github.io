# DeepSeek RAG 示例（Node.js + TypeScript + Yarn）

一个最小可运行的 **RAG（检索增强生成）**（Retrieval-Augmented Generation，检索增强生成） 示例，基于：

- **Node.js**（原生 `fetch`，零第三方 LLM 框架）
- **DeepSeek Chat API**（语义向量化 + 生成回答）
- **TypeScript** + **tsx** 运行
- **Yarn** 管理依赖
- **JSON 文件**作为轻量向量库（适合万级以内数据）

## 关于「Embedding」的重要说明

> **DeepSeek 官方 API 目前没有提供公开的 Embedding 接口**（仅有 `chat` / `reasoner`）。
> 因此本示例默认使用 **DeepSeek Chat 语义向量** 方案：让 LLM 在多个语义维度上打分，
> 把打分结果组成向量用于余弦相似度检索。这与同仓库 `deepseek_ts_embedding` 的思路一致，
> 也是当前「纯 DeepSeek」能做 RAG 的可行方式。
>
> 如果你需要**真实的稠密向量**，只需把 `EMBED_PROVIDER` 设为 `openai`，并配置任意
> OpenAI 兼容的 `/embeddings` 接口即可（见下方「切换真实 Embedding」）。

## 两种向量化策略

| 策略 | 设置 | 说明 | 额外依赖 |
|------|------|------|----------|
| 语义向量（默认） | `EMBED_PROVIDER=deepseek` | DeepSeek Chat 在 12 个语义维度打分 | 仅 DeepSeek Key |
| 真实 Embedding | `EMBED_PROVIDER=openai` | 调用 OpenAI 兼容 `/embeddings` | 需 OpenAI Key |

## 目录结构

```
demo/rag/
├── .env.example          # 环境变量模板
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── data/
│   └── docs/             # 待入库的原始文档（.md / .txt），可自由增删
└── src/
    ├── config.ts         # 配置 + API Key 校验
    ├── embedding.ts      # 可插拔向量化（DeepSeek 语义向量 / OpenAI Embedding）
    ├── chunk.ts          # 文档分块（重叠窗口）
    ├── vectorstore.ts    # JSON 向量存储 + 余弦相似度检索
    ├── rag.ts            # RAG 核心：检索 → 拼提示词 → 生成
    ├── index.ts          # 文档入库（分块 + 向量化）
    ├── search.ts         # 语义检索（交互式 / 命令行）
    ├── query.ts          # RAG 问答（命令行）
    └── demo.ts           # 一键演示
```

## 快速开始（默认 DeepSeek 语义向量）

```bash
cd demo/rag
cp .env.example .env          # 填入 DEEPSEEK_API_KEY，EMBED_PROVIDER 保持 deepseek
yarn install
yarn index                    # 把 data/docs 下的文档分块并向量化入库
yarn demo                     # 一键演示：入库 → 检索 → 问答
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `yarn index` | 读取 `data/docs` 文档 → 分块 → 向量化 → 存入 JSON |
| `yarn search` | 交互式语义检索（输入 `exit` 退出，`clear` 清空） |
| `yarn search "关键词"` | 单次语义检索 |
| `yarn query "你的问题"` | RAG 问答：检索相关片段 → DeepSeek 生成回答 |
| `yarn demo` | 一键演示完整 RAG 流程 |
| `yarn typecheck` | TypeScript 类型检查 |

## RAG 工作流程

```
入库：文档 → 分块(chunk) → 向量化 → 向量 + 原文存 JSON
检索：问题 → 向量化 → 余弦相似度 Top-K
生成：检索片段 + 问题 → DeepSeek Chat → 基于上下文的回答
```

## 切换为真实 Embedding（OpenAI 兼容）

编辑 `.env`：

```bash
EMBED_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_EMBED_MODEL=text-embedding-3-small
```

任何 OpenAI 兼容服务（OpenAI、自建 vLLM、本地 ollama-embeddings 等）均可，
只需改 `OPENAI_BASE_URL`。随后重新 `yarn index` 即可（向量维度由接口返回，自动适配）。

## 替换为自己的知识库

把你的 `.md` / `.txt` 文档放进 `data/docs/` 目录，运行 `yarn index` 即可。
也可修改 `src/index.ts` 的 `loadSourceDocs()` 接入数据库、网页等其他数据源。

## 说明

- 数据量较大时，可将 `vectorstore.ts` 的 JSON 存储替换为 Qdrant / Milvus / pgvector。
- 所有 API 调用均使用原生 `fetch`，未引入 `openai` 等 SDK，依赖仅 `dotenv`。
