/*
 * Bourgeon — service worker : rend l'appli utilisable hors ligne.
 *
 * Les fichiers de l'appli sont gardés en cache. À chaque ouverture, la
 * version en cache s'affiche tout de suite et une version fraîche est
 * téléchargée en arrière-plan (elle servira à l'ouverture suivante).
 * Les échanges avec Supabase (synchronisation) ne passent jamais par le cache.
 *
 * Après une mise à jour importante, augmenter VERSION pour vider l'ancien cache.
 */
var VERSION = 'bourgeon-v5';

var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'vendor/fonts/fonts.css', 'vendor/fonts/Cinzel-500-normal.woff2', 'vendor/fonts/Cinzel-600-normal.woff2',
  'vendor/fonts/Cinzel-700-normal.woff2', 'vendor/fonts/CinzelDecorative-700-normal.woff2',
  'vendor/fonts/Spectral-400-normal.woff2', 'vendor/fonts/Spectral-400-italic.woff2', 'vendor/fonts/Spectral-500-normal.woff2',
  'vendor/fonts/Spectral-500-italic.woff2', 'vendor/fonts/Spectral-600-normal.woff2',
  'vendor/phosphor/regular/style.css', 'vendor/phosphor/regular/Phosphor.woff2',
  'vendor/phosphor/fill/style.css', 'vendor/phosphor/fill/Phosphor-Fill.woff2',
  'vendor/phosphor/bold/style.css', 'vendor/phosphor/bold/Phosphor-Bold.woff2',
  'vendor/supabase/supabase.js',
  'js/config.js', 'js/core/dates.js', 'js/core/validate.js', 'js/core/store.js', 'js/core/ui.js',
  'js/core/backup.js', 'js/core/sync.js',
  'js/modules/journal.js', 'js/modules/goals.js', 'js/modules/habits-logic.js', 'js/modules/habits.js',
  'js/modules/revisions-logic.js', 'js/modules/revisions.js', 'js/modules/focus-logic.js', 'js/modules/focus.js',
  'js/modules/eisenhower-logic.js', 'js/modules/eisenhower.js', 'js/modules/sport-logic.js', 'js/modules/sport.js',
  'js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;   // Supabase : réseau direct

  var key = req.mode === 'navigate' ? 'index.html' : req;
  event.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(key, { ignoreSearch: true }).then(function (cached) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(function () { return cached; });
      return cached || fresh;
    });
  }));
});
