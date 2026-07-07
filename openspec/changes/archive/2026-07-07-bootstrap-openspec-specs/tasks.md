# Tasks: bootstrap-openspec-specs

## 1. 填充 config.yaml
- [x] 1.1 在 `openspec/config.yaml` 写入 `context`：技术栈、构建命令、链接规则口诀、项目域名
- [x] 1.2 验证 YAML 语法正确

## 2. 编写基线 delta specs
- [x] 2.1 创建 `specs/build-pipeline/spec.md`（扫描、跳过、产物、清理）— 以 build-posts.js 行号为锚点
- [x] 2.2 创建 `specs/post-model/spec.md`（frontmatter 字段、分类推导、摘要提取）
- [x] 2.3 创建 `specs/linking/spec.md`（README 用 .md / 其他用 .html，含正反面场景）

## 3. 自检
- [x] 3.1 逐条核对每个 spec scenario 与 `build-posts.js` 源码行为一致
- [x] 3.2 确认 linking spec 与 `posts/.build-link-guide.md` 口诀一致

## 4. 归档
- [x] 4.1 `/opsx:archive` 把 delta specs 合并进 `openspec/specs/`，变更移入 `changes/archive/`
