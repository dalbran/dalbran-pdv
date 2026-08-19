/**
 * Módulo de Atualização Automática do Aplicativo
 *
 * Funciona em duas frentes:
 *  1. ATUALIZAÇÃO MODULAR (web): baixa no início (e periodicamente) um
 *     manifest `versao.json` publicado junto com a versão web; baixa apenas
 *     os arquivos alterados (validando SHA-256), grava no cache do service
 *     worker (`dalbran-update-cache`) e reinicia o app.
 *  2. ATUALIZAÇÃO COMPLETA (APK): se o manifest anunciar um APK com
 *     versionCode maior que o instalado, oferece o download do APK.
 *
 * Quando uma atualização é encontrada após a verificação, um MODAL é exibido
 * com a seleção automática da versão e o botão "Atualizar agora", que aplica
 * a atualização e reinicia o app (fecha e reabre).
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
    name: '0.0.6',
    code: 6
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

  // Manifest atual aguardando confirmação do usuário (usado pelo modal)
  let pendingManifest = null;
  let pendingChanged = [];
  let modalOpen = false;

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

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
        return { updated: false, hasUpdate: false, reason: 'no-manifest-url' };
      }

      emitProgress('Buscando manifest: ' + config.manifestUrl, 'info');
      const sep = config.manifestUrl.includes('?') ? '&' : '?';
      const manifest = await fetchJson(config.manifestUrl + sep + 't=' + Date.now());
      state.lastManifestVersion = manifest.version || '';
      emitProgress('Manifest baixado — versão ' + (manifest.version || '?') + ' (' + (Array.isArray(manifest.web) ? manifest.web.length : 0) + ' arquivos web).', 'success');

      // --- Detecta mudanças (atualização web modular) ---
      let changed = [];
      if (config.checkWeb && Array.isArray(manifest.web) && manifest.version && manifest.version !== state.webVersion) {
        changed = manifest.web.filter(f =>
          f.path !== 'versao.json' && f.path !== 'sw.js' && state.webFiles[f.path] !== f.sha256
        );
      }
      const webChanged = changed.length > 0;

      // --- Detecta novo APK ---
      const apkAvailable = !!(config.checkApk && manifest.apk && manifest.apk.code > APP_VERSION.code);
      const apkUrl = ((manifest.apk && (manifest.apk.url || config.apkUrl)) || '').replace('{VERSION}', (manifest.apk && manifest.apk.name) || '');
      const hasUpdate = webChanged || apkAvailable;

      if (hasUpdate) {
        pendingManifest = manifest;
        pendingChanged = changed;
        state.apkCode = apkAvailable ? manifest.apk.code : state.apkCode;
        if (webChanged) emitProgress(changed.length + ' arquivo(s) web alterado(s) — atualização disponível.', 'info');
        if (apkAvailable) emitProgress('Novo APK disponível: v' + manifest.apk.name + ' (code ' + manifest.apk.code + ').', 'success');

        if (opts.showModal !== false) {
          showUpdateModal({ manifest, changed, webChanged, apkAvailable, apkUrl });
        } else if (apkAvailable) {
          showApkUpdate(manifest.apk, apkUrl);
        }
      } else {
        // tudo em dia
        state.webVersion = manifest.version;
        state.apkCode = 0;
        pendingManifest = null;
        pendingChanged = [];
        saveState();
        hideApkUpdate();
        if (config.checkWeb) emitProgress('Web já na versão ' + (manifest.version || '') + ' (nenhuma alteração).', 'info');
        if (config.checkApk && manifest.apk) emitProgress('APK atualizado (instalado ' + APP_VERSION.name + ' = publicado ' + manifest.apk.name + ').', 'info');
      }

      state.lastCheck = Date.now();
      state.lastResult = hasUpdate ? 'UPDATE_AVAILABLE' : 'OK';
      saveState();
      emitProgress('Verificação concluída em ' + ((Date.now() - startedAt) / 1000).toFixed(2) + 's.', 'success');
      if (!opts.silent) notify(hasUpdate ? 'Atualização disponível!' : 'Verificação de atualizações concluída.', 'info');
      return {
        updated: false,
        webChanged,
        apkAvailable,
        hasUpdate,
        apkCode: manifest.apk ? manifest.apk.code : 0
      };
    } catch (e) {
      state.lastResult = e.message;
      saveState();
      emitProgress('ERRO: ' + e.message, 'error');
      if (!opts.silent) notify('Falha ao verificar atualizações: ' + e.message, 'error');
      return { updated: false, hasUpdate: false, error: e.message };
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
  // Aplicar atualização web e reiniciar o app
  // ---------------------------------------------------------------
  async function applyWebUpdate(manifest, changed) {
    emitProgress('Aplicando atualização web (baixando ' + changed.length + ' arquivo(s))...', 'info');
    setModalStatus('Baixando atualização...', 'info');
    const applied = await downloadAndCache(changed, manifest);
    if (!applied) {
      emitProgress('Falha ao baixar os arquivos da atualização.', 'error');
      setModalStatus('Falha ao baixar os arquivos. Tente novamente.', 'error');
      return false;
    }
    state.webVersion = manifest.version;
    state.webFiles = {};
    manifest.web.forEach(f => { state.webFiles[f.path] = f.sha256; });
    pendingManifest = null;
    pendingChanged = [];
    saveState();
    emitProgress('Atualização web aplicada — reiniciando o app...', 'success');
    setModalStatus('Aplicado! Reiniciando o app...', 'success');
    restartApp();
    return true;
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
    // Pequena pausa para o usuário ver o status antes de fechar/reabrir
    setTimeout(doRestart, 700);
  }

  // ---------------------------------------------------------------
  // Modal de atualização
  // ---------------------------------------------------------------
  function showUpdateModal(info) {
    if (modalOpen) return;
    modalOpen = true;

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
          <div class="update-modal-actions">
            <button type="button" class="btn btn-outline" id="update-modal-later">Agora não</button>
            <button type="button" class="btn btn-primary" id="update-modal-now"><i class="ph ph-download-simple" aria-hidden="true"></i> Atualizar agora</button>
          </div>
          <div class="update-modal-status hidden" id="update-modal-status"></div>
        </div>
      `;
      document.body.appendChild(el);
      document.getElementById('update-modal-close').addEventListener('click', hideUpdateModal);
      document.getElementById('update-modal-overlay').addEventListener('click', hideUpdateModal);
      document.getElementById('update-modal-later').addEventListener('click', () => {
        hideUpdateModal();
        if (info && info.apkAvailable) showApkUpdate(info.manifest.apk, info.apkUrl);
      });
      document.getElementById('update-modal-now').addEventListener('click', onUpdateNow);
    }

    // Preenche os dados (seleção de versão automática)
    document.getElementById('uv-current').textContent = APP_VERSION.name;
    document.getElementById('uv-new').textContent = (info && info.manifest && info.manifest.version) || '';

    const sel = document.getElementById('update-version-select');
    let html = '';
    if (info && info.webChanged) {
      html += '<label class="uv-option"><input type="radio" name="update-kind" value="web" checked> <span class="uv-option-text"><strong>Web (rápido)</strong><small>Atualiza na hora e reinicia o app.</small></span></label>';
    }
    if (info && info.apkAvailable) {
      html += '<label class="uv-option"><input type="radio" name="update-kind" value="apk" ' + (info.webChanged ? '' : 'checked') + '> <span class="uv-option-text"><strong>APK completo</strong><small>Baixa o instalador v' + escapeHtml((info.manifest.apk && info.manifest.apk.name) || '') + '.</small></span></label>';
    }
    sel.innerHTML = html;
    sel.style.display = html ? 'flex' : 'none';

    el.classList.remove('hidden');
  }

  function hideUpdateModal() {
    const el = document.getElementById('update-modal');
    if (el) el.classList.add('hidden');
    modalOpen = false;
    const st = document.getElementById('update-modal-status');
    if (st) { st.classList.add('hidden'); st.textContent = ''; }
  }

  function setModalStatus(msg, type) {
    const st = document.getElementById('update-modal-status');
    if (!st) return;
    st.textContent = msg;
    st.className = 'update-modal-status ' + (type || 'info');
    st.classList.remove('hidden');
  }

  async function onUpdateNow() {
    const now = document.getElementById('update-modal-now');
    const kindEl = document.querySelector('input[name="update-kind"]:checked');
    const kind = kindEl ? kindEl.value : 'web';

    if (!pendingManifest) { hideUpdateModal(); return; }
    if (now) now.disabled = true;

    if (kind === 'web') {
      await applyWebUpdate(pendingManifest, pendingChanged || []);
    } else {
      const apk = pendingManifest.apk;
      const url = ((apk && (apk.url || config.apkUrl)) || '').replace('{VERSION}', (apk && apk.name) || '');
      if (url) {
        setModalStatus('Abrindo o download do APK (' + ((apk && apk.name) || '') + ')...', 'info');
        try {
          const win = window.open(url, '_system');
          if (!win) window.open(url, '_blank');
        } catch (e) {
          window.open(url, '_blank');
        }
        hideUpdateModal();
        if (apk) showApkUpdate(apk, url);
      } else {
        setModalStatus('URL do APK não configurada.', 'error');
      }
    }
    if (now) now.disabled = false;
  }

  // ---------------------------------------------------------------
  // Aviso de APK novo (atualização completa — alternativa ao modal)
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