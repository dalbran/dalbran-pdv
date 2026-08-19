/**
 * Módulo de Atualização Automática do Aplicativo
 *
 * Funciona em duas frentes:
 *  1. ATUALIZAÇÃO MODULAR (web): baixa no início (e periodicamente) um
 *     manifest `versao.json` publicado junto com a versão web; baixa apenas
 *     os arquivos alterados (validando SHA-256), grava no cache do service
 *     worker (`dalbran-update-cache`) e recarrega o app.
 *  2. ATUALIZAÇÃO COMPLETA (APK): se o manifest anunciar um APK com
 *     versionCode maior que o instalado, mostra um aviso com o botão para
 *     baixar o APK novo (link do GitHub Releases / URL configurada).
 *
 * Configurável pelo usuário em Configurações → Atualizações do Aplicativo
 * (manifestUrl, canal, verificação no início, etc.).
 */
(function () {
  'use strict';

  const UPDATE_CACHE = 'dalbran-update-cache';
  const LS_KEY = 'dalbran:update:state';

  // Versão atual do app — MANTER em sincronia com android/app/build.gradle
  const APP_VERSION = {
    name: '0.0.5',
    code: 5
  };

  let config = {
    manifestUrl: 'https://dalbran.github.io/dalbran-pdv/versao.json',
    apkUrl: 'https://github.com/dalbran/dalbran-pdv/releases/download/v{VERSION}/Dalbran-v{VERSION}.apk',
    channel: 'stable',       // stable | beta
    checkOnStart: true,
    checkWeb: true,
    checkApk: true,
    intervalMinutes: 0       // 0 = verificar somente ao abrir o app (após fechar)
  };

  let state = { webVersion: '', webFiles: {}, apkCode: 0, lastCheck: 0, lastResult: '', lastManifestVersion: '' };

  // ---------------------------------------------------------------
  // Estado persistente
  // ---------------------------------------------------------------
  function loadState() {
    try { state = { ...state, ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; } catch (e) {}
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
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

  function notify(message, type) {
    if (typeof showToast === 'function') showToast(message, type);
  }

  // Emite evento de progresso para o log visual (Configurações → Atualizações)
  function emitProgress(msg, type) {
    try {
      document.dispatchEvent(new CustomEvent('app:update-progress', {
        detail: { msg: msg, type: type || 'info', time: Date.now() }
      }));
    } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Verificação principal
  // ---------------------------------------------------------------
  async function checkNow(opts) {
    opts = opts || {};
    const startedAt = Date.now();
    emitProgress('Verificando atualizações...', 'info');
    try {
      if (!config.manifestUrl) {
        state.lastResult = 'Sem URL de manifest configurada.';
        saveState();
        emitProgress('Sem URL de manifest configurada. Configure em Configurações → Atualizações.', 'error');
        if (!opts.silent) notify('Sem URL de verificação de atualização configurada.', 'info');
        return { updated: false, reason: 'no-manifest-url' };
      }

      emitProgress('Buscando manifest: ' + config.manifestUrl, 'info');
      const sep = config.manifestUrl.includes('?') ? '&' : '?';
      const manifest = await fetchJson(config.manifestUrl + sep + 't=' + Date.now());
      state.lastManifestVersion = manifest.version || '';
      emitProgress('Manifest baixado — versão ' + (manifest.version || '?') + ' (' + (Array.isArray(manifest.web) ? manifest.web.length : 0) + ' arquivos web).', 'success');

      // --- Atualização modular (web) ---
      let updated = false;
      if (config.checkWeb && Array.isArray(manifest.web) && manifest.version && manifest.version !== state.webVersion) {
        const changed = manifest.web.filter(f =>
          f.path !== 'versao.json' && f.path !== 'sw.js' && state.webFiles[f.path] !== f.sha256
        );
        if (changed.length > 0) {
          emitProgress(changed.length + ' arquivo(s) alterado(s) — baixando...', 'info');
          const applied = await downloadAndCache(changed, manifest);
          if (applied) {
            state.webVersion = manifest.version;
            state.webFiles = {};
            manifest.web.forEach(f => { state.webFiles[f.path] = f.sha256; });
            saveState();
            updated = true;
            emitProgress('Atualização web aplicada — recarregando o app...', 'success');
            setTimeout(() => { try { window.location.reload(); } catch (e) {} }, 600);
          } else {
            emitProgress('Falha ao baixar os arquivos da atualização.', 'error');
          }
        } else {
          // já temos tudo aplicado para esta versão
          state.webVersion = manifest.version;
          saveState();
          emitProgress('Arquivos já atualizados para ' + manifest.version + '.', 'info');
        }
      } else if (config.checkWeb) {
        emitProgress('Web já na versão ' + (manifest.version || '') + ' (nenhuma alteração).', 'info');
      }

      // --- Atualização completa (APK) ---
      if (config.checkApk && manifest.apk && manifest.apk.code > APP_VERSION.code) {
        const url = (manifest.apk.url || config.apkUrl || '').replace('{VERSION}', manifest.apk.name);
        state.apkCode = manifest.apk.code;
        saveState();
        emitProgress('Novo APK disponível: v' + manifest.apk.name + ' (code ' + manifest.apk.code + ').', 'success');
        showApkUpdate(manifest.apk, url);
      } else {
        hideApkUpdate();
        if (config.checkApk && manifest.apk) {
          emitProgress('APK atualizado (instalado ' + APP_VERSION.name + ' = publicado ' + manifest.apk.name + ').', 'info');
        }
      }

      state.lastCheck = Date.now();
      state.lastResult = 'OK';
      saveState();
      emitProgress('Verificação concluída em ' + ((Date.now() - startedAt) / 1000).toFixed(2) + 's.', 'success');
      if (!opts.silent) notify('Verificação de atualizações concluída.', 'info');
      return { updated, apkAvailable: state.apkCode > APP_VERSION.code };
    } catch (e) {
      state.lastResult = e.message;
      saveState();
      emitProgress('ERRO: ' + e.message, 'error');
      if (!opts.silent) notify('Falha ao verificar atualizações: ' + e.message, 'error');
      return { updated: false, error: e.message };
    }
  }

  async function downloadAndCache(changed, manifest) {
    const files = [];
    const manifestBase = new URL(config.manifestUrl);
    for (const f of changed) {
      try {
        const res = await fetch(new URL(f.path, manifestBase).href, { cache: 'no-store' });
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const hash = await sha256Hex(buf);
        if (f.sha256 && hash !== f.sha256) continue; // integridade
        files.push({ path: f.path, buffer: buf });
      } catch (e) {}
    }
    if (!files.length) return false;

    if (!('caches' in window)) return false;
    try {
      const cache = await caches.open(UPDATE_CACHE);
      for (const f of files) {
        const body = new Response(f.buffer, { headers: { 'Content-Type': contentType(f.path) } });
        // chave local (como o app carrega) — origin + caminho
        const localUrl = new URL(f.path, window.location.origin).href;
        await cache.put(new Request(localUrl, { cache: 'no-store' }), body.clone());
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------
  // Aviso de APK novo (atualização completa)
  // ---------------------------------------------------------------
  function showApkUpdate(apk, url) {
    let el = document.getElementById('apk-update-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'apk-update-banner';
      el.className = 'apk-update-banner';
      el.innerHTML = `
        <div class="apk-update-banner-inner">
          <i class="ph ph-download-simple" aria-hidden="true"></i>
          <div>
            <strong>Nova versão disponível</strong>
            <span>Atualize o aplicativo para a versão ${escapeHtml(apk.name || '')}</span>
          </div>
          <button type="button" class="btn btn-primary" id="apk-update-download">Baixar e instalar</button>
          <button type="button" class="apk-update-close" id="apk-update-close" aria-label="Fechar"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>
      `;
      document.body.appendChild(el);
      document.getElementById('apk-update-download').addEventListener('click', () => {
        if (url) {
          try {
            const win = window.open(url, '_system');
            if (!win) window.open(url, '_blank');
          } catch (e) {
            window.open(url, '_blank');
          }
        } else {
          notify('URL do APK não configurada. Adicione em Configurações → Atualizações.', 'error');
        }
      });
      document.getElementById('apk-update-close').addEventListener('click', hideApkUpdate);
    }
    el.classList.add('show');
  }

  function hideApkUpdate() {
    const el = document.getElementById('apk-update-banner');
    if (el) el.classList.remove('show');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------
  window.AppUpdater = {
    APP_VERSION,
    config,
    checkNow: () => checkNow({ silent: false }),
    runStartupCheck,
    currentState: () => state
  };

  // "Verificar atualizações agora" — mostra loading e log visual
  window.checkAppUpdates = async function () {
    const wrap = document.getElementById('update-check-log-wrap');
    const log = document.getElementById('update-check-log');
    if (wrap) wrap.classList.remove('hidden');
    if (log) log.innerHTML = '';
    document.body.classList.add('update-checking');
    try {
      await checkNow({ silent: false });
    } catch (e) {
      notify('Falha ao verificar atualizações: ' + e.message, 'error');
    }
    document.body.classList.remove('update-checking');
  };

  // Renderiza o log visual (se o painel de Configurações estiver na tela)
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
  // Tela de loading na abertura do app
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
    let updated = false;
    try {
      const res = await checkNow({ silent: true });
      updated = !!(res && res.updated);
    } catch (e) {}
    if (updated) {
      // Atualização aplicada — a página será recarregada; a splash fica visível
      // até o novo carregamento terminar (sem flash de tela branca).
      setSplashMessage('Atualizando sistema...');
      return;
    }
    window.__updateStartupPending = false;
    try { window.dismissSplashScreen(); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------
  async function init() {
    loadState();
    await loadConfigFromFirestore();

    await runStartupCheck();
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