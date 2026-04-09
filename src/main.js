import './style.css';

// ====== Particle background animation ======
function initParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  const points = [];

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
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 120) {
          ctx.beginPath();
          ctx.moveTo(points[a].x, points[a].y);
          ctx.lineTo(points[b].x, points[b].y);
          ctx.strokeStyle = `rgba(0,240,255,${(120 - d) / 300})`;
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
}

// ====== PWA Service Worker ======
if ('serviceWorker' in navigator) {
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

  async function doSearch(query) {
    if (!query) {
      resultsEl.style.display = 'none';
      listWrap.style.display = '';
      return;
    }

    const data = await loadIndex();
    const lower = query.toLowerCase();
    const matches = data.filter(p =>
      p.title.toLowerCase().includes(lower) ||
      p.content.toLowerCase().includes(lower) ||
      p.tags.some(t => t.toLowerCase().includes(lower))
    );

    listWrap.style.display = 'none';
    resultsEl.style.display = '';

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

      return `<li class="post-item">
        <div class="post-title"><a href="/posts-html/${p.slug}.html">${highlight(p.title, query)}</a></div>
        <div class="post-meta">${p.date}${p.tags.length ? ' · ' + p.tags.join(', ') : ''}</div>
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

// Init
initParticles();
initSearch();
initPostToc();
