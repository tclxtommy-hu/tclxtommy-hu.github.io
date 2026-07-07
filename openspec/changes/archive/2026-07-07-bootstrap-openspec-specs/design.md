# Design: bootstrap-openspec-specs

## Context

本项目是单脚本驱动的静态博客，核心是 `scripts/build-posts.js`（约 850 行），技术栈 Vite 8 + Vanilla JS + Three.js + marked + gray-matter。OpenSpec 已 `init`（`schema: spec-driven`）但未配置 context、specs 为空。

## Decisions

### 1. config.yaml 的 context 写什么

写 AI 在 propose/apply 时最需要的三类信息：

- **技术栈**：让 AI 知道用什么渲染、什么框架（避免建议 React 组件等不存在的东西）
- **构建命令**：`npm run dev/build`、`npm run new`
- **链接规则口诀**：`README 用 .md，其他用 .html`——这是最高 ROI，写进 context 后 AI 永不踩 404 坑

### 2. 为什么基线 specs 走"变更流程"而非直接手写

- 走完整 `propose → apply → archive` 闭环，验证 OpenSpec 在本项目的可用性（用户选择本方向的目的）
- archive 时验证 delta specs 合并进 `openspec/specs/` 的"活文档"机制
- 留档可追溯（`changes/archive/<date>-bootstrap-openspec-specs/`）

### 3. 基线 specs 的粒度

3 个核心域，对应 `build-posts.js` 的三大职责：

| Spec 域 | 对应职责 | 为什么独立 |
|---------|---------|-----------|
| build-pipeline | md→html 流程、跳过、产物 | 构建行为的核心契约 |
| post-model | frontmatter、分类、摘要 | 内容作者最常触碰 |
| linking | 链接扩展名规则 | 最高频踩坑点，独立成 spec 便于 delta 引用 |

不为 3D 首页/评论/SEO 写——OpenSpec 原则"会改的部分才值得写 spec"，这些短期不动。

### 4. delta spec 格式

采用 OpenSpec spec-driven schema 的 `requirement + scenario` 格式。本变更是建立基线，delta 全部用 `## ADDED Requirements`，归档时整体合并为新 spec。

每个 scenario 以 `build-posts.js` 的源码行号为锚点，确保 spec 与实现可核对。

## Risks

- **spec 与源码行为不符**：会误导后续变更 → 以行号为锚点逐条核对（见各 spec 引用的行号）。
- **过度规格化**：基线 spec 写太细会限制后续改动 → 只写"不变就出错"的契约，不写实现细节。
