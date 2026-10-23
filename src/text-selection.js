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

/**
 * @typedef {'red' | 'orange'} MarkColor
 * @typedef {{ start: number, end: number, color: MarkColor, text: string }} TextMark
 */

/** 兜底复制：非 HTTPS（或没给剪贴板权限）时 navigator.clipboard 不可用 */
export async function copyText(text) {
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

  // 划线按钮的文案本身就用波浪线预览效果，用户一眼能看出红/橙的区别
  const redBtn = document.createElement('button');
  redBtn.type = 'button';
  redBtn.className = 'ask-sel-btn ask-sel-mark';
  redBtn.dataset.color = 'red';
  redBtn.title = '红色波浪线标注';
  redBtn.setAttribute('aria-label', '用红色波浪线标注选中文字');
  redBtn.innerHTML = '<span class="text-with-red-wave">红线</span>';

  const orangeBtn = document.createElement('button');
  orangeBtn.type = 'button';
  orangeBtn.className = 'ask-sel-btn ask-sel-mark';
  orangeBtn.dataset.color = 'orange';
  orangeBtn.title = '橙色波浪线标注';
  orangeBtn.setAttribute('aria-label', '用橙色波浪线标注选中文字');
  orangeBtn.innerHTML = '<span class="text-with-orange-wave">橙线</span>';

  bubble.append(askBtn, redBtn, orangeBtn, copyBtn);
  document.body.appendChild(bubble);

  /** 气泡当前代表的选段（两个按钮共用；比再读一次 window.getSelection() 稳） */
  let currentText = '';
  /** 气泡弹出时的选区快照：触屏上点按钮可能先把 selection 清掉，用它兜底 */
  /** @type {Range | null} */
  let currentRange = null;
  /** 手指/鼠标正按在气泡上：此时浏览器可能先清掉选区，别把气泡收起来 */
  let pressingBubble = false;
  /** @type {number} */
  let timer = 0;
  /** @type {number} */
  let rafId = 0;

  function hide() {
    if (bubble.hidden) return;
    bubble.hidden = true;
    currentText = '';
    currentRange = null;
    pressingBubble = false;
    askBtn.textContent = '💬 问 AI';
    copyBtn.textContent = '复制';
    bubble.classList.remove('is-copied');
  }

  /** 选区必须整体落在正文里，且不是输入框 / 聊天窗 / 代码块 */
  function isEligible(/** @type {Range} */ range) {
    if (!content.contains(range.commonAncestorContainer)) return false;
    const elementOf = (/** @type {Node} */ node) =>
      node.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (node) : node.parentElement;
    const el = elementOf(range.commonAncestorContainer);
    if (!el) return false;
    if (el.closest('textarea, input, #room-chat-modal')) return false;
    if (el.closest('pre, .mermaid, .mermaid-wrap, svg')) return false;
    // 起点/终点落在代码块里（哪怕共同祖先是正文容器）也不弹
    if (elementOf(range.startContainer)?.closest('pre, .mermaid, .mermaid-wrap, svg')) return false;
    if (elementOf(range.endContainer)?.closest('pre, .mermaid, .mermaid-wrap, svg')) return false;
    return true;
  }

  /**
   * 触屏（没有 hover）上把气泡放到选区下方：长按选中后，系统自带的
   * 「复制 / 全选」菜单就浮在选区上方，我们再挤上去会互相压住。
   */
  const coarsePointer = window.matchMedia?.('(hover: none), (pointer: coarse)').matches ?? false;

  /** 取整个选区的外接矩形；多行选区时浏览器给的 rect 可能偏差很大 */
  function selectionRect(/** @type {Range} */ range) {
    const rects = Array.from(range.getClientRects()).filter(
      (item) => item.width > 0 && item.height > 0
    );
    if (rects.length === 0) return range.getBoundingClientRect();
    const left = Math.min(...rects.map((item) => item.left));
    const right = Math.max(...rects.map((item) => item.right));
    const top = Math.min(...rects.map((item) => item.top));
    const bottom = Math.max(...rects.map((item) => item.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  /** 默认浮在选区上方；贴顶或空间不够时改放下方，别被视口裁掉 */
  function place(/** @type {DOMRect} */ rect) {
    bubble.hidden = false;
    const { width, height } = bubble.getBoundingClientRect();
    const gap = 10;
    const above = rect.top - height - gap;
    const below = rect.bottom + gap;
    let top;
    if (coarsePointer) {
      // 手机：优先下方；下方放不下再翻到上方
      top = below + height <= window.innerHeight - 8 || below < above ? below : above;
    } else {
      top = above >= 8 ? above : below;
    }
    top = Math.min(Math.max(top, 8), Math.max(8, window.innerHeight - height - 8));
    const center = rect.left + rect.width / 2;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.left = `${Math.round(Math.min(Math.max(center, width / 2 + 8), window.innerWidth - width / 2 - 8))}px`;
  }

  function evaluate() {
    // 手指正按在气泡上：浏览器可能先清掉选区再触发 click，此时不能收气泡
    if (pressingBubble) return;
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
    currentRange = range.cloneRange();
    place(selectionRect(range));
  }

  function schedule(delay = 120) {
    clearTimeout(timer);
    timer = setTimeout(evaluate, delay);
  }

  // 鼠标/触屏拖动选区的过程中先不弹，等抬手再定位；手机上长按选词会被浏览器
  // 接管手势并派发 pointercancel（没有 pointerup），所以不能只靠 pointerup 收尾。
  let pointerSelecting = false;

  // 选区变化是移动端唯一可靠的信号：长按选中、拖动原生选区手柄都只会发
  // selectionchange。桌面端拖动时 pointerSelecting 为 true，避免气泡跟着拖拽乱跳。
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      if (!pressingBubble && !bubble.hidden) hide();
      return;
    }
    if (pointerSelecting) return;
    schedule();
  });
  /** 触屏长按后如果浏览器既不发 pointerup 也不发 pointercancel，用它兜底放开判断 */
  /** @type {number} */
  let selectGuardTimer = 0;
  // 键盘（Shift + 方向键）选完也走这里
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift' || e.key.startsWith('Arrow')) schedule();
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
  // 手机地址栏收起 / 键盘弹出只改 visualViewport，不触发 window.scroll，
  // 不重算的话气泡会停在旧位置；选区已经没了就顺势收起。
  window.visualViewport?.addEventListener('resize', () => {
    if (!bubble.hidden) evaluate();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target;
      if (target instanceof Node && bubble.contains(target)) {
        pressingBubble = true;
        return;
      }
      // 不在这里直接 hide()：手机上这根手指很可能正按在原生选区手柄上，
      // 一按就收会让气泡再也弹不回来（后续只有 pointercancel，没有 pointerup）。
      // 真正的收起信号是选区塌陷，交给上面的 selectionchange。
      pointerSelecting = true;
      // iOS 有些版本长按选词后不会再派发 pointerup/pointercancel，
      // 只靠事件复位会让 pointerSelecting 一直为 true，气泡永远不出现。
      if (e.pointerType === 'touch') {
        clearTimeout(selectGuardTimer);
        selectGuardTimer = window.setTimeout(() => {
          pointerSelecting = false;
          schedule(80);
        }, 700);
      }
    },
    true
  );
  // 点气泡按钮时别让浏览器顺手清掉选区：否则「复制」永远拿不到内容
  bubble.addEventListener('mousedown', (e) => e.preventDefault());
  document.addEventListener(
    'pointerup',
    (e) => {
      const target = e.target;
      if (target instanceof Node && bubble.contains(target)) {
        // 等 click 跑完再复位，避免 pointerup 与 click 之间补发的 selectionchange 把气泡收掉
        setTimeout(() => {
          pressingBubble = false;
        }, 300);
        return;
      }
      clearTimeout(selectGuardTimer);
      pointerSelecting = false;
      schedule(160);
    },
    true
  );
  document.addEventListener('pointercancel', () => {
    clearTimeout(selectGuardTimer);
    pointerSelecting = false;
    pressingBubble = false;
    schedule(200);
  }, true);
  // 手指拖到窗口外再松开时可能收不到 pointerup，别让 pointerSelecting 卡在 true
  window.addEventListener('blur', () => {
    clearTimeout(selectGuardTimer);
    pointerSelecting = false;
  });

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

  // ====== 划线标注：只存本机 localStorage，按文章路径隔离 ======
  const MARKS_KEY = `http200:annotations:${window.location.pathname}`;
  // 这些节点里的文字会随渲染变化（Mermaid 会替换成 SVG），不能参与偏移计算
  const MARK_SKIP = 'pre, .mermaid, .mermaid-wrap, svg, script, style, .heading-anchor';

  /** @type {TextMark[]} */
  let marks = [];

  /** 正文里参与标注的文本节点：跳过代码块、Mermaid、SVG 等不稳定节点 */
  function editorTextNodes() {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest(MARK_SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    /** @type {Text[]} */
    const nodes = [];
    while (walker.nextNode()) nodes.push(/** @type {Text} */ (walker.currentNode));
    return nodes;
  }

  function plainText() {
    return editorTextNodes()
      .map((node) => node.data)
      .join('');
  }

  /**
   * 节点内第一个落在 range 里的字符偏移。
   * @param {Text} node
   * @param {Range} range
   */
  function firstOffsetInRange(node, range) {
    let low = 0;
    let high = node.data.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (range.comparePoint(node, mid) >= 0) high = mid;
      else low = mid + 1;
    }
    return low;
  }

  /**
   * 节点内最后一个落在 range 里的字符偏移（不含）。
   * @param {Text} node
   * @param {Range} range
   */
  function lastOffsetInRange(node, range) {
    let low = 0;
    let high = node.data.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (range.comparePoint(node, mid) <= 0) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /**
   * 把 DOM 边界（container/offset）换算成正文纯文本里的字符偏移。
   * 只统计 editorTextNodes()，和 restore 时用的是同一套坐标。
   * @param {Node} container
   * @param {number} offset
   */
  function textLengthBefore(container, offset) {
    const range = document.createRange();
    range.selectNodeContents(content);
    range.setEnd(container, offset);
    let total = 0;
    for (const node of editorTextNodes()) {
      if (!range.intersectsNode(node)) continue;
      const first = firstOffsetInRange(node, range);
      const last = lastOffsetInRange(node, range);
      if (last > first) total += last - first;
    }
    return total;
  }

  /** @param {Range} range */
  function selectionOffsets(range) {
    return {
      start: textLengthBefore(range.startContainer, range.startOffset),
      end: textLengthBefore(range.endContainer, range.endOffset),
    };
  }

  /** @param {number} offset */
  function locateOffset(offset) {
    let total = 0;
    for (const node of editorTextNodes()) {
      const length = node.data.length;
      if (offset <= total + length) return { node, offset: offset - total };
      total += length;
    }
    return null;
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  function rangeFromOffsets(start, end) {
    const startPoint = locateOffset(start);
    const endPoint = locateOffset(end);
    if (!startPoint || !endPoint) return null;
    const range = document.createRange();
    try {
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
    } catch {
      return null;
    }
    return range;
  }

  /** 先把旧标注还原成纯文本节点，避免重复应用时越套越深 */
  function unwrapMarks() {
    // 只认带 data-mark 的 span：文章里作者手写的同名 class 不能误删
    const spans = content.querySelectorAll(
      '.text-with-red-wave[data-mark], .text-with-orange-wave[data-mark]'
    );
    for (const span of spans) {
      span.replaceWith(...Array.from(span.childNodes));
    }
    content.normalize();
  }

  /**
   * 把 range 覆盖到的每个文本节点单独包一层 span。
   * 跨段落/跨行内元素的选区会得到多个 span，视觉上是连续的波浪线。
   * @param {Range} range
   * @param {MarkColor} color
   */
  function wrapRange(range, color) {
    const className = `text-with-${color}-wave`;
    /** @type {{ node: Text, first: number, last: number }[]} */
    const segments = [];
    for (const node of editorTextNodes()) {
      if (!range.intersectsNode(node)) continue;
      // 纯空白节点不用包：波浪线在空白上看不见，只会白白多出一堆 span
      if (!node.data.trim()) continue;
      const first = firstOffsetInRange(node, range);
      const last = lastOffsetInRange(node, range);
      if (last > first) segments.push({ node, first, last });
    }

    for (const { node, first, last } of segments) {
      const value = node.data;
      const span = document.createElement('span');
      span.className = className;
      span.dataset.mark = color;
      span.textContent = value.slice(first, last);
      const fragment = document.createDocumentFragment();
      if (first > 0) fragment.appendChild(document.createTextNode(value.slice(0, first)));
      fragment.appendChild(span);
      if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)));
      node.replaceWith(fragment);
    }
  }

  function renderMarks() {
    unwrapMarks();
    for (const mark of marks) {
      const range = rangeFromOffsets(mark.start, mark.end);
      if (range && !range.collapsed) wrapRange(range, mark.color);
    }
  }

  /**
   * 排序 + 同色合并 + 去掉异常重叠。
   * @param {TextMark[]} list
   * @returns {TextMark[]}
   */
  function normalizeMarks(list) {
    const sorted = list.filter((mark) => mark.end > mark.start).sort((a, b) => a.start - b.start);
    /** @type {TextMark[]} */
    const out = [];
    for (const item of sorted) {
      let mark = item;
      const last = out[out.length - 1];
      if (last && mark.start <= last.end) {
        if (last.color === mark.color) {
          last.end = Math.max(last.end, mark.end);
          continue;
        }
        if (mark.end <= last.end) continue;
        mark = { ...mark, start: last.end };
      }
      out.push(mark);
    }
    return out;
  }

  /**
   * 从已有标注里挖掉 [start, end)，跨边界的标注会拆成左右两段。
   * @param {TextMark[]} list
   * @param {number} start
   * @param {number} end
   * @returns {TextMark[]}
   */
  function subtractRange(list, start, end) {
    /** @type {TextMark[]} */
    const out = [];
    for (const mark of list) {
      if (mark.end <= start || mark.start >= end) {
        out.push(mark);
        continue;
      }
      if (mark.start < start) out.push({ ...mark, end: start });
      if (mark.end > end) out.push({ ...mark, start: end });
    }
    return out;
  }

  function saveMarks() {
    const plain = plainText();
    const items = marks.map((mark) => ({
      start: mark.start,
      end: mark.end,
      color: mark.color,
      text: plain.slice(mark.start, mark.end),
    }));
    try {
      localStorage.setItem(MARKS_KEY, JSON.stringify({ v: 1, textLength: plain.length, items }));
    } catch {
      // 隐私模式 / 配额满：划线只在当前页生效
    }
  }

  function loadMarks() {
    /** @type {{ items?: any[], textLength?: number } | null} */
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(MARKS_KEY) || 'null');
    } catch {
      return;
    }
    if (!saved || !Array.isArray(saved.items) || saved.items.length === 0) return;

    const plain = plainText();
    let changed = false;
    /** @type {TextMark[]} */
    const next = [];
    for (const item of saved.items) {
      if (!item || (item.color !== 'red' && item.color !== 'orange')) {
        changed = true;
        continue;
      }
      let start = Number(item.start);
      let end = Number(item.end);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > plain.length ||
        end <= start
      ) {
        changed = true;
        continue;
      }
      // 文章改过、偏移漂了：按保存的原文重新找位置；找不到就丢弃这一条
      if (typeof item.text === 'string' && item.text && plain.slice(start, end) !== item.text) {
        const at = plain.indexOf(item.text);
        if (at < 0) {
          changed = true;
          continue;
        }
        start = at;
        end = at + item.text.length;
        changed = true;
      }
      next.push({ start, end, color: item.color, text: plain.slice(start, end) });
    }

    marks = normalizeMarks(next);
    renderMarks();
    if (changed || marks.length !== saved.items.length) saveMarks();
  }

  /** @param {MarkColor} color */
  function applyMark(color) {
    const sel = window.getSelection();
    // 桌面上 mousedown 已经 preventDefault，选区还在；触屏上可能已经被浏览器清掉，
    // 这时用气泡弹出时保存的选区快照兜底。
    const range =
      sel && !sel.isCollapsed && sel.rangeCount > 0 ? sel.getRangeAt(0) : currentRange;
    if (!range) return;
    if (!isEligible(range)) return;

    const plain = plainText();
    let { start, end } = selectionOffsets(range);
    // 选区两端常带空格/换行，去掉它们，否则波浪线会拖出一截看不见的空白
    while (start < end && /\s/.test(plain[start])) start += 1;
    while (end > start && /\s/.test(plain[end - 1])) end -= 1;
    if (end <= start) return;

    const covering = marks.find(
      (mark) => mark.color === color && mark.start <= start && mark.end >= end
    );
    if (covering) {
      // 选中的文字整段已经是这个颜色：再点一次 = 取消
      marks = marks.filter((mark) => mark !== covering);
    } else {
      // 先挖掉选区里已有的其他颜色，再落新颜色，保证标注不重叠
      marks = subtractRange(marks, start, end);
      marks.push({ start, end, color, text: plain.slice(start, end) });
      marks = normalizeMarks(marks);
    }

    renderMarks();
    saveMarks();
    sel?.removeAllRanges();
    hide();
  }

  for (const button of [redBtn, orangeBtn]) {
    button.addEventListener('click', () => {
      applyMark(button.dataset.color === 'orange' ? 'orange' : 'red');
    });
  }

  loadMarks();
}
