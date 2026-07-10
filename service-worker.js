const CACHE_NAME = 'profilscan-v1.5.7';
const ASSETS = [
  './',
  './index.html',
  './visual-compare.html',
  './pipeline-debug.html',
  './pipeline-compare.html',
  './manifest.json',
  './configs/validated-default.json',
  './src/app/ui.css',
  './src/app/app.js',
  './src/app/app-main.js',
  './src/app/auto-settings.js',
  './src/app/batch-benchmark.js',
  './src/app/benchmark-weight-presets.js',
  './src/app/camera.js',
  './src/app/config-manager.js',
  './src/app/image-import.js',
  './src/app/live-slider-preview.js',
  './src/app/observability-dashboard.js',
  './src/app/pipeline-preview.js',
  './src/app/preprocessing-live-settings.js',
  './src/app/render-results.js',
  './src/app/reset-app.js',
  './src/app/settings-reader.js',
  './src/app/signature-lab.js',
  './src/app/single-report-download.js',
  './src/app/svg-rasterizer.js',
  './src/app/visual-compare.js',
  './src/app/pipeline-debug.js',
  './src/app/pipeline-compare.js',
  './src/config/settings-package.js',
  './src/import/dataprofils-importer.js',
  './src/observability/algorithm-registry.js',
  './src/observability/algorithm-telemetry.js',
  './src/observability/algorithm-orchestrator.js',
  './src/observability/consistency-report.js',
  './src/observability/core-algorithm-runtime.js',
  './src/observability/descriptor-consistency.js',
  './src/observability/fingerprint-observer.js',
  './src/storage/indexed-db.js',
  './src/shape-engine/fingerprint-pipeline.js',
  './src/shape-engine/pipeline-settings.js',
  './src/shape-engine/signature-builder.js',
  './src/shape-engine/svg-path-sampler.js',
  './src/shape-engine/svg-raster-signature.js',
  './src/shape-engine/candidate-search.js',
  './src/shape-engine/advanced-matching.js',
  './src/shape-engine/score-fusion.js',
  './src/shape-engine/shape-normalizer.js',
  './src/shape-engine/hausdorff.js',
  './src/shape-engine/shape-context.js',
  './src/shape-engine/icp.js',
  './src/shape-engine/local-feature-signature.js',
  './src/shape-engine/minutiae-signature.js',
  './src/shape-engine/ransac.js',
  './src/shape-engine/zernike.js',
  './src/workers/import-worker.js',
  './src/workers/analysis-worker.js',
  './src/workers/canny-edge.js',
  './src/workers/connected-components.js',
  './src/workers/contour-tracer.js',
  './src/workers/dark-regions.js',
  './src/workers/image-preprocessing.js',
  './src/workers/morphology.js',
  './src/workers/robust-segmentation.js',
  './src/workers/section-candidates.js'
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
