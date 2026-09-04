const CACHE_NAME = 'dalbran-cache-v17';
const UPDATE_CACHE_PREFIX = 'dalbran-update-cache-v';
const CONTROL_CACHE = 'dalbran-update-state';

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
  './js/permissions.js',
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

// ---------------------------------------------------------------------------
// Controle de qual cache de atualização está ATIVO
// ---------------------------------------------------------------------------
let activeUpdateCache = null;   // nome do cache de atualização ativo (ex.: dalbran-update-cache-v100)
let keepUpdateCache = null;     // cache anterior mantido para rollback
let controlReadAt = 0;

async function readControl() {
  try {
    const cache = await caches.open(CONTROL_CACHE);
    const res = await cache.match('state');
    if (!res) return null;
    return await res.json();
  } catch (e) { return null; }
}

async function writeControl(state) {
  try {
    const cache = await caches.open(CONTROL_CACHE);
    await cache.put('state', new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (e) {}
}

async function refreshActive() {
  // Re-lê o estado de controle (memoiza por 2s para não custar em cada fetch)
  const now = Date.now();
  if (activeUpdateCache && now - controlReadAt < 2000) return;
  const state = await readControl();
  if (state) {
    activeUpdateCache = state.active || null;
    keepUpdateCache = state.previous || null;
  }
  controlReadAt = now;
}

async function pruneUpdateCaches(keep) {
  const keepSet = new Set(keep || []);
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => k.startsWith(UPDATE_CACHE_PREFIX) && !keepSet.has(k))
      .map((k) => caches.delete(k))
  );
}

// ---------------------------------------------------------------------------
// Instalação / ativação
// ---------------------------------------------------------------------------
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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await refreshActive();
      // Limpa caches obsoletos da instalação base (mantém os de atualização)
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== CONTROL_CACHE && !k.startsWith(UPDATE_CACHE_PREFIX))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------------
// Protocolo de ativação atômica (usado pelo js/update-checker.js)
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const msg = data.type || '';
  if (msg === 'SET_ACTIVE') {
    // Nova versão baixada e validada: aponta o cache ativo para ela.
    // Mantém o cache anterior (keepUpdateCache) até a confirmação, para rollback.
    const state = data.state || {};
    activeUpdateCache = state.active || null;
    keepUpdateCache = state.previous || null;
    controlReadAt = Date.now();
    writeControl({ active: activeUpdateCache, version: state.version || '', previous: keepUpdateCache });
    pruneUpdateCaches([activeUpdateCache, keepUpdateCache].filter(Boolean));
  } else if (msg === 'CONFIRM_ACTIVE') {
    // A nova versão já está em execução: pode apagar o cache anterior.
    activeUpdateCache = data.cacheName || null;
    keepUpdateCache = null;
    controlReadAt = Date.now();
    writeControl({ active: activeUpdateCache, version: data.version || '', previous: null });
    pruneUpdateCaches([activeUpdateCache].filter(Boolean));
  } else if (msg === 'REVERT_ACTIVE') {
    // Falha de ativação: volta ao cache anterior (ou à versão embutida).
    activeUpdateCache = data.cacheName || null;
    keepUpdateCache = null;
    controlReadAt = Date.now();
    writeControl({ active: activeUpdateCache, version: data.version || '', previous: null });
    pruneUpdateCaches([activeUpdateCache].filter(Boolean));
  } else if (msg === 'PRUNE') {
    pruneUpdateCaches([activeUpdateCache, keepUpdateCache].filter(Boolean));
  }
});

// ---------------------------------------------------------------------------
// Interceptação de requisições
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

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
    // 1. Cache de atualização ATIVO (versão modular aplicada)
    await refreshActive();
    if (activeUpdateCache) {
      const updateCache = await caches.open(activeUpdateCache);
      const updated = await updateCache.match(new Request(normalized));
      if (updated) return updated;
    }

    // 2. Cache principal (versão embutida no APK / offline-first)
    const mainCache = await caches.open(CACHE_NAME);
    const cached = await mainCache.match(new Request(normalized));
    if (cached) return cached;

    // 3. Rede — e atualiza o cache principal (apenas conteúdo básico mesmo-origem).
    // Quando há um cache de atualização ATIVO, o principal fica congelado na
    // versão embutida: ele é o alvo do rollback e não pode ser contaminado
    // com arquivos novos (evita página "mista" após reversão).
    try {
      const res = await fetch(event.request);
      if (res && res.status === 200 && res.type === 'basic' && !normalized.includes('versao.json') && !activeUpdateCache) {
        mainCache.put(new Request(normalized), res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      const fallback = await caches.match(event.request);
      return fallback || Response.error();
    }
  })());
});