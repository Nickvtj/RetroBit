/**
 * Service worker do RetroBit: deixa o app instalável e funcionando offline.
 *
 * Estratégia "rede primeiro": com internet, busca sempre a versão nova (e
 * atualiza a cópia); sem internet, serve a última cópia guardada. Assim uma
 * atualização do site nunca fica presa numa versão velha em cache.
 */
const CACHE = 'retrobit-v2.0'; // subir junto com js/version.js

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'assets/favicon.svg',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/fonts/vt323-latin.woff2',
  'assets/fonts/vt323-latin-ext.woff2',
  'assets/fonts/covered-by-your-grace-latin.woff2',
  'assets/fonts/covered-by-your-grace-latin-ext.woff2',
  'assets/tools/pen.png',
  'assets/tools/fineliner.png',
  'assets/tools/pencil.png',
  'assets/tools/brush.png',
  'assets/tools/marker.png',
  'assets/tools/spray.png',
  'assets/tools/bucket.png',
  'assets/tools/eraser.png',
  'assets/tools/dynamite.png',
  'js/main.js',
  'js/state.js',
  'js/engine.js',
  'js/renderer.js',
  'js/wiggle.js',
  'js/mirror.js',
  'js/shapes.js',
  'js/tools.js',
  'js/history.js',
  'js/layers.js',
  'js/projects.js',
  'js/ui.js',
  'js/quick-menu.js',
  'js/palette.js',
  'js/icons.js',
  'js/viewport.js',
  'js/gif.js',
  'js/audio.js',
  'js/tool-art.js',
  'js/theme.js',
  'js/util.js',
  'js/fill.js',
  'js/hit.js',
  'js/paint-drag.js',
  'js/transform.js',
  'js/select.js',
  'js/reference.js',
  'js/fx.js',
  'js/i18n.js',
  'js/version.js',
  'js/tour.js',
  'js/rotate-hint.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))),
  );
});
