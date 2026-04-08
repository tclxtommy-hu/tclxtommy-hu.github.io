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
      <div id="comments-widget"><p class="comments-loading">评论加载中…</p></div>
      <script>
      (async function(){
        var repo='tclxtommy-hu/tclxtommy-hu.github.io';
        var postPath='/posts-html/${post.slug}.html';
        var el=document.getElementById('comments-widget');
        var API='https://api.github.com/repos/'+repo;
        var HDR={Accept:'application/vnd.github.full+json'};
        function gh(u){
          return fetch(u,{headers:HDR}).then(function(r){
            if(r.status===403||r.status===429){throw new Error('ratelimit');}
            if(!r.ok){throw new Error(r.status);}
            return r.json();
          });
        }
        var newUrl='https://github.com/'+repo+'/issues/new?title='+encodeURIComponent(postPath)+'&labels='+encodeURIComponent('\ud83d\udcac comment');
        try{
          var issues=await gh(API+'/issues?state=open&per_page=100');
          var issue=Array.isArray(issues)&&issues.find(function(i){return i.title===postPath;});
          var btn='<a href="'+(issue?issue.html_url:newUrl)+'" target="_blank" rel="noopener" class="comment-btn">\ud83d\udcac '+(issue?'\u53bb GitHub \u8bc4\u8bba':'\u6210\u4e3a\u7b2c\u4e00\u4e2a\u8bc4\u8bba\u8005')+'</a>';
          if(!issue||issue.comments===0){el.innerHTML='<p class="comments-empty">\u6682\u65e0\u8bc4\u8bba</p>'+btn;return;}
          var comments=await gh(issue.comments_url+'?per_page=100');
          var html=comments.map(function(c){
            var d=new Date(c.created_at).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
            return '<div class="comment-item">'
              +'<div class="comment-meta">'
              +'<img src="'+c.user.avatar_url+'" class="comment-avatar" alt="" loading="lazy">'
              +'<a href="https://github.com/'+c.user.login+'" target="_blank" rel="noopener" class="comment-user">'+c.user.login+'</a>'
              +'<time class="comment-time">'+d+'</time>'
              +'</div>'
              +'<div class="comment-body">'+(c.body_html||c.body||'')+'</div>'
              +'</div>';
          }).join('');
          el.innerHTML='<div class="comments-list">'+html+'</div>'+btn;
        }catch(e){
          if(e.message==='ratelimit'){
            el.innerHTML='<p class="comments-error">GitHub \u8bc4\u8bba\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0\u3002'
              +'<a href="'+newUrl+'" target="_blank" rel="noopener" class="comment-btn" style="margin-left:12px">\ud83d\udcac \u53bb GitHub \u8bc4\u8bba</a></p>';
          }else{
            el.innerHTML='<p class="comments-error">\u8bc4\u8bba\u52a0\u8f7d\u5931\u8d25\uff0c<a href="https://github.com/'+repo+'/issues" target="_blank" rel="noopener">\u524d\u5f80 GitHub \u67e5\u770b</a></p>';
          }
        }
      })();
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
