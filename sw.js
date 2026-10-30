// Fabrik Program · service worker
// «Primero la copia» (web 20): la app se abre al instante desde el móvil, también sin conexión, y se
// actualiza por detrás. Cuando se publica una versión nueva (VERSION cambia), el nuevo service worker
// la descarga entera y la app se recarga sola una vez. La programación se pide siempre al servidor.
var VERSION = 'pa-v21';
var ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
// Firebase (otro dominio, versión fija): se guarda para que la app arranque también sin conexión
var EXTERNOS = ['https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(ARCHIVOS.map(function (u) { return new Request(u, { cache: 'reload' }); })).then(function () { return Promise.all(EXTERNOS.map(function (u) { return c.add(u).catch(function () {}); })); });
  }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method === 'GET' && EXTERNOS.indexOf(e.request.url) >= 0) {   // primero la copia: no cambia nunca
    e.respondWith(caches.open(VERSION).then(function (c) { return c.match(e.request).then(function (hit) { return hit || fetch(e.request).then(function (r) { if (r.ok) c.put(e.request, r.clone()); return r; }); }); }));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    var nav = e.request.mode === 'navigate';
    return c.match(nav ? 'index.html' : e.request, { ignoreSearch: nav }).then(function (hit) {
      // (una navegación no se puede clonar con opciones: se pide index.html directamente)
      var red = (nav ? fetch('index.html', { cache: 'no-cache' }) : fetch(new Request(e.request, { cache: 'no-cache' }))).then(function (r) {
        if (r.ok) c.put(nav ? 'index.html' : e.request, r.clone());
        return r;
      });
      if (hit) { e.waitUntil(red.catch(function () {})); return hit; }   // al instante; se actualiza por detrás
      return red.catch(function () { return c.match('index.html'); });
    });
  }));
});

// Notificaciones del coach (Firebase Cloud Messaging): se muestran aunque la app esté cerrada
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { notification: { body: e.data && e.data.text() } }; }
  var n = d.notification || (d.data && { title: d.data.title, body: d.data.body }) || {};
  var link = (d.fcmOptions && d.fcmOptions.link) || (d.webpush && d.webpush.fcm_options && d.webpush.fcm_options.link) || './';
  e.waitUntil(self.registration.showNotification(n.title || 'Fabrik Program', {
    body: n.body || '', icon: n.icon || 'icon-192.png', badge: 'icon-192.png', data: { link: link }, tag: 'fabrik-' + (n.title || '')
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var link = (e.notification.data && e.notification.data.link) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if ('focus' in cs[i]) return cs[i].focus();
    return self.clients.openWindow(link);
  }));
});
