/* Çevrimdışı çalışma: tüm uygulama dosyaları ve hareket görselleri önbelleğe alınır. */
const VERSION = 'efit-v2';
importScripts('js/data.js');
const CORE = ['./', 'index.html', 'css/styles.css', 'js/data.js', 'js/engine.js', 'js/app.js', 'manifest.webmanifest',
  'img/icon-192.png', 'img/icon-512.png', 'img/icon-512-maskable.png'];
const IMGS = [...new Set(Object.values(self.SH_DATA.EX).map((e) => e.img))].flatMap((i) => [`img/ex/${i}_0.jpg`, `img/ex/${i}_1.jpg`]);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.concat(IMGS))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Görseller: önce önbellek. Uygulama dosyaları: önce ağ (güncel sürüm), ulaşılamazsa önbellek.
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.url.includes('/img/')) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    withTimeout(fetch(req, { cache: 'no-store' }), 2500)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
