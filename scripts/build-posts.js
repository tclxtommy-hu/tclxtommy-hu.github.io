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
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { buildImageIndex } from './images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const POSTS_HTML_DIR = path.join(ROOT, 'posts-html');

// Ensure directories exist
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(POSTS_HTML_DIR)) fs.mkdirSync(POSTS_HTML_DIR, { recursive: true });

/**
 * Last commit time and first-seen time per file under posts/
 * (reliable in CI; fs mtime is reset on checkout).
 * Paths are repo-relative with / separators.
 * git log is newest-first: first hit = lastModified, last hit = firstAdded.
 */
function loadGitFileTimes() {
  const lastModified = new Map();
  const firstAdded = new Map();
  try {
    const output = execSync(
      'git -c core.quotepath=false log --pretty=format:%cI --name-only --diff-filter=ACMR -- posts',
      { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
    );
    let currentDate = null;
    for (const line of output.split(/\r?\n/)) {
      if (!line) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
        currentDate = new Date(line);
        continue;
      }
      if (!currentDate || Number.isNaN(currentDate.getTime())) continue;
      const rel = line.replace(/\\/g, '/');
      if (!lastModified.has(rel)) lastModified.set(rel, currentDate);
      firstAdded.set(rel, currentDate);
    }
  } catch {
    // Not a git repo or git unavailable — callers fall back to fs mtime
  }
  return { lastModified, firstAdded };
}

/** Working-tree dirty / newly-added paths, repo-relative with / */
function loadDirtyPostPaths() {
  const dirty = new Set();
  const added = new Set();
  try {
    const output = execSync('git -c core.quotepath=false status --porcelain -- posts', {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    for (const line of output.split(/\r?\n/)) {
      if (!line || line.length < 4) continue;
      // " M path" / "?? path" / "A  path" / "R  old -> new"
      const xy = line.slice(0, 2);
      const rest = line.slice(3);
      const target = rest.includes(' -> ') ? rest.split(' -> ').pop() : rest;
      const rel = String(target).replace(/\\/g, '/');
      dirty.add(rel);
      if (xy === '??' || xy[0] === 'A' || xy[1] === 'A') added.add(rel);
    }
  } catch {
    // ignore
  }
  return { dirty, added };
}

const gitFileTimes = loadGitFileTimes();
const gitLastModified = gitFileTimes.lastModified;
const gitFirstAdded = gitFileTimes.firstAdded;
const dirtyPostInfo = loadDirtyPostPaths();
const dirtyPostPaths = dirtyPostInfo.dirty;
const dirtyAddedPaths = dirtyPostInfo.added;
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function formatMtime(d) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

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

// Normalize path to URL-safe format (always use / separator)
function toUrlPath(relativePath) {
  return String(relativePath).replace(/\\/g, '/');
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
  // 标题右侧挂一个锚点：hover 才显形，点一下就把「本页#这一节」复制走（复制逻辑在 main.js）
  const anchor = `<a class="heading-anchor" href="#${_headingId}" data-anchor="${_headingId}" aria-label="复制本节链接" title="复制本节链接">#</a>`;
  return `<h${depth} id="${_headingId}">${text}${anchor}</h${depth}>`;
};

// 代码块语法高亮：构建期用 highlight.js 着色，运行时只靠 CSS 换深浅配色。
// 未知语言（包括 mermaid）保持纯文本，别让自动识别把图表源码染得乱七八糟。
renderer.code = function code({ text, lang }) {
  const language = String(lang || '').trim().split(/\s+/)[0].toLowerCase();
  const known = Boolean(language && language !== 'mermaid' && hljs.getLanguage(language));
  let highlighted = attrEscape(text);
  if (known) {
    try {
      highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
    } catch {
      highlighted = attrEscape(text);
    }
  }
  const cls = language ? ` class="language-${language} hljs"` : ' class="hljs"';
  return `<pre><code${cls}>${highlighted}</code></pre>`;
};

// 正文配图：构建期已把 PNG/JPEG 转成同目录 WebP（见 scripts/images.js）。
// 这里做三件事：换 src 到 .webp、补 width/height（消 CLS）、加 lazy + async。
// 索引里没有的图（外链、没走 public/ 的路径）原样输出，只补懒加载属性。
renderer.image = function image({ href, title, text }) {
  const raw = String(href || '');
  const publicSrc = raw.replace(/^(?:\.\.\/)*public\//, '/');
  const optimized = imageIndex.get(publicSrc);
  const src = optimized ? optimized.src : publicSrc;
  const size = optimized ? ` width="${optimized.width}" height="${optimized.height}"` : '';
  const titleAttr = title ? ` title="${attrEscape(title)}"` : '';
  return `<img src="${attrEscape(src)}" alt="${attrEscape(String(text || ''))}"${titleAttr}${size} loading="lazy" decoding="async">`;
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

// 正文配图索引（构建期顺手把 PNG/JPEG 转成 WebP）。顶层 await：ESM 脚本里合法，
// 放在渲染之前即可 —— 下面 renderer.image 只会在这里赋值之后才被调用。
const imageIndex = await buildImageIndex();

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
  const stat = fs.statSync(fullPath);
  const mtime = stat.mtime || stat.birthtime || new Date(0);
  // Prefer git last-commit time (CI-safe). Dirty local files keep fs mtime so uncommitted edits still surface.
  const repoRel = toUrlPath(path.relative(ROOT, fullPath));
  const gitMtime = gitLastModified.get(repoRel);
  const lastModified = (dirtyPostPaths.has(repoRel) || !gitMtime) ? mtime : gitMtime;
  const firstAdded = gitFirstAdded.get(repoRel);
  const isNew = dirtyAddedPaths.has(repoRel) || (
    firstAdded instanceof Date && !Number.isNaN(firstAdded.getTime())
    && (Date.now() - firstAdded.getTime()) < NEW_WINDOW_MS
  );
  let dateStr;
  let sortDate;

  if (data.date) {
    const d = data.date instanceof Date ? data.date : new Date(data.date);
    if (d instanceof Date && !isNaN(d.getTime())) {
      dateStr = formatDate(d);
      sortDate = d;
    } else {
      // Unparseable date (e.g. free text) — fall back to slug/mtime, keep date label as-is.
      dateStr = String(data.date);
      const m = slug.match(/(\d{4}-\d{2}-\d{2})/);
      sortDate = m ? new Date(m[1]) : lastModified;
    }
  } else {
    const m = slug.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const d = new Date(m[1]);
      dateStr = formatDate(d);
      sortDate = d;
    } else {
      sortDate = lastModified;
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
    lastModified,
    isNew,
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
/** 去掉 HTML 标签后还会残留 &quot; 这类实体，搜索结果里会原样显示成 &quot;，顺手解码掉 */
function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const searchIndex = posts.map(p => ({
  slug: p.slug,
  title: p.title,
  date: p.date,
  tags: p.tags,
  category: p.category,
  subcategory: p.subcategory,
  relativeDir: toUrlPath(p.relativeDir),
  // Strip HTML tags for plain-text search content.
  // Truncate to 1200 chars: snippets only need ±120 chars around a match,
  // and full text here was the main reason the index grew past 1MB.
  content: decodeEntities(
    p.html
      // 标题右侧的锚点 <a class="heading-anchor">#</a> 只是 UI，别让 # 混进搜索结果摘要
      .replace(/<a\b[^>]*class="heading-anchor"[^>]*>[^<]*<\/a>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200)
  ),
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
        // Keep folders that have nested content, a README, or any other .md
        // (README-only dirs still appear in the archive tree; README stays inline-only)
        const hasContent =
          child.children.length > 0 ||
          !!child.readme ||
          fs.readdirSync(fullPath).some((f) => f.endsWith('.md'));
        if (hasContent) {
          node.children.push(child);
        }
      } else if (entry.isFile() && entry.name === 'README.md') {
        if (!relPath) continue; // skip root README
        // Read and render README.md, rewriting relative .md links to absolute HTML paths
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { content } = matter(raw);
          readmeHtml = rewriteReadmeLinks(marked.parse(content, { renderer }), relPath);
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
  const hasReadme = !!node.readme;

  // Include README-only folders (no posts / no children) so they stay navigable
  if (!hasChildren && !hasPosts && !hasReadme) return '';

  // Every non-empty node is a collapsible folder
  const open = (level === 0 || level === 1) ? ' open' : '';
  const urlPath = toUrlPath(node.path);
  let html = `${indent}<details class="tree-folder" data-path="${urlPath}"${open}>\n`;
  html += `${indent}  <summary class="tree-node${level === 0 ? ' tree-root' : ''}" data-path="${urlPath}">`;
  html += level === 0 ? '' : '📁 ';
  html += name;
  // Article count only; README-only folders omit the badge instead of showing 0
  if (node.totalCount > 0) {
    html += ` <span class="tree-count">${node.totalCount}</span>`;
  }
  html += `</summary>\n`;

  // Sub-folders first
  for (const child of node.children) {
    html += buildTreeHtml(child, level + 1);
  }
  // Then individual posts (as links)
  for (const p of node.posts) {
    const postUrl = p.relativeDir
      ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html`
      : `/posts-html/${p.slug}.html`;
    html += `${indent}  <a href="${postUrl}" class="tree-post" data-slug="${p.slug}" data-path="${toUrlPath(p.relativeDir || '')}">📄 ${attrEscape(p.title)}</a>\n`;
  }

  html += `${indent}</details>\n`;
  return html;
}

const treeHtml = `<div class="archive-tree" id="archive-tree">\n${buildTreeHtml(postsTree, 0)}\n</div>`;

// ====== Generate tree JSON for JS ======
// README HTML is NOT embedded in the tree (it ballooned archive.html to ~370KB).
// The tree only carries a `readme: true` marker; the HTML itself goes to
// /readmes.json and is fetched on demand when a folder is selected.
const readmeMap = {}; // urlPath -> rendered README HTML
function treeToJson(node) {
  if (node.readme) {
    readmeMap[toUrlPath(node.path)] = node.readme;
  }
  return {
    name: node.name,
    path: toUrlPath(node.path),
    readme: node.readme ? true : null,
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
fs.writeFileSync(
  path.join(ROOT, 'public', 'readmes.json'),
  JSON.stringify(readmeMap),
  'utf-8'
);

// ====== Generate lightweight nav tree for post pages ======
// 归档页把整棵树内联在 archive.html 里；文章页不重复塞 200KB，点「目录」时按需拉这份 JSON。
// 只保留导航需要的字段（标题/日期/URL/数量），不带 README。
function navNode(node) {
  return {
    name: node.name,
    path: toUrlPath(node.path),
    totalCount: node.totalCount,
    children: node.children.map(navNode),
    posts: node.posts.map((p) => ({
      title: p.title,
      date: p.date,
      url: p.relativeDir
        ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html`
        : `/posts-html/${p.slug}.html`,
    })),
  };
}
fs.writeFileSync(
  path.join(ROOT, 'public', 'posts-tree.json'),
  JSON.stringify(navNode(postsTree)),
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
  <link rel="alternate" type="application/rss+xml" title="http200.cn" href="/feed.xml">
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
  </script>
  <script>try{var t=localStorage.getItem('site-theme');var s=localStorage.getItem('site-season');if(t==='light'||(!t&&s==='light'))document.documentElement.setAttribute('data-theme','light');}catch(e){}</script>${criticalCss}`;

// 聊天窗骨架：首页 3D 房间、文章页、归档页共用一份，逻辑在 src/room-chat.js（节点 id 对不上会直接报错）。
// 打开方式：首页点小人 / 头顶「聊聊」气泡；文章页、归档页用右下角常驻入口（文章页还有正文划词气泡）。
const chatModalHtml = `
    <div class="room-chat-modal" id="room-chat-modal" hidden>
      <div class="room-chat-panel" role="dialog" aria-modal="true" aria-labelledby="room-chat-title">
        <header class="room-chat-header">
          <span class="room-chat-avatar" aria-hidden="true">🧑</span>
          <div class="room-chat-heading">
            <h2 id="room-chat-title">和房间主人聊聊</h2>
            <p id="room-chat-status">TommyHu · 在线</p>
          </div>
          <button type="button" class="room-chat-icon-btn room-chat-reset" id="room-chat-reset" aria-label="开始新对话" title="开始新对话">↺</button>
          <button type="button" class="room-chat-icon-btn" id="room-chat-voice" aria-pressed="false" aria-label="朗读回复" title="朗读回复">🔇</button>
          <button type="button" class="room-chat-icon-btn room-chat-close" id="room-chat-close" aria-label="关闭聊天">×</button>
        </header>
        <div class="room-chat-log" id="room-chat-log" role="log" aria-live="polite"></div>
        <!-- 文章页划词进来的引用卡片：发送时会拼成「引用自《标题》(链接)：> 选段」，模型才知道这段出自哪篇 -->
        <div class="room-chat-quote" id="room-chat-quote" hidden></div>
        <form class="room-chat-form" id="room-chat-form">
          <button type="button" class="room-chat-icon-btn room-chat-mic" id="room-chat-mic" aria-pressed="false" aria-label="语音输入" title="语音输入">🎤</button>
          <textarea id="room-chat-input" rows="1" placeholder="输入问题，Enter 发送 · Shift+Enter 换行" autocomplete="off"></textarea>
          <button type="submit" class="room-chat-send" id="room-chat-send">发送</button>
        </form>
        <p class="room-chat-hint" id="room-chat-hint">语音输入与朗读都调用浏览器系统接口（Web Speech API），不依赖第三方服务</p>
      </div>
    </div>`;

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
for (const [postIndex, post] of posts.entries()) {
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
    ? `/posts-html/${toUrlPath(post.relativeDir)}/${post.slug}.html`
    : `/posts-html/${post.slug}.html`;

  /** 任意文章页的站内地址（上一篇/下一篇/相关文章共用） */
  const hrefOf = (p) =>
    p.relativeDir ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html` : `/posts-html/${p.slug}.html`;

  // 上一篇 / 下一篇：沿用归档顺序（日期倒序），"上一篇"= 更新的一篇
  const prevPost = postIndex > 0 ? posts[postIndex - 1] : null;
  const nextPost = postIndex < posts.length - 1 ? posts[postIndex + 1] : null;

  // 相关文章：同二级分类最相关，其次同大类，再按共同标签加分；同分时新的在前
  const related = posts
    .filter((p) => p !== post)
    .map((p) => {
      let score = 0;
      if (post.subcategory && p.subcategory === post.subcategory) score += 3;
      else if (post.category && p.category === post.category) score += 1;
      const sharedTags = (p.tags || []).filter((tag) => (post.tags || []).includes(tag)).length;
      score += Math.min(sharedTags, 2);
      return { p, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.p.sortDate > a.p.sortDate ? 1 : -1))
    .slice(0, 3)
    .map((item) => item.p);

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
  <script>try{var s=parseFloat(localStorage.getItem('post-font-scale'));if(s>=0.8&&s<=1.6)document.documentElement.style.setProperty('--post-font-scale',s);}catch(e){}</script>
</head>
<body data-page="post">
  <a class="skip-link" href="#main">跳到正文</a>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav>${navHtml}</nav>
  </header>
  <main id="main" class="container container-post">
    <div class="post-layout${post.tocHeadings.length ? '' : ' no-toc'}">
      <div class="post-main">
        <article>
          <div class="post-header">
            <h1>${post.title}</h1>
            <div class="post-header-meta">
              <div class="post-meta">${post.date}${categoryHtml}${tagsHtml}</div>
              <div class="font-size-control" role="group" aria-label="字号调节">
                <span class="font-size-label">字号</span>
                <button type="button" class="font-size-btn" data-action="decrease" aria-label="减小字号">A&minus;</button>
                <button type="button" class="font-size-btn font-size-value" data-action="reset" aria-label="重置字号">100%</button>
                <button type="button" class="font-size-btn" data-action="increase" aria-label="增大字号">A+</button>
              </div>
            </div>
          </div>
          <div class="post-content">${post.html}</div>
        </article>
        ${related.length ? `<section class="related-posts">
          <h2 class="related-title">相关文章</h2>
          <ul class="related-list">
            ${related.map((p) => `<li>
              <a href="${hrefOf(p)}">${attrEscape(p.title)}</a>
              ${p.category ? `<span class="related-meta">${attrEscape(p.category)}${p.subcategory ? ` › ${attrEscape(p.subcategory)}` : ''}</span>` : ''}
            </li>`).join('')}
          </ul>
        </section>` : ''}
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
    ${prevPost || nextPost ? `<nav class="post-pager" aria-label="上一篇 / 下一篇">
      ${prevPost
        ? `<a class="post-pager-item" href="${hrefOf(prevPost)}">
        <span class="post-pager-label">← 上一篇</span>
        <strong class="post-pager-title">${attrEscape(prevPost.title)}</strong>
      </a>`
        : ''}
      ${nextPost
        ? `<a class="post-pager-item is-next" href="${hrefOf(nextPost)}">
        <span class="post-pager-label">下一篇 →</span>
        <strong class="post-pager-title">${attrEscape(nextPost.title)}</strong>
      </a>`
        : ''}
    </nav>` : ''}
    <a href="/archive.html" class="back-link">← 返回归档</a>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu · <a href="/feed.xml" class="rss-link">RSS</a></footer>
  ${chatModalHtml}
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
      <h1 id="room-card-title">Welcome to My 3D Room</h1>
      <div class="room-card-body" id="room-card-body">
        <button type="button" class="room-card-lang" id="room-card-lang" aria-label="切换语言" title="En/中">En/中</button>
        <p id="room-card-text">Drag to orbit, scroll to zoom, click glowing tags to explore my info.</p>
        <div class="room-card-actions">
          <a href="/archive.html">Blog</a>
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

    <!-- 点小人弹聊天窗：接口端是另一仓库 tclxtommy-hu.github.io.bff，前端逻辑在 src/room-chat.js -->
    ${chatModalHtml}

    <div class="room-tip">Click objects to explore · Drag to orbit · Scroll to zoom</div>
  </div>
  <script type="module" src="/src/main.js"></script>
  <!-- Background Music (lazy: audio loads only after the first click, never on page load) -->
  <button type="button" id="bgm-btn" class="bgm-btn" aria-label="播放背景音乐" title="背景音乐">🎵</button>
  <script>
    (function() {
      var btn = document.getElementById('bgm-btn');
      var bgm = null;
      function setPlaying(state) {
        if (state) { btn.classList.add('playing'); btn.textContent = '🎵'; btn.setAttribute('aria-label', '暂停背景音乐'); }
        else { btn.classList.remove('playing'); btn.textContent = '🔇'; btn.setAttribute('aria-label', '播放背景音乐'); }
      }
      setPlaying(false);
      btn.addEventListener('click', function() {
        if (!bgm) {
          bgm = new Audio();
          bgm.preload = 'none';
          bgm.loop = true;
          bgm.src = '/assets/moonraiver.mp3';
          bgm.addEventListener('error', function() { setPlaying(false); });
        }
        if (bgm.paused) {
          bgm.play().then(function() {
            setPlaying(true);
          }).catch(function(err) {
            setPlaying(false);
            console.warn('背景音乐播放失败', err);
          });
        } else {
          bgm.pause();
          setPlaying(false);
        }
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
// Recent posts by git last-commit time (fs mtime is unreliable after CI checkout)
const RECENT_LIMIT = 10;
const recentPosts = [...posts]
  .sort((a, b) => (b.lastModified > a.lastModified ? 1 : -1))
  .slice(0, RECENT_LIMIT);
const recentKeySet = new Set(recentPosts.map((p) => `${toUrlPath(p.relativeDir || '')}\0${p.slug}`));

const archiveListHtml = posts.length === 0
  ? '<p style="color:var(--text-muted);text-align:center;padding:60px 0;">还没有文章。</p>'
  : `<ul class="archive-list" id="archive-list">${posts.map(p => {
    const postUrl = p.relativeDir
      ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html`
      : `/posts-html/${p.slug}.html`;
    const pathKey = toUrlPath(p.relativeDir || '');
    const isRecent = recentKeySet.has(`${pathKey}\0${p.slug}`);
    const mtimeLabel = formatMtime(p.lastModified);
    const newBadge = p.isNew ? '<span class="archive-badge-new">新增</span>' : '';
    return `
    <li class="archive-item" data-path="${pathKey}" data-slug="${attrEscape(p.slug)}" data-mtime="${p.lastModified.toISOString()}" data-recent="${isRecent ? '1' : '0'}">
      <a class="archive-item-link" href="${postUrl}">
        ${p.date ? `<span class="archive-date" data-pub-date="${attrEscape(p.date)}" data-mtime-label="${attrEscape(mtimeLabel)}" title="最后修改 ${attrEscape(mtimeLabel)}">${p.date}</span>` : ''}
        <div class="archive-info">
          <span class="archive-title">${p.title}${newBadge}</span>
          ${p.relativeDir ? `<span class="archive-category">${p.relativeDir.replace(/\\/g, ' › ')}</span>` : ''}
        </div>
      </a>
    </li>`}).join('')}
  </ul>`;

const recentPostsHtml = recentPosts.length === 0
  ? ''
  : `<details class="archive-recent" id="archive-recent">
        <summary class="archive-tree-header archive-recent-toggle" id="archive-recent-toggle">🕒 最近修改 <span class="tree-count">${recentPosts.length}</span></summary>
        <div class="archive-recent-list">
${recentPosts.map(p => {
    const postUrl = p.relativeDir
      ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html`
      : `/posts-html/${p.slug}.html`;
    const newBadge = p.isNew ? '<span class="archive-badge-new">新增</span>' : '';
    return `          <a href="${postUrl}" class="archive-recent-item" title="${attrEscape(p.title)}">
            <span class="archive-recent-title">📄 ${attrEscape(p.title)}${newBadge}</span>
            <span class="archive-recent-date">${formatMtime(p.lastModified)}</span>
          </a>`;
  }).join('\n')}
        </div>
      </details>`;

const archiveHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>归档 - HTTP200</title>
  <meta name="description" content="${siteDesc}">
  ${keywordsMeta}${buildOgMeta({ title: '归档 - HTTP200', description: siteDesc, url: '/archive.html' })}${buildJsonLd({ type: 'CollectionPage', title: '归档 - HTTP200', description: siteDesc, url: '/archive.html' })}${headExtra}
</head>
<body data-page="archive">
  <a class="skip-link" href="#main">跳到正文</a>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav>${navHtml}</nav>
  </header>
  <main id="main" class="container container-archive">
    <h2 style="margin-bottom:24px;font-weight:700;color:var(--heading,#fff);">文章归档</h2>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="搜索文章标题、内容或标签…" autocomplete="off">
      <kbd class="search-kbd" aria-hidden="true">Ctrl K</kbd>
    </div>
    <div class="archive-layout">
      <aside class="archive-sidebar">
        ${recentPostsHtml}
        <div class="archive-tree-header">📂 目录结构</div>
        ${treeHtml}
      </aside>
      <div class="archive-main">
        <div id="archive-readme" class="archive-readme" style="display:none;"></div>
        <p id="archive-recent-hint" class="archive-recent-hint" hidden>按最后修改时间排序</p>
        <div id="search-results" style="display:none;"></div>
        <div id="post-list-wrap">
          ${archiveListHtml}
        </div>
      </div>
    </div>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu · <a href="/feed.xml" class="rss-link">RSS</a></footer>
  ${chatModalHtml}
  </div>
  <script>
    window.__POSTS_TREE__ = ${treeJson};
  </script>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'archive.html'), archiveHtml, 'utf-8');

// ====== Generate 404.html ======
// GitHub Pages 在找不到页面时用根目录的 404.html。默认那张白页没有任何出口，
// 这里给一个「搜索 + 最近文章」的版本，顺带让聊天、皮肤、回到顶部都还能用。
const notFoundHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面走丢了 - HTTP200</title>
  <meta name="robots" content="noindex">
  ${headExtra}
</head>
<body data-page="404">
  <a class="skip-link" href="#main">跳到正文</a>
  <canvas id="bg-canvas"></canvas>
  <div class="page-wrap">
  <header class="site-header">
    <div class="logo"><a href="/">http200.cn</a></div>
    <nav>${navHtml}</nav>
  </header>
  <main id="main" class="container container-404">
    <p class="notfound-code" aria-hidden="true">404</p>
    <h1 class="notfound-title">这个地址不存在</h1>
    <p class="notfound-text">可能是链接过期了，或者文章被挪到了别的目录。搜一下试试，或者直接翻最近更新。</p>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="搜索文章标题、内容或标签…" autocomplete="off">
      <kbd class="search-kbd" aria-hidden="true">Ctrl K</kbd>
    </div>
    <div id="search-results" style="display:none;"></div>
    <div id="post-list-wrap">
      <h2 class="notfound-subtitle">最近更新</h2>
      <ul class="notfound-list">
        ${recentPosts.slice(0, 8).map((p) => {
          const href = p.relativeDir
            ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html`
            : `/posts-html/${p.slug}.html`;
          return `<li><a href="${href}">${attrEscape(p.title)}</a><span class="notfound-date">${p.date}</span></li>`;
        }).join('')}
      </ul>
      <a class="back-link" href="/archive.html">← 全部文章</a>
    </div>
  </main>
  <footer class="site-footer">© http200.cn | Powered by TommyHu · <a href="/feed.xml" class="rss-link">RSS</a></footer>
  ${chatModalHtml}
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, '404.html'), notFoundHtml, 'utf-8');

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
    ? `/posts-html/${toUrlPath(post.relativeDir)}/${post.slug}.html`
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

// ====== Generate feed.xml（RSS 2.0）======
// 只放最近的 30 篇：全文在站内，订阅端只需要"知道更新了"。
// 编辑器/阅读器都认根目录下的 /feed.xml，headExtra 里也挂了 <link rel="alternate">。
const FEED_LIMIT = 30;
const feedItems = posts.slice(0, FEED_LIMIT).map((p) => {
  const path = p.relativeDir
    ? `/posts-html/${toUrlPath(p.relativeDir)}/${p.slug}.html`
    : `/posts-html/${p.slug}.html`;
  const url = `${SITE_URL}${path}`;
  const pubDate = (p.sortDate instanceof Date ? p.sortDate : new Date()).toUTCString();
  return `    <item>
      <title>${attrEscape(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      ${p.category ? `<category>${attrEscape(p.category)}</category>` : ''}
      <description>${attrEscape(p.summary)}</description>
    </item>`;
}).join('\n');

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>http200.cn</title>
    <link>${SITE_URL}/</link>
    <description>${attrEscape(siteDesc)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${feedItems}
  </channel>
</rss>
`;

fs.writeFileSync(path.join(ROOT, 'public', 'feed.xml'), feedXml, 'utf-8');

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
