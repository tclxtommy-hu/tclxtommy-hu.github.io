import './style.css';

function initHomeRoomIfNeeded() {
  if (document.body?.dataset?.page !== 'home-3d') return false;
  // three.js is ~160KB gzipped: defer it until the page settles so it never
  // competes with the critical rendering path
  const load = () => import('./three-room.js').then((m) => m.initHome3DRoom()).catch(() => {});
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => load(), { timeout: 3000 });
  } else {
    setTimeout(load, 1200);
  }
  return true;
}

function initHomeSearchModal() {
  if (document.body?.dataset?.page !== 'home-3d') return;

  const modal = document.getElementById('room-search-modal');
  const input = document.getElementById('room-search-input');
  const results = document.getElementById('room-search-results');
  const closeBtn = document.getElementById('room-search-close');
  if (!modal || !input || !results || !closeBtn) return;

  let indexData = null;

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(text).replace(new RegExp(escaped, 'gi'), (m) => `<span class="search-highlight">${m}</span>`);
  }

  async function loadIndex() {
    if (indexData) return indexData;
    const res = await fetch('/search-index.json');
    indexData = await res.json();
    return indexData;
  }

  // Prefetch the index at the user's first interaction so the very search
  // doesn't have to wait for the full JSON download
  document.addEventListener('pointerdown', () => { loadIndex().catch(() => {}); }, { once: true, passive: true });

  function setOpen(open) {
    modal.hidden = !open;
    modal.classList.toggle('is-open', open);
    document.body.classList.toggle('is-home-search-open', open);
    if (open) {
      requestAnimationFrame(() => input.focus());
    }
  }

  async function runSearch(query) {
    if (!query) {
      results.innerHTML = '<p class="search-empty">输入关键词搜索文章</p>';
      return;
    }

    const data = await loadIndex();
    const lower = query.toLowerCase();
    const matches = data.filter((p) =>
      p.title.toLowerCase().includes(lower) ||
      p.content.toLowerCase().includes(lower) ||
      p.tags.some((t) => t.toLowerCase().includes(lower)) ||
      (p.category && p.category.toLowerCase().includes(lower)) ||
      (p.subcategory && p.subcategory.toLowerCase().includes(lower))
    );

    if (matches.length === 0) {
      results.innerHTML = '<p class="search-empty">没有找到匹配的文章</p>';
      return;
    }

    results.innerHTML = `<ul class="post-list">${matches.slice(0, 20).map((p) => {
      const idx = p.content.toLowerCase().indexOf(lower);
      let snippet = '';
      if (idx !== -1) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(p.content.length, idx + query.length + 80);
        snippet = (start > 0 ? '…' : '') + p.content.slice(start, end) + (end < p.content.length ? '…' : '');
      }
      const postUrl = p.relativeDir
        ? `/posts-html/${p.relativeDir}/${p.slug}.html`
        : `/posts-html/${p.slug}.html`;
      const catMeta = p.category
        ? ` · <span class="search-category">${p.category}${p.subcategory ? ' › ' + p.subcategory.replace(/ \/ /g, ' › ') : ''}</span>`
        : '';
      return `<li class="post-item">
        <div class="post-title"><a href="${postUrl}">${highlight(p.title, query)}</a></div>
        <div class="post-meta">${p.date}${catMeta}${p.tags.length ? ' · ' + p.tags.join(', ') : ''}</div>
        ${snippet ? `<div class="post-summary">${highlight(snippet, query)}</div>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const value = input.value.trim();
    timer = setTimeout(() => runSearch(value), 160);
  });

  closeBtn.addEventListener('click', () => setOpen(false));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) setOpen(false);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) {
      setOpen(false);
    }
  });

  window.addEventListener('room:open-search', () => {
    setOpen(true);
    runSearch(input.value.trim());
  });
}

// ====== Particle background animation ======
function initParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  const points = [];
  const LINK_DIST_SQ = 120 * 120;

  function resize() {
    w = canvas.width = innerWidth;
    h = canvas.height = innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#00f0ff', '#7b2fff', '#ff2fc8'];
  for (let i = 0; i < 80; i++) {
    points.push({
      x: Math.random() * (w || 800),
      y: Math.random() * (h || 600),
      r: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.6,
      speedY: (Math.random() - 0.5) * 0.6,
      color: colors[Math.floor(Math.random() * 3)],
    });
  }

  function animate() {
    // Skip drawing while hidden (saves CPU/battery on background tabs)
    if (!document.hidden) {
      ctx.clearRect(0, 0, w, h);
      for (const p of points) {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0 || p.x > w) p.speedX *= -1;
        if (p.y < 0 || p.y > h) p.speedY *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      for (let a = 0; a < points.length; a++) {
        for (let b = a + 1; b < points.length; b++) {
          const dx = points[a].x - points[b].x;
          const dy = points[a].y - points[b].y;
          const d2 = dx * dx + dy * dy;
          // Compare squared distances (no sqrt) and only pay sqrt for links
          if (d2 < LINK_DIST_SQ) {
            const d = Math.sqrt(d2);
            ctx.beginPath();
            ctx.moveTo(points[a].x, points[a].y);
            ctx.lineTo(points[b].x, points[b].y);
            ctx.strokeStyle = `rgba(0,240,255,${(120 - d) / 300})`;
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
}

// ====== Mermaid diagram rendering ======
let mermaidApi = null;
let mermaidLightbox = null;

async function getMermaidApi() {
  if (mermaidApi) return mermaidApi;
  const mermaid = await import('mermaid');
  mermaid.default.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#7b2fff',
      primaryTextColor: '#e0e0e6',
      lineColor: '#00f0ff',
    },
  });
  mermaidApi = mermaid.default;
  return mermaidApi;
}

async function initMermaid() {
  const blocks = document.querySelectorAll('pre code.language-mermaid');
  if (blocks.length === 0) {
    enhanceMermaidZoom();
    return;
  }
  try {
    const mermaid = await getMermaidApi();
    let index = 0;
    for (const block of blocks) {
      const pre = block.parentElement;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = block.textContent;
      pre.replaceWith(div);
      try {
        // Render one by one: a single failed diagram must not abort the rest
        const { svg, bindFunctions } = await mermaid.render(`mermaid-svg-${++index}`, div.textContent);
        div.innerHTML = svg;
        if (bindFunctions) bindFunctions(div);
      } catch (err) {
        // Fall back to the original code block for this diagram only
        console.warn('[mermaid] diagram render failed:', err);
        div.replaceWith(pre);
      }
    }
  } catch (err) {
    console.warn('[mermaid] init failed:', err);
  } finally {
    enhanceMermaidZoom();
  }
}

function enhanceMermaidZoom() {
  document.querySelectorAll('.mermaid').forEach((diagram) => {
    if (diagram.closest('.mermaid-wrap')) return;
    if (!diagram.querySelector('svg')) return;

    const wrap = document.createElement('div');
    wrap.className = 'mermaid-wrap';
    diagram.replaceWith(wrap);
    wrap.appendChild(diagram);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mermaid-zoom-btn';
    btn.title = '放大查看';
    btn.setAttribute('aria-label', '放大查看流程图');
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
    wrap.appendChild(btn);

    const open = () => openMermaidLightbox(diagram);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      open();
    });
    diagram.addEventListener('click', open);
    diagram.setAttribute('role', 'button');
    diagram.setAttribute('tabindex', '0');
    diagram.setAttribute('aria-label', '点击放大查看流程图');
    diagram.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function getMermaidLightbox() {
  if (mermaidLightbox) return mermaidLightbox;

  const overlay = document.createElement('div');
  overlay.className = 'mermaid-lightbox';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '流程图放大查看');
  overlay.innerHTML = `
    <div class="mermaid-lightbox-bar">
      <span class="mermaid-lightbox-hint">拖动平移 · 滚轮缩放 · Esc 关闭</span>
      <div class="mermaid-lightbox-actions">
        <button type="button" data-action="out" aria-label="缩小">−</button>
        <span data-zoom-label>100%</span>
        <button type="button" data-action="in" aria-label="放大">+</button>
        <button type="button" data-action="fit" aria-label="适应窗口">适应</button>
        <button type="button" data-action="close" aria-label="关闭">关闭</button>
      </div>
    </div>
    <div class="mermaid-lightbox-viewport">
      <div class="mermaid-lightbox-world"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const viewport = overlay.querySelector('.mermaid-lightbox-viewport');
  const world = overlay.querySelector('.mermaid-lightbox-world');
  const label = overlay.querySelector('[data-zoom-label]');
  const pointers = new Map();
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let pinchStart = null;
  let svgEl = null;
  let placeholder = null;
  let svgStyle = null;

  function applyTransform() {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    label.textContent = `${Math.round(scale * 100)}%`;
  }

  function getSvgSize() {
    if (!svgEl) return { width: 1, height: 1 };
    const box = svgEl.viewBox?.baseVal;
    if (box && box.width && box.height) return { width: box.width, height: box.height };
    const widthAttr = svgEl.getAttribute('width') || '';
    const heightAttr = svgEl.getAttribute('height') || '';
    const attrW = parseFloat(widthAttr);
    const attrH = parseFloat(heightAttr);
    if (attrW && attrH && !widthAttr.includes('%') && !heightAttr.includes('%')) {
      return { width: attrW, height: attrH };
    }
    const bbox = svgEl.getBBox();
    return { width: bbox.width || 1, height: bbox.height || 1 };
  }

  function fitToView() {
    if (!svgEl) return;
    const { width, height } = getSvgSize();
    const pad = 48;
    const next = Math.min(
      (viewport.clientWidth - pad) / width,
      (viewport.clientHeight - pad) / height,
      1.25
    );
    scale = Math.max(next, 0.15);
    tx = (viewport.clientWidth - width * scale) / 2;
    ty = (viewport.clientHeight - height * scale) / 2;
    applyTransform();
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = viewport.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const clamped = Math.min(8, Math.max(0.15, nextScale));
    const k = clamped / scale;
    tx = cx - k * (cx - tx);
    ty = cy - k * (cy - ty);
    scale = clamped;
    applyTransform();
  }

  function zoomCenter(nextScale) {
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextScale);
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('is-mermaid-zoomed');
    if (svgEl && placeholder) {
      if (svgStyle) {
        svgEl.style.maxWidth = svgStyle.maxWidth;
        svgEl.style.width = svgStyle.width;
        svgEl.style.height = svgStyle.height;
      }
      placeholder.replaceWith(svgEl);
    }
    world.replaceChildren();
    svgEl = null;
    placeholder = null;
    svgStyle = null;
    pointers.clear();
    pinchStart = null;
  }

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'close') close();
    else if (action === 'in') zoomCenter(scale * 1.25);
    else if (action === 'out') zoomCenter(scale / 1.25);
    else if (action === 'fit') fitToView();
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      tx += e.clientX - prev.x;
      ty += e.clientY - prev.y;
      applyTransform();
      return;
    }

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.dist > 0) {
        zoomAt(pinchStart.midX, pinchStart.midY, pinchStart.scale * (dist / pinchStart.dist));
      }
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  window.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomCenter(scale * 1.25);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomCenter(scale / 1.25);
    } else if (e.key === '0') {
      e.preventDefault();
      fitToView();
    }
  });

  mermaidLightbox = {
    overlay,
    world,
    open(diagram) {
      const svg = diagram.querySelector('svg');
      if (!svg) return;
      placeholder = document.createComment('mermaid-svg');
      svgStyle = {
        maxWidth: svg.style.maxWidth,
        width: svg.style.width,
        height: svg.style.height,
      };
      svg.replaceWith(placeholder);
      svg.style.maxWidth = 'none';
      const box = svg.viewBox?.baseVal;
      if (box && box.width && box.height) {
        svg.style.width = `${box.width}px`;
        svg.style.height = `${box.height}px`;
      } else {
        svg.style.width = svg.getAttribute('width') || '';
        svg.style.height = svg.getAttribute('height') || '';
      }
      world.replaceChildren(svg);
      svgEl = svg;
      overlay.hidden = false;
      document.body.classList.add('is-mermaid-zoomed');
      requestAnimationFrame(fitToView);
    },
    close,
  };
  return mermaidLightbox;
}

function openMermaidLightbox(diagram) {
  getMermaidLightbox().open(diagram);
}

// ====== PWA Service Worker ======
// Production only: in dev, the SW would cache unbundled source paths and break HMR
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ====== Search ======
function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  const resultsEl = document.getElementById('search-results');
  const listWrap = document.getElementById('post-list-wrap');
  let index = null;

  async function loadIndex() {
    if (index) return index;
    const res = await fetch('/search-index.json');
    index = await res.json();
    return index;
  }

  // Prefetch as soon as the user focuses the search box
  input.addEventListener('focus', () => { loadIndex().catch(() => {}); }, { once: true });

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(text).replace(
      new RegExp(escaped, 'gi'),
      match => `<span class="search-highlight">${match}</span>`
    );
  }

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value.trim()), 200);
  });

  // ====== Tree-based filter ======
  const readmeEl = document.getElementById('archive-readme');
  const treeFolders = document.querySelectorAll('.archive-tree .tree-node');
  const recentToggle = document.getElementById('archive-recent-toggle');
  const recentDetails = document.getElementById('archive-recent');
  const recentHint = document.getElementById('archive-recent-hint');
  const archiveListEl = document.getElementById('archive-list');
  const desktopRecentMq = window.matchMedia('(min-width: 901px)');
  let currentPath = '';
  let viewMode = 'path';
  let syncingRecent = false;
  let savedTreeState = null;

  function isDesktopArchive() {
    return desktopRecentMq.matches;
  }

  function getTreeFolderDetails() {
    const treeEl = document.getElementById('archive-tree');
    return treeEl ? [...treeEl.querySelectorAll('details.tree-folder')] : [];
  }

  // Collapse the whole tree while searching; remember previous open state
  function collapseTreeForSearch() {
    if (savedTreeState) return;
    savedTreeState = new Set();
    getTreeFolderDetails().forEach((details) => {
      if (details.open) savedTreeState.add(details.dataset.path || '');
      details.open = false;
    });
  }

  function restoreTreeFromSearch() {
    if (!savedTreeState) return;
    getTreeFolderDetails().forEach((details) => {
      details.open = savedTreeState.has(details.dataset.path || '');
    });
    savedTreeState = null;
  }

  if (archiveListEl) {
    archiveListEl.querySelectorAll('.archive-item').forEach((el, i) => {
      el.dataset.index = String(i);
    });
  }

  function findTreeNode(path) {
    if (!window.__POSTS_TREE__) return null;
    function search(node) {
      if (normalizePath(node.path) === path) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    }
    return search(window.__POSTS_TREE__);
  }

  // README HTML was moved out of archive.html (build emits /readmes.json);
  // fetched once on demand when a folder is first selected
  let readmesPromise = null;
  function loadReadmes() {
    if (!readmesPromise) {
      readmesPromise = fetch('/readmes.json').then((r) => r.json()).catch(() => ({}));
    }
    return readmesPromise;
  }

  let readmeToken = 0;
  async function showReadmeOrHint(node) {
    if (!readmeEl) return;
    const token = ++readmeToken;
    if (node && node.readme) {
      readmeEl.style.display = '';
      readmeEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;font-size:0.95rem;">加载中…</p>';
      const readmes = await loadReadmes();
      if (token !== readmeToken) return; // user already switched to another folder
      const html = readmes[normalizePath(node.path) || ''];
      if (html) {
        readmeEl.innerHTML = html;
        initMermaid();
      } else {
        readmeEl.style.display = 'none';
      }
    } else if (node && node.children && node.children.length > 0) {
      // Folder has subfolders but no README
      readmeEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;font-size:0.95rem;">📂 请点击具体文档查看内容</p>';
      readmeEl.style.display = '';
    } else {
      readmeEl.style.display = 'none';
    }
  }

  // Normalize path to use / separator (tree JSON and data-path are /-based)
  function normalizePath(path) {
    if (!path) return path;
    return path.replace(/\\/g, '/');
  }

  function expandTreeAncestors(path, { includeSelf = true } = {}) {
    if (!path) return;
    const treeEl = document.getElementById('archive-tree');
    if (!treeEl) return;

    // Ensure root is always open so the selected path stays visible
    const rootDetails = treeEl.querySelector('.tree-folder[data-path=""]');
    if (rootDetails) rootDetails.open = true;

    // Build ancestor paths: e.g., "AI/Agent开发知识/02-推理范式" → ["AI", "AI/Agent开发知识", "AI/Agent开发知识/02-推理范式"]
    const parts = path.split('/');
    let accumulated = '';
    for (const part of parts) {
      accumulated = accumulated ? accumulated + '/' + part : part;
      // When collapsing via click, skip the target node so native close sticks
      if (!includeSelf && accumulated === path) continue;
      const details = treeEl.querySelector(`.tree-folder[data-path="${CSS.escape(accumulated)}"]`);
      if (details) details.open = true;
    }
  }

  function getArchiveItems() {
    return listWrap ? [...listWrap.querySelectorAll('.archive-item')] : [];
  }

  function setDateLabels(mode) {
    getArchiveItems().forEach((el) => {
      const dateEl = el.querySelector('.archive-date');
      if (!dateEl) return;
      const label = mode === 'recent' ? dateEl.dataset.mtimeLabel : dateEl.dataset.pubDate;
      if (label) dateEl.textContent = label;
    });
  }

  function restoreListOrder() {
    if (!archiveListEl) return;
    getArchiveItems()
      .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
      .forEach((el) => archiveListEl.appendChild(el));
  }

  function setRecentOpen(open) {
    if (!recentDetails || recentDetails.open === open) return;
    syncingRecent = true;
    recentDetails.open = open;
    syncingRecent = false;
  }

  function setRecentToggleActive(active) {
    if (!recentToggle) return;
    recentToggle.classList.toggle('is-active', active);
  }

  function applyRecentFilter() {
    viewMode = 'recent';
    currentPath = '';
    setRecentToggleActive(true);
    setRecentOpen(true);
    treeFolders.forEach((n) => n.classList.remove('is-active'));
    if (readmeEl) readmeEl.style.display = 'none';
    if (recentHint) recentHint.hidden = false;
    if (archiveListEl) archiveListEl.classList.add('is-recent-view');
    if (listWrap) listWrap.style.display = '';
    if (resultsEl) resultsEl.style.display = 'none';

    const items = getArchiveItems();
    items.forEach((el) => {
      el.style.display = el.dataset.recent === '1' ? '' : 'none';
    });
    if (archiveListEl) {
      items
        .filter((el) => el.dataset.recent === '1')
        .sort((a, b) => String(b.dataset.mtime || '').localeCompare(String(a.dataset.mtime || '')))
        .forEach((el) => archiveListEl.appendChild(el));
    }
    setDateLabels('recent');

    const url = new URL(window.location);
    url.searchParams.set('recent', '1');
    url.searchParams.delete('path');
    window.history.replaceState({}, '', url);
  }

  function applyPathFilter(path, options = {}) {
    // Paths use / separator consistently (tree JSON, data-path, URLs)
    path = normalizePath(path);
    viewMode = 'path';
    currentPath = path;
    setRecentToggleActive(false);
    if (isDesktopArchive()) setRecentOpen(false);
    if (recentHint) recentHint.hidden = true;
    if (archiveListEl) archiveListEl.classList.remove('is-recent-view');
    restoreListOrder();
    setDateLabels('path');

    const items = getArchiveItems();

    // Expand tree ancestors along the path
    expandTreeAncestors(path, options);

    // Highlight active tree node
    treeFolders.forEach(n => {
      n.classList.toggle('is-active', n.dataset.path === path);
    });

    // Show README or hint for the selected path
    if (path) {
      const node = findTreeNode(path);
      showReadmeOrHint(node);
    } else {
      if (readmeEl) readmeEl.style.display = 'none';
    }

    if (!path) {
      items.forEach(el => el.style.display = '');
    } else {
      items.forEach(el => {
        const itemPath = el.dataset.path || '';
        // Show items whose path matches exactly or is under currentPath
        el.style.display = (itemPath === path || itemPath.startsWith(path + '/')) ? '' : 'none';
      });
    }

    // Update URL
    const url = new URL(window.location);
    url.searchParams.delete('recent');
    if (path) {
      url.searchParams.set('path', path);
    } else {
      url.searchParams.delete('path');
    }
    window.history.replaceState({}, '', url);
  }

  if (recentDetails) {
    recentDetails.addEventListener('toggle', () => {
      if (syncingRecent) return;
      if (!isDesktopArchive()) {
        // Mobile: only expand/collapse the sidebar list; keep the main list as-is.
        setRecentToggleActive(recentDetails.open);
        return;
      }
      if (recentDetails.open) {
        if (input) input.value = '';
        restoreTreeFromSearch();
        applyRecentFilter();
      } else if (viewMode === 'recent') {
        applyPathFilter('');
      }
    });
  }

  treeFolders.forEach(node => {
    node.addEventListener('click', () => {
      // Don't interfere with native <details> toggle or <a> links
      const path = node.dataset.path;
      const details = node.closest('details');
      if (details && node.tagName === 'SUMMARY') {
        // Let native toggle finish, then filter; if user collapsed, don't force-reopen
        setTimeout(() => {
          applyPathFilter(path, { includeSelf: details.open });
        }, 10);
      }
    });
  });

  // Init from URL on load
  function initPathFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('recent') === '1') {
      if (isDesktopArchive()) applyRecentFilter();
      else setRecentOpen(true);
      return;
    }
    const path = params.get('path');
    if (path) {
      applyPathFilter(path);
    }
  }
  initPathFromUrl();

  async function doSearch(query) {
    if (!query) {
      resultsEl.style.display = 'none';
      listWrap.style.display = '';
      restoreTreeFromSearch();
      // Restore tree / recent filter
      if (viewMode === 'recent') applyRecentFilter();
      else applyPathFilter(currentPath);
      return;
    }

    const data = await loadIndex();
    const lower = query.toLowerCase();
    const matches = data.filter(p =>
      p.title.toLowerCase().includes(lower) ||
      p.content.toLowerCase().includes(lower) ||
      p.tags.some(t => t.toLowerCase().includes(lower)) ||
      (p.category && p.category.toLowerCase().includes(lower)) ||
      (p.subcategory && p.subcategory.toLowerCase().includes(lower))
    );

    listWrap.style.display = 'none';
    resultsEl.style.display = '';
    collapseTreeForSearch();
    if (readmeEl) readmeEl.style.display = 'none';
    if (recentHint) recentHint.hidden = true;

    if (matches.length === 0) {
      resultsEl.innerHTML = '<p class="search-empty">没有找到匹配的文章</p>';
      return;
    }

    resultsEl.innerHTML = `<ul class="post-list">${matches.map(p => {
      // Find a snippet around the match in content
      let snippet = '';
      const idx = p.content.toLowerCase().indexOf(lower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(p.content.length, idx + query.length + 80);
        snippet = (start > 0 ? '…' : '') + p.content.slice(start, end) + (end < p.content.length ? '…' : '');
      }

      const postUrl = p.relativeDir
        ? `/posts-html/${p.relativeDir}/${p.slug}.html`
        : `/posts-html/${p.slug}.html`;
      const catMeta = p.category
        ? ` · <span class="search-category">${p.category}${p.subcategory ? ' › ' + p.subcategory.replace(/ \/ /g, ' › ') : ''}</span>`
        : '';

      return `<li class="post-item">
        <div class="post-title"><a href="${postUrl}">${highlight(p.title, query)}</a></div>
        <div class="post-meta">${p.date}${catMeta}${p.tags.length ? ' · ' + p.tags.join(', ') : ''}</div>
        ${snippet ? `<div class="post-summary">${highlight(snippet, query)}</div>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }
}

function initPostToc() {
  const toc = document.querySelector('[data-post-toc]');
  if (!toc) return;

  const toggle = toc.querySelector('[data-toc-toggle]');
  const toggleText = toggle?.querySelector('.post-toc-toggle-text');
  const mobileMedia = window.matchMedia('(max-width: 768px)');

  const items = [...toc.querySelectorAll('.post-toc-link')]
    .map(link => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const heading = document.getElementById(id);
      return heading ? { link, heading } : null;
    })
    .filter(Boolean);

  if (items.length === 0) {
    toc.remove();
    return;
  }

  function setCollapsed(collapsed) {
    if (!toggle) return;
    toc.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    if (toggleText) {
      toggleText.textContent = collapsed ? '展开' : '收起';
    }
  }

  function syncTocMode() {
    if (!toggle) return;
    if (mobileMedia.matches) {
      setCollapsed(!toc.classList.contains('is-open-mobile'));
    } else {
      toc.classList.remove('is-collapsed', 'is-open-mobile');
      toggle.setAttribute('aria-expanded', 'true');
      if (toggleText) {
        toggleText.textContent = '';
      }
    }
  }

  function updateActiveLink() {
    const offset = 140;
    let activeItem = items[0];

    for (const item of items) {
      if (item.heading.getBoundingClientRect().top <= offset) {
        activeItem = item;
      } else {
        break;
      }
    }

    for (const item of items) {
      item.link.classList.toggle('is-active', item === activeItem);
    }
  }

  let ticking = false;
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateActiveLink();
      ticking = false;
    });
  }

  for (const item of items) {
    item.link.addEventListener('click', () => {
      for (const entry of items) {
        entry.link.classList.toggle('is-active', entry === item);
      }

      if (mobileMedia.matches) {
        toc.classList.remove('is-open-mobile');
        setCollapsed(true);
      }
    });
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const willOpen = toc.classList.contains('is-collapsed');
      toc.classList.toggle('is-open-mobile', willOpen);
      setCollapsed(!willOpen);
    });
  }

  document.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  mobileMedia.addEventListener('change', syncTocMode);
  syncTocMode();
  requestUpdate();
}

// ====== WeChat Share ======
function initWeChatShare() {
  const ua = navigator.userAgent.toLowerCase();
  if (!ua.includes('micromessenger')) return;

  // Extract share info from meta tags
  const getMeta = (prop) => {
    const el = document.querySelector(`meta[property="${prop}"]`) ||
               document.querySelector(`meta[name="${prop}"]`);
    return el ? el.getAttribute('content') : '';
  };

  const shareData = {
    title: getMeta('og:title') || document.title,
    desc: getMeta('og:description') || getMeta('description') || '',
    link: getMeta('og:url') || window.location.href,
    imgUrl: getMeta('og:image') || 'https://http200.cn/icons/icon-512.png',
  };

  // Try WeChat JS-SDK if available
  function configWxSdk() {
    if (typeof wx === 'undefined') return;

    wx.ready(function () {
      wx.updateAppMessageShareData({
        title: shareData.title,
        desc: shareData.desc,
        link: shareData.link,
        imgUrl: shareData.imgUrl,
        success: function () {},
      });
      wx.updateTimelineShareData({
        title: shareData.title,
        link: shareData.link,
        imgUrl: shareData.imgUrl,
        success: function () {},
      });
    });
  }

  // Try to fetch wx-config from API, fallback to meta tags only
  fetch('/api/wx-config?url=' + encodeURIComponent(window.location.href.split('#')[0]))
    .then(function (res) { return res.json(); })
    .then(function (cfg) {
      if (cfg.appId && cfg.timestamp && cfg.nonceStr && cfg.signature) {
        var script = document.createElement('script');
        script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
        script.onload = function () {
          wx.config({
            debug: false,
            appId: cfg.appId,
            timestamp: cfg.timestamp,
            nonceStr: cfg.nonceStr,
            signature: cfg.signature,
            jsApiList: [
              'updateAppMessageShareData',
              'updateTimelineShareData',
            ],
          });
          configWxSdk();
        };
        document.head.appendChild(script);
      }
    })
    .catch(function () {
      // No server-side config available, rely on OG meta tags
    });
}

// ====== Back to top ======
function initBackToTop(isHome3D) {
  if (isHome3D) return;
  if (document.querySelector('.back-to-top')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', '回到顶部');
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 4l8 8h-5v8h-6v-8H4z"/></svg>`;
  document.body.appendChild(btn);

  const toggle = () => {
    btn.classList.toggle('is-visible', window.scrollY > window.innerHeight);
  };
  toggle();
  window.addEventListener('scroll', toggle, { passive: true });
  window.addEventListener('resize', toggle, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ====== Season theme switcher ======
const SEASON_THEMES = [
  { id: '', icon: '🌌', label: '默认', color: '#0a0a0f' },
  { id: 'spring', icon: '🌸', label: '春', color: '#0d1310' },
  { id: 'summer', icon: '☀️', label: '夏', color: '#081220' },
  { id: 'autumn', icon: '🍂', label: '秋', color: '#14100a' },
  { id: 'winter', icon: '❄️', label: '冬', color: '#0a0e17' },
];

function initSeasonSwitcher() {
  const KEY = 'site-season';
  const validIds = SEASON_THEMES.map((t) => t.id);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'season-btn';
  btn.setAttribute('aria-label', '切换季节皮肤');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'season-menu';
  menu.setAttribute('role', 'menu');
  SEASON_THEMES.forEach((theme) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.season = theme.id;
    item.innerHTML = `<span aria-hidden="true">${theme.icon}</span><span>${theme.label}</span>`;
    item.addEventListener('click', () => {
      applySeason(theme.id);
      closeMenu();
    });
    menu.appendChild(item);
  });

  function applySeason(/** @type {string} */ id) {
    if (id) {
      document.documentElement.setAttribute('data-season', id);
    } else {
      document.documentElement.removeAttribute('data-season');
    }
    try {
      localStorage.setItem(KEY, id);
    } catch (e) { /* storage unavailable — ignore */ }
    const theme = SEASON_THEMES.find((t) => t.id === id) || SEASON_THEMES[0];
    btn.textContent = theme.icon;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.color);
    menu.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.season === id);
    });
  }

  function openMenu() {
    menu.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () => {
    if (menu.classList.contains('is-open')) closeMenu();
    else openMenu();
  });
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!menu.classList.contains('is-open')) return;
    if (target && (menu.contains(target) || btn.contains(target))) return;
    closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  document.body.appendChild(menu);
  document.body.appendChild(btn);

  let saved = '';
  try {
    saved = localStorage.getItem(KEY) || '';
  } catch (e) { /* storage unavailable — ignore */ }
  applySeason(validIds.includes(saved) ? saved : '');
}

// ====== Post font-size control ======
function initFontSizeControl() {
  const control = document.querySelector('.font-size-control');
  if (!control) return;

  const KEY = 'post-font-scale';
  const MIN = 0.8;
  const MAX = 1.6;
  const STEP = 0.1;

  const valueEl = control.querySelector('.font-size-value');
  let scale = parseFloat(localStorage.getItem(KEY) || '');
  if (!Number.isFinite(scale) || scale < MIN || scale > MAX) scale = 1;

  /** Clamp to [MIN, MAX] and round to one decimal to avoid float drift (0.7000000000001 etc.). */
  function clampScale(/** @type {number} */ v) {
    return Math.round(Math.min(MAX, Math.max(MIN, v)) * 10) / 10;
  }

  function apply() {
    scale = clampScale(scale);
    document.documentElement.style.setProperty('--post-font-scale', String(scale));
    if (valueEl) valueEl.textContent = `${Math.round(scale * 100)}%`;
    try {
      localStorage.setItem(KEY, String(scale));
    } catch (e) { /* storage unavailable — ignore */ }
  }

  control.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const btn = target?.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'increase') scale += STEP;
    else if (action === 'decrease') scale -= STEP;
    else scale = 1;
    apply();
  });

  apply();
}

// Init
const isHome3D = initHomeRoomIfNeeded();
if (!isHome3D) {
  initParticles();
}
initHomeSearchModal();
initSearch();
initPostToc();
initWeChatShare();
initMermaid();
initFontSizeControl();
initSeasonSwitcher();
initBackToTop(isHome3D);
