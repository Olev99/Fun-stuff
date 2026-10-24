// Offline play and safe updates. tools/stamp.mjs writes VERSION here and the
// file list into precache.json. Every code URL carries ?v=<hash of its
// contents>, so a cached copy can never be the wrong one: cache first for
// those; the page itself (index.html) and version.json go network first, so
// an online player always gets the newest page, and a cached copy only fills
// in when the network fails. A new worker downloads in the background and
// waits; it takes over at the next launch or when the player taps "Update
// ready" on the title screen. Anything else (the PeerJS broker, WebRTC) is
// left alone. ?nosw (or Settings > Repair) removes the worker and the caches.
const VERSION = '653fabc';
const CACHE = `zoomies-${VERSION}`;
const SCOPE = self.registration.scope;
const HOME = `${SCOPE}index.html`;
const FRESH = /\/(index\.html|version\.json|precache\.json)$|\/$/;
const NOSW = /[?&]nosw(=|&|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const list = await (await fetch(`${SCOPE}precache.json`, { cache: 'reload' })).json();
    // A stale precache.json next to a newer sw.js: give up now and try again at the next check.
    if (!list || list.v !== VERSION || !Array.isArray(list.urls)) throw new Error('precache list does not match');
    const cache = await caches.open(CACHE);
    await Promise.all(list.urls.map(async (u) => {
      const url = new URL(u, SCOPE).href;
      const r = await fetch(url, { cache: 'reload' });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      await cache.put(url, r);
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('zoomies-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
  else if (e.data === 'ver' && e.ports[0]) e.ports[0].postMessage(VERSION);
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(SCOPE) || req.headers.has('range')) return;
  if (NOSW.test(req.url) || NOSW.test(req.referrer)) return;
  const page = req.mode === 'navigate';
  if (page || FRESH.test(url.pathname)) e.respondWith(networkFirst(req, page ? HOME : url.origin + url.pathname));
  else e.respondWith(cacheFirst(req));
});

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  let bad = null;
  try {
    const r = await Promise.race([
      fetch(req.url, { cache: 'no-store' }),
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000)),
    ]);
    if (r.ok) {
      cache.put(key, r.clone());
      return r;
    }
    bad = r;
  } catch (err) { /* offline or slow: use the copy */ }
  return (await cache.match(key)) || bad || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.type === 'basic') cache.put(req, r.clone());
  return r;
}
