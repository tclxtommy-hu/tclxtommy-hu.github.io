#!/usr/bin/env node
/**
 * 微信 JS-SDK 签名服务（零依赖，Node.js >= 18）。
 *
 * 前端 src/main.js 的 initWeChatShare() 会请求
 *   GET /api/wx-config?url=<当前页面 URL>
 * 本服务返回 { appId, timestamp, nonceStr, signature }，前端用它调 wx.config()，
 * 从而自定义微信分享的标题 / 描述 / 缩略图。
 *
 * 运行：
 *   WX_APP_ID=wx1234567890 WX_APP_SECRET=xxxx PORT=8787 node server/wechat-signature.mjs
 *
 * 部署要点：
 * - AppSecret 只能放在服务端，绝不能进前端代码。
 * - 公众号后台「设置与开发 → 基本配置 → IP 白名单」必须包含本服务的出口 IP：
 *   get_access_token 接口受 IP 白名单限制，Cloudflare Workers / Vercel 等
 *   出口 IP 不固定的平台会报 40164 invalid ip 错误。建议部署在能固定出口
 *   IP 的环境（轻量服务器 / CVM / VPS），前面用 Caddy 或 Cloudflare 代理
 *   获得 HTTPS（页面是 https，endpoint 必须也是 https）。
 * - access_token / jsapi_ticket 有每日调用配额，这里用进程内缓存
 *   （微信有效期 7200s，提前 200s 过期）；多实例部署请换共享存储（如 Redis）。
 */

import crypto from 'node:crypto';
import http from 'node:http';

const APP_ID = process.env.WX_APP_ID || '';
const APP_SECRET = process.env.WX_APP_SECRET || '';
const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGIN = process.env.WX_ALLOWED_ORIGIN || 'https://http200.cn';
// WeChat tokens/tickets live 7200s; refresh 200s early to absorb clock skew
const TTL_MS = 7000 * 1000;

const cache = new Map(); // key -> { value, expiresAt }

/**
 * @param {string} key
 * @param {string} url
 * @returns {Promise<any>}
 */
async function cachedJson(key, url) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const res = await fetch(url);
  const data = await res.json();
  if (!data || data.errcode) {
    throw new Error(`WeChat API ${data && data.errcode}: ${data && data.errmsg}`);
  }
  cache.set(key, { value: data, expiresAt: Date.now() + TTL_MS });
  return data;
}

async function getJsapiTicket() {
  const tokenData = await cachedJson(
    'access_token',
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`
  );
  const ticketData = await cachedJson(
    'jsapi_ticket',
    `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${tokenData.access_token}&type=jsapi`
  );
  return ticketData.ticket;
}

/**
 * @param {string} ticket
 * @param {string} url
 */
function sign(ticket, url) {
  const nonceStr = crypto.randomBytes(8).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  // Fields MUST be sorted alphabetically: jsapi_ticket, noncestr, timestamp, url
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash('sha1').update(raw).digest('hex');
  return { appId: APP_ID, timestamp, nonceStr, signature };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const { pathname, searchParams } = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (req.method !== 'GET' || pathname !== '/api/wx-config') {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const url = searchParams.get('url') || '';
  if (!url.startsWith(`${ALLOWED_ORIGIN}/`) && url !== ALLOWED_ORIGIN) {
    // jsapi signatures are bound to the page URL; refuse to sign third-party pages
    res.statusCode = 400;
    res.end(JSON.stringify({ error: `url must be under ${ALLOWED_ORIGIN}` }));
    return;
  }

  try {
    const ticket = await getJsapiTicket();
    res.end(JSON.stringify(sign(ticket, url)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wechat-signature]', message);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: message }));
  }
});

if (!APP_ID || !APP_SECRET) {
  console.error('Missing WX_APP_ID / WX_APP_SECRET environment variables.');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`wechat-signature listening on :${PORT} (GET /api/wx-config?url=...)`);
});
