# HTTP200

> 最新 AI 技术、网络 IT、软件开发与编程技术分享 · [http200.cn](https://http200.cn)

个人技术博客 & AI 知识库，聚焦 **Agent 开发、大语言模型、AI 编程范式**等前沿话题。首页是一个 Three.js 驱动的 3D 交互空间，文章通过归档页浏览。

## 技术栈

| 类别 | 技术 |
|------|------|
| 构建工具 | Vite 8 |
| Markdown | gray-matter + marked |
| 图表 | Mermaid |
| 3D 渲染 | Three.js |
| 前端 | Vanilla JS（无框架） |
| 部署 | GitHub Pages + GitHub Actions |

## 内容分类

```
posts/
├── AI/
│   ├── AI实践/              ← Ollama、PyTorch、MCP 协议、向量数据库等实战
│   ├── AI知识库/            ← AI 基础 → Transformer → LLM → RAG → Agent 体系课程
│   ├── AI编程范式/           ← AI 辅助编程（Vibe Coding、Spec-Driven）与应用开发范式
│   ├── Agent设计模式/        ← ReAct、Plan-Execute、Reflection 等 9 种设计模式
│   └── Agent开发知识/        ← 工具调用、记忆系统、多智能体、安全评估等
├── Others/                  ← 杂项
├── hello-world.md           ← 开篇
├── hometown.md              ← 故乡：安徽安庆
└── second-hometown.md       ← 第二故乡：江苏苏州
```

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（支持热更新）
npm run dev

# 构建生产版本
npm run build

# 新建文章
npm run new
```

## 发布

推送到 `main` 分支，GitHub Actions 自动编译并部署到 GitHub Pages。

## 项目结构

```
posts/              ← Markdown 文章（按分类目录组织）
scripts/
  build-posts.js    ← 编译脚本（md → html）
  new-post.js       ← 新建文章脚手架
src/
  main.js           ← JS 入口 & 3D 场景
  three-room.js     ← Three.js 3D 房间
  style.css         ← 全局样式
public/             ← 静态资源（CNAME、图片、音频等）
.github/workflows/  ← CI/CD 配置
```