// Offline support: caches the app's own files. Never touches your data, and leaves the
// food-database requests alone (they are never cached).
const CACHE = 'pocket-stats-v8';
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
  './js/i18n.js',
  './js/lang-en.js',
  './js/lang-ar.js',
  './js/icons.js',
  './js/coach.js',
  './js/exercises-ar.js',
  './js/recipes.js',
  './js/mealplan.js',
  './js/meals.js',
  './js/photoedit.js',
  './js/imaging.js',
  './js/cutout.js',
  './js/vendor/tf-backend-wasm.min.js',
  './js/vendor/tfjs-backend-wasm-simd.wasm',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-700-normal.woff2',
  './fonts/space-grotesk-latin-700-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2',
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
