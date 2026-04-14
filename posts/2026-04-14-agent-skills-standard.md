---
title: Agent Skills 标准指南
date: 2026-04-14
tags: [agent-skills, ai-agent, npx-skills, guide]
---

# Agent Skills 标准指南

现在我明白了！你指的是 **Agent Skills** 标准，这是一个通用的 AI Agent 技能包格式，通过 `npx skills add` 命令来管理。这是由 Vercel Labs 推出的开放标准。

## 什么是 Agent Skills？

Agent Skills 是为 AI 编程代理（如 Claude Code、Cursor、Codex 等）设计的可重用技能包。每个 Skill 都包含封装好的指令和脚本，用于扩展 Agent 的能力。

## 核心标准格式

### 文件结构
```
skill-name/
├── SKILL.md (必需)
│   ├── YAML frontmatter (name, description)
│   └── Markdown instructions
└── resources/ (可选)
    ├── scripts/      - 自动化脚本
    ├── references/   - 参考文档
    └── assets/       - 资源文件
```

### SKILL.md 结构
```markdown
---
name: skill-name
description: 简明描述技能功能和触发条件
---

# 技能名称

详细使用说明...
```

## 安装和管理命令

### 安装技能
```bash
# 从 GitHub 安装
npx skills add vercel-labs/agent-skills

# 全局安装
npx skills add vercel-labs/agent-skills -g

# 安装到特定 Agent
npx skills add vercel-labs/agent-skills --agent claude-code cursor

# 只安装特定技能
npx skills add vercel-labs/agent-skills --skill pr-review commit
```

### 管理技能
```bash
# 列出已安装的技能
skills list          # 项目级技能
skills ls -g         # 全局技能

# 搜索技能
skills find          # 交互式搜索
skills find typescript  # 关键词搜索

# 移除技能
skills remove web-design
skills rm --global frontend-design

# 更新技能
skills update        # 更新所有技能
skills update my-skill  # 更新特定技能
```

## 实际示例

### Vercel 官方技能集包含：

1. **React/Next.js 性能优化**
   - 40+ 条规则，8个类别
   - 使用场景：编写新组件、代码审查、性能优化

2. **UI 最佳实践审查**
   - 100+ 条规则
   - 覆盖：可访问性、性能、UX 设计

3. **React Native 最佳实践**
   - 16条规则，7个部分
   - 针对移动应用开发优化

4. **Vercel 部署**
   - 直接部署到 Vercel
   - 自动检测框架并返回预览链接

## 创建自定义技能

### 初始化模板
```bash
# 创建新的技能目录
skills init my-skill
```

这会生成一个包含 `SKILL.md` 的基础模板。

### 发布到仓库
将你的技能发布到 GitHub 仓库，然后其他人可以通过：
```bash
npx skills add your-username/repo-name
```

## 技能发现

- **官方目录**: https://skills.sh
- **GitHub**: 搜索 "agent-skills" 或 "ai-agent-skills"
- **热门集合**: 
  - Microsoft Azure Skills (3.4M+ 使用量)
  - GitHub Copilot for Azure (2.3M+ 使用量)
  - Vercel 官方技能集

## Python 脚本执行环境

这是一个重要的实际问题：当你安装的 Skill 包含 Python 脚本时，这些脚本在哪里执行？

### 执行环境取决于具体的 Agent 实现

Agent Skills 标准本身**不规定执行环境**，而是由各个 AI Agent 平台来决定如何处理脚本：

#### 1. **本地执行（需要你安装 Python）**
- **OpenClaw**: 默认在你的本地环境中执行脚本，所以你需要预先安装 Python
- **某些桌面 Agent**: 直接调用系统命令，依赖本地环境

#### 2. **沙盒/容器化执行（不需要本地安装）**
- **Claude Code**: 在隔离的沙盒环境中执行，内置了常用语言运行时
- **Cursor**: 可能在容器中执行，提供标准开发环境
- **云原生 Agent**: 在服务器端的容器中执行脚本

#### 3. **混合模式**
- 有些 Agent 会先检查本地环境，如果没有则使用内置运行时
- 或者提供配置选项让用户选择执行模式

### 如何确定你的 Agent 使用哪种模式？

#### 检查技能文档
查看 SKILL.md 文件，通常会注明环境要求：
```markdown
## Requirements
- Python 3.8+
- Required packages: pandas, requests
```

#### 测试执行
你可以尝试运行一个简单的 Python 脚本技能，观察错误信息：
- 如果提示 "python not found" → 需要本地安装
- 如果正常执行 → 使用沙盒环境

#### 查看 Agent 文档
不同 Agent 的文档会说明其执行环境：
- **OpenClaw**: 本地执行（参考你的 MEMORY.md 中提到的 PowerShell 环境）
- **Claude Desktop**: 沙盒执行
- **Cursor**: 容器化执行

### 最佳实践建议

#### 对于技能开发者：
1. **明确声明依赖**：在 SKILL.md 中清楚说明需要的运行时和包
2. **提供 fallback**：考虑提供多种实现（如 Python + Node.js 版本）
3. **环境检测**：在脚本开头添加环境检查逻辑

#### 对于技能使用者：
1. **查看依赖要求**：安装前先阅读 SKILL.md
2. **测试简单脚本**：确认执行环境是否符合预期
3. **配置本地环境**：如果使用本地执行的 Agent，确保安装必要的运行时

### 你的具体情况

根据你的 MEMORY.md 记录，你使用的是 **OpenClaw**，它默认在**本地环境**中执行脚本。这意味着：

✅ **你需要在本地安装 Python**  
✅ 脚本会使用你系统中的 Python 解释器  
✅ 你需要手动安装脚本所需的 Python 包

如果你希望避免管理本地 Python 环境，可以考虑：
1. 使用支持沙盒执行的其他 Agent（如 Claude Code）
2. 在 OpenClaw 中配置特定的执行环境
3. 选择只包含纯文本指令、不依赖脚本的技能

## 技术细节

- **兼容性**: 支持 Claude Code、Cursor、Codex、Gemini Code Assist 等主流编码 Agent
- **自动加载**: 安装后技能自动可用，无需额外配置
- **智能触发**: Agent 根据 SKILL.md 中的 description 自动判断何时使用该技能

这个标准的核心优势是**跨平台兼容性**——同一个技能可以在不同的 AI 编码工具中工作，让开发者可以构建真正可重用的 AI 辅助工具！