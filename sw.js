// ═══════════════════════════════════════════════════════════
//  Tribuna Libre — Service Worker v1.0
//  Estrategia: Cache-First para assets estáticos,
//              Network-First para noticias/RSS.
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'tribuna-libre-v1';

// Assets que se cachean en la instalación
const PRECACHE_ASSETS = [
  '/home/',
  '/home/index.html',
  '/home/manifest.json'
];

// ── Instalación: pre-cachear el shell ───────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Se hace best-effort: si falla alguno no rompe la instalación
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

// ── Activación: limpiar cachés viejos ──────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia por tipo de recurso ──────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar requests de Supabase, APIs externas ni rss2json
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('rss2json.com') ||
    url.hostname.includes('gnews.io') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    request.method !== 'GET'
  ) {
    return; // dejar pasar sin cache
  }

  // Para CDN (React, Babel, fonts): Cache-First
  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Para el shell de la app (index.html, manifest): Network-First con fallback
  if (
    url.pathname.startsWith('/home/') &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json'))
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Para imágenes de GitHub raw: Cache-First (logos, banners)
  if (url.hostname.includes('raw.githubusercontent.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }
});
