// v4：/src/（vite dev 源码模块）与 chat.config.json 彻底不进 SW 缓存，
// 顺带让 activate 清掉旧缓存（v2/v3 里可能缓存着改动前的 /src/*.js）
const CACHE_NAME = 'http200-v4';
const PRECACHE = [
  '/',
  '/archive.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function canCacheRequest(request) {
  if (!request || request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.origin === self.location.origin;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache entries individually: a single 404 must not abort install
    // (previously a missing /src/main.js broke install, so caching never worked)
    await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Content-addressed static assets: safe to serve from cache first.
// mp3 excluded to avoid filling mobile storage (8MB of background music).
function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    /\.(?:png|jpe?g|webp|gif|svg|ico|css|js|json|woff2?|txt|xml)$/i.test(pathname)
  );
}

// 完全不进 SW 缓存的路径（连离线兜底都不要）：
//   /src/            —— vite dev 直接给的源码模块，被缓存过就会出现「页面在跑旧代码」
//   chat.config.json —— 换后端地址后必须立刻生效，不能被旧值顶掉
function isNoCachePath(pathname) {
  return pathname.startsWith('/src/') || pathname === '/chat.config.json';
}

self.addEventListener('fetch', (e) => {
  if (!canCacheRequest(e.request)) return;

  const url = new URL(e.request.url);

  // 不插手：交给浏览器直接走网络
  if (isNoCachePath(url.pathname)) return;

  if (isStaticAsset(url.pathname)) {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) {
        // Stale-while-revalidate: refresh in the background for next visit
        fetch(e.request)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(e.request);
        if (res && res.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(e.request, res.clone());
        }
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  // HTML navigations: network-first so content stays fresh, cache as offline fallback
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/')))
  );
});
