---
title: Hello World - 博客启动
date: 2026-04-07
tags: [日志, 博客]
---

# Hello World

这是 **http200.cn** 的第一篇文章。

## 关于本站

> 作为个人的知识库体系的一部分。本站使用 Vite 构建，通过 GitHub Actions 自动部署到 GitHub Pages。
> 在日常与AI对话中，对于一些有益且需要积极归类的知识，我会将其记录到本站中。

> 本站的目的是提供一个方便的知识库，方便我自己查阅和分享。



### 工作流程

1. 在 `posts/` 目录下新建 `.md` 文件
2. 推送到 GitHub
3. GitHub Actions 自动编译并部署
4. 通过 http200.cn 即可访问
5. 其他

```shell
# ssh
ssh-keygen -t ed25519 -C "你的GitHub邮箱@example.com"

# 测试
ssh -T git@github.com
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes

# git代理
http.proxy → http://127.0.0.1:7897
https.proxy → http://127.0.0.1:7897

eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
git clone -c core.sshCommand="ssh -i ~/.ssh/id_ed25519" git@github.com:tclxtommy-hu/tclxtommy-hu.github.io.git
```

### Markdown 支持

支持完整的 Markdown 语法：

- **粗体** 和 *斜体*
- `行内代码` 和代码块
- 列表、引用、表格等

> 0 error, 0 warning — 这就是 http200 的含义。

```javascript
console.log('Hello from http200.cn!');
```

欢迎访问，您也可以fork本站来搭建自己的个人知识库站点！
