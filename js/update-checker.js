/**
 * Módulo de Atualização Automática do Aplicativo (arquitetura v2)
 *
 * DUAS versões independentes:
 *  - WEB/MODULAR  (webVersion/webCode): controla tudo que pode ser atualizado
 *    sem novo APK (HTML, CSS, JS, telas, módulos, imagens, configurações remotas).
 *  - NATIVA/APK   (nativeVersion/nativeCode): muda APENAS quando há alteração
 *    real no container Android (plugin novo, código nativo, permissão,
 *    Manifest, assinatura, libs). O APK é tratado como contingência — nunca
 *    como solução padrão para mudanças web.
 *
 * ATUALIZAÇÃO MODULAR (fluxo atômico com confirmação e rollback):
 *  1. Busca o manifest remoto (versao.json).
 *  2. Compara webCode com o instalado e calcula os arquivos alterados (hash).
 *  3. Baixa TODOS os arquivos alterados e valida o SHA-256 de cada um.
 *  4. Só depois de 100% validado, grava num cache de atualização VERSIONADO
 *     (dalbran-update-cache-v<code>).
 *  5. Ativa atomicamente via Service Worker (cache de controle), mantendo o
 *     cache anterior para rollback.
 *  6. Registra a versão local e reinicia a WebView.
 *  7. Na próxima abertura CONFIRMA a versão em execução (window.__WEB_CODE__).
 *     - Confirmou => limpa caches antigos e conclui.
 *     - Não confirmou => reverte ao cache anterior/versão embutida e diagnostica.
 *
 * Uma atualização SÓ é considerada concluída quando a nova versão está de
 * fato em execução — nunca apenas porque o download terminou.
 *
 * INSTALAÇÃO NATIVA (APK) — somente quando necessário:
 *  - Verifica a autorização de instalar pacotes (fontes desconhecidas).
 *  - Detecta o dispositivo (Samsung, Xiaomi, Motorola, Google, etc.) e
 *    abre a tela de configurações mais relevante via intent nativo.
 *  - Ao voltar do Android para o app, re-verifica a autorização e continua
 *    automaticamente a instalação.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------------
  const UPDATE_CACHE_PREFIX = 'dalbran-update-cache-v';
  const CONTROL_CACHE = 'dalbran-update-state';
  const LS_KEY = 'dalbran:update:state';
  const DIAG_KEY = 'dalbran:update:diag';
  const MAX_APPLY_ATTEMPTS = 2;

  // Versão NATIVA instalada — MANTER em sincronia com android/app/build.gradle
  const APP_VERSION = {
    name: '0.0.19',
    code: 19
  };
  window.__APP_VERSION__ = APP_VERSION.name;
  window.__APP_CODE__ = APP_VERSION.code;

  let config = {
    manifestUrl: 'https://dalbran.github.io/dalbran-pdv/versao.json',
    apkUrl: 'https://github.com/dalbran/dalbran-pdv/releases/download/v{VERSION}/Dalbran-v{VERSION}.apk',
    channel: 'stable',
    checkOnStart: true,
    checkWeb: true,
    checkApk: true,
    intervalMinutes: 0
  };

  let state = {
    webVersion: '',          // versão web instalada (persistida após confirmação)
    webCode: 0,              // code web instalado
    webFiles: {},            // hashes instalados
    prevWebVersion: '',
    prevWebCode: 0,
    prevWebFiles: {},
    prevCacheName: '',
    pendingConfirmation: false, // aguardando confirmar que a nova versão subiu
    applyAttempts: 0,
    webUpdateBlocked: false,    // ativação falhou repetidamente: parar de insistir
    apkCode: 0,
    dismissedVersion: '',
    dismissedApk: 0,        // code do APK opcional dispensado (banner não volta)
    lastCheck: 0,
    lastResult: '',
    lastManifestVersion: ''
  };

  let pendingManifest = null;
  let pendingChanged = [];
  let pendingNativeInstall = null; // { filePath, apk, url } aguardando permissão
  let modalOpen = false;
  let mandatoryUpdate = false;
  let resumingInstall = false;

  // ---------------------------------------------------------------
  // Persistência
  // ---------------------------------------------------------------
  function loadState() {
    try { state = { ...state, ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; } catch (e) {}
    // Migração de estados antigos (pré-1.0.0): o sistema antigo gravava
    // webVersion/webFiles SEM webCode. Sem registro de ativação modular
    // confirmada (webCode=0), esse estado não é confiável — zera para
    // restabelecer a linha de base a partir da versão realmente EMBUTIDA
    // no APK em execução (a comparação por hash volta a funcionar).
    if (!state.webCode && (state.webVersion || Object.keys(state.webFiles).length)) {
      state.webVersion = '';
      state.webFiles = {};
      state.apkCode = 0;
      state.dismissedVersion = '';
      state.dismissedApk = 0;
      state.pendingConfirmation = false;
      state.applyAttempts = 0;
      state.webUpdateBlocked = false;
      state.prevWebCode = 0;
      state.prevWebVersion = '';
      state.prevWebFiles = {};
      state.prevCacheName = '';
      diag('Estado antigo de atualização migrado (sem webCode) — linha de base restabelecida.', 'info');
    }
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Diagnóstico (log detalhado + log visual + bug report)
  // ---------------------------------------------------------------
  function diag(line, type) {
    const entry = {
      t: new Date().toISOString(),
      type: type || 'info',
      msg: line
    };
    try {
      const arr = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
      arr.push(entry);
      if (arr.length > 200) arr.splice(0, arr.length - 200);
      localStorage.setItem(DIAG_KEY, JSON.stringify(arr));
    } catch (e) {}
    emitProgress(line, type);
    console.log('[update] ' + line);
  }

  function getDiagnostics() {
    try { return JSON.parse(localStorage.getItem(DIAG_KEY) || '[]'); } catch (e) { return []; }
  }

  // ---------------------------------------------------------------
  // Configuração (Firestore settings/company + defaults)
  // ---------------------------------------------------------------
  async function loadConfigFromFirestore() {
    if (typeof db === 'undefined') return;
    try {
      const doc = await db.collection('settings').doc('company').get();
      if (doc.exists) {
        const d = doc.data() || {};
        config = {
          ...config,
          manifestUrl: d.updateManifestUrl || config.manifestUrl,
          apkUrl: d.updateApkUrl || config.apkUrl,
          channel: d.updateChannel || config.channel,
          checkOnStart: d.updateCheckOnStart !== false,
          checkWeb: d.updateCheckWeb !== false,
          checkApk: d.updateCheckApk !== false,
          intervalMinutes: parseInt(d.updateIntervalMinutes, 10) || config.intervalMinutes
        };
      }
    } catch (e) { /* sem rede ainda */ }
  }

  // ---------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function contentType(path) {
    if (path.endsWith('.js')) return 'application/javascript';
    if (path.endsWith('.css')) return 'text/css';
    if (path.endsWith('.html')) return 'text/html';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
  }

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.search = '';
      const p = u.pathname;
      if (p === '' || p === '/') u.pathname = '/index.html';
      return u.href;
    } catch (e) { return url; }
  }

  function notify(message, type) {
    if (typeof showToast === 'function') showToast(message, type);
  }

  function emitProgress(msg, type) {
    try {
      document.dispatchEvent(new CustomEvent('app:update-progress', {
        detail: { msg: msg, type: type || 'info', time: Date.now() }
      }));
    } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------
  // Versões
  // ---------------------------------------------------------------
  // Code da versão web REALMENTE em execução (injetado no index.html pelo build)
  function runningWebCode() {
    return parseInt(window.__WEB_CODE__ || 0, 10) || 0;
  }
  function runningWebVersion() {
    return window.__WEB_VERSION__ || '';
  }
  // Code web base da instalação (bundle atual)
  function installedBaseWebCode() {
    return runningWebCode() || APP_VERSION.code;
  }

  // ---------------------------------------------------------------
  // Service Worker — registro/ativação/controle
  // ---------------------------------------------------------------
  async function ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      diag('Service Worker indisponível neste navegador.', 'info');
      return;
    }
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('./sw.js');
        diag('Service Worker registrado.', 'info');
      }
      const controlled = !!navigator.serviceWorker.controller;
      diag('Service Worker: ' + (controlled ? 'ativo' : 'inativo (primeira carga)'), 'info');
      if (!controlled && !sessionStorage.getItem('dlb:sw:reload')) {
        // Ativa o SW na página atual: recarrega UMA vez por sessão para que
        // a WebView passe a ser controlada e sirva os arquivos atualizados.
        sessionStorage.setItem('dlb:sw:reload', '1');
        try { await navigator.serviceWorker.ready; } catch (e) {}
        if (!navigator.serviceWorker.controller) {
          diag('Ativando Service Worker — recarregando uma única vez...', 'info');
          window.location.reload();
          return false;
        }
      }
    } catch (e) {
      diag('Falha ao ativar o Service Worker: ' + e.message, 'error');
    }
    return true;
  }

  async function postToSW(message) {
    // Broadcast para todos os workers conhecidos (ativo + espera + instalação +
    // controlador): garante que o worker que serve os fetches receba o estado,
    // mesmo durante transições de atualização do próprio SW.
    let sent = false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const targets = [];
      if (reg) {
        if (reg.active) targets.push(reg.active);
        if (reg.waiting && !targets.includes(reg.waiting)) targets.push(reg.waiting);
        if (reg.installing && !targets.includes(reg.installing)) targets.push(reg.installing);
      }
      const ctrl = navigator.serviceWorker.controller;
      if (ctrl && !targets.includes(ctrl)) targets.push(ctrl);
      targets.forEach(target => {
        try { if (target && target.postMessage) { target.postMessage(message); sent = true; } } catch (e) {}
      });
      return sent;
    } catch (e) { return false; }
  }

  // Cache de controle: qual cache de atualização está ativo
  async function readControl() {
    try {
      const cache = await caches.open(CONTROL_CACHE);
      const res = await cache.match('state');
      return res ? res.json() : null;
    } catch (e) { return null; }
  }

  async function writeControl(stateObj) {
    try {
      const cache = await caches.open(CONTROL_CACHE);
      await cache.put('state', new Response(JSON.stringify(stateObj), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (e) {}
  }

  async function currentActiveCacheName() {
    const c = await readControl();
    return (c && c.active) || null;
  }

  // ---------------------------------------------------------------
  // Confirmação da versão em execução + rollback
  // ---------------------------------------------------------------
  async function confirmActiveWeb() {
    const running = runningWebCode();
    const installed = parseInt(state.webCode || 0, 10) || 0;
    const wasPending = !!state.pendingConfirmation;

    if (installed > 0 && running === installed) {
      // A nova versão ESTÁ em execução: atualização concluída de verdade.
      if (wasPending) {
        diag('CONFIRMAÇÃO: versão ' + state.webVersion + ' em execução. Limpando caches antigos.', 'success');
        await postToSW({
          type: 'CONFIRM_ACTIVE',
          cacheName: UPDATE_CACHE_PREFIX + installed,
          version: state.webVersion
        });
        state.pendingConfirmation = false;
        state.applyAttempts = 0;
        state.webUpdateBlocked = false;
        state.prevWebCode = 0;
        state.prevWebVersion = '';
        state.prevWebFiles = {};
        state.prevCacheName = '';
        state.lastResult = 'RUNNING ' + state.webVersion;
        saveState();
        diag('Running version: ' + state.webVersion + ' (confirmada)', 'success');
        sessionStorage.removeItem('dlb:update:retry-reload');
        sessionStorage.removeItem('dlb:update:rollback-reload');
      }
      return { ok: true };
    }

    if (installed > 0 && running !== installed) {
      // A versão instalada não subiu: falha de ATIVAÇÃO.
      diag('UPDATE FAILED', 'error');
      diag('Stage: ACTIVATION', 'error');
      diag('Running code: ' + (running || '?') + ' | Instalado: ' + installed, 'error');

      if (wasPending && state.applyAttempts <= MAX_APPLY_ATTEMPTS && !sessionStorage.getItem('dlb:update:retry-reload')) {
        // Pode ser a corrida do SW na 1ª carga fria: tenta UMA recarga com o
        // SW já controlando a página antes de considerar a ativação falha.
        sessionStorage.setItem('dlb:update:retry-reload', '1');
        diag('Recarregando uma vez para ativar os arquivos baixados...', 'info');
        window.location.reload();
        return { ok: false, stage: 'ACTIVATION_RETRY', reloading: true };
      }

      // Rollback: volta ao cache anterior (ou à versão embutida).
      const useCache = state.prevCacheName || null;
      const useVersion = String(state.prevWebCode || 0);
      await postToSW({ type: 'REVERT_ACTIVE', cacheName: useCache, version: useVersion });
      diag('Rollback: ' + (useCache ? ('restaurando ' + useCache) : 'versão embutida no APK'), 'info');

      const hadPrev = state.prevWebCode > 0;
      state.webCode = state.prevWebCode || 0;
      state.webVersion = state.prevWebVersion || '';
      state.webFiles = state.prevWebFiles || {};
      state.prevWebCode = 0;
      state.prevWebVersion = '';
      state.prevWebFiles = {};
      state.prevCacheName = '';
      state.pendingConfirmation = false;
      state.applyAttempts = (state.applyAttempts || 0) + 1;

      if (state.applyAttempts > MAX_APPLY_ATTEMPTS) {
        state.webUpdateBlocked = true;
        state.lastResult = 'WEB_UPDATE_BLOCKED';
        diag('Ativação falhou ' + state.applyAttempts + ' vezes. Atualização modular bloqueada (diagnóstico abaixo).', 'error');
        showDiagnosticsInModal();
      } else {
        state.lastResult = 'ROLLED_BACK_TO_' + (hadPrev ? ('V' + state.webCode) : 'BUNDLED');
      }
      saveState();

      if (state.webUpdateBlocked) {
        // Não reinicia em loop: permanece na versão funcional e mostra diagnóstico.
        return { ok: false, stage: 'ACTIVATION', blocked: true };
      }
      if (!sessionStorage.getItem('dlb:update:rollback-reload')) {
        sessionStorage.setItem('dlb:update:rollback-reload', '1');
        window.location.reload();
        return { ok: false, stage: 'ROLLBACK', reloading: true };
      }
      return { ok: false, stage: 'ACTIVATION' };
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------
  // Verificação principal
  // ---------------------------------------------------------------
  async function checkNow(opts) {
    opts = opts || {};
    const startedAt = Date.now();
    diag('--- UPDATE START ---');
    diag('Current Web Version: ' + (runningWebVersion() || ('bundled code ' + installedBaseWebCode())));
    emitProgress('Verificando atualizações...', 'info');
    try {
      if (!config.manifestUrl) {
        state.lastResult = 'Sem URL de manifest configurada.';
        saveState();
        diag('Sem URL de manifest configurada.', 'error');
        if (!opts.silent) notify('Sem URL de verificação de atualização configurada.', 'info');
        return { updated: false, hasUpdate: false, reason: 'no-manifest-url' };
      }

      emitProgress('Buscando manifest: ' + config.manifestUrl, 'info');
      const sep = config.manifestUrl.includes('?') ? '&' : '?';
      const manifest = await fetchJson(config.manifestUrl + sep + 't=' + Date.now());
      state.lastManifestVersion = manifest.webVersion || manifest.version || '';
      diag('Manifest: web ' + (manifest.webVersion || '?') + ' (code ' + (manifest.webCode || '?') + ') | nativo ' + (manifest.nativeVersion || '?') + ' (code ' + (manifest.nativeCode || '?') + ')', 'success');

      // --- Mudanças web (modular) ---
      const manifestWebCode = parseInt(manifest.webCode || manifest.code || 0, 10) || 0;
      const installedCode = parseInt(state.webCode || 0, 10) || installedBaseWebCode();
      let changed = [];
      if (config.checkWeb && Array.isArray(manifest.web) && manifest.webVersion && manifestWebCode > installedCode) {
        if (state.webUpdateBlocked && !opts.force) {
          diag('Atualização modular bloqueada por falhas anteriores (use "Verificar novamente" para tentar de novo).', 'info');
        } else {
          changed = manifest.web.filter(f =>
            f.path !== 'versao.json' && f.path !== 'sw.js' && state.webFiles[f.path] !== f.sha256
          );
        }
      }
      const webChanged = changed.length > 0;

      // --- Novo APK ---
      const apk = manifest.apk || null;
      const apkRequired = !!(config.checkApk && apk && apk.required && apk.code > APP_VERSION.code);
      const apkOptional = !!(config.checkApk && apk && !apk.required && apk.code > APP_VERSION.code && apk.code > state.apkCode);
      const apkUrl = (apk && (apk.url || config.apkUrl) || '').replace('{VERSION}', (apk && apk.name) || '');
      const apkFallbackUrl = (apk && (apk.fallbackUrl || '').replace('{VERSION}', (apk && apk.name) || '')) || '';
      const hasUpdate = webChanged || apkRequired;

      const dismissed = state.dismissedVersion === (manifest.webVersion || manifest.version);

      if (hasUpdate) {
        pendingManifest = manifest;
        pendingChanged = changed;
        if (apkRequired) state.apkCode = apk.code;
        if (webChanged) diag('Arquivos web alterados: ' + changed.length + '.', 'info');
        if (apkRequired) diag('Atualização NATIVA obrigatória: ' + (apk.reason || 'mudança no container Android') + ' (v' + apk.name + ').', 'info');

        if (opts.showModal !== false) {
          if (!dismissed || opts.force) {
            if (dismissed && opts.force) state.dismissedVersion = '';
            showUpdateModal({ manifest, changed, webChanged, apkRequired, apkOptional, apkUrl, apkFallbackUrl });
          } else {
            diag('Atualização ' + manifest.webVersion + ' já avisada anteriormente (dispensada) — ignorando.', 'info');
          }
        } else if (apkRequired) {
          showApkUpdate(apk, apkUrl, apkFallbackUrl);
        }
      } else {
        // Tudo em dia (ou web bloqueada sem força)
        state.webVersion = manifest.webVersion || state.webVersion;
        state.apkCode = 0;
        pendingManifest = null;
        pendingChanged = [];
        saveState();
        hideApkUpdate();
        if (config.checkWeb) {
          if (webChanged) diag('Web desatualizada mas bloqueada; mantendo versão funcional.', 'info');
          else diag('Web já na versão ' + (manifest.webVersion || '') + ' (nenhuma alteração).', 'info');
        }
        if (config.checkApk && apk) {
          if (apk.code > APP_VERSION.code) {
            diag('Novo APK v' + apk.name + ' disponível (opcional — instale em Configurações se necessário).', 'info');
            if (apkOptional && apk.code > state.dismissedApk) showApkUpdate(apk, apkUrl, apkFallbackUrl);
          }
          else { state.dismissedApk = apk.code; diag('APK atualizado (instalado ' + APP_VERSION.name + ' = publicado ' + apk.name + ').', 'info'); }
        }
      }

      state.lastCheck = Date.now();
      state.lastResult = hasUpdate ? 'UPDATE_AVAILABLE' : 'OK';
      saveState();
      diag('Verificação concluída em ' + ((Date.now() - startedAt) / 1000).toFixed(2) + 's.', 'success');
      if (!opts.silent) notify(hasUpdate && !dismissed ? 'Atualização disponível!' : 'Verificação de atualizações concluída.', 'info');
      return {
        updated: false,
        webChanged,
        apkRequired,
        hasUpdate,
        apkCode: apk ? apk.code : 0
      };
    } catch (e) {
      state.lastResult = e.message;
      saveState();
      diag('ERRO: ' + e.message, 'error');
      if (!opts.silent) notify('Falha ao verificar atualizações: ' + e.message, 'error');
      return { updated: false, hasUpdate: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------
  // Aplicar atualização MODULAR (atômico)
  // ---------------------------------------------------------------
  async function applyWebUpdate(manifest, changed) {
    const newCode = parseInt(manifest.webCode || 0, 10) || 0;
    const newVersion = manifest.webVersion || '';
    const cacheName = UPDATE_CACHE_PREFIX + newCode;
    diag('Aplicando atualização modular para ' + newVersion + ' (code ' + newCode + ')...', 'info');
    setModalStage('download', 'Baixando ' + changed.length + ' arquivo(s)...');
    setModalProgress(2, 'Baixando atualização...');

    // 1. Baixa TODOS os arquivos e valida a integridade ANTES de tocar em cache.
    const manifestBase = new URL(config.manifestUrl);
    const staged = [];
    const total = changed.length || 1;
    for (let i = 0; i < changed.length; i++) {
      const f = changed[i];
      try {
        const res = await fetch(new URL(f.path, manifestBase).href, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = await res.arrayBuffer();
        const hash = await sha256Hex(buf);
        if (f.sha256 && hash !== f.sha256) throw new Error('checksum mismatch');
        staged.push({ path: f.path, buffer: buf });
      } catch (e) {
        diag('DOWNLOAD FAILED', 'error');
        diag('Arquivo: ' + f.path, 'error');
        diag('Motivo: ' + e.message, 'error');
        setModalStatus('Falha ao baixar ' + f.path + '. Nenhum arquivo foi alterado.', 'error');
        return { ok: false, stage: 'DOWNLOAD' };
      }
      const pct = Math.round(((i + 1) / total) * 100);
      setModalProgress(pct, 'Baixando e validando... ' + pct + '%');
    }

    diag('Download: ' + staged.length + '/' + total + ' validado (SHA-256 OK).', 'success');
    if (staged.length === 0) {
      diag('Nenhum arquivo válido baixado. Abortando sem alterar nada.', 'error');
      setModalStatus('Nenhum arquivo pôde ser baixado/validado.', 'error');
      return { ok: false, stage: 'DOWNLOAD' };
    }

    if (!('caches' in window)) {
      diag('CacheStorage indisponível — atualização modular impossível neste ambiente.', 'error');
      return { ok: false, stage: 'ACTIVATION' };
    }

    // 2. Grava a nova versão num cache VERSIONADO (ainda NÃO ativo).
    setModalStage('activate', 'Ativando nova versão...');
    try {
      await caches.delete(cacheName);
      const cache = await caches.open(cacheName);
      for (const f of staged) {
        const body = new Response(f.buffer, { headers: { 'Content-Type': contentType(f.path) } });
        const localUrl = normalizeUrl(new URL(f.path, window.location.origin).href);
        await cache.put(new Request(localUrl, { cache: 'no-store' }), body.clone());
      }
    } catch (e) {
      diag('Falha ao gravar o cache de atualização: ' + e.message, 'error');
      try { await caches.delete(cacheName); } catch (e2) {}
      setModalStatus('Falha ao ativar a nova versão. Nada foi alterado.', 'error');
      return { ok: false, stage: 'ACTIVATION' };
    }

    // 3. Ativa atomicamente: aponta o SW para o novo cache (mantendo o anterior).
    const prevCache = await currentActiveCacheName();
    const control = { active: cacheName, version: newVersion, previous: prevCache };
    await writeControl(control);
    await postToSW({ type: 'SET_ACTIVE', state: control });
    diag('Ativação: cache ' + cacheName + ' (anterior: ' + (prevCache || 'embutido') + ').', 'success');

    // 3b. VERIFICAÇÃO PRÉ-COMMIT: confirma que o SW passa a servir a nova
    // versão ANTES de registrar o estado e reiniciar. Sem isso, um SW que não
    // controla a página gera loop infinito (aplica → reverte → oferece de novo).
    // Repete até 3 vezes (o worker pode estar com leitura memoizada por até 2s).
    setModalStage('activate', 'Verificando ativação...');
    let probeCode = 0;
    let probeErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 900));
        await postToSW({ type: 'SET_ACTIVE', state: control });
      } else {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      try {
        const probeRes = await fetch(new URL('index.html', window.location.origin).href, { cache: 'no-store' });
        if (!probeRes.ok) throw new Error('HTTP ' + probeRes.status);
        const probeText = await probeRes.text();
        const probeMatch = probeText.match(/window\.__WEB_CODE__\s*=\s*(\d+)/);
        probeCode = probeMatch ? Number(probeMatch[1]) : 0;
        if (probeCode === newCode) break;
        probeErr = 'SW serviu code ' + (probeCode || 'desconhecido') + ', esperado ' + newCode;
      } catch (e) {
        probeCode = 0;
        probeErr = (e.message || 'erro');
      }
    }
    if (probeCode !== newCode) {
      const semControle = !(navigator.serviceWorker && navigator.serviceWorker.controller);
      const detalhe = probeErr + (semControle ? ' (página sem controle do Service Worker)' : '');
      diag('ATIVAÇÃO FALHOU NA VERIFICAÇÃO: ' + detalhe, 'error');
      diag('Revertendo o controle e descartando o cache ' + cacheName + '. Nada foi alterado.', 'error');
      try {
        await writeControl({ active: prevCache || null, version: '', previous: null });
        await postToSW({ type: 'REVERT_ACTIVE', cacheName: prevCache || null, version: '' });
        await caches.delete(cacheName);
      } catch (e2) {}
      setModalStatus('Falha ao ativar a versão ' + newVersion + ' (' + detalhe + '). Nada foi alterado — tente "Verificar novamente" ou reinstale o APK.', 'error');
      return { ok: false, stage: 'ACTIVATION_VERIFY' };
    }
    diag('Verificação: SW servindo a versão ' + newVersion + ' (code ' + newCode + ').', 'success');

    // 4. Registra a versão local.
    state.prevWebCode = parseInt(state.webCode || 0, 10) || installedBaseWebCode();
    state.prevWebVersion = state.webVersion || runningWebVersion() || '';
    state.prevWebFiles = state.webFiles || {};
    state.prevCacheName = prevCache || '';
    state.webCode = newCode;
    state.webVersion = newVersion;
    state.webFiles = {};
    manifest.web.forEach(f => { state.webFiles[f.path] = f.sha256; });
    state.dismissedVersion = '';
    state.pendingConfirmation = true;
    state.applyAttempts = (state.applyAttempts || 0) + 1;
    state.webUpdateBlocked = false;
    pendingManifest = null;
    pendingChanged = [];
    saveState();

    // 5. Reinicia a WebView para carregar a nova versão.
    diag('WebView reload: reiniciando o app para carregar a nova versão...', 'success');
    setModalStage('restart', 'Reiniciando o app...');
    setModalProgress(100, 'Aplicado! Reiniciando...');
    restartApp();
    return { ok: true };
  }

  function restartApp() {
    const doRestart = function () {
      try {
        const Restart = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Restart;
        if (Restart && Restart.restartApp) { Restart.restartApp(); return; }
      } catch (e) {}
      try {
        const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (App && App.exitApp) { App.exitApp(); return; }
      } catch (e) {}
      try { window.location.reload(); } catch (e) {}
    };
    // Reinicia DENTRO da WebView primeiro (a navegação passa pelo SW ativo e
    // carrega a nova versão sem matar o app). Se a página não descarregar, o
    // fallback nativo assume após o timeout.
    try { setTimeout(doRestart, 4000); } catch (e) {}
    try { window.location.reload(); } catch (e2) { doRestart(); }
  }

  // ---------------------------------------------------------------
  // APK nativo (somente quando necessário)
  // ---------------------------------------------------------------
  async function downloadApkToCache(url, apk) {
    const Inst = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ApkInstaller;
    if (!Inst || !Inst.downloadApk) {
      return { error: 'Plugin de instalação não disponível.' };
    }
    const fileName = 'Dalbran-v' + (apk.name || '') + '.apk';
    const onProgress = (ev) => {
      const pct = (ev && ev.percent != null) ? ev.percent : 0;
      setModalProgress(pct, 'Baixando APK ' + (apk.name || '') + '... ' + pct + '%');
      diag('Baixando APK: ' + pct + '%', 'info');
    };
    let listener;
    try { listener = Inst.addListener('progress', onProgress); } catch (e) {}
    try {
      let res;
      try {
        res = await Inst.downloadApk({ url, fileName });
      } catch (d1) {
        diag('Falha no download principal (' + (d1.message || 'erro') + ').', 'info');
        if (window.AppUpdater && window.AppUpdater.config && window.AppUpdater.config.apkUrl) {
          const fb = window.AppUpdater.config.apkUrl.replace('{VERSION}', apk.name || '');
          res = await Inst.downloadApk({ url: fb, fileName });
        } else {
          throw d1;
        }
      }
      return { filePath: res.filePath, size: res.size };
    } catch (err) {
      return { error: err.message || 'erro' };
    } finally {
      try { if (listener && listener.remove) listener.remove(); } catch (e) {}
    }
  }

  async function installDownloadedApk(filePath, apk) {
    const Inst = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ApkInstaller;
    if (Inst && Inst.installApk) {
      const ins = await Inst.installApk({ filePath });
      if (ins && ins.needsPermission) {
        return { needsPermission: true, message: ins.message };
      }
      return { installed: true };
    }
    // Fallback web: abre o link de download do APK
    window.open((apk && (apk.url || '').replace('{VERSION}', apk.name || '')) || '', '_blank');
    return { installed: true, web: true };
  }

  async function checkInstallPermission() {
    try {
      const PM = window.PermissionManager;
      if (!PM) return { granted: true };
      const granted = await PM.canInstallApks();
      const device = await PM.getDeviceInfo();
      return { granted, device };
    } catch (e) {
      return { granted: true };
    }
  }

  // Inicia o fluxo de instalação nativa. Se faltar autorização, explica,
  // abre as configurações e aguarda o retorno ao app para continuar.
  async function installApkInternal(url, apk, fallbackUrl) {
    setModalStatus('Baixando e instalando APK v' + (apk.name || '') + '...', 'info');
    diag('Instalação nativa iniciada: v' + (apk.name || ''), 'info');

    const dl = await downloadApkToCache(url, apk);
    if (dl.error) {
      diag('Falha no download do APK: ' + dl.error, 'error');
      setModalStatus('Falha ao baixar o APK: ' + dl.error, 'error');
      return false;
    }
    diag('APK baixado (' + (dl.size ? Math.round(dl.size / 1048576) : '?') + ' MB).', 'success');

    const perm = await checkInstallPermission();
    if (!perm.granted) {
      // Explica + abre configurações + aguarda retorno ao app
      pendingNativeInstall = { filePath: dl.filePath, apk, url };
      diag('Instalação bloqueada pelo Android (fontes desconhecidas). Abrindo configurações...', 'error');
      showInstallPermissionModal(perm.device, apk, dl.filePath);
      await openDeviceSettings(perm.device);
      return false;
    }

    return await finishNativeInstall(dl.filePath, apk, url);
  }

  async function finishNativeInstall(filePath, apk, url) {
    try {
      const ins = await installDownloadedApk(filePath, apk);
      if (ins && ins.needsPermission) {
        pendingNativeInstall = { filePath, apk, url };
        diag('Permissão de instalação ainda necessária.', 'error');
        showInstallPermissionModal(null, apk, filePath);
        await openDeviceSettings(null);
        return false;
      }
      state.apkCode = apk.code;
      saveState();
      pendingNativeInstall = null;
      diag('Instalação do APK iniciada pelo sistema Android.', 'success');
      setModalStatus('Instalação iniciada pelo sistema.', 'success');
      hideUpdateModal();
      return true;
    } catch (err) {
      diag('ERRO na instalação do APK: ' + (err.message || 'erro'), 'error');
      setModalStatus('Falha ao instalar o APK: ' + (err.message || 'erro'), 'error');
      return false;
    }
  }

  async function openDeviceSettings(device) {
    const PM = window.PermissionManager;
    if (!PM) return;
    try {
      const r = await PM.openInstallationSettings('install');
      diag('Abertura de configurações: ' + (r.opened ? 'ok' : (r.unsupported ? 'não suportado' : 'falhou')), r.opened ? 'success' : 'error');
    } catch (e) {
      diag('Falha ao abrir configurações: ' + e.message, 'error');
    }
  }

  // Chamado quando o app volta ao primeiro plano
  async function onAppResumed() {
    try {
      if (pendingNativeInstall) {
        const perm = await checkInstallPermission();
        if (perm.granted) {
          diag('Permissão concedida ao voltar ao app. Continuando a instalação...', 'success');
          const item = pendingNativeInstall;
          pendingNativeInstall = null;
          await finishNativeInstall(item.filePath, item.apk, item.url);
        } else {
          diag('Permissão de instalação ainda NÃO concedida.', 'error');
          showInstallPermissionModal(perm.device, pendingNativeInstall.apk, pendingNativeInstall.filePath, true);
        }
        return;
      }
      if (state.pendingConfirmation && !resumingInstall) {
        resumingInstall = true;
        try { await confirmActiveWeb(); } catch (e) {}
        resumingInstall = false;
      }
    } catch (e) {}
  }

  function setupResumeWatcher() {
    try {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      let wasActive = true;
      if (App && App.addListener) {
        App.addListener('appStateChange', (info) => {
          const isActive = !!(info && info.isActive);
          if (isActive && !wasActive) onAppResumed();
          wasActive = isActive;
        });
      }
    } catch (e) {}
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onAppResumed();
    });
    window.addEventListener('focus', () => onAppResumed());
  }

  // ---------------------------------------------------------------
  // Modal de atualização
  // ---------------------------------------------------------------
  function showUpdateModal(info) {
    if (modalOpen) return;
    modalOpen = true;

    mandatoryUpdate = !!(info && info.manifest && info.manifest.force === true);

    let el = document.getElementById('update-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'update-modal';
      el.className = 'update-modal hidden';
      el.innerHTML = `
        <div class="update-modal-overlay" id="update-modal-overlay"></div>
        <div class="update-modal-card" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
          <button type="button" class="update-modal-close" id="update-modal-close" aria-label="Fechar"><i class="ph ph-x" aria-hidden="true"></i></button>
          <div class="update-modal-icon"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i></div>
          <h3 id="update-modal-title">Atualização disponível</h3>
          <p id="update-modal-sub">Uma nova versão do aplicativo está disponível.</p>
          <div class="update-type-badge" id="update-type-badge"></div>
          <div class="update-version-box">
            <div class="update-version-col">
              <span class="uv-label">Instalada</span>
              <span class="uv-value uv-current" id="uv-current"></span>
            </div>
            <div class="update-version-arrow"><i class="ph ph-arrow-right" aria-hidden="true"></i></div>
            <div class="update-version-col update-version-new-col">
              <span class="uv-label">Disponível</span>
              <span class="uv-value uv-new" id="uv-new"></span>
            </div>
          </div>
          <div class="update-version-select" id="update-version-select"></div>
          <div class="update-reason-box hidden" id="update-reason-box"></div>
          <div class="update-device-box hidden" id="update-device-box"></div>
          <div class="update-modal-bar hidden" id="update-modal-bar">
            <div class="update-modal-bar-track"><div class="update-modal-bar-fill" id="update-modal-bar-fill"></div></div>
          </div>
          <div class="update-modal-stage hidden" id="update-modal-stage"></div>
          <div class="update-modal-actions" id="update-modal-actions">
            <button type="button" class="btn btn-outline" id="update-modal-later">Agora não</button>
            <button type="button" class="btn btn-primary" id="update-modal-now"><i class="ph ph-download-simple" aria-hidden="true"></i> Atualizar agora</button>
          </div>
          <div class="update-modal-status hidden" id="update-modal-status"></div>
        </div>
      `;
      document.body.appendChild(el);
      document.getElementById('update-modal-close').addEventListener('click', dismissUpdateModal);
      document.getElementById('update-modal-overlay').addEventListener('click', dismissUpdateModal);
      document.getElementById('update-modal-later').addEventListener('click', dismissUpdateModal);
      document.getElementById('update-modal-now').addEventListener('click', onUpdateNow);
    }

    const m = info.manifest || {};
    document.getElementById('uv-current').textContent = APP_VERSION.name;
    document.getElementById('uv-new').textContent = (m.webVersion || m.version || '');
    const sub = document.getElementById('update-modal-sub');
    if (sub) {
      sub.textContent = mandatoryUpdate
        ? 'Esta é uma atualização obrigatória — você precisa atualizar para continuar usando o aplicativo.'
        : 'Uma nova versão do aplicativo está disponível.';
      sub.className = 'update-modal-sub' + (mandatoryUpdate ? ' mandatory' : '');
    }
    const close = document.getElementById('update-modal-close');
    const later = document.getElementById('update-modal-later');
    if (close) close.style.display = mandatoryUpdate ? 'none' : '';
    if (later) later.style.display = mandatoryUpdate ? 'none' : '';

    // Badge de tipo (WEB/MODULAR ou NATIVA)
    const badge = document.getElementById('update-type-badge');
    if (badge) {
      if (info.apkRequired) {
        badge.className = 'update-type-badge native';
        badge.innerHTML = '<i class="ph ph-android-logo"></i> NATIVA · Novo APK obrigatório · reinstalação SIM';
      } else if (info.webChanged) {
        badge.className = 'update-type-badge web';
        badge.innerHTML = '<i class="ph ph-lightning"></i> WEB / MODULAR · sem reinstalar o APK';
      } else if (info.apkOptional) {
        badge.className = 'update-type-badge optional';
        badge.innerHTML = '<i class="ph ph-download-simple"></i> APK opcional (contingência)';
      } else {
        badge.className = 'update-type-badge';
        badge.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Atualização';
      }
    }

    // Razão da atualização nativa
    const reasonBox = document.getElementById('update-reason-box');
    if (reasonBox) {
      const reason = (m.apk && m.apk.reason) || '';
      if (info.apkRequired) {
        reasonBox.className = 'update-reason-box';
        reasonBox.innerHTML = '<strong>Por que é necessário reinstalar o APK?</strong><span>' + escapeHtml(reason || 'Mudança estrutural no aplicativo que não pode ser entregue pela atualização modular (plugin, permissão ou código nativo).') + '</span>';
      } else {
        reasonBox.className = 'update-reason-box hidden';
      }
    }

    // Seleção (somente web quando houver; APK só quando exigido)
    const sel = document.getElementById('update-version-select');
    let html = '';
    if (info.webChanged) {
      html += '<label class="uv-option"><input type="radio" name="update-kind" value="web" checked> <span class="uv-option-text"><strong>Web (modular)</strong><small>Baixa só o que mudou e reinicia sem reinstalar o APK.</small></span></label>';
    }
    if (info.apkRequired) {
      html += '<label class="uv-option"><input type="radio" name="update-kind" value="apk" ' + (info.webChanged ? '' : 'checked') + '> <span class="uv-option-text"><strong>APK completo</strong><small>Necessário — baixa e instala o v' + escapeHtml((m.apk && m.apk.name) || '') + '.</small></span></label>';
    }
    sel.innerHTML = html;
    sel.style.display = html ? 'flex' : 'none';

    // Detalhes do dispositivo (útil para diagnóstico nativo)
    const devBox = document.getElementById('update-device-box');
    if (devBox && info.apkRequired) {
      window.PermissionManager.getDeviceInfo().then((device) => {
        devBox.className = 'update-device-box';
        devBox.innerHTML = '<span class="udv-label">Dispositivo</span><span class="udv-value">' + escapeHtml(window.PermissionManager.deviceLabel(device)) + '</span>';
      }).catch(() => {});
    }

    el.classList.remove('hidden');
  }

  function hideUpdateModal() {
    const el = document.getElementById('update-modal');
    if (el) el.classList.add('hidden');
    modalOpen = false;
    mandatoryUpdate = false;
    const st = document.getElementById('update-modal-status');
    if (st) { st.classList.add('hidden'); st.textContent = ''; }
    const stage = document.getElementById('update-modal-stage');
    if (stage) { stage.classList.add('hidden'); stage.textContent = ''; }
    const bar = document.getElementById('update-modal-bar');
    const fill = document.getElementById('update-modal-bar-fill');
    if (bar) bar.classList.add('hidden');
    if (fill) fill.style.width = '0%';
    const actions = document.getElementById('update-modal-actions');
    if (actions) actions.style.display = '';
  }

  function dismissUpdateModal() {
    if (mandatoryUpdate) return;
    if (pendingManifest && pendingManifest.webVersion) {
      state.dismissedVersion = pendingManifest.webVersion;
      saveState();
    }
    hideUpdateModal();
  }

  function setModalStatus(msg, type) {
    const st = document.getElementById('update-modal-status');
    if (!st) return;
    st.textContent = msg;
    st.className = 'update-modal-status ' + (type || 'info');
    st.classList.remove('hidden');
  }

  function setModalStage(stage, msg) {
    const el = document.getElementById('update-modal-stage');
    if (!el) return;
    el.textContent = msg;
    el.className = 'update-modal-stage stage-' + stage;
    el.classList.remove('hidden');
  }

  function setModalProgress(pct, msg) {
    const fill = document.getElementById('update-modal-bar-fill');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    const bar = document.getElementById('update-modal-bar');
    if (bar) bar.classList.remove('hidden');
    if (msg != null) setModalStatus(msg, 'info');
  }

  // Modal de permissão de instalação com botão ABRIR CONFIGURAÇÕES
  function showInstallPermissionModal(device, apk, filePath, isResume) {
    const PM = window.PermissionManager;
    let el = document.getElementById('update-modal');
    if (!el) {
      showUpdateModal({ manifest: { webVersion: '', version: '', apk }, webChanged: false, apkRequired: true, apkOptional: false });
      el = document.getElementById('update-modal');
    }
    modalOpen = true;
    mandatoryUpdate = true;

    document.getElementById('update-modal-title').textContent = 'Instalação bloqueada';
    const sub = document.getElementById('update-modal-sub');
    if (sub) sub.textContent = 'A instalação da atualização foi bloqueada pelas configurações de segurança do dispositivo.';
    const badge = document.getElementById('update-type-badge');
    if (badge) {
      badge.className = 'update-type-badge native';
      badge.innerHTML = '<i class="ph ph-shield-warning"></i> PERMISSÃO DE INSTALAÇÃO NECESSÁRIA';
    }
    document.getElementById('update-version-select').style.display = 'none';
    const close = document.getElementById('update-modal-close');
    const later = document.getElementById('update-modal-later');
    if (close) close.style.display = 'none';
    if (later) later.style.display = 'none';
    document.getElementById('update-modal-now').style.display = 'none';

    const box = document.getElementById('update-device-box');
    if (box) {
      const label = PM ? PM.deviceLabel(device) : '';
      box.className = 'update-device-box';
      box.innerHTML = '<span class="udv-label">Dispositivo</span><span class="udv-value">' + escapeHtml(label) + '</span>';
    }
    const reasonBox = document.getElementById('update-reason-box');
    if (reasonBox) {
      reasonBox.className = 'update-reason-box';
      reasonBox.innerHTML = '<strong>' + (PM ? PM.description(device) : '') + '</strong><span>' + (isResume ? 'Volte a esta tela quando a permissão for concedida.' : 'Toque em ABRIR CONFIGURAÇÕES e autorize a instalação do Dalbran PRO. Ao voltar, a instalação continua automaticamente.') + '</span>';
    }

    const actions = document.getElementById('update-modal-actions');
    actions.style.display = 'flex';
    actions.innerHTML = '';
    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'btn btn-primary';
    settingsBtn.id = 'update-modal-settings';
    settingsBtn.innerHTML = '<i class="ph ph-gear" aria-hidden="true"></i> ABRIR CONFIGURAÇÕES';
    settingsBtn.addEventListener('click', () => { openDeviceSettings(device); });
    actions.appendChild(settingsBtn);

    el.classList.remove('hidden');
  }

  // Mostra o diagnóstico de falha dentro do modal (sem loop)
  function showDiagnosticsInModal() {
    let el = document.getElementById('update-modal');
    if (!el) return;
    modalOpen = true;
    mandatoryUpdate = false;
    document.getElementById('update-modal-title').textContent = 'Falha na atualização modular';
    const sub = document.getElementById('update-modal-sub');
    if (sub) sub.textContent = 'A nova versão não pôde ser ativada neste dispositivo. O app continua funcionando na versão anterior.';
    const badge = document.getElementById('update-type-badge');
    if (badge) { badge.className = 'update-type-badge error'; badge.innerHTML = '<i class="ph ph-bug"></i> DIAGNÓSTICO'; }
    document.getElementById('update-version-select').style.display = 'none';
    const close = document.getElementById('update-modal-close');
    const later = document.getElementById('update-modal-later');
    if (close) close.style.display = '';
    if (later) later.style.display = '';
    document.getElementById('update-modal-now').style.display = 'none';

    const box = document.getElementById('update-device-box');
    if (box) {
      box.className = 'update-device-box';
      box.innerHTML = '<pre class="update-diag-pre">' + escapeHtml(getDiagnostics().slice(-12).map(d => '[' + d.msg + ']').join('\n')) + '</pre>';
    }
    const actions = document.getElementById('update-modal-actions');
    actions.style.display = 'flex';
    actions.innerHTML = '';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-outline';
    retryBtn.innerHTML = '<i class="ph ph-arrows-clockwise" aria-hidden="true"></i> Tentar novamente';
    retryBtn.addEventListener('click', () => { hideUpdateModal(); window.checkAppUpdates(); });
    actions.appendChild(retryBtn);

    el.classList.remove('hidden');
  }

  async function onUpdateNow() {
    const now = document.getElementById('update-modal-now');
    const kindEl = document.querySelector('input[name="update-kind"]:checked');
    const kind = kindEl ? kindEl.value : 'web';

    if (!pendingManifest) { hideUpdateModal(); return; }
    if (now) now.disabled = true;
    document.querySelectorAll('input[name="update-kind"]').forEach(r => { r.disabled = true; });

    if (kind === 'web') {
      await applyWebUpdate(pendingManifest, pendingChanged || []);
    } else {
      const apk = pendingManifest.apk;
      const url = ((apk && (apk.url || config.apkUrl)) || '').replace('{VERSION}', (apk && apk.name) || '');
      const fallbackUrl = ((apk && (apk.fallbackUrl || '').replace('{VERSION}', (apk && apk.name) || '')) || '');
      if (!url) {
        setModalStatus('URL do APK não configurada.', 'error');
      } else {
        await installApkInternal(url, apk, fallbackUrl);
      }
      if (now) now.disabled = false;
      return;
    }
    if (now) now.disabled = false;
  }

  // ---------------------------------------------------------------
  // Aviso de APK opcional (banner discreto)
  // ---------------------------------------------------------------
  function showApkUpdate(apk, url, fallbackUrl) {
    let el = document.getElementById('apk-update-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'apk-update-banner';
      el.className = 'apk-update-banner';
      el.innerHTML = `
        <div class="apk-update-banner-inner">
          <i class="ph ph-download-simple" aria-hidden="true"></i>
          <div>
            <strong>Novo APK disponível (opcional)</strong>
            <span>Atualize o aplicativo para a versão ${escapeHtml(apk.name || '')} — apenas se necessário.</span>
          </div>
          <button type="button" class="btn btn-primary" id="apk-update-download">Baixar e instalar</button>
          <button type="button" class="apk-update-close" id="apk-update-close" aria-label="Fechar"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>
      `;
      document.body.appendChild(el);
      document.getElementById('apk-update-download').addEventListener('click', () => {
        if (url) installApkInternal(url, apk, fallbackUrl);
        else notify('URL do APK não configurada. Adicione em Configurações → Atualizações.', 'error');
      });
      document.getElementById('apk-update-close').addEventListener('click', () => {
        hideApkUpdate();
        state.dismissedApk = apk.code;
        saveState();
      });
    }
    el.classList.add('show');
  }

  function hideApkUpdate() {
    const el = document.getElementById('apk-update-banner');
    if (el) el.classList.remove('show');
  }

  // ---------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------
  window.AppUpdater = {
    APP_VERSION,
    WEB_VERSION: () => ({ name: runningWebVersion(), code: runningWebCode() }),
    config,
    checkNow: () => checkNow({ silent: false }),
    checkNowForced: () => checkNow({ silent: false, force: true }),
    runStartupCheck,
    currentState: () => state,
    getDiagnostics,
    deviceInfo: () => window.PermissionManager ? window.PermissionManager.getDeviceInfo(true) : Promise.resolve(null),
    confirmActiveWeb
  };

  window.checkAppUpdates = async function () {
    const wrap = document.getElementById('update-check-log-wrap');
    const log = document.getElementById('update-check-log');
    if (wrap) wrap.classList.remove('hidden');
    if (log) log.innerHTML = '';
    document.body.classList.add('update-checking');
    try {
      await checkNow({ silent: false, force: true });
    } catch (e) {
      notify('Falha ao verificar atualizações: ' + e.message, 'error');
    }
    document.body.classList.remove('update-checking');
  };

  window.downloadLatestApk = async function () {
    const wrap = document.getElementById('update-check-log-wrap');
    if (wrap) wrap.classList.remove('hidden');
    document.body.classList.add('update-checking');
    try {
      if (!config.manifestUrl) throw new Error('Sem URL de manifest configurada.');
      const sep = config.manifestUrl.includes('?') ? '&' : '?';
      const manifest = await fetchJson(config.manifestUrl + sep + 't=' + Date.now());
      const apk = manifest && manifest.apk;
      if (!apk) throw new Error('Manifest sem APK.');
      if (apk.code <= APP_VERSION.code) {
        notify('O APK já está na versão mais recente (' + APP_VERSION.name + ').', 'info');
        diag('APK já na versão mais recente (' + APP_VERSION.name + ').', 'info');
        return;
      }
      const url = (apk.url || config.apkUrl || '').replace('{VERSION}', apk.name || '');
      const fallbackUrl = (apk.fallbackUrl || '').replace('{VERSION}', apk.name || '');
      diag('Baixando e instalando APK v' + (apk.name || '') + ' manualmente...', 'info');
      showUpdateModal({ manifest, changed: [], webChanged: false, apkRequired: true, apkOptional: false, apkUrl: url, apkFallbackUrl: fallbackUrl });
      await installApkInternal(url, apk, fallbackUrl);
    } catch (e) {
      notify('Falha ao baixar/instalar o APK: ' + e.message, 'error');
      diag('ERRO no APK: ' + e.message, 'error');
    }
    document.body.classList.remove('update-checking');
  };

  // Botão "Abrir configurações" usado pelo PermissionManager/UI
  window.openInstallationSettings = async function () {
    if (window.PermissionManager) return window.PermissionManager.openInstallationSettings();
    return { opened: false };
  };

  // Preenche o painel "Versão instalada / Web / Nativa / Dispositivo" nas
  // Configurações (elementos #uv-info-web / #uv-info-native / #uv-info-device).
  window.refreshUpdateVersionInfo = function () {
    const webEl = document.getElementById('uv-info-web');
    const nativeEl = document.getElementById('uv-info-native');
    const devEl = document.getElementById('uv-info-device');
    if (webEl) {
      const running = runningWebCode();
      webEl.textContent = running
        ? (runningWebVersion() || ('code ' + running)) + (running === (state.webCode || 0) ? '' : ' (instalado: ' + (state.webVersion || 'base') + ')')
        : (state.webVersion ? 'base (' + state.webVersion + ')' : 'base embutida');
    }
    if (nativeEl) nativeEl.textContent = APP_VERSION.name + ' (code ' + APP_VERSION.code + ')';
    if (devEl) {
      if (window.PermissionManager) {
        window.PermissionManager.getDeviceInfo().then((d) => {
          const el2 = document.getElementById('uv-info-device');
          if (el2) el2.textContent = window.PermissionManager.deviceLabel(d);
        }).catch(() => {});
      }
    }
  };

  // Diagnóstico completo (estado + versões em execução + últimas linhas do log)
  window.showUpdateDiagnostics = function () {
    try {
      const info = {
        runningWeb: { name: runningWebVersion(), code: runningWebCode() },
        bundledNative: { name: APP_VERSION.name, code: APP_VERSION.code },
        state,
        diag: getDiagnostics().slice(-30)
      };
      const text = JSON.stringify(info, null, 2);
      const log = document.getElementById('update-check-log');
      const wrap = document.getElementById('update-check-log-wrap');
      if (log && wrap) {
        log.textContent = text;
        wrap.classList.remove('hidden');
        // Garante visibilidade mesmo com o acordeão recolhido: abre a seção
        // "Atualizações do Aplicativo" e rola até o diagnóstico.
        try {
          const block = wrap.closest('.settings-block');
          if (block) block.classList.add('open');
          setTimeout(() => { try { wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e2) {} }, 60);
        } catch (e2) {}
        return;
      }
      notify('Abra Configurações → Atualizações para ver o diagnóstico.', 'info');
    } catch (e) {}
  };

  // ---------------------------------------------------------------
  // Log visual (Configurações → Atualizações)
  // ---------------------------------------------------------------
  document.addEventListener('app:update-progress', (ev) => {
    const log = document.getElementById('update-check-log');
    if (!log) return;
    const d = ev.detail || {};
    const line = '[' + new Date(d.time || Date.now()).toLocaleTimeString('pt-BR') + '] ' + (d.msg || '');
    const row = document.createElement('div');
    row.className = 'update-log-line ' + (d.type || 'info');
    row.textContent = line;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  });

  // ---------------------------------------------------------------
  // Splash
  // ---------------------------------------------------------------
  function setSplashMessage(msg) {
    try {
      const el = document.getElementById('splash-status-msg');
      if (el) el.textContent = msg;
    } catch (e) {}
  }

  async function runStartupCheck() {
    window.__updateStartupPending = true;
    if (!config.checkOnStart) {
      window.__updateStartupPending = false;
      try { window.dismissSplashScreen(); } catch (e) {}
      return;
    }
    setSplashMessage('Verificando atualizações...');
    try {
      await checkNow({ silent: true });
    } catch (e) {}
    window.__updateStartupPending = false;
    try { window.dismissSplashScreen(); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------
  async function init() {
    loadState();
    await loadConfigFromFirestore();

    // 1. Garante o Service Worker ativo ANTES de conferir/atualizar versões.
    const swOk = await ensureServiceWorker();
    if (swOk === false) return; // recarregando para ativar o SW

    // 2. Confirma/roolback da versão web em execução.
    const confirm = await confirmActiveWeb();
    if (confirm.reloading) return; // recarregando para aplicar/desfazer

    // 3. Verificação de atualizações na abertura.
    await runStartupCheck();

    // 4. Retomada automática ao voltar ao app (permissão de instalação, etc.)
    setupResumeWatcher();

    if (config.intervalMinutes > 0) {
      setInterval(() => checkNow({ silent: true }), Math.max(10, config.intervalMinutes) * 60 * 1000);
    }
    // Trava de segurança: nunca deixar a tela de loading eterna
    setTimeout(() => {
      window.__updateStartupPending = false;
      try { window.dismissSplashScreen(); } catch (e) {}
    }, 15000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();