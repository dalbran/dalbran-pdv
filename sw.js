const CACHE_NAME = 'dalbran-cache-v11';
const UPDATE_CACHE = 'dalbran-update-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './API.html',
  './API.conf',
  './css/style.css',
  './css/api-admin.css',
  './js/firebase.js',
  './js/auth.js',
  './js/utils.js',
  './js/produtos.js',
  './js/clientes.js',
  './js/configuracoes.js',
  './js/orcamento.js',
  './js/whatsapp.js',
  './js/backup.js',
  './js/drive-backup.js',
  './js/update-checker.js',
  './js/api-admin.js',
  './catalogos/catalog-data.js',
  './js/catalogos.js',
  './js/app.js',
  './manifest.json'
];

// Normaliza URLs para casar com as chaves do cache:
//  - remove query string (ex.: ?v=123)
//  - trata a raiz "/" como "/index.html" (navegação do app em https://localhost/)
function normalizeUrl(url) {
  const u = new URL(url);
  u.search = '';
  const p = u.pathname;
  if (p === '' || p === '/') u.pathname = '/index.html';
  return u.href;
}

// Instalação resiliente: mesmo que um asset falhe, o Service Worker ativa.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => {
          const url = normalizeUrl(new URL(asset, self.location).href);
          return cache.add(new Request(url, { cache: 'no-store' }));
        })
      ).then((results) => {
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        console.log('dalbran SW: assets em cache ' + ok + '/' + results.length);
      })
    ).catch(() => {})
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos e assume o controle imediatamente.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== UPDATE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  // 1. Só faz cache de requisições GET (ignora POST, PUT, DELETE do Firebase)
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // 2. Ignora APIs do Firebase, extensões e o próprio Service Worker
  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit') || url.includes('chrome-extension')) {
    return;
  }

  const normalized = normalizeUrl(url);

  // sw.js nunca vem do cache (evita shadowing da atualização do SW)
  if (normalized.endsWith('/sw.js')) {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch (e) {
        const c = await caches.match(new Request(normalized));
        return c || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    // 3. Prioriza os arquivos da atualização modular (escritos pelo update-checker)
    const updateCache = await caches.open(UPDATE_CACHE);
    const updated = await updateCache.match(new Request(normalized));
    if (updated) return updated;

    // 4. Depois o cache principal (offline-first)
    const mainCache = await caches.open(CACHE_NAME);
    const cached = await mainCache.match(new Request(normalized));
    if (cached) return cached;

    // 5. Rede — e atualiza o cache principal
    try {
      const res = await fetch(event.request);
      if (res && res.status === 200 && res.type === 'basic' && !normalized.includes('versao.json')) {
        mainCache.put(new Request(normalized), res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      const fallback = await caches.match(event.request);
      return fallback || Response.error();
    }
  })());
});