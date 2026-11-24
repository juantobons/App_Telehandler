// Service worker: la app abre sin señal (interior mina). Red primero; caché si no hay red. No guarda datos del maestro ni registros.
const V = 'telehandler-v12', ARCHIVOS = ['./', 'index.html', 'app/styles.css', 'app/app.js', 'app/i18n.js', 'app/maestro.js', 'app/pdf.js', 'app/logo.svg',
  'app/vendor/xlsx.full.min.js', 'app/vendor/jspdf.umd.min.js', 'app/vendor/jszip.min.js',
  'app/vendor/fonts/NotoSansSC-Regular-sub.ttf', 'app/vendor/fonts/NotoSansSC-Bold-sub.ttf',
  'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(ARCHIVOS).catch(() => {}))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(ca => ca.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
