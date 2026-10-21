// 文章页右侧快捷入口：
//   - 「目录」：按需拉 /posts-tree.json，展开分类树，直接跳到任意文章或归档目录
//   - 「搜索」：按需拉 /search-index.json，在浮层里搜全站文章（Ctrl/Cmd+K 也能开）
//
// 文章页不重复渲染归档页那棵大树，这里只做入口，数据按需加载。

const TREE_URL = '/posts-tree.json';
const SEARCH_INDEX_URL = '/search-index.json';
const MAX_RESULTS = 30;

/**
 * @typedef {Object} NavPost
 * @property {string} title
 * @property {string} date
 * @property {string} url
 */

/**
 * @typedef {Object} NavNode
 * @property {string} name
 * @property {string} path
 * @property {number} totalCount
 * @property {NavNode[]} children
 * @property {NavPost[]} posts
 */

/**
 * @typedef {Object} SearchRecord
 * @property {string} slug
 * @property {string} title
 * @property {string} date
 * @property {string[]} [tags]
 * @property {string} [category]
 * @property {string} [subcategory]
 * @property {string} content
 * @property {string} [relativeDir]
 */

/** @param {unknown} str */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string} str */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} text @param {string} query */
function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  return safe.replace(
    new RegExp(escapeRegExp(query), 'gi'),
    (match) => `<span class="search-highlight">${match}</span>`
  );
}

/** @param {{ slug: string, relativeDir?: string }} post */
function postHref(post) {
  const dir = String(post.relativeDir || '').replace(/\\/g, '/');
  return dir ? `/posts-html/${dir}/${post.slug}.html` : `/posts-html/${post.slug}.html`;
}

/** 把详情页路径和树里的文章地址对齐（树里是原始中文，浏览器给的是百分号编码） */
function isCurrentPost(url) {
  try {
    return decodeURI(url) === decodeURI(window.location.pathname);
  } catch {
    return url === window.location.pathname;
  }
}

/**
 * 全站搜索浮层。
 * @returns {{ open: () => void, close: () => void, prefetch: () => void }}
 */
function createSearchModal() {
  /** @type {HTMLElement | null} */
  let modal = null;
  /** @type {HTMLInputElement | null} */
  let input = null;
  /** @type {HTMLElement | null} */
  let results = null;
  /** @type {SearchRecord[] | null} */
  let indexData = null;
  /** @type {Promise<SearchRecord[]> | null} */
  let indexPromise = null;
  /** @type {HTMLElement | null} */
  let opener = null;
  let active = -1;
  let timer = 0;
  let searchToken = 0;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(SEARCH_INDEX_URL, { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return /** @type {Promise<SearchRecord[]>} */ (res.json());
        })
        .catch((err) => {
          indexPromise = null;
          throw err;
        });
    }
    return indexPromise;
  }

  function ensure() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'site-modal site-search-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="site-modal-panel site-search-panel" role="dialog" aria-modal="true" aria-labelledby="site-search-title">
        <div class="site-modal-header">
          <h2 id="site-search-title">搜索全部文章</h2>
          <button type="button" class="site-modal-close" data-close aria-label="关闭搜索">×</button>
        </div>
        <div class="search-box site-search-box">
          <input type="text" id="site-search-input" placeholder="搜索标题、正文、标签或分类…" autocomplete="off">
          <kbd class="search-kbd" aria-hidden="true">Esc</kbd>
        </div>
        <div class="site-search-results" id="site-search-results">
          <p class="search-empty">输入关键词，搜全站文章</p>
        </div>
      </div>`;
    document.body.appendChild(modal);

    input = /** @type {HTMLInputElement} */ (modal.querySelector('#site-search-input'));
    results = /** @type {HTMLElement} */ (modal.querySelector('#site-search-results'));

    modal.addEventListener('click', (event) => {
      const target = event.target;
      if (target === modal || (target instanceof Element && target.closest('[data-close]'))) close();
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    });

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => run(input ? input.value : ''), 140);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = getItems();
        if (items.length === 0) return;
        event.preventDefault();
        active = Math.min(Math.max(active + (event.key === 'ArrowDown' ? 1 : -1), 0), items.length - 1);
        items.forEach((el, i) => el.classList.toggle('is-active', i === active));
        items[active].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && active >= 0) {
        const link = getItems()[active]?.querySelector('a');
        if (link) {
          event.preventDefault();
          window.location.href = link.href;
        }
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) close();
    });
  }

  /** @returns {HTMLElement[]} */
  function getItems() {
    return results ? /** @type {any} */ ([...results.querySelectorAll('.post-item')]) : [];
  }

  /** @param {string} query */
  async function run(query) {
    const q = query.trim();
    const token = ++searchToken;
    if (!results) return;

    if (!q) {
      results.innerHTML = '<p class="search-empty">输入关键词，搜全站文章</p>';
      active = -1;
      return;
    }

    results.innerHTML = '<p class="search-empty">搜索中…</p>';
    let data;
    try {
      data = indexData || (await loadIndex());
      indexData = data;
    } catch {
      if (token === searchToken) {
        results.innerHTML =
          '<p class="search-empty">搜索索引加载失败，去 <a href="/archive.html">归档页</a> 看看</p>';
      }
      return;
    }
    if (token !== searchToken) return;

    const lower = q.toLowerCase();
    const matches = data
      .filter((post) => {
        const tags = Array.isArray(post.tags) ? post.tags : [];
        return (
          post.title.toLowerCase().includes(lower) ||
          post.content.toLowerCase().includes(lower) ||
          tags.some((tag) => tag.toLowerCase().includes(lower)) ||
          (post.category || '').toLowerCase().includes(lower) ||
          (post.subcategory || '').toLowerCase().includes(lower)
        );
      })
      .slice(0, MAX_RESULTS);

    if (matches.length === 0) {
      results.innerHTML = '<p class="search-empty">没有找到匹配的文章</p>';
      active = -1;
      return;
    }

    results.innerHTML = `<ul class="post-list">${matches
      .map((post) => {
        const idx = post.content.toLowerCase().indexOf(lower);
        let snippet = '';
        if (idx !== -1) {
          const start = Math.max(0, idx - 45);
          const end = Math.min(post.content.length, idx + q.length + 90);
          snippet =
            (start > 0 ? '…' : '') +
            post.content.slice(start, end) +
            (end < post.content.length ? '…' : '');
        }
        const cat = post.category
          ? ` · <span class="search-category">${escapeHtml(post.category)}${
              post.subcategory ? ` › ${escapeHtml(post.subcategory)}` : ''
            }</span>`
          : '';
        const tags =
          Array.isArray(post.tags) && post.tags.length ? ` · ${escapeHtml(post.tags.join(', '))}` : '';
        return `<li class="post-item">
          <div class="post-title"><a href="${escapeHtml(postHref(post))}">${highlight(post.title, q)}</a></div>
          <div class="post-meta">${escapeHtml(post.date || '')}${cat}${tags}</div>
          ${snippet ? `<div class="post-summary">${highlight(snippet, q)}</div>` : ''}
        </li>`;
      })
      .join('')}</ul>`;
    active = -1;
  }

  function open() {
    ensure();
    if (!modal || !input) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    document.body.classList.add('is-site-modal-open');
    window.requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      input.select();
      if (input.value.trim()) run(input.value);
    });
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (!document.querySelector('.site-modal:not([hidden])')) {
      document.body.classList.remove('is-site-modal-open');
    }
    opener?.focus();
    opener = null;
  }

  return { open, close, prefetch: () => { loadIndex().catch(() => {}); } };
}

/**
 * 文章目录抽屉。
 * @returns {{ open: () => void, close: () => void, prefetch: () => void }}
 */
function createTreeDrawer() {
  /** @type {HTMLElement | null} */
  let modal = null;
  /** @type {HTMLElement | null} */
  let body = null;
  /** @type {HTMLElement | null} */
  let opener = null;
  /** @type {Promise<NavNode> | null} */
  let treePromise = null;

  function loadTree() {
    if (!treePromise) {
      treePromise = fetch(TREE_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return /** @type {Promise<NavNode>} */ (res.json());
        })
        .catch((err) => {
          treePromise = null;
          throw err;
        });
    }
    return treePromise;
  }

  /**
   * @param {NavNode} node
   * @param {number} depth
   * @returns {{ html: string, hasCurrent: boolean }}
   */
  function renderNode(node, depth) {
    let hasCurrent = false;

    const children = Array.isArray(node.children) ? node.children : [];
    const posts = Array.isArray(node.posts) ? node.posts : [];

    const childHtml = children.map((child) => {
      const rendered = renderNode(child, depth + 1);
      if (rendered.hasCurrent) hasCurrent = true;
      return rendered.html;
    });

    const postHtml = posts.map((post) => {
      const current = isCurrentPost(post.url);
      if (current) hasCurrent = true;
      return `<a class="site-tree-post${current ? ' is-current' : ''}" href="${escapeHtml(post.url)}"${
        current ? ' aria-current="page"' : ''
      }>${escapeHtml(post.title)}</a>`;
    });

    // 根节点默认展开；当前文章所在的祖先目录也默认展开，打开就能看到「你在哪」
    const open = depth === 0 || hasCurrent;
    const archiveLink = node.path
      ? `<a class="site-tree-archive" href="/archive.html?path=${encodeURIComponent(node.path)}">在归档页查看该目录 →</a>`
      : '';

    return {
      hasCurrent,
      html: `<details class="site-tree-folder"${open ? ' open' : ''} data-path="${escapeHtml(node.path || '')}">
        <summary class="site-tree-summary"><span class="site-tree-name">${escapeHtml(node.name || '全部')}</span>${
          node.totalCount ? `<span class="site-tree-count">${node.totalCount}</span>` : ''
        }</summary>
        ${archiveLink}${childHtml.join('')}${postHtml.join('')}
      </details>`,
    };
  }

  function ensure() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'site-modal site-tree-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="site-modal-panel site-tree-panel" role="dialog" aria-modal="true" aria-labelledby="site-tree-title" tabindex="-1">
        <div class="site-modal-header">
          <h2 id="site-tree-title">文章目录</h2>
          <button type="button" class="site-modal-close" data-close aria-label="关闭目录">×</button>
        </div>
        <div class="site-tree-body" id="site-tree-body"></div>
        <div class="site-tree-footer"><a href="/archive.html">在归档页查看全部文章 →</a></div>
      </div>`;
    document.body.appendChild(modal);

    body = /** @type {HTMLElement} */ (modal.querySelector('#site-tree-body'));
    modal.addEventListener('click', (event) => {
      const target = event.target;
      if (target === modal || (target instanceof Element && target.closest('[data-close]'))) close();
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) close();
    });
  }

  async function open() {
    ensure();
    if (!modal) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.hidden = false;
    document.body.classList.add('is-site-modal-open');

    const panel = modal.querySelector('.site-tree-panel');
    if (panel instanceof HTMLElement) panel.focus();

    if (body) body.innerHTML = '<p class="search-empty">目录加载中…</p>';
    try {
      const tree = await loadTree();
      if (!modal.hidden && body) {
        body.innerHTML = renderNode(tree, 0).html;
        // 当前文章默认展开后可能在很下面，直接滚到它
        body.querySelector('.site-tree-post.is-current')?.scrollIntoView({ block: 'center' });
      }
    } catch {
      if (body) {
        body.innerHTML =
          '<p class="search-empty">目录加载失败，去 <a href="/archive.html">归档页</a> 看看</p>';
      }
    }
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (!document.querySelector('.site-modal:not([hidden])')) {
      document.body.classList.remove('is-site-modal-open');
    }
    opener?.focus();
    opener = null;
  }

  return { open, close, prefetch: () => { loadTree().catch(() => {}); } };
}

export function initPostQuickNav() {
  if (document.body?.dataset?.page !== 'post') return;
  if (document.getElementById('post-quick-nav')) return;

  const nav = document.createElement('div');
  nav.id = 'post-quick-nav';
  nav.className = 'post-quick-nav';
  nav.innerHTML = `
    <button type="button" class="post-quick-btn" data-action="tree" aria-label="打开文章目录" title="按分类浏览全部文章">📂 目录</button>
    <button type="button" class="post-quick-btn" data-action="search" aria-label="搜索全部文章" title="搜索全部文章（Ctrl+K）">🔍 搜索</button>`;
  document.body.appendChild(nav);

  const search = createSearchModal();
  const tree = createTreeDrawer();

  const treeBtn = nav.querySelector('[data-action="tree"]');
  const searchBtn = nav.querySelector('[data-action="search"]');

  treeBtn?.addEventListener('click', tree.open);
  searchBtn?.addEventListener('click', search.open);
  // 悬停就先拉数据，点开时基本是秒开
  treeBtn?.addEventListener('pointerenter', tree.prefetch, { once: true });
  searchBtn?.addEventListener('pointerenter', search.prefetch, { once: true });
  treeBtn?.addEventListener('focus', tree.prefetch, { once: true });
  searchBtn?.addEventListener('focus', search.prefetch, { once: true });

  // 文章页的 Ctrl/Cmd+K 不再跳归档，直接开搜索浮层
  window.addEventListener('site:open-search', () => search.open());
}
