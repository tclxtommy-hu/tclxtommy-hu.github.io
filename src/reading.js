// 阅读增强（全部是渐进增强，脚本不跑正文照样能读）：
//   - 代码块「复制」按钮 + 语言角标
//   - 正文配图点击放大
//   - 标题锚点：点一下复制「本页#这一节」的绝对地址
//   - 轻提示 toast（上面几件事共用）

import { copyText } from './text-selection.js';

let toastTimer = 0;

/**
 * 底部中间弹一条一句话提示，1.6s 自动消失。
 * @param {string} text
 * @param {number} [ms]
 */
export function showToast(text, ms = 1600) {
  let el = document.getElementById('site-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'site-toast';
    el.className = 'site-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = text;
  // 先移除再加，保证连点时动画会重播
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), ms);
}

/** 代码块语言：```ts 里 marked 会渲染成 class="language-ts" */
function codeLanguage(/** @type {HTMLElement} */ pre) {
  const code = pre.querySelector('code');
  const match = code && /language-([\w+-]+)/.exec(code.className);
  return match ? match[1] : '';
}

/** 给正文里每个代码块挂「复制」按钮和语言角标 */
export function initCodeCopy() {
  const blocks = document.querySelectorAll('.post-content pre, .archive-readme pre');
  blocks.forEach((pre) => {
    const el = /** @type {HTMLElement} */ (pre);
    if (el.parentElement?.classList.contains('code-block')) return;
    // mermaid 会把这个 <pre> 换成图表：包一层再留下「复制」按钮，图表右上角会多出一个孤立按钮
    if (el.querySelector('code.language-mermaid')) return;

    // 角标和按钮放在 <pre> 外面（包一层 .code-block）：
    // 塞进 <pre> 里会被「全选 + 复制」一起带走 —— 复制出来的 JSON 尾巴上多个「复制」就废了
    const box = document.createElement('div');
    box.className = 'code-block';
    el.parentNode?.insertBefore(box, el);
    box.appendChild(el);

    const lang = codeLanguage(el);
    if (lang && lang !== 'mermaid') {
      el.classList.add('has-lang');
      const tag = document.createElement('span');
      tag.className = 'code-lang';
      tag.textContent = lang;
      box.appendChild(tag);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制这段代码');
    btn.addEventListener('click', async () => {
      const code = el.querySelector('code');
      const text = (code ? code.textContent : el.textContent) || '';
      const ok = await copyText(text.replace(/\n$/, ''));
      btn.textContent = ok ? '已复制' : '复制失败';
      showToast(ok ? '代码已复制' : '复制失败，请手动选中');
      window.setTimeout(() => {
        btn.textContent = '复制';
      }, 1400);
    });
    box.appendChild(btn);
  });
}

/** 正文配图点击放大：点图开、点任意处 / Esc / × 关 */
export function initImageLightbox() {
  const content = document.querySelector('.post-content, .archive-readme');
  if (!content) return;

  /** @type {HTMLImageElement | null} */
  let current = null;

  const overlay = document.createElement('div');
  overlay.className = 'img-lightbox';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '图片放大查看');

  const img = document.createElement('img');
  img.className = 'img-lightbox-img';
  img.alt = '';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'img-lightbox-close';
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.textContent = '×';

  overlay.append(img, closeBtn);
  document.body.appendChild(overlay);

  function open(source) {
    current = source;
    img.src = source.currentSrc || source.src;
    img.alt = source.alt || '';
    overlay.hidden = false;
    document.body.classList.add('is-lightbox-open');
    closeBtn.focus();
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    img.removeAttribute('src');
    document.body.classList.remove('is-lightbox-open');
    current?.focus();
    current = null;
  }

  // 用事件委托：切换文章 / 以后动态插入图片都不用重新绑定
  content.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    // 图片套在链接里的，交给链接（用户想点的是链接）
    if (target.closest('a')) return;
    if (target.closest('.mermaid-wrap')) return;
    event.preventDefault();
    open(target);
  });

  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

/** 标题锚点：点 # 复制绝对链接，同时保留默认的「跳到本节」 */
export function initHeadingAnchors() {
  document.querySelectorAll('.heading-anchor').forEach((el) => {
    const anchor = /** @type {HTMLElement} */ (el);
    // 归档页的 README 是异步插入的，这里会被重复调用；用 dataset 标记避免重复绑定
    if (anchor.dataset.bound === '1') return;
    anchor.dataset.bound = '1';
    anchor.addEventListener('click', () => {
      const id = anchor.dataset.anchor || '';
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      copyText(url).then((ok) => showToast(ok ? '本节链接已复制' : url));
    });
  });
}
