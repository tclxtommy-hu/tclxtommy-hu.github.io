# http200.cn

个人博客，基于 Vite 构建，GitHub Actions 自动部署到 GitHub Pages。

## 使用方法

### 写文章

在 `posts/` 目录下新建 `.md` 文件，支持 front matter：

```markdown
---
title: 文章标题
date: 2026-04-07
tags: [标签1, 标签2]
---

正文内容...
```

文件名建议格式：`YYYY-MM-DD-slug.md`

### 本地预览

```bash
npm install
npm run dev
```

### 发布

推送到 `main` 分支即可，GitHub Actions 会自动编译部署。

## 项目结构

```
posts/           ← 在这里写 Markdown 文章
src/
  style.css      ← 全局样式
  main.js        ← JS 入口
scripts/
  build-posts.js ← 编译脚本（md → html）
public/
  CNAME          ← 自定义域名
.github/
  workflows/
    deploy.yml   ← CI/CD 工作流
```