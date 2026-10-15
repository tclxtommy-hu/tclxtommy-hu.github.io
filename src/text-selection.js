// 文章页「划词问 AI」：选中正文里的文字 → 选区旁弹出小气泡 → 一键丢进聊天窗（src/room-chat.js）。
//
// 只认正文 .post-content 里的选区：聊天窗、输入框、代码块里的选中都不弹气泡，
// 免得用户想复制一行命令时被气泡挡住（那种场景「复制」按钮反而是干扰）。
//
// 气泡用 position: fixed + 视口坐标，滚动即收起 —— 不用跟随滚动重算位置，
// 手机上也不会出现「气泡留在原地、文字已经滚走」的错位。

/** 与 room-chat.js 的取长上限一致：更长的选段该分几次问，一次塞进去只会白烧 token */
const MAX_QUOTE_CHARS = 1200;
/** 短于这个长度不弹气泡：多半是单击、或拖拽时顺手带上了一个标点 */
const MIN_QUOTE_CHARS = 2;

/** 兜底复制：非 HTTPS（或没给剪贴板权限）时 navigator.clipboard 不可用 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到 execCommand 兜底
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function initTextSelectionAsk() {
  const content = document.querySelector('.post-content');
  if (!content) return;

  const bubble = document.createElement('div');
  bubble.className = 'ask-sel-bubble';
  bubble.hidden = true;
  bubble.setAttribute('role', 'toolbar');
  bubble.setAttribute('aria-label', '选中文字后的操作');

  const askBtn = document.createElement('button');
  askBtn.type = 'button';
  askBtn.className = 'ask-sel-btn ask-sel-ask';
  askBtn.textContent = '💬 问 AI';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'ask-sel-btn ask-sel-copy';
  copyBtn.textContent = '复制';

  bubble.append(askBtn, copyBtn);
  document.body.appendChild(bubble);

  /** 气泡当前代表的选段（两个按钮共用；比再读一次 window.getSelection() 稳） */
  let currentText = '';
  /** @type {number} */
  let timer = 0;
  /** @type {number} */
  let rafId = 0;

  function hide() {
    if (bubble.hidden) return;
    bubble.hidden = true;
    currentText = '';
    askBtn.textContent = '💬 问 AI';
    copyBtn.textContent = '复制';
    bubble.classList.remove('is-copied');
  }

  /** 选区必须整体落在正文里，且不是输入框 / 聊天窗 / 代码块 */
  function isEligible(/** @type {Range} */ range) {
    if (!content.contains(range.commonAncestorContainer)) return false;
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (node) : node.parentElement;
    if (!el) return false;
    if (el.closest('textarea, input, #room-chat-modal')) return false;
    if (el.closest('pre')) return false;
    return true;
  }

  /** 默认浮在选区上方；贴顶（或屏幕太矮）时改放下方，别被视口裁掉 */
  function place(/** @type {DOMRect} */ rect) {
    bubble.hidden = false;
    const { width, height } = bubble.getBoundingClientRect();
    const above = rect.top - height - 10;
    const top = above < 8 ? rect.bottom + 10 : above;
    const center = rect.left + rect.width / 2;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.left = `${Math.round(Math.min(Math.max(center, width / 2 + 8), window.innerWidth - width / 2 - 8))}px`;
  }

  function evaluate() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hide();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!isEligible(range)) {
      hide();
      return;
    }
    const text = sel.toString().trim();
    if (text.length < MIN_QUOTE_CHARS) {
      hide();
      return;
    }
    currentText = text.length > MAX_QUOTE_CHARS ? `${text.slice(0, MAX_QUOTE_CHARS)}…` : text;
    place(range.getBoundingClientRect());
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(evaluate, 120);
  }

  // 鼠标 / 触屏选完是 pointerup，键盘（Shift + 方向键）选完是 keyup
  document.addEventListener('pointerup', schedule);
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift' || e.key.startsWith('Arrow')) schedule();
  });
  // 选区自己消失（点别处、拖没了）就收起，不需要等下一个事件
  document.addEventListener('selectionchange', () => {
    if (bubble.hidden) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hide();
  });
  // 为什么不是「一有 scroll 就收起」：滚动事件由浏览器延迟派发（无动画的页面里可能晚到几百毫秒），
  // 于是「先滚动、后划词」时，滚动事件会在气泡弹出之后才到，气泡会当场消失。
  // 所以只比对滚动位置：位置没变 = 这个事件是弹出之前的，忽略。
  // 滚动时重新定位，而不是直接收起：浏览器会在划词之后才补发滚动事件
  // （点目录的平滑滚动、手机的惯性滚动都会连发几十个），
  // 一有滚动就收起会让气泡一闪而过。选区真的没了（点别处、重新点一下）才是收起信号。
  window.addEventListener(
    'scroll',
    () => {
      if (bubble.hidden || rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        evaluate();
      });
    },
    { passive: true, capture: true }
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target;
      if (target instanceof Node && bubble.contains(target)) return;
      hide();
    },
    true
  );
  // 点气泡按钮时别让浏览器顺手清掉选区：否则「复制」永远拿不到内容
  bubble.addEventListener('mousedown', (e) => e.preventDefault());

  askBtn.addEventListener('click', () => {
    const text = currentText;
    if (!text) return;
    const title = document.querySelector('.post-header h1')?.textContent?.trim() || document.title;
    const url = `${window.location.origin}${window.location.pathname}`;
    hide();
    // 统一入口：room-chat.js 收到 detail.quote 就挂成引用卡片，用户提问时自动带出处
    window.dispatchEvent(
      new CustomEvent('room:open-chat', { detail: { quote: text, sourceTitle: title, sourceUrl: url } })
    );
  });

  copyBtn.addEventListener('click', async () => {
    if (!currentText) return;
    const ok = await copyText(currentText);
    copyBtn.textContent = ok ? '已复制' : '复制失败';
    bubble.classList.toggle('is-copied', ok);
    setTimeout(() => {
      if (!bubble.hidden) {
        copyBtn.textContent = '复制';
        bubble.classList.remove('is-copied');
      }
    }, 1200);
  });
}
