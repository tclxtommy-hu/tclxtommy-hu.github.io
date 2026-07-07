# Linking Specification

## Purpose

定义 `posts/` 下所有 Markdown 文件的内部链接扩展名规则，确保构建后链接可正确跳转。核心口诀：**README 用 .md，其他用 .html**。

## Requirements

### Requirement: README.md 内部链接用 .md

`README.md` 文件内的所有内部链接（指向本项目其他 .md 文件）SHALL 使用 `.md` 扩展名。构建时由 `rewriteReadmeLinks` 在归档页渲染时自动转换为 `/posts-html/.../.html` 绝对路径。

#### Scenario: README 链接同目录文章

- **WHEN** `posts/AI/AI编程范式/README.md` 中写 `[ReAct](01-ReAct模式.md)`
- **THEN** `rewriteReadmeLinks` 将其转为 `/posts-html/AI/AI编程范式/01-ReAct模式.html`（`build-posts.js:239-268`）

#### Scenario: README 跨目录上溯

- **WHEN** 子目录 README 中写 `[总索引](../README.md)`
- **THEN** 链接被正确重写为上级目录的 README 路径（`build-posts.js:260-264`）
- **AND** 被指向的 README 不生成独立页面（构建跳过），仅作归档页内联展示

#### Scenario: README 链接错误地用了 .html（反面）

- **WHEN** README 中写 `[ReAct](01-ReAct模式.html)`
- **THEN** `rewriteReadmeLinks` 不匹配（仅处理 `.md` 结尾），链接保持 `.html` 原样
- **AND** 由于 README 不生成独立页面，该相对 .html 链接在归档页上下文中可能解析错误

### Requirement: 普通 .md 文章内部链接用 .html

除 `README.md` 外的所有 .md 文件，其内部链接指向本项目其他文章时 SHALL 使用 `.html` 扩展名。因为 marked 渲染后保持链接原样不做转换，写 `.md` 会导致 404。

#### Scenario: 普通 post 用 .html（正确）

- **WHEN** `posts/.../01-ReAct模式.md`（非 README）中写 `[ReAct](01-ReAct模式.html)`
- **THEN** marked 渲染后链接保持 `01-ReAct模式.html`，正确跳转到同目录文章

#### Scenario: 普通 post 用 .md（错误，会 404）

- **WHEN** 普通 post 中写 `[ReAct](01-ReAct模式.md)`
- **THEN** marked 不转换，页面链接为 `01-ReAct模式.md`
- **AND** 访问该链接 404（服务器无此 .md 文件）

### Requirement: 链接规则口诀

项目 SHALL 遵循统一口诀：**README 用 .md，其他用 .html**。该规则适用于 `posts/` 下所有目录的所有 markdown 文件。

#### Scenario: 新建 post 目录检查

- **WHEN** 新建文章目录并放入 md 文件
- **THEN** 逐个文件判断：若文件名为 `README.md`，内部链接用 `.md`；否则用 `.html`（详见 `posts/.build-link-guide.md`）

#### Scenario: 外部链接与锚点不受影响

- **WHEN** 链接是 `https://`、`http://`、`mailto:`、`tel:`、`data:` 或以 `#` 开头的锚点
- **THEN** 链接规则不适用，保持原样（`build-posts.js:244-246`）
