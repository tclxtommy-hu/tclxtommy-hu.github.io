/**
 * build-comments.js
 * 构建前把 GitHub Issues 里的文章评论抓成静态快照 `public/comments.json`，
 * 由 build-posts.js 内联进每篇文章，浏览器不再直连 api.github.com。
 *
 * 为什么不能继续让浏览器直接请求 GitHub：
 *   - 匿名调用 api.github.com 的配额是 **每个 IP 每小时 60 次**；
 *   - 国内运营商大量用户共用一个 NAT 出口 IP，几次访问就会把配额打满，
 *     评论区直接显示「GitHub 评论请求过于频繁」。
 *
 * 构建时用 GitHub Actions 自带的 GITHUB_TOKEN 抓取（5000 次/小时），
 * 读者浏览器零请求，也就没有限流问题。
 *
 * 失败策略：任何网络/配额错误都不让构建失败，沿用上一次的快照；
 * 没有旧快照时退化成空快照（页面只显示「去 GitHub 评论」按钮）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'public', 'comments.json');

const REPO = 'tclxtommy-hu/tclxtommy-hu.github.io';
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const MAX_ISSUE_PAGES = 10;
const MAX_COMMENT_PAGES = 5;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 20000;

function headers() {
  /** @type {Record<string, string>} */
  const h = {
    Accept: 'application/vnd.github.full+json',
    'User-Agent': 'http200.cn-comments-snapshot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

/** @param {string} url */
async function ghJson(url) {
  const res = await fetch(url, {
    headers: headers(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} ${res.statusText}`);
    // @ts-expect-error 自定义字段，便于上层判断是否限流
    err.status = res.status;
    throw err;
  }
  return {
    data: await res.json(),
    next: nextLink(res.headers.get('link') || ''),
  };
}

/** 从 Link 响应头里取出 rel="next" 的地址 */
function nextLink(link) {
  const match = /<([^>]+)>\s*;\s*rel="next"/.exec(link);
  return match ? match[1] : '';
}

/**
 * 列出所有「文章评论帖」。
 * 评论帖的标题就是文章路径（如 /posts-html/AI/xxx.html），
 * 和旧版前端 `issues.find(i => i.title === postPath)` 的约定保持一致。
 * 用 state=all：已关闭的 issue 仍然可以继续评论，历史也要能显示。
 */
async function listIssues() {
  /** @type {any[]} */
  const issues = [];
  let url = `${API}/issues?state=all&per_page=100&sort=created&direction=asc`;
  for (let page = 0; url && page < MAX_ISSUE_PAGES; page += 1) {
    const { data, next } = await ghJson(url);
    if (!Array.isArray(data)) break;
    for (const item of data) {
      if (item.pull_request) continue;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title.startsWith('/posts-html/') || !title.endsWith('.html')) continue;
      issues.push(item);
    }
    url = next;
  }
  return issues;
}

/** @param {any} issue */
async function listComments(issue) {
  /** @type {any[]} */
  const comments = [];
  if (!issue.comments) return comments;

  let url = `${issue.comments_url}?per_page=100`;
  for (let page = 0; url && page < MAX_COMMENT_PAGES; page += 1) {
    const { data, next } = await ghJson(url);
    if (!Array.isArray(data)) break;
    for (const c of data) {
      const user = c?.user || {};
      comments.push({
        user: user.login || 'ghost',
        avatar: user.avatar_url || '',
        createdAt: c?.created_at || '',
        htmlUrl: c?.html_url || '',
        // GitHub 返回的 body_html 已经做过 XSS 清洗
        bodyHtml: c?.body_html || '',
      });
    }
    url = next;
  }
  return comments;
}

/**
 * 固定并发跑任务，避免一次性打出几十个请求。
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapPool(items, limit, fn) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function readExisting() {
  try {
    const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
    return data && typeof data === 'object' && data.issues ? data : null;
  } catch {
    return null;
  }
}

/** @param {{ generatedAt: string, repo: string, issues: Record<string, unknown> }} snapshot */
function writeSnapshot(snapshot) {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot), 'utf-8');
}

function emptySnapshot() {
  return { generatedAt: new Date().toISOString(), repo: REPO, issues: {} };
}

async function main() {
  const previous = readExisting();

  if (!TOKEN) {
    // 本地没有 token 时不要去消耗 anonymous 的 60 次配额，静默沿用旧快照。
    console.log('⚠️  build-comments: 未设置 GITHUB_TOKEN，沿用现有 public/comments.json');
    if (!previous) writeSnapshot(emptySnapshot());
    return;
  }

  try {
    const issues = await listIssues();
    const entries = await mapPool(issues, CONCURRENCY, async (issue) => {
      const comments = await listComments(issue);
      return [
        issue.title.trim(),
        {
          number: issue.number,
          html_url: issue.html_url,
          state: issue.state,
          updated_at: issue.updated_at,
          comments,
        },
      ];
    });

    /** @type {Record<string, unknown>} */
    const map = {};
    let commentCount = 0;
    for (const [title, entry] of entries) {
      map[title] = entry;
      commentCount += entry.comments.length;
    }

    writeSnapshot({
      generatedAt: new Date().toISOString(),
      repo: REPO,
      issues: map,
    });
    console.log(`✅ build-comments: ${issues.length} 个评论帖 / ${commentCount} 条评论`);
  } catch (err) {
    const status = /** @type {any} */ (err)?.status;
    const hint = status === 403 || status === 429 ? '（GitHub API 限流）' : '';
    console.warn(`⚠️  build-comments: 抓取失败${hint}：${err instanceof Error ? err.message : err}`);
    console.warn('   沿用现有 public/comments.json，评论区仍可正常显示旧数据。');
    if (!previous) {
      writeSnapshot(emptySnapshot());
      console.warn('   没有旧快照，写入空快照（页面只显示「去 GitHub 评论」按钮）。');
    }
  }
}

// 允许被测试脚本 import；直接 `node scripts/build-comments.js` 时才执行
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export { listIssues, listComments, nextLink, main };
