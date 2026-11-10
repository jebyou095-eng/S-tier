// Offline support: caches the app's own files. Never touches your data, and leaves the
// food-database requests alone (they are never cached).
const CACHE = 'pocket-stats-v6';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/stats.js',
  './js/charts.js',
  './js/ui.js',
  './js/food.js',
  './js/foods.js',
  './js/nutrition.js',
  './js/scanner.js',
  './js/fooddb.js',
  './js/recognize.js',
  './js/foodscan.js',
  './js/vendor/tf.min.js',
  './js/vendor/anthropic-sdk.min.js',
  './js/gym.js',
  './js/exercises.js',
  './js/body.js',
  './js/poses.js',
  './js/vendor/zxing.min.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
