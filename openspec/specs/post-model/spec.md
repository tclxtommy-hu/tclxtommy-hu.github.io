# Post Model Specification

## Purpose

定义文章 Markdown 的 frontmatter 字段契约、分类推导规则、摘要与目录（TOC）生成逻辑。

## Requirements

### Requirement: Frontmatter 字段

文章 Markdown SHALL 以 YAML frontmatter 开头，支持以下字段：

- `title`（字符串，必填，缺省回退到文件名 slug）
- `date`（日期，可选，缺省从文件名 `YYYY-MM-DD` 或文件 mtime 推导）
- `tags`（字符串数组，可选）
- `category`（字符串，可选，缺省从目录路径推导）
- `subcategory`（字符串，可选）
- `image`（字符串，可选，OG 图路径）

#### Scenario: title 缺省

- **WHEN** frontmatter 未提供 `title`
- **THEN** 文章标题回退为文件名（去 .md）（`build-posts.js:155`）

#### Scenario: date 缺省且文件名含日期

- **WHEN** frontmatter 无 `date`，且文件名匹配 `YYYY-MM-DD`
- **THEN** date 从文件名解析（`build-posts.js:182-186`）

#### Scenario: date 完全缺省

- **WHEN** frontmatter 无 `date` 且文件名不含 `YYYY-MM-DD`
- **THEN** date 回退为文件 mtime（`build-posts.js:188-190`）

### Requirement: 分类推导

分类 SHALL 优先取 frontmatter.category，否则从文章所在相对目录的第一段推导；subcategory 取后续路径段用 ` / ` 连接。

#### Scenario: frontmatter 优先

- **WHEN** frontmatter 提供 `category: AI`
- **THEN** 使用 `AI` 作为分类，忽略目录路径（`build-posts.js:164`）

#### Scenario: 目录推导

- **WHEN** frontmatter 无 category，文章位于 `posts/AI/AI知识库/01-AI基础概念/`
- **THEN** category = `AI`，subcategory = `AI知识库 / 01-AI基础概念`（`build-posts.js:46-52`）

#### Scenario: 根目录文章无分类

- **WHEN** 文章位于 `posts/` 根目录（如 `hello-world.md`）且无 frontmatter category
- **THEN** category 与 subcategory 均为空字符串（`build-posts.js:47`）

### Requirement: 文章摘要

构建 SHALL 从正文（去掉首个一级标题后）提取首段作为摘要，去除 Markdown 标记字符，截断至 150 字符。

#### Scenario: 摘要提取

- **WHEN** 文章正文首段为 `**加粗**内容`
- **THEN** 摘要为 `加粗内容`（去除 `*` 等标记），最长 150 字符（`build-posts.js:152-153`）

### Requirement: 目录与 TOC

构建 SHALL 从文章标题（h1-h4，排除与标题同名的 h1）生成目录（TOC），渲染为侧边栏导航，锚点 ID 由标题文本 slugify 而来并去重。

#### Scenario: TOC 生成

- **WHEN** 文章含 h2/h3 标题
- **THEN** 生成 `.post-toc` 侧边栏，含对应锚点链接（`build-posts.js:482-496`）

#### Scenario: 与标题同名的 h1 排除

- **WHEN** 文章首个 h1 文本与 frontmatter title 相同（忽略大小写）
- **THEN** 该 h1 不出现在 TOC 中（`build-posts.js:156-160`）
