// Service worker for the tablet compatibility test page only.
// It keeps the page itself available offline. Pack files are stored and read
// by the page directly, so this worker never answers for them.
'use strict';
var SHELL = 'li-test-shell-v1';
var FILES = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'bg.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); })
    .then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/pack/') !== -1 || url.pathname.indexOf('probe.txt') !== -1) return;
  // Network first so a corrected page is picked up; stored copy when offline.
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) {
      var copy = r.clone();
      caches.open(SHELL).then(function (c) { c.put(e.request, copy); });
    }
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) {
      return r || caches.match('index.html');
    });
  }));
});
