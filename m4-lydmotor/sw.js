// Lydmotor service worker. build.py writes ../sw.js from this file: VERSION is a content hash of the build,
// FILES the precache list (relative to the worker, so it works under /Fun-stuff/m4-lydmotor/ on GitHub Pages).
// index.html: network first (3 s), then cache. Icons and manifest: cache first. Other origins: never touched.
const VERSION = '0017700f3519', CACHE = 'lydmotor-' + VERSION, FILES = ["index.html", "manifest.webmanifest", "apple-touch-icon.png", "favicon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"], NET_MS = 3000;

self.addEventListener('install', (e) => {
  // no skipWaiting: a new version takes over on the next launch (or when the page asks for it)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('lydmotor-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.k === 'ver' && e.ports && e.ports[0]) e.ports[0].postMessage({ v: VERSION });
  else if (m.k === 'skip') self.skipWaiting();
});

async function page(e) {
  const net = fetch(e.request).then(async (r) => {
    if (r.ok && r.type === 'basic' && !r.redirected) { try { await (await caches.open(CACHE)).put('index.html', r.clone()); } catch (x) {} }
    return r;
  });
  e.waitUntil(net.catch(() => {}));
  const late = new Promise((res) => setTimeout(res, NET_MS)).then(() => caches.match('index.html'));
  try { const r = await Promise.race([net, late]); if (r) return r; } catch (x) {}
  return (await caches.match('index.html')) || net; // offline without cache: the network error
}

self.addEventListener('fetch', (e) => {
  const q = e.request, u = new URL(q.url), sc = new URL(self.registration.scope);
  if (q.method !== 'GET' || u.origin !== sc.origin || !u.pathname.startsWith(sc.pathname)) return; // e.g. OpenStreetMap: untouched
  const rel = u.pathname.slice(sc.pathname.length);
  if (q.mode === 'navigate' || rel === '' || rel === 'index.html') e.respondWith(page(e));
  else if (FILES.includes(rel)) e.respondWith(caches.match(rel).then((r) => r || fetch(q)));
});
