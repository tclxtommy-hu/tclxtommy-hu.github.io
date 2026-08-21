# 项目长期记忆（MEMORY.md）

## Markdown 编写规范（Cursor / WorkBuddy 双端统一）
仓库 `.md` 编写规范已统一，Cursor 端在 `.cursor/rules/*.mdc`，WorkBuddy 端镜像在 `.workbuddy/rules/*.mdc`（三者内容一致，便于双端同步）。编辑任何 `.md` 时务必遵守，全文要点：

1. **加粗留白**（`markdown-bold-spacing`）：`**加粗**` 两侧必须有空格（含中文冒号、句号前），否则本站渲染不处理加粗。
2. **英文音标**（`markdown-english-ipa`）：英文术语/专有名词/短语正文首次出现须附 IPA 音标（`**词** /ipa/`），仅首次；代码标识符、文件名、命令不加。
3. **缩写全拼+音标**（`markdown-abbreviation`）：所有缩写（ACL、RBAC、IdP、JWT 等）正文首次出现须同时给出全拼+IPA 音标，缩写≥2 个时文末加「本文缩写」汇总表。

> 完整规则以 `.workbuddy/rules/*.mdc` 为准；改动规范时两处 `.mdc` 需保持同步。
