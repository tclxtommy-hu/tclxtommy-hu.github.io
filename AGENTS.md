# Codex 项目指令（AGENTS.md）

本文件为 Codex 在本仓库中工作时的项目级指令，Codex 在生成与编辑代码/文档时需遵循以下规则。

## 项目说明

这是一个基于 Vite 构建的个人博客（http200.cn），通过 GitHub Actions 自动部署到 GitHub Pages。文章以 Markdown 形式存放在 `posts/` 目录下。

## Markdown 文件修改规则（强制）

当你 **创建或修改** 仓库中任意 `.md` 文件（包括 `posts/` 下的文章、各目录下的 `README.md` 等）时， **必须** 在文档第一个一级标题（H1，即 `# 标题`）的正下方添加一行"最后修改时间"。

### 规则细节

1. **定位标题**：找到文档中的第一个 `#` 一级标题。
   - 若文件开头有 YAML front matter（`---` 包裹的元信息块），则跳过 front matter，取其后的第一个 `#` 标题。
   - 若文件没有 front matter，则取文件第一个 `#` 标题。
2. **插入位置**：在 H1 标题行下方， **空一行** 后插入"最后修改时间"行，再空一行后接原文内容。
3. **格式**：使用引用块格式，时间取 **当前实际修改时间** ，格式为 `YYYY-MM-DD HH:mm`：

   ```markdown
   # 文档标题

   > 最后修改时间：2026-07-02 18:25

   正文内容...
   ```

4. **更新而非重复**：
   - 若 H1 下方已存在 `> 最后修改时间：...` 行，则 **更新** 其中的时间为本次修改时间，不要新增第二行。
   - 若不存在，则按上述格式新增。
5. **不要改动其他内容**：仅新增/更新"最后修改时间"行，不要因此改动正文、标题或 front matter 中的其他字段。
6. **时间来源**：使用本次编辑的实际时间（当前系统时间），不要使用固定值或占位符。

### 示例

修改前（无 front matter）：

```markdown
# Vibe Coding（氛围编程）

## 定义

正文...
```

修改后：

```markdown
# Vibe Coding（氛围编程）

> 最后修改时间：2026-07-02 18:25

## 定义

正文...
```

修改前（有 front matter）：

```markdown
---
title: Hello World
date: 2026-04-07
tags: [日志]
---

# Hello World

这是第一篇文章。
```

修改后：

```markdown
---
title: Hello World
date: 2026-04-07
tags: [日志]
---

# Hello World

> 最后修改时间：2026-07-02 18:25

这是第一篇文章。
```

## Markdown 内部链接规则（强制）

> 背景：`scripts/build-posts.js` 对不同文件类型的链接处理不同。详细技术分析见 `posts/.build-link-guide.md`。

**规则只有一句：README 用 .md，其他用 .html。**

| 当前编辑的文件类型 | 链接到其他 md 文件时用什么扩展名 | 原因 |
|-------------------|-------------------------------|------|
| **README.md** | `.md` | `rewriteReadmeLinks()` 自动 `.md` → `.html` |
| **普通 .md post** | `.html` | `marked` 渲染后链接保持原样，不转换 |

### 正确写法

```markdown
<!-- ✅ README.md 内部链接 → 用 .md -->
[ReAct 模式](01-ReAct模式.md)
[上级总索引](../README.md)

<!-- ✅ 普通 post 内部链接 → 用 .html -->
[ReAct 模式](01-ReAct模式.html)
[上级总索引](../README.html)
```

### 新建 post 目录检查清单

每次在 `posts/` 下新建目录时：
- [ ] 每个文件是 README.md 还是普通 post？
- [ ] README.md 中所有内部链接是否用了 `.md`？
- [ ] 普通 post 中所有内部链接是否用了 `.html`？
- [ ] 相对路径是否正确（`../` 可安全使用）？

## 代码示例语言约定（强制）

在本仓库文章（`.md`）中编写代码示例时， **语言选择顺序固定** ：

1. **首选 Node.js + TypeScript（Node.js + TS）**：所有 SDK 调用、脚本、工具函数示例，默认用 TS 写成，尽量带类型标注。
2. **次选 Python**：仅当 TS 示例不足以说明（如某 SDK 无 TS 类型）时，再补 Python 版本； **不要以 Python 作为唯一示例** 。
3. **其他语言**（Go / Java / Bash 等）：仅作必要补充，不作为主示例。

同一概念有多语言示例时，用注释或小节标题区分「主示例（TS）」与「补充（Python）」。已发布的 Python 为主旧文档不强行全量回改，重构/大幅增补时逐步改为 TS 优先。

完整规则见 `.codex/rules/code-sample-language.mdc` 与 `.cursor/rules/code-sample-language.mdc`（多端同步）。

## 文档方法论 + 落地示例（强制）

写或补本仓库知识库 / 学习路线 / 技术方案类 `.md` 时， **禁止通篇纯方法论** 。每讲一个抽象概念、流程或原则，必须紧跟落地示例，让读者「照着就能做」。

合格示例至少满足其一：
1. **贯穿案例**：虚构但真实感足够的业务场景，带真实数字；
2. **可运行代码**：完整到能直接跑（含 import、类型标注），语言遵守 `code-sample-language`；
3. **具体数据样例**：展示数据的「真实样子」，不是抽象分类；
4. **端到端排期**：把方法论排成周级计划 + 工具栈表。

完整规则见 `.codex/rules/doc-method-with-examples.mdc`。

## Markdown 编写规范细则

以下规则详见 `.codex/rules/`（与 `.cursor/rules/` 、 `.codebuddy/rules/` 、 `.workbuddy/rules/` 多端同步）：

| 规则文件 | 说明 |
|----------|------|
| `markdown-bold-spacing.mdc` | 加粗两侧必须留空格，否则本站渲染不生效 |
| `markdown-english-ipa.mdc` | 英文术语首次出现须附 IPA 音标 |
| `markdown-abbreviation.mdc` | 缩写首次出现须附全拼与音标，文末推荐汇总表 |
| `code-sample-language.mdc` | 代码示例优先 Node.js + TS，其次 Python |
| `doc-method-with-examples.mdc` | 文档不能单纯讲方法论，每个概念必须配落地示例 |

编辑任何 `.md` 时务必遵守。

## 其他约定

- 中文文档，请使用中文回复与注释。
- 文件名建议格式：`YYYY-MM-DD-slug.md`。
- 写文章时在 `posts/` 目录下新建 `.md` 文件，支持 front matter（`title` / `date` / `tags`）。
- 不要删除 `.codex` 、 `.codebuddy` 、 `.cursor` 、 `.workbuddy` 目录，其中存放项目相关数据与配置。
- 详细构建链接规则见 `posts/.build-link-guide.md`。