const CACHE_NAME = 'dalbran-cache-v10';
const UPDATE_CACHE = 'dalbran-update-cache';
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

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache aberto com sucesso');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== UPDATE_CACHE) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  // 1. Só faz cache de requisições GET (ignora POST, PUT, DELETE do Firebase)
  if (event.request.method !== 'GET') return;

  // 2. Ignora requisições para APIs do Firebase ou extensões
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit') || url.includes('chrome-extension')) {
    return;
  }

  event.respondWith(
    // 3. Prioriza arquivos da atualização modular (escritos pelo update-checker)
    caches.open(UPDATE_CACHE)
      .then((updateCache) => updateCache.match(event.request))
      .then((updatedResponse) => {
        if (updatedResponse) {
          return updatedResponse;
        }
        // 4. Depois o cache principal (offline-first)
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // Não armazena o manifest de versão (é atualizado a cada build)
            if (url.includes('versao.json')) {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            return response;
          }).catch(() => {
            // Retorna fallback offline se necessário
          });
        });
      })
  );
});