const CACHE_NAME = 'profilscan-v1.1.3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/app/ui.css',
  './src/app/app.js',
  './src/app/camera.js',
  './src/app/image-import.js',
  './src/app/render-results.js',
  './src/import/dataprofils-importer.js',
  './src/storage/indexed-db.js',
  './src/shape-engine/signature-builder.js',
  './src/workers/import-worker.js',
  './src/workers/analysis-worker.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
