# 项目长期记忆（MEMORY.md）

## Markdown 编写规范（Cursor / WorkBuddy / CodeBuddy 三端统一）
仓库 `.md` 编写规范已统一，三端规则文件内容一致：
- Cursor 端：`.cursor/rules/*.mdc`
- WorkBuddy 端：`.workbuddy/rules/*.mdc`
- CodeBuddy 端：`.codebuddy/rules/*.mdc`
- CodeBuddy 额外在 `.codebuddy/instructions.md` 内联摘要

编辑任何 `.md` 时务必遵守，全文要点：

1. **加粗留白**（`markdown-bold-spacing`）：`**加粗**` 两侧必须有空格（含中文冒号、句号前），否则本站渲染不处理加粗。
2. **英文音标**（`markdown-english-ipa`）：英文术语/专有名词/短语正文首次出现须附 IPA 音标（`**词** /ipa/`），仅首次；代码标识符、文件名、命令不加。
3. **缩写全拼+音标**（`markdown-abbreviation`）：所有缩写（ACL、RBAC、IdP、JWT 等）正文首次出现须同时给出全拼+IPA 音标，缩写≥2 个时文末加「本文缩写」汇总表。
4. **代码示例语言**（`code-sample-language`）：文章中代码示例优先 Node.js + TypeScript，其次 Python；不要以 Python 作为唯一示例。

> 完整规则以各端 `.rules/*.mdc` 为准；改动规范时三处 `.mdc` 需保持同步。
