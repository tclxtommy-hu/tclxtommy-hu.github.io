/**
 * check-generated.js
 * 校验「提交进仓库的生成物」是不是还和 posts/ 对得上。
 *
 * 为什么需要它：index.html / archive.html / sitemap.xml / search-index.json 是
 * `npm run build` 生成后一起提交的。只新增 .md、忘了重新生成，仓库里这几个文件就会
 * 悄悄落后 —— 之前 archive.html 就漏收过两篇文章，归档页点不到新文章。
 *
 * 注意：必须在**构建之前**跑才有意义（构建会把生成物刷新成最新，之后必然一致）。
 * 因此 CI 里这一步排在 `npm run build` 前面。
 *
 * 只比对「集合」，不比对字节：sitemap 的 lastmod 用当天日期、archive 的「新增」角标
 * 用 7 天窗口，这两个东西每天都会变，纯 diff 会误报。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');

const ORIGIN = 'https://http200.cn';
/** 生成物里应该是全部文章，对不上多少篇就报多少篇，先看前 5 条 */
const MAX_REPORT = 5;

function toUrlPath(p) {
  return p.replace(/\\/g, '/');
}

/** 和 build-posts.js 的 findMdFiles 保持同一套规则：跳过点开头的文件和 README.md */
function findPosts(dir, baseDir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'README.md') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findPosts(full, baseDir, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let relativeDir = toUrlPath(path.relative(baseDir, path.dirname(full)));
      if (relativeDir === '.') relativeDir = '';
      out.push({ slug: path.basename(full, '.md'), relativeDir });
    }
  }
  return out;
}

/** 文章页 URL 的拼法要和各模板一致（见 build-posts.js 的 postUrl） */
function postUrl({ slug, relativeDir }) {
  return relativeDir ? `/posts-html/${relativeDir}/${slug}.html` : `/posts-html/${slug}.html`;
}

function readText(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf-8');
}

/** 生成物里出现了、但 posts/ 里已经没有的 URL，也别悄咪咪留着 */
function diffSets(label, expected, actual) {
  const problems = [];
  const missing = [...expected].filter((url) => !actual.has(url));
  const extra = [...actual].filter((url) => !expected.has(url));
  if (missing.length === 0 && extra.length === 0) return problems;
  problems.push(`${label}：缺 ${missing.length} 篇、多 ${extra.length} 篇`);
  for (const url of missing.slice(0, MAX_REPORT)) problems.push(`  · 少了 ${url}`);
  if (missing.length > MAX_REPORT) problems.push(`  · ……另有 ${missing.length - MAX_REPORT} 篇`);
  for (const url of extra.slice(0, MAX_REPORT)) problems.push(`  · 多了 ${url}`);
  if (extra.length > MAX_REPORT) problems.push(`  · ……另有 ${extra.length - MAX_REPORT} 篇`);
  return problems;
}

const posts = findPosts(POSTS_DIR, POSTS_DIR);
const expected = new Set(posts.map(postUrl));
const problems = [];

// ---- archive.html：每篇文章都应该有一条 archive-item-link ----
const archiveHtml = readText('archive.html');
if (!archiveHtml) {
  problems.push('archive.html：文件不存在，先跑一次 `npm run build`');
} else {
  const links = [...archiveHtml.matchAll(/class="archive-item-link" href="([^"]+)"/g)].map((m) => m[1]);
  problems.push(...diffSets('archive.html', expected, new Set(links)));
}

// ---- search-index.json：站内搜索能搜到的前提 ----
const searchJson = readText(path.join('public', 'search-index.json'));
if (!searchJson) {
  problems.push('public/search-index.json：文件不存在，先跑一次 `npm run build`');
} else {
  let records = [];
  try {
    records = JSON.parse(searchJson);
  } catch {
    problems.push('public/search-index.json：不是合法 JSON，重新生成一次');
  }
  if (Array.isArray(records) && records.length > 0) {
    const urls = records.map((r) => postUrl({ slug: r.slug, relativeDir: r.relativeDir || '' }));
    problems.push(...diffSets('search-index.json', expected, new Set(urls)));
  }
}

// ---- sitemap.xml：搜索引擎抓到的地址（/ 和 /archive.html 不是文章，跳过） ----
const sitemap = readText(path.join('public', 'sitemap.xml'));
if (!sitemap) {
  problems.push('public/sitemap.xml：文件不存在，先跑一次 `npm run build`');
} else {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => {
      let loc = decodeURIComponent(m[1].trim());
      if (loc.startsWith(ORIGIN)) loc = loc.slice(ORIGIN.length);
      return loc;
    })
    .filter((loc) => loc.startsWith('/posts-html/'));
  problems.push(...diffSets('sitemap.xml', expected, new Set(locs)));
}

if (problems.length === 0) {
  console.log(`✅ 生成物与 posts/ 一致（${posts.length} 篇）`);
  process.exit(0);
}

console.error('❌ 生成物已经和 posts/ 对不上了（多半是只加了 .md，没重新生成）：\n');
for (const line of problems) console.error(line);
console.error('\n修法：跑一次 `npm run build`（或 `npm run dev`），把 index.html / archive.html / public/*.json|xml 一起提交。');
process.exit(1);
