const PROXY_PATH = '/p?url=';
const OWN_PATHS = ['/sw-proxy.js', '/browse.html', '/api/', '/videos.html', '/games.html', '/plinko'];

let baseUrls = {};

self.addEventListener('message', (e) => {
  if (e.data?.type === 'set-base' && e.data.clientId && e.data.baseUrl) {
    baseUrls[e.data.clientId] = e.data.baseUrl;
  }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const urlObj = new URL(url);

  if (urlObj.pathname.startsWith('/p') && urlObj.searchParams.has('url')) return;

  for (const p of OWN_PATHS) {
    if (urlObj.pathname.startsWith(p) || urlObj.pathname === '/') return;
  }

  if (urlObj.origin === self.location.origin) {
    const clientId = event.clientId || event.resultingClientId;
    const base = baseUrls[clientId];
    if (base) {
      try {
        const resolved = new URL(urlObj.pathname + urlObj.search + urlObj.hash, base).href;
        event.respondWith(fetch(PROXY_PATH + encodeURIComponent(resolved)));
        return;
      } catch {}
    }
    return;
  }

  event.respondWith(fetch(self.location.origin + PROXY_PATH + encodeURIComponent(url)));
});
