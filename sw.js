/* Service worker: guarda o app inteiro para ele abrir offline.
   Estratégia: cache primeiro para os arquivos do app; a API do GitHub
   nunca passa por aqui (sempre rede). */

const VERSION = 'v1';
const CACHE = `minhas-tarefas-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/ui.js',
  './js/sheets.js',
  './js/store.js',
  './js/ink.js',
  './js/sync.js',
  './js/recurrence.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // api.github.com etc.

  event.respondWith(
    caches.match(request).then((cached) => {
      // Rede em paralelo para manter o cache fresco na próxima abertura.
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
