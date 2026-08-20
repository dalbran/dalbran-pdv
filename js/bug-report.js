/**
 * Módulo de Relatório de Erros e Logs (bug report)
 *
 * Captura erros de execução (window.onerror, unhandledrejection, console.error)
 * e eventos importantes do app, guarda em um buffer local (localStorage) e envia
 * AUTOMATICAMENTE para o Firestore (coleção `bug_reports`) quando houver erros
 * pendentes e o usuário estiver autenticado. O envio também acontece:
 *  - na abertura do app (após login);
 *  - a cada 5 minutos;
 *  - ao atingir 3 erros pendentes;
 *  - manualmente (Configurações → Suporte e Erros → "Enviar relatório").
 *
 * Os relatórios são analisados por nós (painel/browser da coleção bug_reports).
 */
(function () {
  'use strict';

  const LS_KEY = 'dalbran:buglog';
  const MAX_ENTRIES = 150;
  const MIN_PENDING = 3;

  let initialized = false;
  let flushing = false;

  function load() {
    try {
      const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function save(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
    } catch (e) {}
  }

  function deviceInfo() {
    const v = (window.AppUpdater && window.AppUpdater.APP_VERSION) || {};
    return {
      app: 'Dalbran PRO',
      version: v.name || '',
      code: v.code || 0,
      platform: (window.Capacitor && Capacitor.getPlatform && Capacitor.getPlatform()) || 'web',
      userAgent: navigator.userAgent,
      lang: navigator.language || '',
      screen: (window.screen && window.screen.width) + 'x' + (window.screen.height || 0) + '@' + (window.devicePixelRatio || 1),
      memory: navigator.deviceMemory ? (navigator.deviceMemory + 'GB') : '',
      online: navigator.onLine === true,
      user: (typeof auth !== 'undefined' && auth.currentUser) ? (auth.currentUser.email || '') : ''
    };
  }

  function capture(type, message, detail) {
    const entry = {
      t: new Date().toISOString(),
      type: String(type || 'log'),
      message: String(message == null ? '' : message).slice(0, 2000),
      detail: detail ? String(detail).slice(0, 5000) : '',
      url: (location && location.href) || '',
      sent: false
    };
    const list = load();
    list.push(entry);
    save(list);
    try { maybeFlush(); } catch (e) {}
    return entry;
  }

  async function flush() {
    if (flushing) return false;
    const list = load();
    const pending = list.filter(e => !e.sent);
    if (!pending.length) return true;
    if (typeof db === 'undefined' || !db) return false;
    if (typeof auth !== 'undefined' && auth && !auth.currentUser) return false; // aguarda login

    flushing = true;
    try {
      await db.collection('bug_reports').add({
        info: deviceInfo(),
        entries: pending.map(({ t, type, message, detail, url }) => ({ t, type, message, detail, url })),
        count: pending.length,
        createdAt: (firebase && firebase.firestore && firebase.firestore.FieldValue.serverTimestamp()) || new Date().toISOString()
      });
      const ids = new Set(pending.map(e => e.t + '|' + e.type + '|' + e.message.slice(0, 40)));
      const next = list.map(e => (ids.has(e.t + '|' + e.type + '|' + e.message.slice(0, 40)) ? { ...e, sent: true } : e));
      save(next);
      return true;
    } catch (e) {
      return false;
    } finally {
      flushing = false;
    }
  }

  function maybeFlush() {
    const pending = load().filter(e => !e.sent);
    if (pending.length >= MIN_PENDING) flush();
  }

  function init() {
    if (initialized) return;
    initialized = true;

    window.addEventListener('error', (e) => {
      capture('error', e && e.message, (e && (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0) + '\n' + ((e.error && e.error.stack) || '')) || '');
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      capture('promise', (r && (r.message || r.stack)) || 'Unhandled rejection', (r && r.stack) || '');
    });

    const origError = console.error;
    console.error = function () {
      try {
        const args = Array.prototype.slice.call(arguments);
        const text = args.map(a => {
          if (a instanceof Error) return a.message + (a.stack ? '\n' + a.stack : '');
          if (typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
          return String(a);
        }).join(' ');
        capture('console.error', text.slice(0, 2000));
      } catch (e) {}
      try { origError.apply(console, arguments); } catch (e) {}
    };

    // Eventos do app (atualização, backup, etc.) com erro também entram no log
    document.addEventListener('app:update-progress', (ev) => {
      const d = ev.detail || {};
      if (d.type === 'error') capture('update', d.msg || '');
    });
    document.addEventListener('drive-backup:progress', (ev) => {
      const d = ev.detail || {};
      if (d.type === 'error') capture('backup', d.msg || '');
    });

    // Envio automático após login e periodicamente
    if (typeof auth !== 'undefined' && auth) {
      auth.onAuthStateChanged(user => { if (user) setTimeout(() => flush(), 2000); });
    }
    setInterval(() => maybeFlush(), 5 * 60 * 1000);

    window.BugReport = {
      capture,
      flush,
      maybeFlush,
      getPending: () => load().filter(e => !e.sent).length,
      getEntries: () => load(),
      clear: () => save([])
    };
  }

  // Botão manual (Configurações → Suporte e Erros)
  window.sendBugReport = async function () {
    try {
      const pending = window.BugReport ? window.BugReport.getPending() : 0;
      if (window.BugReport && pending === 0) {
        window.BugReport.capture('manual', 'Relatório de erros solicitado manualmente pelo usuário.');
      }
      const ok = window.BugReport ? await window.BugReport.flush() : false;
      if (typeof showToast === 'function') {
        if (ok) showToast('Relatório enviado com sucesso!', 'success');
        else if (typeof auth !== 'undefined' && auth && !auth.currentUser) showToast('Faça login para enviar o relatório.', 'info');
        else showToast('Não foi possível enviar agora. O relatório será enviado automaticamente.', 'error');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Erro ao enviar relatório: ' + e.message, 'error');
    }
  };

  window.downloadBugLog = function () {
    try {
      const entries = (window.BugReport && window.BugReport.getEntries()) || [];
      const blob = new Blob([JSON.stringify({ info: deviceInfo(), entries }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dalbran-buglog-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {}
  };

  document.addEventListener('DOMContentLoaded', init);
})();