/*
 * Bourgeon — service worker : rend l'appli utilisable hors ligne.
 *
 * Les fichiers de l'appli sont gardés en cache. En ligne, on demande
 * toujours la dernière version au serveur (et on met le cache à jour) ;
 * le cache ne sert que hors connexion. Ainsi une mise à jour apparaît dès
 * l'ouverture suivante, sans mélange d'anciens et de nouveaux fichiers.
 * Les échanges avec Supabase (synchronisation) ne passent jamais par le cache.
 *
 * Après une mise à jour importante, augmenter VERSION pour vider l'ancien cache.
 */
var VERSION = 'bourgeon-v9';

var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'vendor/fonts/fonts.css', 'vendor/fonts/MarcellusSC-400-normal.woff2',
  'vendor/fonts/ChakraPetch-400-normal.woff2', 'vendor/fonts/ChakraPetch-500-normal.woff2',
  'vendor/fonts/ChakraPetch-600-normal.woff2', 'vendor/fonts/ChakraPetch-700-normal.woff2',
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
  // cache: 'reload' : ne pas reprendre une copie périmée du cache HTTP du navigateur
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    return cache.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }));
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
    // Réseau d'abord (en revalidant le cache HTTP), cache si hors ligne
    return fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(function () {
      return cache.match(key, { ignoreSearch: true }).then(function (cached) { return cached || Response.error(); });
    });
  }));
});
