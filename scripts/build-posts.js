/**
 * build-posts.js
 * Pre-build step: reads posts/**​/*.md recursively, generates:
 *   - index.html (post list)
 *   - posts-html/<slug>.html (each post page, preserving directory structure)
 *   - archive.html with category filtering
 *   - search-index.json with category support
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

// ====== Utility: recursive directory scan for .md files ======
function findMdFiles(dir, baseDir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'README.md') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push({
        fullPath,
        relativePath: path.relative(baseDir, fullPath),
        relativeDir: path.relative(baseDir, path.dirname(fullPath)),
      });
    }
  }
  return results;
}

// ====== Utility: derive category / subcategory from path ======
function deriveCategories(relativeDir) {
  if (!relativeDir || relativeDir === '.') return { category: '', subcategory: '' };
  const parts = relativeDir.split(path.sep);
  const category = parts[0] || '';
  const subcategory = parts.length > 1 ? parts.slice(1).join(' / ') : '';
  return { category, subcategory };
}

// Escape text for use inside HTML attributes (double-quoted)
function attrEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

// Clean old generated HTML (recursive)
function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanDir(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  // Remove empty subdirectories (but keep posts-html root)
  if (dir !== POSTS_HTML_DIR) {
    try { fs.rmdirSync(dir); } catch (_) { /* not empty */ }
  }
}
cleanDir(POSTS_HTML_DIR);

// Read all markdown files recursively
const mdFiles = findMdFiles(POSTS_DIR, POSTS_DIR);

const posts = mdFiles.map(({ fullPath, relativeDir }) => {
  const raw = fs.readFileSync(fullPath, 'utf-8');
  const { data, content } = matter(raw);
  const slug = path.basename(fullPath, '.md');
  const tokens = marked.lexer(content);
  const headings = collectHeadings(tokens, new Map());

  // Rewrite image paths: ../../public/images/xxx → /images/xxx (for nested posts)
  const html = marked.parser(tokens, { renderer }).replace(/(<img\s[^>]*src=")(?:\.\.\/)*public\//g, '$1/');

  // Extract first paragraph as summary
  const summaryMatch = content.replace(/^#.+\n*/m, '').trim().split('\n\n')[0];
  const summary = summaryMatch ? summaryMatch.replace(/[#*`\[\]]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').slice(0, 150).trim() : '';

  const normalizedTitle = (data.title || slug).trim().toLowerCase();
  const tocHeadings = headings.filter(heading => {
    if (!heading.text) return false;
    if (heading.depth > 4) return false;
    return !(heading.depth === 1 && heading.text.trim().toLowerCase() === normalizedTitle);
  });

  // Derive category from frontmatter first, then from directory path
  const pathCategories = deriveCategories(relativeDir);
  const category = data.category || pathCategories.category;
  const subcategory = data.subcategory || pathCategories.subcategory;

  // Format date nicely
  const formatDate = (d) => d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  let dateStr;
  let sortDate;

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
    const m = slug.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const d = new Date(m[1]);
      dateStr = formatDate(d);
      sortDate = d;
    } else {
      const stat = fs.statSync(fullPath);
      sortDate = stat.mtime || stat.birthtime || new Date(0);
      dateStr = formatDate(sortDate);
    }
  }

  // Build output path preserving directory structure
  const outputDir = path.join(POSTS_HTML_DIR, relativeDir);
  const outputFile = path.join(outputDir, `${slug}.html`);

  return {
    slug,
    title: data.title || slug,
    date: dateStr,
    sortDate,
    tags: data.tags || [],
    category,
    subcategory,
    summary,
    image: data.image || '',
    html,
    tocHeadings,
    relativeDir,      // e.g. "AI/AI知识库/01-AI基础概念"
    outputFile,       // absolute path for writing
  };
});

// Sort by date descending
posts.sort((a, b) => (b.sortDate > a.sortDate ? 1 : -1));

// ====== Generate search index (with category support) ======
const searchIndex = posts.map(p => ({
  slug: p.slug,
  title: p.title,
  date: p.date,
  tags: p.tags,
  category: p.category,
  subcategory: p.subcategory,
  relativeDir: p.relativeDir,
  // Strip HTML tags for plain-text search content
  content: p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
}));
fs.writeFileSync(
  path.join(ROOT, 'public', 'search-index.json'),
  JSON.stringify(searchIndex),
  'utf-8'
);

// ====== Rewrite relative .md links in README HTML to absolute HTML paths ======
// README is displayed on /archive.html, so relative .md links must be converted
// to absolute /posts-html/<dir>/<file>.html URLs to work correctly.
function rewriteReadmeLinks(html, readmeRelDir) {
  // Normalize to forward slashes (POSIX style)
  const baseDir = (readmeRelDir || '').replace(/\\/g, '/');
  return html.replace(/(<a\s+[^>]*href=")([^"]*)("[^>]*>)/gi, (match, pre, href, post) => {
    // Skip external URLs, anchors, mailto, tel, data URIs
    if (/^(https?:)?\/\//i.test(href)) return match;
    if (href.startsWith('#')) return match;
    if (/^(mailto:|tel:|data:)/i.test(href)) return match;

    // Split off any anchor fragment (#section)
    let anchor = '';
    let linkPath = href;
    const hashIdx = linkPath.indexOf('#');
    if (hashIdx !== -1) {
      anchor = linkPath.slice(hashIdx);
      linkPath = linkPath.slice(0, hashIdx);
    }

    // Only rewrite links to .md files
    if (!linkPath.endsWith('.md')) return match;

    // Resolve path relative to README's directory, normalize ../ and ./
    const resolved = path.posix.join('/', baseDir, linkPath);
    // Change .md extension to .html
    const htmlPath = resolved.replace(/\.md$/, '.html');
    const newHref = '/posts-html' + htmlPath + anchor;

    return pre + newHref + post;
  });
}

// ====== Build directory tree ======
function buildPostsTree(baseDir) {
  const root = { name: '全部', path: '', children: [], posts: [], readme: null, totalCount: 0 };

  function walk(dir, node, relPath) {
    node.path = relPath;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // Sort: folders first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    let readmeHtml = null;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const childRelPath = path.relative(baseDir, fullPath);
        const child = { name: entry.name, path: childRelPath, children: [], posts: [], readme: null, totalCount: 0 };
        walk(fullPath, child, childRelPath);
        // Include if it has children or any .md files (we count posts later)
        const hasContent = child.children.length > 0 || fs.readdirSync(fullPath).some(f => f.endsWith('.md') && f !== 'README.md');
        if (hasContent) {
          node.children.push(child);
        }
      } else if (entry.isFile() && entry.name === 'README.md') {
        if (!relPath) continue; // skip root README
        // Read and render README.md, rewriting relative .md links to absolute HTML paths
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { content } = matter(raw);
          readmeHtml = rewriteReadmeLinks(marked.parse(content), relPath);
        } catch (_) { /* ignore */ }
      }
    }
    node.readme = readmeHtml;
  }

  walk(baseDir, root, '');

  // Attach posts to tree nodes
  for (const p of posts) {
    const dirPath = p.relativeDir;
    if (!dirPath) {
      root.posts.push(p);
      root.totalCount++;
      continue;
    }

    // Find or create nodes for each path segment
    const parts = dirPath.split(path.sep);
    let currentNode = root;
    for (let i = 0; i < parts.length; i++) {
      const segPath = parts.slice(0, i + 1).join(path.sep);
      let child = currentNode.children.find(c => c.path === segPath);
      if (!child) {
        child = { name: parts[i], path: segPath, children: [], posts: [], readme: null, totalCount: 0 };
        currentNode.children.push(child);
      }
      currentNode = child;
      currentNode.totalCount++;
    }
    currentNode.posts.push(p);
    root.totalCount++;
  }

  return root;
}

const postsTree = buildPostsTree(POSTS_DIR);

// ====== Generate tree HTML ======
function buildTreeHtml(node, level) {
  const name = node.path ? node.name : '全部';
  const indent = '  '.repeat(level);
  const hasChildren = node.children.length > 0;
  const hasPosts = node.posts.length > 0;

  if (!hasChildren && !hasPosts) return '';

  // Every non-empty node is a collapsible folder
  const open = (level === 0 || level === 1) ? ' open' : '';
  let html = `${indent}<details class="tree-folder" data-path="${node.path}"${open}>\n`;
  html += `${indent}  <summary class="tree-node${level === 0 ? ' tree-root' : ''}" data-path="${node.path}">`;
  html += level === 0 ? '' : '📁 ';
  html += `${name} <span class="tree-count">${node.totalCount}</span></summary>\n`;

  // Sub-folders first
  for (const child of node.children) {
    html += buildTreeHtml(child, level + 1);
  }
  // Then individual posts (as links)
  for (const p of node.posts) {
    const postUrl = p.relativeDir
      ? `/posts-html/${p.relativeDir}/${p.slug}.html`
      : `/posts-html/${p.slug}.html`;
    html += `${indent}  <a href="${postUrl}" class="tree-post" data-slug="${p.slug}" data-path="${p.relativeDir || ''}">📄 ${attrEscape(p.title)}</a>\n`;
  }

  html += `${indent}</details>\n`;
  return html;
}

const treeHtml = `<div class="archive-tree" id="archive-tree">\n${buildTreeHtml(postsTree, 0)}\n</div>`;

// ====== Generate tree JSON for JS ======
function treeToJson(node) {
  return {
    name: node.name,
    path: node.path,
    readme: node.readme,
    totalCount: node.totalCount,
    children: node.children.map(treeToJson),
    posts: node.posts.map(p => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      relativeDir: p.relativeDir,
    })),
  };
}
const treeJson = JSON.stringify(treeToJson(postsTree));

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
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  </script>${criticalCss}`;

function buildOgMeta({ title, description, url, type = 'website', image = '/icons/icon-512.png' }) {
  const fullImage = image.startsWith('http') ? image : `https://http200.cn${image}`;
  const cleanDesc = attrEscape(description.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
  const escTitle = attrEscape(title);
  return `
  <link rel="canonical" href="https://http200.cn${url}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escTitle}">
  <meta property="og:description" content="${cleanDesc}">
  <meta property="og:url" content="https://http200.cn${url}">
  <meta property="og:image" content="${fullImage}">
  <meta property="og:site_name" content="http200.cn">
  <meta property="og:locale" content="zh_CN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escTitle}">
  <meta name="twitter:description" content="${cleanDesc}">
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
  // Build category breadcrumb HTML
  let categoryHtml = '';
  if (post.category) {
    const parts = [post.category];
    if (post.subcategory) parts.push(...post.subcategory.split(' / '));
    categoryHtml = `<span class="post-category"> · ${parts.map((p, i, arr) => {
      // Link to archive with category filter
      const filter = arr.slice(0, i + 1).join('/');
      return `<a href="/archive.html?path=${encodeURIComponent(filter)}" title="在归档中查看: ${p}">${p}</a>`;
    }).join(' › ')}</span>`;
  }

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

  // Build post URL preserving directory structure
  const postUrl = post.relativeDir
    ? `/posts-html/${post.relativeDir}/${post.slug}.html`
    : `/posts-html/${post.slug}.html`;

  const ogMeta = buildOgMeta({
    title: `${post.title} - http200.cn`,
    description: post.summary,
    url: postUrl,
    type: 'article',
    image: post.image || undefined,
  });
  const jsonLd = buildJsonLd({
    type: 'Article',
    title: post.title,
    description: post.summary,
    url: postUrl,
    datePublished: post.sortDate ? post.sortDate.toISOString().split('T')[0] : '',
    dateModified: post.sortDate ? post.sortDate.toISOString().split('T')[0] : '',
  });

  const postHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - http200.cn</title>
  <meta name="description" content="${attrEscape(post.summary)}">
  <meta property="article:published_time" content="${post.sortDate ? post.sortDate.toISOString() : ''}">
  ${post.tags.length ? `<meta property="article:tag" content="${post.tags.join(',')}">` : ''}
  ${post.category ? `<meta property="article:section" content="${post.category}">` : ''}
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
            <div class="post-meta">${post.date}${categoryHtml}${tagsHtml}</div>
          </div>
          <div class="post-content">${post.html}</div>
        </article>
        <section class="comments-section">
          <h2 class="comments-title">评论</h2>
          <div id="comments-widget"><p class="comments-loading">评论加载中…</p></div>
          <script>
          (async function(){
            var repo='tclxtommy-hu/tclxtommy-hu.github.io';
            var postPath='${postUrl}';
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
    <a href="/archive.html" class="back-link">← 返回归档</a>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

  // Ensure output directory exists
  const outDir = path.dirname(post.outputFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(post.outputFile, postHtml, 'utf-8');
}

// ====== Generate index.html ======
const homeTitle = 'HTTP200 - 最新AI技术、网络IT、软件开发与编程技术分享';
const homeDesc = 'HTTP200专注分享最新AI技术、大模型应用、人工智能实战教程，同时提供网络技术、IT运维、服务器、软件开发等IT领域干货与技术经验。';
const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${homeTitle}</title>
  <meta name="description" content="${homeDesc}">
  ${keywordsMeta}${buildOgMeta({ title: homeTitle, description: homeDesc, url: '/' })}${buildJsonLd({ type: 'WebSite', title: homeTitle, description: homeDesc, url: '/' })}${headExtra}
</head>
<body class="home-3d" data-page="home-3d">
  <div class="room-page">
    <div id="room-canvas" class="room-canvas" aria-label="3D 房间场景"></div>

    <aside class="room-card" id="room-info-card">
      <button type="button" class="room-card-toggle" id="room-card-toggle" aria-label="收起卡片" title="收起">▲</button>
      <!-- <div class="room-card-kicker">TommyHu · Interactive Resume</div> -->
      <h1 id="room-card-title">欢迎来到我的 3D 房间</h1>
      <div class="room-card-body" id="room-card-body">
        <p id="room-card-text">拖拽旋转视角，滚轮缩放，点击发光标签探索我的信息。</p>
        <div class="room-card-actions">
          <a href="/archive.html">进入博客归档</a>
          <a href="https://github.com/tclxtommy-hu" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </aside>

    <div class="room-hotspots" id="room-hotspots" aria-hidden="false">
      <button type="button" class="room-hotspot" data-hotspot="about">✨ About Me</button>
      <button type="button" class="room-hotspot" data-hotspot="skills">🧠 Skills</button>
      <button type="button" class="room-hotspot" data-hotspot="projects">💻 Projects</button>
      <button type="button" class="room-hotspot" data-hotspot="contact">📫 Contact</button>
    </div>

    <div class="room-search-modal" id="room-search-modal" hidden>
      <div class="room-search-panel">
        <div class="room-search-header">
          <h2>搜索文章</h2>
          <button type="button" id="room-search-close" aria-label="关闭搜索">×</button>
        </div>
        <div class="search-box room-search-box">
          <input type="text" id="room-search-input" placeholder="输入关键词，例如 Agent / 向量数据库 / PyTorch" autocomplete="off">
        </div>
        <div id="room-search-results"><p class="search-empty">输入关键词搜索文章</p></div>
      </div>
    </div>

    <div class="room-tip">Click an object to explore · Drag to orbit · Scroll to zoom</div>
  </div>
  <script type="module" src="/src/main.js"></script>
  <!-- Background Music -->
  <audio id="bgm" src="/assets/moonraiver.mp3" loop preload="auto" muted autoplay></audio>
  <button type="button" id="bgm-btn" class="bgm-btn" aria-label="背景音乐">🎵</button>
  <script>
    (function() {
      var btn = document.getElementById('bgm-btn');
      var bgm = document.getElementById('bgm');
      var playing = true;
      bgm.muted = false;
      bgm.play().catch(function(err) {
        playing = false;
        console.log('浏览器阻止播放', error)
      });
      
      btn.addEventListener('click', function() {
        if (playing) { bgm.pause(); btn.textContent = '🔇'; }
        else { bgm.play().catch(function(){}); btn.textContent = '🎵'; }
        playing = !playing;
      });
    })();
  </script>
  <script>
    (function() {
      var toggle = document.getElementById('room-card-toggle');
      var card = document.getElementById('room-info-card');
      if (!toggle || !card) return;
      toggle.addEventListener('click', function() {
        var collapsed = card.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-label', collapsed ? '展开卡片' : '收起卡片');
        toggle.setAttribute('title', collapsed ? '展开' : '收起');
      });
    })();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml, 'utf-8');

// ====== Generate archive.html ======
const archiveListHtml = posts.length === 0
  ? '<p style="color:var(--text-muted);text-align:center;padding:60px 0;">还没有文章。</p>'
  : `<ul class="archive-list" id="archive-list">${posts.map(p => {
    const postUrl = p.relativeDir
      ? `/posts-html/${p.relativeDir}/${p.slug}.html`
      : `/posts-html/${p.slug}.html`;
    return `
    <li class="archive-item" data-path="${p.relativeDir || ''}">
      ${p.date ? `<span class="archive-date">${p.date}</span>` : ''}
      <div class="archive-info">
        <a class="archive-title" href="${postUrl}">${p.title}</a>
        ${p.relativeDir ? `<span class="archive-category">${p.relativeDir.replace(/\\/g, ' › ')}</span>` : ''}
      </div>
    </li>`}).join('')}
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
  <main class="container container-archive">
    <h2 style="margin-bottom:24px;font-weight:700;color:#fff;">文章归档</h2>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="搜索文章标题、内容或标签…" autocomplete="off">
    </div>
    <div class="archive-layout">
      <aside class="archive-sidebar">
        <div class="archive-tree-header">📂 目录结构</div>
        ${treeHtml}
      </aside>
      <div class="archive-main">
        <div id="archive-readme" class="archive-readme" style="display:none;"></div>
        <div id="search-results" style="display:none;"></div>
        <div id="post-list-wrap">
          ${archiveListHtml}
        </div>
      </div>
    </div>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu</footer>
  </div>
  <script>
    window.__POSTS_TREE__ = ${treeJson};
  </script>
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
  const postUrl = post.relativeDir
    ? `/posts-html/${post.relativeDir}/${post.slug}.html`
    : `/posts-html/${post.slug}.html`;
  sitemapEntries.push({
    loc: postUrl,
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
