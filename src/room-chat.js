// 3D 房间「点击小人聊天」聊天窗口。
//
// 依赖后端 BFF（仓库 tclxtommy-hu.github.io.bff）的 POST /api/chat：
//   - API Key 只存在 BFF 里，浏览器拿不到；
//   - 请求体 { messages: [{ role, content }], stream: true }，返回 SSE 增量。
//
// 语音输入 / 朗读全部使用浏览器系统接口（Web Speech API），不引第三方 SDK：
//   - 语音输入：SpeechRecognition / webkitSpeechRecognition
//   - 语音朗读：speechSynthesis

import { copyText } from './text-selection.js';

const CHAT_CONFIG_URL = '/chat.config.json';
const CHAT_ENDPOINT_PATH = '/api/chat';
/** 携带多少轮历史（不含本次提问），太多会白烧 token */
const MAX_HISTORY_TURNS = 8;

const GREETING = '嗨，我是 TommyHu 👋 这个房间里的人就是我。想聊技术、聊项目，还是想问问我的经历？直接问我，也可以点麦克风用说的。';

/** 文章页的招呼语：那边的主线是「找文章 / 问文章里的内容」 */
const GREETING_POST = '嗨，我是 TommyHu 的 AI 分身 👋 全站文章我都读过，也能直接聊你正在看的这篇——问「这篇文章讲了什么」「总结一下」都行，也可以把正文里的段落划词丢给我。';

/** 归档 / 404 等没有「当前文章」的页面：只承诺全站问答，别提「这篇」 */
const GREETING_ARCHIVE = '嗨，我是 TommyHu 的 AI 分身 👋 全站文章我都读过——想找什么直接问我，也可以把正文里的段落划词丢给我。';

/** 输入框留空、但手上带着引用时用的默认问题，省掉「你倒是问一句啊」的空转 */
const DEFAULT_QUOTE_QUESTION = '这段内容是什么意思？结合我博客里的相关文章讲一下。';

/** 划词选段的长度上限：太长会白烧 token，UI 上也读不完 */
const MAX_QUOTE_CHARS = 1200;

/** BFF 单条消息上限（MAX_MESSAGE_CHARS 默认 4000），留点余量给上下文分隔块 */
const MAX_SEND_CHARS = 3600;
/** 当前文章最多塞多少字：够模型概括，又不至于每轮都烧一大截 token */
const ARTICLE_CONTEXT_CHARS = 2400;

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
  const { modal, log, form, closeBtn, micBtn, voiceBtn, hint } = nodes;
  // 「新对话」是后加的可选按钮：老缓存里的 HTML 没有它，缺了就少个功能，不至于整个聊天窗打不开
  const resetBtn = document.getElementById('room-chat-reset');
  // 节点表统一按 HTMLElement 存（循环里按 id 取），到这儿再收窄成具体类型：
  // 输入框要 value / placeholder，发送键要 disabled —— 都是 HTMLElement 上没有的
  /** @type {HTMLTextAreaElement} */
  const input = /** @type {any} */ (nodes.input);
  /** @type {HTMLButtonElement} */
  const sendBtn = /** @type {any} */ (nodes.sendBtn);
  const status = document.getElementById('room-chat-status');
  // 引用卡片是可选的：缓存里的旧 HTML 没有这个节点，缺了就降级（不报错、不影响普通聊天）
  const quoteCard = document.getElementById('room-chat-quote');
  // 首页 3D 房间是「和房间主人聊」，其余页面（文章页 / 归档页）主线都是「找文章、问文章」，
  // 招呼语和标题要跟着换 —— 否则归档页上会说「这个房间里的人就是我」，明显对不上。
  const isHomeChat = document.body?.dataset?.page === 'home-3d';
  const isPostPage = document.body?.dataset?.page === 'post';
  /** 招呼语按页面类型切换：文章页多承诺「当前这篇文章」，归档页没有当前文章 */
  const greetingText = isHomeChat ? GREETING : isPostPage ? GREETING_POST : GREETING_ARCHIVE;
  if (!isHomeChat) {
    const titleEl = document.getElementById('room-chat-title');
    if (titleEl) {
      // 文章页能带上当前正文，标题就说清楚；归档页没有「当前文章」可聊
      titleEl.textContent = isPostPage ? '聊聊这篇文章' : '问问站点里的文章';
    }
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

  /**
   * 文章页：把「当前文章」压成一段模型能读的上下文。
   * 只读一次并缓存；克隆一份再读，避免把标题右侧的「#」锚点带进去，也不动真实 DOM。
   * @type {{ title: string, url: string, text: string } | null | undefined}
   */
  let articleContext;

  /** @returns {{ title: string, url: string, text: string } | null} */
  function getArticleContext() {
    if (articleContext !== undefined) return articleContext;
    articleContext = null;
    if (document.body?.dataset?.page !== 'post') return articleContext;

    const content = document.querySelector('.post-content');
    if (!content) return articleContext;

    const title =
      document.querySelector('.post-header h1')?.textContent?.trim() ||
      document.title.replace(/\s*-\s*http200\.cn\s*$/, '');

    const clone = /** @type {HTMLElement} */ (content.cloneNode(true));
    clone.querySelectorAll('.heading-anchor, script, style').forEach((node) => node.remove());
    clone.setAttribute('aria-hidden', 'true');
    // 离屏但仍在布局里：innerText 需要布局才能正确分行
    clone.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px;';
    document.body.appendChild(clone);
    const text = (clone.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    clone.remove();

    if (!text) return articleContext;
    articleContext = { title, url: window.location.href, text: text.slice(0, ARTICLE_CONTEXT_CHARS) };
    return articleContext;
  }

  /**
   * 把当前文章附在这次提问后面：
   * - BFF 只接受 user/assistant（system 由服务端注入），所以只能拼进 user 消息；
   * - 问题放最前面，BFF 的检索仍按问题（前 200 字）走；
   * - 只影响本次请求，不写进 history，避免每轮重复塞几千字。
   * @param {string} content
   * @returns {string}
   */
  function withArticleContext(content) {
    const ctx = getArticleContext();
    if (!ctx) return content;

    // 「这篇文章讲的什么 / 总结一下」这类问题，别被 system 里「回复 60 字以内」压成一句话
    const wantsSummary = /(?:这|本|该)\s*(?:篇|个)?\s*文章|本文|讲了(?:什么|啥)|讲的是什么|总结|概括|主要内容|中心思想|说的什么/.test(content);
    const header =
      `\n\n---\n【当前文章】访客正在阅读《${ctx.title}》，链接：${ctx.url}\n` +
      '如果问题里说「这篇文章 / 本文 / 上面 / 这里」，指的就是这篇；与本文无关的问题照常回答，不要硬扯。\n' +
      (wantsSummary
        ? '访客想了解这篇文章：请用 3～6 句话概括主题、结构和关键结论（这条可以超过 60 字），不要逐段复述。\n'
        : '回答本文相关问题时用简洁中文概括，别大段复述原文。\n') +
      '【正文摘录（可能已截断）】\n';

    // BFF 单条消息上限 4000 字：问题太长时宁可不加文章，也不要触发 400
    const budget = MAX_SEND_CHARS - content.length - header.length;
    if (budget < 200) return content;
    return `${content}${header}${ctx.text.slice(0, budget)}`;
  }

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

  /**
   * 给一条 AI 回答挂「复制」按钮（回答里的命令/代码段可以直接复制走）。
   * @param {HTMLElement} bubble
   * @param {string} text 原始回答（不是渲染后的 HTML）
   */
  function addCopyButton(bubble, text) {
    if (!text || bubble.querySelector('.room-chat-copy')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'room-chat-copy';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制这条回答');
    btn.addEventListener('click', async () => {
      const ok = await copyText(text);
      btn.textContent = ok ? '已复制' : '复制失败';
      window.setTimeout(() => {
        btn.textContent = '复制';
      }, 1400);
    });
    bubble.appendChild(btn);
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
    // 文章页把当前文章附在最新一条 user 消息后面；history 里仍只存原始问题
    const outgoing = withArticleContext(payload);

    setQuote(null);
    input.value = '';
    autoGrow();
    stopListening();

    const bubble = addBubble('assistant');
    const thinking = document.createElement('span');
    thinking.className = 'room-chat-thinking';
    thinking.textContent = '思考中…';
    bubble.appendChild(thinking);

    /** @type {{ role: 'user' | 'assistant', content: string }[]} */
    const messages = [...history.slice(-MAX_HISTORY_TURNS * 2), { role: 'user', content: outgoing }];
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
        addCopyButton(bubble, answer);
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
        addCopyButton(bubble, answer);
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
        addBubble('assistant').innerHTML = renderRich(greetingText);
      }
      requestAnimationFrame(() => {
        // 面板刚显示出来：offsetWidth / offsetHeight 现在才是真值，
        // 「上次拖到的位置」要等这一刻才能算准（隐藏时算出来全是 0）
        syncPanelLayout();
        input.focus();
      });
    } else {
      inflight?.abort();
      stopListening();
      window.speechSynthesis?.cancel();
    }
  }

  // ---------- PC 端：右下角浮窗（可拖动、可缩放） ----------
  //
  // 手机端仍是「底部抽屉 + 蒙层」，桌面端（CSS 的同一条断点 min-width: 641px）
  // 面板是 position: fixed 的浮窗，这里管它的拖动（标题栏）、缩放（右下角把手）和记忆。
  //
  // 位置按「距视口右、下边各多少 px」存 localStorage，而不是存绝对 left/top：
  // 换台分辨率更高的显示器、或把窗口拉大，浮窗仍然贴着右下角，不会留在半空里。

  /** @type {HTMLElement | null} */
  const panel = /** @type {any} */ (modal.querySelector('.room-chat-panel'));
  /** @type {HTMLElement | null} */
  const header = /** @type {any} */ (modal.querySelector('.room-chat-header'));

  /** 和 CSS 里的 @media (min-width: 641px) 保持一致 */
  const DESKTOP_QUERY = '(min-width: 641px)';
  const desktopMedia = window.matchMedia(DESKTOP_QUERY);
  /** 浮窗离视口边缘至少留这么多，拖到贴边也还抓得住标题栏 */
  const PANEL_GAP = 12;
  /** 缩放下限：再窄输入框 + 发送按钮就挤成一团了 */
  const PANEL_MIN_WIDTH = 320;
  const PANEL_MIN_HEIGHT = 280;
  const PANEL_POS_KEY = 'room-chat-panel-pos';

  function isDesktopPanel() {
    return desktopMedia.matches;
  }

  /** 拖动中的指针状态：dx / dy 是「指针 - 面板左上角」的偏移，保证抓哪拖哪 */
  /** @type {{ pointerId: number, dx: number, dy: number } | null} */
  let drag = null;
  /**
   * 缩放中的指针状态：记下起始指针位置、框的四个边，以及这个角拖的是哪两条边。
   * @type {{
   *   pointerId: number,
   *   edgeX: 'left' | 'right',
   *   edgeY: 'top' | 'bottom',
   *   startX: number,
   *   startY: number,
   *   start: { left: number, top: number, right: number, bottom: number, width: number, height: number },
   * } | null}
   */
  let resize = null;
  /** 拖动后的坐标；null = 还在用 CSS 的右下角默认位置 */
  /** @type {{ left: number, top: number } | null} */
  let panelPos = null;
  /** 用户是否手动缩放过：没缩放过就别把「当前内容撑出来的高度」写死进存储 */
  let panelSized = false;

  /** @returns {{ right: number, bottom: number, width: number | null, height: number | null } | null} */
  function readPanelPos() {
    try {
      const raw = localStorage.getItem(PANEL_POS_KEY);
      if (!raw) return null;
      const pos = JSON.parse(raw);
      if (!pos || !Number.isFinite(pos.right) || !Number.isFinite(pos.bottom)) return null;
      // 尺寸是可选的：只拖过位置、没缩放过的那条记录里就没有 width/height
      const size = (v) => (Number.isFinite(v) ? v : null);
      return { right: pos.right, bottom: pos.bottom, width: size(pos.width), height: size(pos.height) };
    } catch {
      return null;
    }
  }

  function savePanelPos() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    /** @type {{ right: number, bottom: number, width?: number, height?: number }} */
    const record = {
      right: Math.max(0, Math.round(window.innerWidth - rect.right)),
      bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
    };
    // 只有手动缩放过才存尺寸：否则会把「当前内容刚好撑出来的高度」写死，
    // 下次对话变长也不会自己长高了
    if (panelSized) {
      record.width = Math.round(rect.width);
      record.height = Math.round(rect.height);
    }
    try {
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify(record));
    } catch {
      // 隐私模式 / 禁用存储：位置记不住就记不住，不影响聊天
    }
  }

  /**
   * 把浮窗摆到 (left, top)，超出一律夹回视口内 ——
   * 窗口缩小、或上次记下的位置在当前分辨率下放不进去，都靠这里兜住。
   * @param {number} left
   * @param {number} top
   */
  function movePanel(left, top) {
    if (!panel) return;
    const maxLeft = Math.max(PANEL_GAP, window.innerWidth - panel.offsetWidth - PANEL_GAP);
    const maxTop = Math.max(PANEL_GAP, window.innerHeight - panel.offsetHeight - PANEL_GAP);
    panelPos = {
      left: Math.min(Math.max(left, PANEL_GAP), maxLeft),
      top: Math.min(Math.max(top, PANEL_GAP), maxTop),
    };
    panel.style.left = `${panelPos.left}px`;
    panel.style.top = `${panelPos.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  /**
   * 一次性定下位置 + 尺寸（四个角的缩放、恢复上次尺寸都走这里）。
   * 尺寸先夹到 [最小尺寸, 视口 - 2×留白]，位置再按尺寸夹一次，保证整个面板都在视口里。
   * 必须显式写 height —— CSS 的 max-height 是给「内容自适应」用的，不写 height 就拖不高。
   * @param {number} left
   * @param {number} top
   * @param {number} width
   * @param {number} height
   */
  function placePanel(left, top, width, height) {
    if (!panel) return;
    const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_GAP * 2);
    const maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_GAP * 2);
    const w = Math.min(Math.max(Math.round(width), PANEL_MIN_WIDTH), maxWidth);
    const h = Math.min(Math.max(Math.round(height), PANEL_MIN_HEIGHT), maxHeight);
    const maxLeft = Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP);
    const maxTop = Math.max(PANEL_GAP, window.innerHeight - h - PANEL_GAP);
    panelPos = {
      left: Math.min(Math.max(Math.round(left), PANEL_GAP), maxLeft),
      top: Math.min(Math.max(Math.round(top), PANEL_GAP), maxTop),
    };
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    panel.style.maxHeight = 'none';
    panel.style.left = `${panelPos.left}px`;
    panel.style.top = `${panelPos.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    // 定过尺寸后消息区不再保底 180px，不然把窗口拖矮会把输入框挤出面板
    panel.classList.add('is-sized');
  }

  /** 交还给 CSS：手机端、或还没拖过 / 缩放过的时候都走右下角默认位置和默认尺寸 */
  function resetPanelPosition() {
    if (!panel) return;
    panelPos = null;
    panelSized = false;
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.width = '';
    panel.style.height = '';
    panel.style.maxHeight = '';
    panel.classList.remove('is-sized');
  }

  /** 按当前视口恢复上次拖到的位置和缩放过的尺寸；手机端一律回到默认（底部抽屉不吃这套） */
  function syncPanelLayout() {
    if (!panel) return;
    const desktop = isDesktopPanel();
    // 桌面端不是模态对话框（没有蒙层，页面照常可点），aria-modal 要跟着关掉
    panel.setAttribute('aria-modal', desktop ? 'false' : 'true');
    if (!desktop) {
      resetPanelPosition();
      return;
    }
    const saved = readPanelPos();
    if (!saved) {
      if (panelPos) resetPanelPosition();
      return;
    }
    // 缩放过就按「距右/下多少 + 尺寸」一次性还原，不用先定尺寸再量一遍
    if (saved.width !== null && saved.height !== null) {
      panelSized = true;
      placePanel(
        window.innerWidth - saved.right - saved.width,
        window.innerHeight - saved.bottom - saved.height,
        saved.width,
        saved.height
      );
      return;
    }
    movePanel(
      window.innerWidth - saved.right - panel.offsetWidth,
      window.innerHeight - saved.bottom - panel.offsetHeight
    );
  }

  /** @param {PointerEvent} event */
  function startDrag(event) {
    if (!panel || !header || !isDesktopPanel() || drag || event.button !== 0) return;
    // 标题栏右侧的朗读 / 关闭按钮不是把手
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;
    const rect = panel.getBoundingClientRect();
    drag = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    panel.classList.add('is-dragging');
    // 捕获指针：鼠标甩到窗口外面再松手也能收到 pointerup，不至于「粘」在手上
    try {
      header.setPointerCapture(event.pointerId);
    } catch {
      // 指针已失效就退化成普通拖拽（window 上的 pointermove/pointerup 照样收得到）
    }
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    movePanel(event.clientX - drag.dx, event.clientY - drag.dy);
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    panel?.classList.remove('is-dragging');
    savePanelPos();
  }

  /**
   * 按住某个角的把手开始缩放。edgeX / edgeY 记的是「这个角拖的是哪两条边」，
   * 拖动时对面那条边固定不动（拖左上角，右下角就钉在原地）。
   * @param {PointerEvent} event
   */
  function startResize(event) {
    if (!panel || !isDesktopPanel() || resize || drag || event.button !== 0) return;
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) return;
    const rect = panel.getBoundingClientRect();
    resize = {
      pointerId: event.pointerId,
      edgeX: handle.dataset.edgeX === 'left' ? 'left' : 'right',
      edgeY: handle.dataset.edgeY === 'top' ? 'top' : 'bottom',
      startX: event.clientX,
      startY: event.clientY,
      /** 手势开始时的框，缩放全程都基于它算，不会自己滚雪球 */
      start: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    };
    panel.classList.add('is-resizing');
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // 指针已失效：window 上的 pointermove/pointerup 照样收得到
    }
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  function onResizeMove(event) {
    if (!resize || event.pointerId !== resize.pointerId) return;
    const { start, edgeX, edgeY } = resize;
    const dx = event.clientX - resize.startX;
    const dy = event.clientY - resize.startY;
    const maxWidth = Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_GAP * 2);
    const maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_GAP * 2);
    const width = Math.min(Math.max(edgeX === 'right' ? start.width + dx : start.width - dx, PANEL_MIN_WIDTH), maxWidth);
    const height = Math.min(Math.max(edgeY === 'bottom' ? start.height + dy : start.height - dy, PANEL_MIN_HEIGHT), maxHeight);
    // 右边那条边不动 → 用它的位置反推 left；下边同理
    const left = edgeX === 'right' ? start.left : start.right - width;
    const top = edgeY === 'bottom' ? start.top : start.bottom - height;
    panelSized = true;
    placePanel(left, top, width, height);
  }

  function endResize() {
    if (!resize) return;
    resize = null;
    panel?.classList.remove('is-resizing');
    savePanelPos();
  }

  if (panel && header) {
    header.addEventListener('pointerdown', startDrag);

    // 四个角的缩放把手（PC 端才显示，见 CSS）。样式靠 transform 旋转复用同一套点阵。
    for (const [corner, edgeX, edgeY] of [
      ['br', 'right', 'bottom'],
      ['tr', 'right', 'top'],
      ['bl', 'left', 'bottom'],
      ['tl', 'left', 'top'],
    ]) {
      const handle = document.createElement('div');
      handle.className = `room-chat-resize room-chat-resize--${corner}`;
      handle.dataset.edgeX = edgeX;
      handle.dataset.edgeY = edgeY;
      handle.setAttribute('aria-hidden', 'true');
      handle.title = '拖动调整窗口大小';
      handle.addEventListener('pointerdown', startResize);
      panel.appendChild(handle);
    }

    // 监听挂在 window 上：面板再窄，鼠标拖出面板边界也不会断
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', () => {
      endDrag();
      endResize();
    });
    window.addEventListener('pointercancel', () => {
      endDrag();
      endResize();
    });
    window.addEventListener('blur', () => {
      endDrag();
      endResize();
    });
    desktopMedia.addEventListener?.('change', () => {
      if (!modal.hidden) syncPanelLayout();
    });
    window.addEventListener('resize', () => {
      if (modal.hidden) return;
      // 窗口变小了：先按新视口把尺寸夹一次（位置跟着一起夹），再处理没缩放过的情况
      if (panelSized && panel.offsetWidth) {
        const rect = panel.getBoundingClientRect();
        placePanel(rect.left, rect.top, rect.width, rect.height);
      }
      // 没缩放过的话位置只做「夹回视口」，不做右下角吸附：用户把它拖到哪就留在哪
      if (!panelPos) return;
      movePanel(panelPos.left, panelPos.top);
    });
    // 面板高度会随对话变长（标题栏 + 消息 + 引用卡片都会撑高）。
    // 拖过之后 top 是固定的，光让高度长就会顶出屏幕下沿 —— 高度一变就重新夹一次，
    // 效果就是「往下长到头了就开始往上顶」，跟 IM 的浮窗一样。
    if (typeof ResizeObserver === 'function') {
      const panelResizeObserver = new ResizeObserver(() => {
        // 拖动 / 缩放中的位置和尺寸由指针事件负责；没拖过就交给 CSS 的 bottom: 20px 定位
        if (drag || resize || !panelPos) return;
        // 收起时面板 display: none，量出来是 0×0 —— 拿这个尺寸去夹会把位置算歪
        if (!panel.offsetWidth) return;
        movePanel(panelPos.left, panelPos.top);
      });
      panelResizeObserver.observe(panel);
    }
    // 这一刻面板还是 hidden（offsetWidth 全是 0），只把语义对齐，位置留给 setOpen 里那一帧
    panel.setAttribute('aria-modal', isDesktopPanel() ? 'false' : 'true');
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

  // 新对话：清空上下文和消息区。聊偏了不用刷新页面。
  resetBtn?.addEventListener('click', () => {
    inflight?.abort();
    history = [];
    log.replaceChildren();
    addBubble('assistant').innerHTML = renderRich(greetingText);
    setQuote(null);
    setBusy(false);
    if (status) status.textContent = 'TommyHu · 在线';
    input.value = '';
    autoGrow();
    input.focus();
  });

  // 手机端是模态对话框：Tab 不该跑到面板底下的页面上。
  // 桌面端是右下角浮窗（不遮页面），就不拦了。
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || modal.hidden || isDesktopPanel()) return;
    const focusables = /** @type {HTMLElement[]} */ ([
      ...modal.querySelectorAll('button:not([hidden]), textarea, input, a[href]'),
    ]).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !modal.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });

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
 * 内容页（文章页、归档页）右下角的常驻入口：不划词也能随手问一句。
 * 首页 3D 房间不需要它 —— 那边是点小人 / 头顶的「聊聊」气泡。
 */
export function initPageChatEntry() {
  const page = document.body?.dataset?.page || '';
  // 只有首页走「点小人」那条路；其余页面（post / archive ……）一律挂个常驻入口，
  // 新页面只要带上 data-page 且不是 home-3d，就自动有入口（聊天窗骨架也得一起带上）
  if (page === 'home-3d') return;
  if (document.getElementById('post-chat-fab')) return;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'post-chat-fab';
  fab.className = 'post-chat-fab';
  fab.textContent = '💬 问 AI';
  // 划词入口只存在于有正文的页面（text-selection.js 要有 .post-content），别给归档页瞎承诺
  fab.title = document.querySelector('.post-content') ? '可以问当前这篇文章，也可以先划词再问' : '基于全站文章问答，试试问点什么';
  fab.setAttribute('aria-label', '打开 AI 问答');
  fab.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('room:open-chat'));
  });
  document.body.appendChild(fab);
}
