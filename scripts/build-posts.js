/**
 * build-posts.js
 * Pre-build step: reads posts/*.md, generates:
 *   - index.html (post list)
 *   - posts-html/<slug>.html (each post page)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const POSTS_HTML_DIR = path.join(ROOT, 'posts-html');

// Ensure directories exist
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(POSTS_HTML_DIR)) fs.mkdirSync(POSTS_HTML_DIR, { recursive: true });

// Clean old generated HTML
for (const f of fs.readdirSync(POSTS_HTML_DIR)) {
  fs.unlinkSync(path.join(POSTS_HTML_DIR, f));
}

// Read all markdown files
const mdFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));

const posts = mdFiles.map(file => {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');
  const { data, content } = matter(raw);
  const slug = file.replace(/\.md$/, '');
  // Rewrite image paths: ../public/images/xxx -> /images/xxx (for production)
  const html = marked(content).replace(/(<img\s[^>]*src=")\.\.\/public\//g, '$1/');

  // Extract first paragraph as summary
  const summaryMatch = content.replace(/^#.+\n*/m, '').trim().split('\n\n')[0];
  const summary = summaryMatch ? summaryMatch.replace(/[#*`\[\]]/g, '').slice(0, 150) : '';

  return {
    slug,
    title: data.title || slug,
    date: data.date || slug.slice(0, 10) || 'unknown',
    tags: data.tags || [],
    summary,
    html,
  };
});

// Sort by date descending
posts.sort((a, b) => (b.date > a.date ? 1 : -1));

// ====== Generate search index ======
const searchIndex = posts.map(p => ({
  slug: p.slug,
  title: p.title,
  date: p.date,
  tags: p.tags,
  // Strip HTML tags for plain-text search content
  content: p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
}));
fs.writeFileSync(
  path.join(ROOT, 'public', 'search-index.json'),
  JSON.stringify(searchIndex),
  'utf-8'
);

// ====== Shared HTML fragments ======
const criticalCss = `
  <style>
    body { background: #0a0a0f; color: #e0e0e6; margin: 0; }
    .page-wrap { opacity: 0; animation: fadeIn .3s ease .05s forwards; }
    @keyframes fadeIn { to { opacity: 1; } }
  </style>`;

const headExtra = `
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0a0a0f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">${criticalCss}`;

// ====== Generate post pages ======
for (const post of posts) {
  const tagsHtml = post.tags.length
    ? `<span class="post-tags"> · ${post.tags.join(', ')}</span>`
    : '';

  const postHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - http200.cn</title>
  <meta name="description" content="${post.summary}">${headExtra}
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav><a href="/">首页</a><a href="https://github.com/tclxtommy-hu" target="_blank">GitHub</a></nav>
  </header>
  <main class="container">
    <article>
      <div class="post-header">
        <h1>${post.title}</h1>
        <div class="post-meta">${post.date}${tagsHtml}</div>
      </div>
      <div class="post-content">${post.html}</div>
    </article>
    <section class="comments-section">
      <h2 class="comments-title">评论</h2>
      <script src="https://utteranc.es/client.js"
        repo="tclxtommy-hu/tclxtommy-hu.github.io"
        issue-term="pathname"
        label="💬 comment"
        theme="github-dark"
        crossorigin="anonymous"
        async>
      <\/script>
    </section>
    <a href="/" class="back-link">← 返回首页</a>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(POSTS_HTML_DIR, `${post.slug}.html`), postHtml, 'utf-8');
}

// ====== Generate index.html ======
const listHtml = posts.length === 0
  ? '<p style="color:var(--text-muted);text-align:center;padding:60px 0;">还没有文章，在 <code>posts/</code> 目录下添加 Markdown 文件即可。</p>'
  : `<ul class="post-list">${posts.map(p => `
    <li class="post-item">
      <div class="post-title"><a href="/posts-html/${p.slug}.html">${p.title}</a></div>
      <div class="post-meta">${p.date}${p.tags.length ? ` · ${p.tags.join(', ')}` : ''}</div>
      ${p.summary ? `<div class="post-summary">${p.summary}</div>` : ''}
    </li>`).join('')}
  </ul>`;

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>http200.cn | 0 error, 0 warning</title>
  <meta name="description" content="http200.cn - TommyHu's blog">${headExtra}
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav><a href="/">首页</a><a href="https://github.com/tclxtommy-hu" target="_blank">GitHub</a></nav>
  </header>
  <main class="container">
    <h2 style="margin-bottom:24px;font-weight:700;color:#fff;">最新文章</h2>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="搜索文章标题、内容或标签…" autocomplete="off">
    </div>
    <div id="search-results" style="display:none;"></div>
    <div id="post-list-wrap">
    ${listHtml}
    </div>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml, 'utf-8');

console.log(`✅ Built ${posts.length} post(s), index.html updated.`);
