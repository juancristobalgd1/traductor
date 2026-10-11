// Service worker: guarda la app para usarla sin conexión y añade las cabeceras
// COOP/COEP para que el navegador permita usar varios hilos (más velocidad).
const VERSION = 'traductor-v32';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-v2.svg', './icons/icon-192-v2.png', './icons/icon-512-v2.png', './icons/maskable-192-v2.png', './icons/maskable-512-v2.png', './icons/apple-touch-icon-v2.png',
  './vendor/wllama/index.js', './vendor/jszip/jszip.min.js', './vendor/wllama/wllama.wasm', './listen.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function isolate(resp) {
  if (!resp || resp.status === 0) return resp;
  const h = new Headers(resp.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // el modelo se descarga directo de Hugging Face
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? './index.html' : req;
    // Librerías, fuentes e iconos no cambian entre versiones: uso lo guardado y abro al instante.
    if (/\/(vendor|fonts|icons)\/|\/icon-v2\.svg$/.test(url.pathname)) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return isolate(hit);
      const got = await fetch(req);
      if (got.ok) cache.put(req, got.clone());
      return isolate(got);
    }
    try {
      // Con mala conexión no espero más de 4 s: paso a lo guardado si lo tengo.
      const net = fetch(req, { cache: 'no-cache' });
      const saved = await cache.match(key, { ignoreSearch: true });
      const fresh = saved ? await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000))]) : await net;
      if (fresh.ok) cache.put(key, fresh.clone());
      return isolate(fresh);
    } catch {
      const cached = await cache.match(key, { ignoreSearch: true });
      return isolate(cached || Response.error());
    }
  })());
});
