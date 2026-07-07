# Proposal: bootstrap-openspec-specs

## Why

OpenSpec 已 `openspec init` 接入本项目，但处于"裸装"状态：`config.yaml` 的 `context` 未填、`openspec/specs/` 为空、`changes/` 为空。这导致：

- AI 每次 propose/apply 都不知道项目的技术栈与**链接规则**，会写出导致 404 的 `.md` 链接（本项目最高频踩坑点，见 `posts/.build-link-guide.md`）。
- 后续任何变更的 delta specs 无所依附，"活文档"没有起点——OpenSpec 的核心价值（规格随代码演进）无法启动。

本变更为本项目建立 OpenSpec 的基线 context 与初始 specs，让框架真正可用。

## What Changes

1. **填充 `openspec/config.yaml` 的 `context`**：技术栈、构建命令、链接规则口诀、项目域名。
2. **新增 3 个基线 spec**（描述"现有系统是什么"，非新功能）：
   - `specs/build-pipeline/spec.md` — Markdown→HTML 构建管线
   - `specs/post-model/spec.md` — 文章 frontmatter 模型与分类推导
   - `specs/linking/spec.md` — 内部链接扩展名规则（最高频坑点）

## Non-goals

- 不修改 `build-posts.js`、`vite.config.js` 等任何构建代码。
- 不为 3D 首页、评论系统、SEO/OG 写 spec——这些短期不动，等有真实变更再补（OpenSpec 原则：会改的部分才值得写 spec）。
- 不新建文章内容。

## Impact

- 修改：`openspec/config.yaml`（填充 context）
- 新增（归档后进入 `openspec/specs/`）：3 个 spec 文件
- 零代码改动，零构建风险
