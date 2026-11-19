// Service worker: la app funciona offline para lo ya visitado; los datos siempre se piden frescos.
const VERSION = 'caballete-v6';
const BASE = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('supabase.co') && !u.pathname.includes('/storage/v1/object/public/')) return; // API: siempre red
  const esImagen = e.request.destination === 'image';
  if (esImagen) { // imágenes: caché primero
    e.respondWith(caches.open(VERSION + '-img').then(async (c) => { const r = await c.match(e.request); if (r) return r; const n = await fetch(e.request); if (n.ok) c.put(e.request, n.clone()); return n; }));
    return;
  }
  if (u.origin === location.origin) { // app: red primero, caché si no hay conexión
    e.respondWith(fetch(e.request).then((n) => { const cp = n.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); return n; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  }
});
