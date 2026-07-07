# Build Pipeline Specification

## Purpose

定义 `scripts/build-posts.js` 的构建行为契约：如何扫描 Markdown、生成哪些产物、如何清理旧产物与重写图片路径。

## Requirements

### Requirement: Markdown 扫描

构建脚本 SHALL 递归扫描 `posts/` 下所有 `.md` 文件，跳过以 `.` 开头的文件和 `README.md`。

#### Scenario: 跳过 README.md

- **WHEN** 构建扫描到任意目录下的 `README.md`
- **THEN** 该文件不生成独立 HTML 页面（`build-posts.js:30`）
- **AND** 其内容被提取到 `archive.html` 内联展示（`build-posts.js:298-306`）

#### Scenario: 跳过 dot 文件

- **WHEN** 构建扫描到以 `.` 开头的文件（如 `.build-link-guide.md`）
- **THEN** 该文件被跳过，不参与构建（`build-posts.js:30`）

#### Scenario: 递归子目录

- **WHEN** `posts/AI/AI知识库/` 下存在嵌套子目录与 .md 文件
- **THEN** 递归扫描全部 .md，产物保留目录结构到 `posts-html/<相对路径>/<slug>.html`（`build-posts.js:194-196`）

### Requirement: 产物生成

构建 SHALL 生成以下产物：

- 每篇文章的 `posts-html/<dir>/<slug>.html`
- `index.html`（3D 首页）
- `archive.html`（归档页含目录树与搜索）
- `public/search-index.json`
- `public/sitemap.xml`
- `public/robots.txt`

#### Scenario: 产物齐全

- **WHEN** 运行 `npm run build`
- **THEN** 上述 6 类产物全部生成
- **AND** 控制台输出 `✅ Built N post(s)...`（`build-posts.js:850`）

### Requirement: 旧产物清理

构建 SHALL 在生成前清空 `posts-html/` 目录，避免删除文章后残留旧 HTML。

#### Scenario: 清空 posts-html

- **WHEN** 构建开始
- **THEN** `cleanDir(POSTS_HTML_DIR)` 清空 posts-html 下所有文件与空子目录（`build-posts.js:120-136`）
- **AND** 保留 posts-html 根目录本身

### Requirement: 图片路径重写

构建 SHALL 把文章中嵌套路径的图片引用（`../../public/images/xxx`）重写为绝对路径 `/images/xxx`。

#### Scenario: 嵌套文章图片路径

- **WHEN** 嵌套目录的文章引用 `../../public/images/foo.png`
- **THEN** 渲染后 src 被重写为 `/images/foo.png`（`build-posts.js:149`）
