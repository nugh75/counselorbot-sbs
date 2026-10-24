// Se la navigazione fallisce (PC del docente spento, tunnel senza origine → 502/530), mostra /offline.html.
const CACHE = 'offline-v1';
const FALLBACK = '/offline.html';
const ASSETS = [FALLBACK, '/offline.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request).then(
      (response) => (response.status >= 502 && response.status <= 504) || response.status === 530 ? offline(request) : response,
      () => offline(request),
    ),
  );
});

function offline(request) {
  return caches.match(FALLBACK).then(
    (page) => page || new Response('Il docente è offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
  );
}
