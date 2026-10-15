// 3D 房间「点击小人聊天」聊天窗口。
//
// 依赖后端 BFF（仓库 tclxtommy-hu.github.io.bff）的 POST /api/chat：
//   - API Key 只存在 BFF 里，浏览器拿不到；
//   - 请求体 { messages: [{ role, content }], stream: true }，返回 SSE 增量。
//
// 语音输入 / 朗读全部使用浏览器系统接口（Web Speech API），不引第三方 SDK：
//   - 语音输入：SpeechRecognition / webkitSpeechRecognition
//   - 语音朗读：speechSynthesis

const CHAT_CONFIG_URL = '/chat.config.json';
const CHAT_ENDPOINT_PATH = '/api/chat';
/** 携带多少轮历史（不含本次提问），太多会白烧 token */
const MAX_HISTORY_TURNS = 8;

const GREETING = '嗨，我是 TommyHu 👋 这个房间里的人就是我。想聊技术、聊项目，还是想问问我的经历？直接问我，也可以点麦克风用说的。';

/** 文章页的招呼语：那边的主线是「找文章 / 问文章里的内容」 */
const GREETING_POST = '嗨，我是 TommyHu 的 AI 分身 👋 全站文章我都读过——想找什么直接问我，也可以把正文里的段落划词丢给我。';

/** 输入框留空、但手上带着引用时用的默认问题，省掉「你倒是问一句啊」的空转 */
const DEFAULT_QUOTE_QUESTION = '这段内容是什么意思？结合我博客里的相关文章讲一下。';

/** 划词选段的长度上限：太长会白烧 token，UI 上也读不完 */
const MAX_QUOTE_CHARS = 1200;

/**
 * 解析后端地址。
 * 优先级：window.__CHAT_API_BASE__ > /chat.config.json 的 apiBase > 同源（走 vite 代理）。
 * @returns {Promise<string>}
 */
async function resolveApiBase() {
  const injected = /** @type {any} */ (window).__CHAT_API_BASE__;
  if (typeof injected === 'string') return injected.replace(/\/+$/, '');
  try {
    const res = await fetch(CHAT_CONFIG_URL, { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.apiBase === 'string') return cfg.apiBase.replace(/\/+$/, '');
    }
  } catch {
    // 配置文件不存在就退回同源
  }
  return '';
}

/** @param {string} str */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 极简 Markdown 渲染：先转义再补标签，避免 XSS。
 * 只支持聊天里真正常用的几种：代码块、行内代码、链接、加粗、换行。
 * @param {string} text
 */
function renderRich(text) {
  let html = escapeHtml(text);
  html = html.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, (_, code) => `<pre class="room-chat-code">${code.replace(/\n$/, '')}</pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = linkify(html);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/** 链接末尾粘上的标点（中文句号、顿号、右括号……）要剥掉，否则点开是 404 */
const TRAILING_PUNCT = /[。，、；：）】》)\]}.,;:]+$/;
/** 中文（含中文标点）在 URL 里只可能出现在站内文章路径上，见 cutHref 的说明 */
const FIRST_CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
/** 短于这个长度就不当链接（避免把残缺的 http:// 变成锚点） */
const LINK_MIN_LENGTH = 'https://'.length + 1;

/**
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
function anchor(href, label) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

/**
 * 从「URL + 后面可能粘着的话」里切出真正的链接，剩下的原样返回。
 *
 * 1) 站内文章地址一定以 `.html` 结尾 —— 切到最后一个 `.html` 为止，后面的中文正文留给文本；
 * 2) 其他链接没有 `.html`，那就遇到中文就停（真 URL 里不该有中文，后面的多半是模型继续写的话）；
 * 3) 最后再把 `。` `，` `)` 这类尾巴标点剥掉。
 * @param {string} raw
 * @returns {{ href: string, rest: string }}
 */
function cutHref(raw) {
  let href = raw.replace(TRAILING_PUNCT, '');
  const htmlAt = href.lastIndexOf('.html');
  if (htmlAt !== -1) {
    href = href.slice(0, htmlAt + '.html'.length);
  } else {
    const cjkAt = href.search(FIRST_CJK);
    if (cjkAt !== -1) href = href.slice(0, cjkAt);
  }
  return { href, rest: raw.slice(href.length) };
}

/**
 * 把 http(s) 链接变成「新窗口打开」的锚点（输入必须是 escapeHtml 之后的文本）：
 *   - `[标题](https://…)` → 锚文本用标题；
 *   - 裸链接 → 锚文本就是 URL 本身，粘在尾巴上的中文标点留在链接外面。
 * BFF 注入给模型的文章地址就是裸链接，所以这里是「点了能不能打开」的关键一步。
 * @param {string} html
 * @returns {string}
 */
export function linkify(html) {
  return html.replace(
    /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'`]+)/g,
    (match, mdText, mdHref, bare) => {
      const { href, rest } = cutHref(mdHref ?? bare ?? '');
      if (href.length < LINK_MIN_LENGTH) return match;
      return anchor(href, mdHref ? mdText : href) + rest;
    }
  );
}

/** 朗读前把 Markdown 记号去掉，避免读出「星号」「井号」 */
function toSpeechText(text) {
  return text
    .replace(/```[\s\S]*?```/g, '（代码片段）')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, '链接')
    .replace(/[*_#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 把文章页划词的选段拼成模型能看懂的引用块（含出处链接，模型才会去找站内相关文章）：
 *
 *   引用自《标题》(https://http200.cn/posts-html/xxx.html)：
 *   > 第一行
 *   > 第二行
 *
 * @param {{ text: string, title?: string, url?: string }} quote
 * @returns {string}
 */
function formatQuote(quote) {
  const head = quote.title ? `引用自《${quote.title}》` : '引用自本站文章';
  const body = quote.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${head}${quote.url ? `(${quote.url})` : ''}：\n${body}`;
}

export function initChatModal() {
  // 聊天窗骨架由 scripts/build-posts.js 生成：首页 index.html 和所有文章页 posts-html/**.html 都有。
  // 注意：改了模板必须重跑 npm run dev / npm run build，否则这里的节点会缺失。
  // 以前这种缺失是「静默 return」，表现就是点小人毫无反应、控制台也不报错，极难排查 —— 现在直接报错说清楚。
  const NODE_IDS = {
    modal: 'room-chat-modal',
    log: 'room-chat-log',
    form: 'room-chat-form',
    input: 'room-chat-input',
    sendBtn: 'room-chat-send',
    closeBtn: 'room-chat-close',
    micBtn: 'room-chat-mic',
    voiceBtn: 'room-chat-voice',
    hint: 'room-chat-hint',
  };
  /** @type {Record<string, HTMLElement>} */
  const nodes = {};
  const missing = [];
  for (const [key, id] of Object.entries(NODE_IDS)) {
    const el = document.getElementById(id);
    if (el) nodes[key] = el;
    else missing.push(`#${id}`);
  }
  if (missing.length > 0) {
    console.error(
      `[room-chat] 聊天窗节点缺失：${missing.join('、')}。` +
        '请确认 index.html 与 posts-html/**.html 都是 scripts/build-posts.js 生成的最新版本（重跑 npm run dev 或 npm run build），' +
        '并按 Ctrl/Cmd + Shift + R 强制刷新清掉旧缓存。'
    );
    return;
  }
  const { modal, log, form, input, sendBtn, closeBtn, micBtn, voiceBtn, hint } = nodes;
  const status = document.getElementById('room-chat-status');
  // 引用卡片是可选的：缓存里的旧 HTML 没有这个节点，缺了就降级（不报错、不影响普通聊天）
  const quoteCard = document.getElementById('room-chat-quote');
  const isPostPage = document.body?.dataset?.page === 'post';
  if (isPostPage) {
    const titleEl = document.getElementById('room-chat-title');
    if (titleEl) titleEl.textContent = '问问站点里的文章';
  }

  /** @type {string} */
  let apiBase = '';
  /** @type {{ role: 'user' | 'assistant', content: string }[]} */
  let history = [];
  let started = false;
  /** @type {AbortController | null} */
  let inflight = null;
  let speakReplies = false;
  /** @type {any} */
  let recognition = null;
  let listening = false;
  /**
   * 待发送的引用（文章页划词进来时设置），发送后清空。
   * @type {{ text: string, title?: string, url?: string } | null}
   */
  let pendingQuote = null;

  resolveApiBase().then((base) => {
    apiBase = base;
    // apiBase 为空 = 按同源请求 /api/chat。本地开发有 vite 代理没问题，
    // 但线上站点是纯静态（GitHub Pages），POST 会被静态服务器拒掉（405 Not Allowed）
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    if (!base && !isLocal) {
      console.warn(
        '[room-chat] public/chat.config.json 的 apiBase 是空的：线上会把聊天请求打到站点自己（静态服务器通常回 405 Not Allowed）。' +
          '请填 BFF 的 HTTPS 地址，例如 { "apiBase": "https://bff.http200.cn" }。'
      );
    }
  });

  // ---------- 消息渲染 ----------

  /**
   * @param {'user' | 'assistant' | 'system'} role
   * @returns {HTMLDivElement}
   */
  function addBubble(role) {
    const wrap = document.createElement('div');
    wrap.className = `room-chat-msg room-chat-msg--${role}`;
    // 不再给每条消息配头像：标题栏已经有头像了，再挨一个看起来就是重复的图标
    const bubble = document.createElement('div');
    bubble.className = 'room-chat-bubble';
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  /** @param {string} text */
  function addSystemNote(text) {
    const bubble = addBubble('system');
    bubble.textContent = text;
    return bubble;
  }

  function setBusy(busy) {
    sendBtn.classList.toggle('is-stop', busy);
    sendBtn.textContent = busy ? '停止' : '发送';
    input.disabled = false;
  }

  // ---------- 请求后端 ----------

  /**
   * @param {{ role: 'user' | 'assistant', content: string }[]} messages
   * @param {{ onDelta: (chunk: string) => void, onReasoning?: (chunk: string) => void }} handlers
   */
  async function streamReply(messages, handlers) {
    const controller = new AbortController();
    inflight = controller;

    const res = await fetch(`${apiBase}${CHAT_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => '');
      let detail = `HTTP ${res.status}`;
      try {
        const data = JSON.parse(raw);
        if (data && data.error) detail = String(data.error);
      } catch {
        // 不是 JSON：多半打到了静态站点（GitHub Pages / Nginx 静态目录对 POST 回 405）
        if (res.status === 405 || res.status === 404 || /<html/i.test(raw)) {
          detail = `HTTP ${res.status}：这个地址不是 BFF，像是静态站点`;
        }
      }
      throw new Error(detail);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawContent = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let json;
          try {
            json = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = json?.choices?.[0]?.delta;
          if (!delta) continue;
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
            handlers.onReasoning?.(delta.reasoning_content);
          }
          if (typeof delta.content === 'string' && delta.content) {
            sawContent = true;
            handlers.onDelta(delta.content);
          }
        }
      }
    }

    return sawContent;
  }

  // ---------- 一次问答 ----------

  /**
   * 一次问答。
   * @param {string} text 用户输入的问题；带引用时允许留空（用默认问题兜底）
   */
  async function ask(text) {
    const quote = pendingQuote;
    const question = (text || '').trim() || (quote ? DEFAULT_QUOTE_QUESTION : '');
    if (!question || inflight) return;

    // 气泡里把引用单独摆一行，方便回看「我问的是这一段」；发给模型的正文则额外带出处
    const userBubble = addBubble('user');
    if (quote) {
      const quoted = document.createElement('div');
      quoted.className = 'room-chat-msg-quote';
      quoted.textContent = quote.text;
      userBubble.appendChild(quoted);
    }
    userBubble.appendChild(document.createTextNode(question));
    const payload = quote ? `${formatQuote(quote)}\n\n${question}` : question;

    setQuote(null);
    input.value = '';
    autoGrow();
    stopListening();

    const bubble = addBubble('assistant');
    const thinking = document.createElement('span');
    thinking.className = 'room-chat-thinking';
    thinking.textContent = '思考中…';
    bubble.appendChild(thinking);

    const messages = [...history.slice(-MAX_HISTORY_TURNS * 2), { role: 'user', content: payload }];
    let answer = '';
    let reasonSeen = false;

    setBusy(true);
    if (status) status.textContent = 'TommyHu · 正在输入…';

    try {
      await streamReply(messages, {
        onReasoning: () => {
          reasonSeen = true;
          thinking.textContent = '思考中…';
        },
        onDelta: (chunk) => {
          if (!answer) bubble.textContent = '';
          answer += chunk;
          bubble.innerHTML = renderRich(answer);
          log.scrollTop = log.scrollHeight;
        },
      });

      if (answer) {
        bubble.innerHTML = renderRich(answer);
      } else {
        bubble.innerHTML = reasonSeen
          ? '<em>（这次没组织好语言，再问我一次试试？）</em>'
          : '<em>（没有收到回复）</em>';
      }

      history.push({ role: 'user', content: payload });
      history.push({ role: 'assistant', content: answer });
      history = history.slice(-MAX_HISTORY_TURNS * 2);
      if (answer && speakReplies) speak(answer);
    } catch (err) {
      if (/** @type {any} */ (err)?.name === 'AbortError') {
        bubble.innerHTML = renderRich(answer ? `${answer}\n（已停止）` : '（已停止）');
      } else {
        const message = err instanceof Error ? err.message : String(err);
        bubble.innerHTML = `<em>连接后端失败：${escapeHtml(message)}</em>`;
        addSystemNote(
          apiBase
            ? `请求地址：${apiBase}${CHAT_ENDPOINT_PATH}。请确认：BFF 已启动、前面有 HTTPS 反代、且 ALLOWED_ORIGINS 里含 ${window.location.origin}。`
            : '还没配置接口地址（public/chat.config.json 的 apiBase 为空），请求打到了站点自己。' +
              '线上请填 BFF 的 HTTPS 地址，例如 { "apiBase": "https://bff.http200.cn" }；本地开发留空即可（走 vite 代理）。'
        );
      }
    } finally {
      inflight = null;
      setBusy(false);
      if (status) status.textContent = 'TommyHu · 在线';
    }
  }

  // ---------- 语音朗读（系统接口 speechSynthesis）----------

  /** @param {string} text */
  function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const clean = toSpeechText(text);
    if (!clean) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = /[\u4e00-\u9fa5]/.test(clean) ? 'zh-CN' : 'en-US';
    const voices = synth.getVoices();
    const preferred = voices.find((v) => v.lang === utter.lang) || voices.find((v) => v.lang.startsWith('zh')) || null;
    if (preferred) utter.voice = preferred;
    utter.rate = 1.02;
    utter.pitch = 1;
    synth.speak(utter);
  }

  function setSpeakReplies(on) {
    speakReplies = on;
    voiceBtn.setAttribute('aria-pressed', String(on));
    voiceBtn.textContent = on ? '🔊' : '🔇';
    voiceBtn.title = on ? '关闭朗读' : '朗读回复';
    if (!on) window.speechSynthesis?.cancel();
  }

  // ---------- 语音输入（系统接口 SpeechRecognition）----------

  const SpeechRecognitionCtor =
    /** @type {any} */ (window).SpeechRecognition || /** @type {any} */ (window).webkitSpeechRecognition;

  function stopListening() {
    if (recognition && listening) {
      listening = false;
      try {
        recognition.stop();
      } catch {
        // 忽略重复 stop
      }
    }
    listening = false;
    micBtn.classList.remove('is-listening');
    micBtn.setAttribute('aria-pressed', 'false');
  }

  function startListening() {
    if (!SpeechRecognitionCtor) {
      input.placeholder = '当前浏览器不支持语音输入，直接用键盘输入吧';
      input.focus();
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    recognition = new SpeechRecognitionCtor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = '';

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add('is-listening');
      micBtn.setAttribute('aria-pressed', 'true');
      input.placeholder = '正在听你说话…说完再点一次麦克风即可发送';
    };

    recognition.onresult = (/** @type {any} */ event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      input.value = (finalText + interim).trim();
      autoGrow();
    };

    recognition.onerror = (/** @type {any} */ event) => {
      const map = {
        'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风',
        'service-not-allowed': '浏览器语音服务不可用（需要 HTTPS 环境）',
        'no-speech': '没有听到声音，再试一次',
        network: '语音识别服务连不上网络',
      };
      input.placeholder = map[event?.error] || '语音输入出错，改用键盘输入吧';
      stopListening();
    };

    recognition.onend = () => {
      const wasListening = listening;
      stopListening();
      input.placeholder = '输入问题，Enter 发送 · Shift+Enter 换行';
      // 说完自动提问，省掉「再点一次发送」（识别有误差时用户可以改，历史里也就多一条）
      if (wasListening && input.value.trim()) ask(input.value);
    };

    try {
      recognition.start();
    } catch {
      stopListening();
    }
  }

  // ---------- 交互 ----------

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  /**
   * 设置 / 清除输入区上方的引用卡片（文章页划词、或外部事件带 detail.quote 时调用）。
   * @param {{ text: string, title?: string, url?: string } | null} quote
   */
  function setQuote(quote) {
    pendingQuote = quote;
    if (!quoteCard) return;
    quoteCard.innerHTML = '';
    if (!quote) {
      quoteCard.hidden = true;
      input.placeholder = '输入问题，Enter 发送 · Shift+Enter 换行';
      return;
    }
    quoteCard.hidden = false;

    const label = document.createElement('span');
    label.className = 'room-chat-quote-label';
    label.textContent = quote.title ? `引用《${quote.title}》` : '引用选段';

    const body = document.createElement('span');
    body.className = 'room-chat-quote-text';
    body.textContent = quote.text;

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'room-chat-quote-close';
    clear.setAttribute('aria-label', '移除引用');
    clear.textContent = '×';
    clear.addEventListener('click', () => {
      setQuote(null);
      input.focus();
    });

    quoteCard.append(label, body, clear);
    input.placeholder = '针对这段内容想了解什么？留空直接回车，我来解释';
  }

  function setOpen(open) {
    modal.hidden = !open;
    modal.classList.toggle('is-open', open);
    document.body.classList.toggle('is-home-chat-open', open);
    if (open) {
      if (!started) {
        started = true;
        addBubble('assistant').innerHTML = renderRich(isPostPage ? GREETING_POST : GREETING);
      }
      requestAnimationFrame(() => input.focus());
    } else {
      inflight?.abort();
      stopListening();
      window.speechSynthesis?.cancel();
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (inflight) {
      inflight.abort();
      return;
    }
    ask(input.value);
  });

  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    // 中文输入法选字时的 Enter（isComposing / keyCode 229）不能当作发送
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (!inflight) ask(input.value);
  });

  micBtn.addEventListener('click', startListening);
  voiceBtn.addEventListener('click', () => setSpeakReplies(!speakReplies));
  closeBtn.addEventListener('click', () => setOpen(false));

  modal.addEventListener('click', (e) => {
    if (e.target === modal) setOpen(false);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) setOpen(false);
  });

  // 划词气泡（src/text-selection.js）、文章页右下角入口、3D 房间的小人都走这个事件。
  // 带 detail.quote 时先把选段挂成引用卡片，用户提问就自动带上出处。
  window.addEventListener('room:open-chat', (event) => {
    const { quote, sourceTitle, sourceUrl } = /** @type {any} */ (event).detail || {};
    setOpen(true);
    setQuote(
      quote
        ? { text: String(quote).slice(0, MAX_QUOTE_CHARS), title: sourceTitle || '', url: sourceUrl || '' }
        : null
    );
  });

  // 语音不可用时直接隐藏按钮，避免点了没反应
  if (!SpeechRecognitionCtor) {
    micBtn.hidden = true;
    hint.textContent = '当前浏览器不支持语音输入；可开启 🔊 朗读回复';
  }
  if (!('speechSynthesis' in window)) {
    voiceBtn.hidden = true;
  }
  setSpeakReplies(false);

  // 供 three-room.js 判断「聊天模块是否就绪」：没就绪时点气泡会给出可操作的提示
  /** @type {any} */ (window).__roomChatReady = true;
}

/**
 * 文章页右下角的常驻入口（不划词也能随手问一句）。
 * 首页 3D 房间不需要它：那边是点小人 / 头顶的「聊聊」气泡。
 */
export function initPageChatEntry() {
  if (document.body?.dataset?.page !== 'post') return;
  if (document.getElementById('post-chat-fab')) return;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'post-chat-fab';
  fab.className = 'post-chat-fab';
  fab.textContent = '💬 问 AI';
  fab.title = '基于全站文章问答，也可以先划词再问';
  fab.setAttribute('aria-label', '打开 AI 问答');
  fab.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('room:open-chat'));
  });
  document.body.appendChild(fab);
}
