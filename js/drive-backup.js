/**
 * Módulo de Backup Automático para Google Drive
 *
 * Este módulo é a camada do APLICATIVO. Ele apenas:
 *  - coleta os dados do Firestore,
 *  - organiza em pastas (VENDAS/AAAA/MM, ORCAMENTOS/AAAA/MM, PRODUTOS,
 *    CLIENTES, CONFIGURACOES, BACKUPS_COMPLETOS),
 *  - envia o pacote para o backend (Cloud Functions) que faz o upload no Drive.
 *
 * SEGURANÇA: o OAuth 2.0 e os tokens do Google Drive ficam no backend
 * (functions/). Este arquivo NÃO contém nem exibe tokens — ele apenas chama
 * as Cloud Functions `driveBackup`, `driveAuthUrl`, `driveStatus`,
 * `driveDisconnect`. Se o backend ainda não estiver implantado, o sistema
 * gera um export organizado localmente (fallback) sem nenhum segredo.
 */
(function () {
  'use strict';

  const BACKUP_DOC = 'backup'; // settings/backup (estado operacional)

  const DEFAULTS = {
    enabled: false,
    frequency: 'manual',
    folder: 'PDV BACKUP',
    retentionCount: 10,
    nextBackupAt: null,
    lastBackupAt: null,
    lastBackupStatus: 'none', // none | running | success | error | fallback_local
    lastBackupDetail: '',
    connectedEmail: '',
    pendingIncremental: 0
  };

  const FREQ_MS = { hourly: 60 * 60 * 1000, daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };

  let settings = { ...DEFAULTS };
  let loaded = false;

  function nowIso() { return new Date().toISOString(); }

  function getFunctions() {
    return (typeof firebase !== 'undefined' && firebase.functions) ? firebase.functions() : null;
  }

  async function callBackend(name, data, timeoutMs) {
    const functions = getFunctions();
    if (!functions) {
      const err = new Error('Backend (Cloud Functions) não configurado.');
      err.code = 'BACKEND_NOT_READY';
      throw err;
    }
    const callable = functions.httpsCallable(name);
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => { const e = new Error('Tempo de resposta do backend excedido.'); e.code = 'BACKEND_TIMEOUT'; rej(e); }, timeoutMs || 25000);
    });
    try {
      const res = await Promise.race([callable(data || {}), timeout]);
      return res && res.data;
    } finally { clearTimeout(timer); }
  }

  async function loadSettings() {
    try {
      const doc = await db.collection('settings').doc(BACKUP_DOC).get();
      if (doc.exists) settings = { ...DEFAULTS, ...doc.data() };
      else await db.collection('settings').doc(BACKUP_DOC).set(settings, { merge: true });
    } catch (e) { console.error('backup:load', e); }
    loaded = true;
  }

  async function writeSettings(patch) {
    settings = { ...settings, ...patch };
    try { await db.collection('settings').doc(BACKUP_DOC).set(patch, { merge: true }); }
    catch (e) { console.error('backup:write', e); }
    emitChange();
  }

  function emitChange() {
    try { window.dispatchEvent(new CustomEvent('drive-backup:changed', { detail: { settings } })); } catch (e) {}
  }

  async function driveValues() {
    let values = {};
    try {
      const doc = await db.collection('api_credentials').doc('drive').get();
      if (doc.exists && doc.data().values) values = doc.data().values;
    } catch (e) {}
    return values;
  }

  // ---------------------------------------------------------------
  // Coleta e organização dos dados (espelha a estrutura de pastas)
  // ---------------------------------------------------------------
  async function collectSnapshot() {
    const [products, clients, quotes, settingsSnap] = await Promise.all([
      db.collection('products').get(),
      db.collection('clients').get(),
      db.collection('quotes').get(),
      db.collection('settings').get()
    ]);
    const docMap = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      generatedAt: nowIso(),
      products: docMap(products),
      clients: docMap(clients),
      quotes: docMap(quotes),
      settings: docMap(settingsSnap)
    };
  }

  function toDate(value) {
    if (value && value.toDate) return value.toDate();
    const d = value ? new Date(value) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function organize(snapshot) {
    const byMonth = list => {
      const map = {};
      list.forEach(q => {
        const d = toDate(q.createdAt);
        const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!map[key]) map[key] = [];
        map[key].push(q);
      });
      return map;
    };
    return {
      VENDAS: byMonth(snapshot.quotes.filter(q => q.tipo === 'venda')),
      ORCAMENTOS: byMonth(snapshot.quotes.filter(q => q.tipo === 'orcamento')),
      PRODUTOS: snapshot.products,
      CLIENTES: snapshot.clients,
      CONFIGURACOES: snapshot.settings,
      quotes: snapshot.quotes
    };
  }

  // ---------------------------------------------------------------
  // Execução do backup
  // ---------------------------------------------------------------
  async function performBackupNow(kind) {
    kind = kind || 'full';
    try { await ensureLoaded(); } catch (e) {}
    const values = await driveValues();

    await writeSettings({ lastBackupStatus: 'running', lastBackupDetail: 'Iniciando backup...' });

    try {
      const snapshot = await collectSnapshot();
      const organized = organize(snapshot);
      const result = await callBackend('driveBackup', { kind: 'full', organized, options: { folder: values.backupFolder || settings.folder, retentionCount: values.retentionCount || settings.retentionCount } });

      await writeSettings({
        lastBackupAt: nowIso(),
        lastBackupStatus: 'success',
        lastBackupDetail: (result && result.message) || 'Backup enviado ao Google Drive.',
        nextBackupAt: computeNextBackup(values),
        pendingIncremental: 0
      });
      return { ok: true, via: 'drive', result };
    } catch (err) {
      const code = err && (err.code || err.message || '');
      const backendMissing = code === 'BACKEND_NOT_READY' || code === 'BACKEND_TIMEOUT' || /not-found|unavailable|Backend \(Cloud Functions\)/.test(code);
      if (backendMissing) {
        // Fallback sem segredos: gera o pacote organizado localmente.
        const detail = await fallbackLocalExport();
        await writeSettings({
          lastBackupAt: nowIso(),
          lastBackupStatus: 'fallback_local',
          lastBackupDetail: detail,
          nextBackupAt: computeNextBackup(values),
          pendingIncremental: 0
        });
        return { ok: true, via: 'local', detail };
      }
      await writeSettings({ lastBackupStatus: 'error', lastBackupDetail: (err && err.message) || 'Falha no backup.' });
      return { ok: false, error: err };
    }
  }

  async function fallbackLocalExport() {
    try {
      const snapshot = await collectSnapshot();
      const organized = organize(snapshot);
      const manifest = {
        app: 'Dalbran Distribuidora',
        type: 'backup_organizado',
        exportedAt: nowIso(),
        structure: 'PDV BACKUP/{VENDAS|ORCAMENTOS}/AAAA/MM + PRODUTOS + CLIENTES + CONFIGURACOES + BACKUPS_COMPLETOS',
        data: organized
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dalbran-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return 'Backend ainda não configurado — backup organizado exportado localmente.';
    } catch (e) {
      return 'Não foi possível gerar o backup local: ' + e.message;
    }
  }

  function computeNextBackup(values) {
    const freq = values.backupFrequency || settings.frequency || 'manual';
    const ms = FREQ_MS[freq];
    if (!ms) return null;
    return new Date(Date.now() + ms).toISOString();
  }

  // ---------------------------------------------------------------
  // Venda concluída → sincronização incremental
  // ---------------------------------------------------------------
  async function onSaleCompleted(sale) {
    try {
      await ensureLoaded();
      const values = await driveValues();
      const enabled = values.backupEnabled !== undefined ? values.backupEnabled : settings.enabled;
      if (!enabled || !sale) return;
      const freq = values.backupFrequency || settings.frequency;

      if (freq === 'real_time') {
        const result = await callBackend('driveBackup', { kind: 'incremental', sale, options: { folder: values.backupFolder || settings.folder } });
        await writeSettings({ lastBackupAt: nowIso(), lastBackupStatus: 'success', lastBackupDetail: `Venda ${sale.numero || ''} sincronizada com o Drive.` });
        return result;
      }
      await writeSettings({ pendingIncremental: (settings.pendingIncremental || 0) + 1 });
    } catch (e) { /* silencioso — aguardará o próximo ciclo */ }
  }

  // ---------------------------------------------------------------
  // Agendamento (executado periodicamente e ao voltar para o app)
  // ---------------------------------------------------------------
  async function schedulerTick() {
    try {
      await ensureLoaded();
      const values = await driveValues();
      const enabled = values.backupEnabled !== undefined ? values.backupEnabled : settings.enabled;
      if (!enabled) return;
      const freq = values.backupFrequency || settings.frequency;

      if (freq === 'manual' || freq === 'real_time') {
        if ((settings.pendingIncremental || 0) > 0 && freq === 'real_time') {
          await writeSettings({ pendingIncremental: 0 });
          performBackupNow('full');
        }
        return;
      }
      if (settings.nextBackupAt && new Date(settings.nextBackupAt) <= new Date()) {
        performBackupNow('full');
      }
    } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Conexão com a conta Google (fluxo OAuth no backend)
  // ---------------------------------------------------------------
  async function driveConnect() {
    try {
      const result = await callBackend('driveAuthUrl', {});
      const url = result && result.url;
      if (!url) throw new Error('Sem URL de autorização retornada.');
      window.open(url, '_blank', 'noopener');
      window.drivePollStatus();
    } catch (err) {
      alert(
        'Para conectar o Google Drive é preciso implantar o backend (Cloud Functions).\n\n' +
        'Siga o guia em functions/README.md e depois tente novamente.\n\nDetalhe: ' + (err && err.message)
      );
    }
  }

  async function checkDriveStatus() {
    try {
      const result = await callBackend('driveStatus', {});
      const connected = !!(result && result.connected);
      try {
        await db.collection('api_credentials').doc('drive').set({
          status: connected ? 'connected' : 'disconnected',
          connectedEmail: (result && result.email) || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {}
      return result;
    } catch (e) {
      try { await db.collection('api_credentials').doc('drive').set({ status: 'disconnected' }, { merge: true }); } catch (_) {}
      throw e;
    }
  }

  function pollDriveStatus(attempts) {
    attempts = attempts || 0;
    if (attempts > 60) { emitChange(); return; }
    setTimeout(async () => {
      try {
        const st = await checkDriveStatus();
        if (st && st.connected) { emitChange(); return; }
      } catch (e) {}
      pollDriveStatus(attempts + 1);
    }, 3000);
  }

  async function driveTest() {
    try {
      const result = await checkDriveStatus();
      if (result && result.connected) {
        alert('Conectado ao Google Drive como: ' + (result.email || 'conta Google'));
        return true;
      }
      alert('Nenhuma conta conectada. Use "Conectar conta Google".');
      return false;
    } catch (err) {
      alert('Backend não configurado: ' + (err && err.message));
      return false;
    }
  }

  async function driveDisconnect() {
    try {
      await callBackend('driveDisconnect', {});
      try {
        await db.collection('api_credentials').doc('drive').set({ status: 'disconnected', connectedEmail: '' }, { merge: true });
      } catch (e) {}
      emitChange();
      alert('Conta Google desconectada.');
    } catch (err) {
      alert('Não foi possível desconectar: ' + (err && err.message));
    }
  }

  function ensureLoaded() { return loaded ? Promise.resolve() : loadSettings(); }

  // ---------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------
  const DriveBackup = {
    init: () => {},
    getConfig: () => settings,
    readSettings: async () => { await ensureLoaded(); return settings; },
    onSaleCompleted,
    performBackupNow,
    driveConnect,
    driveTest,
    driveDisconnect,
    checkStatus: checkDriveStatus
  };

  window.DriveBackup = DriveBackup;
  window.driveBackupNow = () => performBackupNow('full');
  window.driveConnect = () => driveConnect();
  window.driveTest = () => driveTest();
  window.driveDisconnect = () => driveDisconnect();
  window.drivePollStatus = () => pollDriveStatus(0);

  // ---------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    setInterval(schedulerTick, 60 * 1000);
    window.addEventListener('focus', schedulerTick);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedulerTick(); });

    if (typeof auth !== 'undefined') {
      auth.onAuthStateChanged(user => { if (user && !loaded) loadSettings(); });
    }

    // Retorno do OAuth: API.html?drive=connected
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('drive') === 'connected') {
        window.drivePollStatus(0);
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }
      }
    } catch (e) {}
  });
})();