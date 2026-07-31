// 随遂 App — 离线缓存 Service Worker
// v2：网络优先拿最新 CSS/JS（避免「加装后看到的还是旧设计稿外壳」），离线时回退到缓存。
const CACHE = 'suisui-pwa-v4';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './storage.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // 升级时清掉所有旧缓存（v1 / 任何旧名）
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 跨域资源（字体等）：网络优先，失败回退到 index.html
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // 导航请求（HTML）：网络优先拉新版本，离线时回退缓存
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源（CSS/JS/图片）：网络优先拿最新版，失败回退到缓存
  // —— 这样改完 CSS/JS 部署后，已安装的 App 也能立即看到新版本，不会被旧 SW 缓存困住
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
