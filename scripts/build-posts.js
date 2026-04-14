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

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function createHeadingId(text, slugCounts) {
  const base = slugifyHeading(text);
  const count = slugCounts.get(base) || 0;
  slugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function collectHeadings(tokens, slugCounts, headings = []) {
  for (const token of tokens) {
    if (token.type === 'heading') {
      const text = (token.text || '').trim();
      token._headingId = createHeadingId(text, slugCounts);
      headings.push({
        id: token._headingId,
        text,
        depth: token.depth,
      });
    }

    if (Array.isArray(token.tokens)) {
      collectHeadings(token.tokens, slugCounts, headings);
    }

    if (Array.isArray(token.items)) {
      for (const item of token.items) {
        if (Array.isArray(item.tokens)) {
          collectHeadings(item.tokens, slugCounts, headings);
        }
      }
    }
  }

  return headings;
}

const renderer = new marked.Renderer();
renderer.heading = function heading({ tokens, depth, _headingId }) {
  const text = this.parser.parseInline(tokens);
  return `<h${depth} id="${_headingId}">${text}</h${depth}>`;
};

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
  const tokens = marked.lexer(content);
  const headings = collectHeadings(tokens, new Map());
  // Rewrite image paths: ../public/images/xxx -> /images/xxx (for production)
  const html = marked.parser(tokens, { renderer }).replace(/(<img\s[^>]*src=")\.\.\/public\//g, '$1/');

  // Extract first paragraph as summary
  const summaryMatch = content.replace(/^#.+\n*/m, '').trim().split('\n\n')[0];
  const summary = summaryMatch ? summaryMatch.replace(/[#*`\[\]]/g, '').slice(0, 150) : '';

  const normalizedTitle = (data.title || slug).trim().toLowerCase();
  const tocHeadings = headings.filter(heading => {
    if (!heading.text) return false;
    if (heading.depth > 4) return false;
    return !(heading.depth === 1 && heading.text.trim().toLowerCase() === normalizedTitle);
  });

  // Format date nicely
  // Priority: frontmatter date > date from slug > file mtime > file birthtime
  const formatDate = (d) => d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  let dateStr;
  let sortDate; // for sorting

  if (data.date) {
    const d = data.date instanceof Date ? data.date : new Date(data.date);
    if (d instanceof Date && !isNaN(d)) {
      dateStr = formatDate(d);
      sortDate = d;
    } else {
      dateStr = String(data.date);
      sortDate = new Date(data.date);
    }
  } else {
    // Try to extract date from slug (e.g. 2026-04-07-xxx or xxx-2026-04-09)
    const m = slug.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const d = new Date(m[1]);
      dateStr = formatDate(d);
      sortDate = d;
    } else {
      // Fall back to file mtime then birthtime
      const filePath = path.join(POSTS_DIR, file);
      const stat = fs.statSync(filePath);
      sortDate = stat.mtime || stat.birthtime || new Date(0);
      dateStr = formatDate(sortDate);
    }
  }

  return {
    slug,
    title: data.title || slug,
    date: dateStr,
    sortDate,
    tags: data.tags || [],
    summary,
    html,
    tocHeadings,
  };
});

// Sort by date descending
posts.sort((a, b) => (b.sortDate > a.sortDate ? 1 : -1));

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

const keywordsMeta = '<meta name="keywords" content="HTTP200,AI技术,大模型,人工智能,AI应用,网络技术,IT运维,软件开发,编程教程,AI工具,大语言模型">';
const siteDesc = 'HTTP200专注分享最新AI技术、大模型应用、人工智能实战教程，同时提供网络技术、IT运维、服务器、软件开发等IT领域干货与技术经验。';

const headExtra = `
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0a0a0f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">${criticalCss}`;

function buildOgMeta({ title, description, url, type = 'website', image = '/icons/icon-512.png' }) {
  const fullImage = image.startsWith('http') ? image : `https://http200.cn${image}`;
  return `
  <link rel="canonical" href="https://http200.cn${url}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://http200.cn${url}">
  <meta property="og:image" content="${fullImage}">
  <meta property="og:site_name" content="http200.cn">
  <meta property="og:locale" content="zh_CN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${fullImage}">`;
}

function buildJsonLd({ type, title, description, url, datePublished = '', dateModified = '' }) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': type,
    name: title,
    description,
    url: `https://http200.cn${url}`,
    publisher: {
      '@type': 'Organization',
      name: 'http200.cn',
      logo: { '@type': 'ImageObject', url: 'https://http200.cn/icons/icon-512.png' },
    },
  };
  if (datePublished) ld.datePublished = datePublished;
  if (dateModified) ld.dateModified = dateModified;
  return `\n  <script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

// ====== Shared nav HTML ======
const navHtml = '<a href="/">首页</a><a href="/archive.html">归档</a><a href="https://github.com/tclxtommy-hu" target="_blank">GitHub</a>';

// ====== Generate post pages ======
for (const post of posts) {
  const tagsHtml = post.tags.length
    ? `<span class="post-tags"> · ${post.tags.join(', ')}</span>`
    : '';
  const tocHtml = post.tocHeadings.length
    ? `<aside class="post-toc" data-post-toc>
      <button type="button" class="post-toc-toggle" data-toc-toggle aria-expanded="false" aria-controls="post-toc-nav-${post.slug}">
        <span class="post-toc-title">目录</span>
        <span class="post-toc-toggle-text">展开</span>
      </button>
      <nav id="post-toc-nav-${post.slug}" class="post-toc-nav" aria-label="文章目录">
        <ol class="post-toc-list">${post.tocHeadings.map(heading => `
          <li class="post-toc-item depth-${heading.depth}">
            <a href="#${heading.id}" class="post-toc-link" data-toc-id="${heading.id}">${heading.text}</a>
          </li>`).join('')}
        </ol>
      </nav>
    </aside>`
    : '';

  const ogMeta = buildOgMeta({
    title: `${post.title} - http200.cn`,
    description: post.summary,
    url: `/posts-html/${post.slug}.html`,
    type: 'article',
  });
  const jsonLd = buildJsonLd({
    type: 'Article',
    title: post.title,
    description: post.summary,
    url: `/posts-html/${post.slug}.html`,
    datePublished: post.sortDate ? post.sortDate.toISOString().split('T')[0] : '',
    dateModified: post.sortDate ? post.sortDate.toISOString().split('T')[0] : '',
  });

  const postHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - http200.cn</title>
  <meta name="description" content="${post.summary}">
  ${keywordsMeta}${ogMeta}${jsonLd}${headExtra}
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav>${navHtml}</nav>
  </header>
  <main class="container container-post">
    <div class="post-layout${post.tocHeadings.length ? '' : ' no-toc'}">
      <div class="post-main">
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
      </div>
      ${tocHtml}
    </div>
    <a href="/" class="back-link">← 返回首页</a>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(POSTS_HTML_DIR, `${post.slug}.html`), postHtml, 'utf-8');
}

// ====== Generate index.html (only latest 3 posts) ======
const latestPosts = posts.slice(0, 3);
const listHtml = latestPosts.length === 0
  ? '<p style="color:var(--text-muted);text-align:center;padding:60px 0;">还没有文章，在 <code>posts/</code> 目录下添加 Markdown 文件即可。</p>'
  : `<ul class="post-list">${latestPosts.map(p => `
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
  <title>HTTP200 - 最新AI技术、网络IT、软件开发与编程技术分享</title>
  <meta name="description" content="${siteDesc}">
  ${keywordsMeta}${buildOgMeta({ title: 'HTTP200 - 最新AI技术、网络IT、软件开发与编程技术分享', description: siteDesc, url: '/' })}${buildJsonLd({ type: 'WebSite', title: 'HTTP200', description: siteDesc, url: '/' })}${headExtra}
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav>${navHtml}</nav>
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
    <div style="text-align:center;margin-top:24px;"><a href="/archive.html" style="color:var(--accent);font-size:0.95rem;">查看全部文章 →</a></div>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml, 'utf-8');

// ====== Generate archive.html ======
const archiveListHtml = posts.length === 0
  ? '<p style="color:var(--text-muted);text-align:center;padding:60px 0;">还没有文章。</p>'
  : `<ul class="archive-list">${posts.map(p => `
    <li class="archive-item">
      ${p.date ? `<span class="archive-date">${p.date}</span>` : ''}
      <a class="archive-title" href="/posts-html/${p.slug}.html">${p.title}</a>
    </li>`).join('')}
  </ul>`;

const archiveHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>归档 - HTTP200</title>
  <meta name="description" content="${siteDesc}">
  ${keywordsMeta}${buildOgMeta({ title: '归档 - HTTP200', description: siteDesc, url: '/archive.html' })}${buildJsonLd({ type: 'CollectionPage', title: '归档 - HTTP200', description: siteDesc, url: '/archive.html' })}${headExtra}
</head>
<body>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav>${navHtml}</nav>
  </header>
  <main class="container">
    <h2 style="margin-bottom:24px;font-weight:700;color:#fff;">文章归档</h2>
    ${archiveListHtml}
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'archive.html'), archiveHtml, 'utf-8');

// ====== Generate sitemap.xml ======
const SITE_URL = 'https://http200.cn';
const today = new Date().toISOString().split('T')[0];

const sitemapEntries = [];

// Static pages
sitemapEntries.push({ loc: '/', changefreq: 'daily', priority: '1.0', lastmod: today });
sitemapEntries.push({ loc: '/archive.html', changefreq: 'weekly', priority: '0.8', lastmod: today });

// Post pages
for (const post of posts) {
  sitemapEntries.push({
    loc: `/posts-html/${post.slug}.html`,
    changefreq: 'weekly',
    priority: '0.7',
    lastmod: post.sortDate ? post.sortDate.toISOString().split('T')[0] : today,
  });
}

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sitemapEntries.map(e => `  <url>
    <loc>${SITE_URL}${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

fs.writeFileSync(path.join(ROOT, 'public', 'sitemap.xml'), sitemapXml, 'utf-8');

// ====== Generate robots.txt ======
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml

# Baidu
User-agent: Baiduspider
Allow: /

# AI crawlers
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

# Block non-benefit crawlers
User-agent: AhrefsBot
Disallow: /

User-agent: SemrushBot
Disallow: /
`;

fs.writeFileSync(path.join(ROOT, 'public', 'robots.txt'), robotsTxt, 'utf-8');

console.log(`✅ Built ${posts.length} post(s), index.html, archive.html, sitemap.xml & robots.txt updated.`);
