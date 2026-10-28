// Fabrik Program · service worker
// «Primero red»: con conexión siempre se sirve la última versión publicada (y se guarda copia);
// sin conexión, la copia guardada. La programación siempre se pide al servidor (otro dominio, no pasa por aquí).
var VERSION = 'pa-v14';
var ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    // no-cache: revalida con GitHub Pages en vez de usar la caché HTTP (10 min)
    return fetch(new Request(e.request, { cache: 'no-cache' })).then(function (r) {
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }).catch(function () { return c.match(e.request).then(function (hit) { return hit || c.match('index.html'); }); });
  }));
});
