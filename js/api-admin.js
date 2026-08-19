/**
 * Página Administrativa de APIs (API.html)
 *
 * Área independente e protegida para gerenciamento das integrações.
 * - Autenticação: reutiliza o Firebase Auth do app.
 * - Camada extra: chave secreta obrigatória (hash armazenado no Firestore,
 *   nunca em texto puro no cliente).
 * - Credenciais: armazenadas no Firestore (coleção api_credentials), exibidas
 *   apenas mascaradas (••••••••ABCD). A arquitetura está preparada para
 *   mover o armazenamento para backend/servidor seguro.
 */

(function() {
  'use strict';

  const CONFIG = window.API_CONF || { integrations: [], collection: 'api_credentials', accessDoc: 'apiAccess' };
  const INTEGRATIONS = Array.isArray(CONFIG.integrations) ? CONFIG.integrations : [];
  const COLLECTION = CONFIG.collection || 'api_credentials';
  const ACCESS_DOC = CONFIG.accessDoc || 'apiAccess';

  let state = {
    unlocked: false,
    cache: {}   // { integrationId: { values: {...}, status, enabled, lastTest } }
  };

  // ---------------------------------------------------------------
  // Utilitários
  // ---------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function apiToast(message, type) {
    const el = $('api-toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'api-toast show' + (type ? ' toast-' + type : '');
    clearTimeout(apiToast._t);
    apiToast._t = setTimeout(() => { el.classList.remove('show'); }, 3200);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function maskValue(value) {
    const str = String(value == null ? '' : value);
    if (!str) return '';
    const tail = str.slice(-4);
    return '••••••••••••' + tail;
  }

  // SHA-256 (hex) via Web Crypto — sem expor o valor em texto puro.
  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function saveAccessSecret(secret) {
    const salt = 'dalbran-api-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    const hash = await sha256(salt + secret);
    await db.collection('settings').doc(ACCESS_DOC).set({
      salt,
      hash,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function verifyAccessSecret(secret) {
    const doc = await db.collection('settings').doc(ACCESS_DOC).get();
    if (!doc.exists) return { valid: false, configured: false };
    const data = doc.data() || {};
    const hash = await sha256((data.salt || '') + secret);
    return { valid: hash === data.hash, configured: true };
  }

  async function hasAccessSecretConfigured() {
    const doc = await db.collection('settings').doc(ACCESS_DOC).get();
    return doc.exists && !!(doc.data() || {}).hash;
  }

  // ---------------------------------------------------------------
  // Navegação entre telas
  // ---------------------------------------------------------------
  function showScreen(screen) {
    ['api-login-screen', 'api-secret-screen', 'api-main-screen'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = (id === screen) ? 'block' : 'none';
    });
  }

  function renderUserInfo() {
    const role = window.isMasterUser === true ? 'master' : 'operador';
    const badge = $('api-role-badge');
    if (badge) {
      badge.textContent = role;
      badge.className = 'api-btn api-btn-ghost' + (role === 'master' ? ' api-role-master' : '');
    }
  }

  // ---------------------------------------------------------------
  // Login (Firebase Auth)
  // ---------------------------------------------------------------
  async function handleLogin(e) {
    e.preventDefault();
    const email = $('api-login-email').value.trim();
    const password = $('api-login-password').value;
    const errorEl = $('api-login-error');
    errorEl.style.display = 'none';
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      errorEl.textContent = 'E-mail ou senha incorretos.';
      errorEl.style.display = 'block';
    }
  }

  // ---------------------------------------------------------------
  // Chave secreta (configuração e verificação)
  // ---------------------------------------------------------------
  async function openSecretGate() {
    const configured = await hasAccessSecretConfigured();
    if (configured) {
      $('api-secret-title').textContent = 'Acesso protegido';
      $('api-secret-subtitle').textContent = 'Informe a chave secreta para gerenciar as APIs.';
      $('api-secret-setup').style.display = 'none';
      $('api-secret-form').style.display = 'block';
      $('api-secret-action').textContent = 'Desbloquear área';
    } else {
      $('api-secret-title').textContent = 'Configurar acesso';
      $('api-secret-subtitle').textContent = 'Defina uma chave secreta. Ela será obrigatória para acessar e modificar as APIs.';
      $('api-secret-setup').style.display = 'block';
      $('api-secret-form').style.display = 'block';
      $('api-secret-action').textContent = 'Criar chave de acesso';
    }
    showScreen('api-secret-screen');
  }

  async function handleSecretSubmit(e) {
    e.preventDefault();
    const secret = $('api-secret-input').value;
    if (!secret || secret.length < 6) {
      apiToast('A chave deve ter pelo menos 6 caracteres.', 'error');
      return;
    }
    const configured = await hasAccessSecretConfigured();
    if (!configured) {
      // Apenas o usuário master pode definir a chave.
      if (window.isMasterUser !== true) {
        apiToast('Somente o usuário master pode definir a chave secreta.', 'error');
        return;
      }
      await saveAccessSecret(secret);
      state.unlocked = true;
      apiToast('Chave criada com sucesso!', 'success');
      enterAdminArea();
      return;
    }
    const result = await verifyAccessSecret(secret);
    if (!result.valid) {
      apiToast('Chave secreta incorreta.', 'error');
      return;
    }
    state.unlocked = true;
    apiToast('Acesso liberado.', 'success');
    enterAdminArea();
  }

  async function enterAdminArea() {
    if (!state.unlocked) return;
    showScreen('api-main-screen');
    renderUserInfo();
    await renderIntegrations();
  }

  // ---------------------------------------------------------------
  // Credenciais (Firestore) — apenas mascaradas na interface
  // ---------------------------------------------------------------
  async function loadIntegration(integrationId) {
    const doc = await db.collection(COLLECTION).doc(integrationId).get();
    const data = doc.exists ? (doc.data() || {}) : {};
    state.cache[integrationId] = {
      values: data.values || {},
      status: data.status || 'disconnected',
      enabled: data.enabled !== false,
      lastTest: data.lastTest || null
    };
    return state.cache[integrationId];
  }

  async function saveIntegration(integrationId, patch) {
    const current = state.cache[integrationId] || {};
    const next = {
      values: patch.values !== undefined ? patch.values : (current.values || {}),
      status: patch.status !== undefined ? patch.status : (current.status || 'disconnected'),
      enabled: patch.enabled !== undefined ? patch.enabled : (current.enabled !== false),
      lastTest: patch.lastTest !== undefined ? patch.lastTest : (current.lastTest || null),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection(COLLECTION).doc(integrationId).set(next, { merge: true });
    state.cache[integrationId] = next;
  }

  // ---------------------------------------------------------------
  // Renderização dos blocos de integração (modular)
  // ---------------------------------------------------------------
  async function renderIntegrations() {
    const grid = $('api-integrations-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const integration of INTEGRATIONS) {
      const data = await loadIntegration(integration.id);
      const statusChip = renderStatusChip(data);
      const credRows = renderCredRows(integration, data);
      const panelHtml = integration.panel === 'drive' ? '<div class="api-drive-panel" id="api-drive-panel"></div>' : '';

      const card = document.createElement('div');
      card.className = 'api-card';
      card.id = 'api-card-' + integration.id;
      card.innerHTML = `
        <div class="api-card-header">
          <div class="api-card-icon" style="background:${integration.color || '#0284c7'}"><i class="ph ${integration.icon || 'ph-plug'}" aria-hidden="true"></i></div>
          <div class="api-card-title">
            <h3>${escapeHtml(integration.name)}</h3>
            <p>${escapeHtml(integration.description || '')}</p>
          </div>
          ${statusChip}
        </div>
        <div class="api-card-body">
          ${credRows}
          ${panelHtml}
          <div class="api-card-actions">
            ${renderActions(integration, data)}
          </div>
        </div>
      `;
      grid.appendChild(card);

      if (integration.panel === 'drive') renderDrivePanel(integration.id);
    }
  }

  // ---------------------------------------------------------------
  // Painel específico: Google Drive / Backup Automático
  // ---------------------------------------------------------------
  function formatApiDate(iso) {
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  async function renderDrivePanel(integrationId) {
    const container = $('api-drive-panel');
    if (!container) return;
    const data = state.cache[integrationId] || {};
    const values = data.values || {};

    let runtime = {};
    if (window.DriveBackup && window.DriveBackup.readSettings) {
      try { runtime = await window.DriveBackup.readSettings(); } catch (e) {}
    }

    const connected = data.status === 'connected';
    const enabled = values.backupEnabled === true;
    const freq = values.backupFrequency || 'manual';
    const folder = values.backupFolder || 'PDV BACKUP';
    const retention = values.retentionCount || 10;
    const lastAt = runtime.lastBackupAt;
    const nextAt = runtime.nextBackupAt;
    const lastStatus = runtime.lastBackupStatus || 'none';
    const lastDetail = runtime.lastBackupDetail;

    const freqLabel = {
      real_time: 'A cada venda concluída',
      hourly: 'Por hora',
      daily: 'Diário',
      weekly: 'Semanal',
      manual: 'Somente manual'
    }[freq] || freq;

    const statusMap = {
      success: '<span class="api-backup-ok"><i class="ph ph-check-circle" aria-hidden="true"></i> Sucesso</span>',
      running: '<span class="api-backup-run"><i class="ph ph-spinner-gap" aria-hidden="true"></i> Em andamento</span>',
      error: '<span class="api-backup-err"><i class="ph ph-x-circle" aria-hidden="true"></i> Falha</span>',
      fallback_local: '<span class="api-backup-warn"><i class="ph ph-download-simple" aria-hidden="true"></i> Exportado local</span>'
    };
    const lastStatusHtml = !lastAt ? '<span class="api-cred-empty">Nenhum backup realizado</span>' : (statusMap[lastStatus] || '<span class="api-cred-empty">—</span>');

    container.innerHTML = `
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-google-drive-logo" aria-hidden="true"></i> Conta conectada</span>
        <span class="api-cred-value">${connected ? escapeHtml(data.connectedEmail || 'Conta Google') : 'Nenhuma conta'}</span>
      </div>
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-timer" aria-hidden="true"></i> Backup automático</span>
        <span class="api-drive-switch">
          <input type="checkbox" id="api-drive-enabled" ${enabled ? 'checked' : ''} onchange="window.driveSetEnabled(this.checked)">
          <label for="api-drive-enabled">${enabled ? 'Ativo' : 'Inativo'}</label>
        </span>
      </div>
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-repeat" aria-hidden="true"></i> Frequência</span>
        <span class="api-cred-value">${escapeHtml(freqLabel)}</span>
      </div>
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-folder" aria-hidden="true"></i> Pasta principal</span>
        <span class="api-cred-value">${escapeHtml(folder)}</span>
      </div>
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i> Último backup</span>
        <span class="api-cred-value">${lastAt ? escapeHtml(formatApiDate(lastAt)) : '—'}</span>
      </div>
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-calendar-blank" aria-hidden="true"></i> Próximo backup</span>
        <span class="api-cred-value">${nextAt ? escapeHtml(formatApiDate(nextAt)) : '—'}</span>
      </div>
      <div class="api-drive-row">
        <span class="api-cred-label"><i class="ph ph-info" aria-hidden="true"></i> Status do último backup</span>
        <span class="api-cred-value">${lastStatusHtml} ${lastDetail ? '<br><small class="api-drive-detail">' + escapeHtml(lastDetail) + '</small>' : ''}</span>
      </div>
      <div class="api-drive-tree">
        <strong><i class="ph ph-tree-structure" aria-hidden="true"></i> Estrutura criada no Drive</strong>
        <pre>${escapeHtml(folder)}/
├── VENDAS/        (ano/mês)
├── ORCAMENTOS/    (ano/mês)
├── PRODUTOS/
├── CLIENTES/
├── CONFIGURACOES/
└── BACKUPS_COMPLETOS/   (mantém últimos ${escapeHtml(String(retention))})</pre>
        <small class="api-drive-note">A autenticação OAuth e os tokens ficam no backend (Cloud Functions). Nenhuma credencial é gravada neste aplicativo.</small>
      </div>
    `;
  }

  function renderStatusChip(data) {
    if (data.status === 'connected') {
      return `<span class="api-status-chip api-status-connected"><i class="ph ph-check-circle" aria-hidden="true"></i> Conectada</span>`;
    }
    if (data.status === 'configured') {
      return `<span class="api-status-chip api-status-configured"><i class="ph ph-sliders-horizontal" aria-hidden="true"></i> Configurada</span>`;
    }
    return `<span class="api-status-chip api-status-disconnected"><i class="ph ph-plug" aria-hidden="true"></i> Desconectada</span>`;
  }

  function renderCredRows(integration, data) {
    if (integration.panel === 'drive') return '';
    const rows = integration.fields.map(field => {
      const has = !!data.values[field.key];
      return `
        <div class="api-cred-row">
          <span class="api-cred-label"><i class="ph ${field.secret ? 'ph-lock' : 'ph-key'}" aria-hidden="true"></i> ${escapeHtml(field.label)}</span>
          <span class="api-cred-value ${has ? 'api-cred-masked' : 'api-cred-empty'}">${has ? maskValue(data.values[field.key]) : 'Não configurado'}</span>
        </div>
      `;
    }).join('');
    return rows;
  }

  function renderActions(integration, data) {
    return integration.actions.map(action => {
      if (action === 'conectar') {
        return `<button type="button" class="api-btn api-btn-primary" onclick="window.driveConnect()"><i class="ph ph-google-drive-logo" aria-hidden="true"></i> Conectar conta Google</button>`;
      }
      if (action === 'configurar') {
        return `<button type="button" class="api-btn" onclick="window.openApiConfig('${integration.id}')"><i class="ph ph-pencil-simple" aria-hidden="true"></i> Configurar</button>`;
      }
      if (action === 'backup_agora') {
        return `<button type="button" class="api-btn api-btn-success" onclick="window.driveBackupNow()"><i class="ph ph-cloud-arrow-up" aria-hidden="true"></i> Fazer backup agora</button>`;
      }
      if (action === 'testar') {
        return `<button type="button" class="api-btn" onclick="window.testApiConnection('${integration.id}')"><i class="ph ph-pulse" aria-hidden="true"></i> Testar conexão</button>`;
      }
      if (action === 'desconectar') {
        return `<button type="button" class="api-btn api-btn-danger" onclick="window.disconnectApi('${integration.id}')"><i class="ph ph-plug" aria-hidden="true"></i> Desconectar</button>`;
      }
      return '';
    }).join('');
  }

  // ---------------------------------------------------------------
  // Modal de configuração de credenciais
  // ---------------------------------------------------------------
  function openConfigModal(integrationId) {
    const integration = INTEGRATIONS.find(i => i.id === integrationId);
    if (!integration) return;
    const data = state.cache[integrationId] || { values: {}, status: 'disconnected', enabled: true };

    const fieldsHtml = integration.fields.map(field => {
      const value = data.values[field.key];
      if (field.type === 'checkbox') {
        return `
          <div class="api-field">
            <label style="display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:0;">
              <input id="api-field-${field.key}" type="checkbox" ${value ? 'checked' : ''}> ${escapeHtml(field.label)}
            </label>
            <small style="color:var(--api-muted);font-size:.7rem;">Ligado, o sistema sincroniza vendas e executa backups conforme a frequência.</small>
          </div>`;
      }
      if (field.type === 'select') {
        const options = (field.options || []).map(opt => {
          const label = (field.optionLabels && field.optionLabels[opt]) || opt;
          return `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
        return `
          <div class="api-field">
            <label>${escapeHtml(field.label)}</label>
            <select id="api-field-${field.key}">${options}</select>
          </div>`;
      }
      const inputType = field.type === 'number' ? 'number' : (field.secret ? 'password' : 'text');
      const secretNote = field.secret ? '<small style="color:var(--api-muted);font-size:.7rem;">Armazenado de forma segura e exibido apenas mascarado.</small>' : '';
      return `
        <div class="api-field">
          <label>${escapeHtml(field.label)} ${field.secret ? '<i class="ph ph-lock" aria-hidden="true"></i>' : ''}</label>
          <input id="api-field-${field.key}" type="${inputType}" value="${escapeHtml(value != null ? value : '')}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.secret ? 'autocomplete="new-password"' : ''}>
          ${secretNote}
        </div>`;
    }).join('');

    $('api-modal-title').textContent = 'Configurar ' + integration.name;
    $('api-modal-subtitle').textContent = integration.id === 'drive'
      ? 'Ajuste o comportamento do backup automático. A conexão com a conta Google é feita pelo botão "Conectar conta Google" e os tokens ficam no backend.'
      : 'Preencha as credenciais da integração. Os valores são armazenados no banco de forma protegida.';
    $('api-modal-body').innerHTML = fieldsHtml;
    $('api-modal-body').dataset.integrationId = integrationId;
    $('api-modal-save').textContent = 'Salvar credenciais';
    $('api-modal-delete').style.display = 'block';
    $('api-modal-backdrop').classList.add('open');
  }

  async function saveConfigFromModal() {
    const integrationId = $('api-modal-body').dataset.integrationId;
    const integration = INTEGRATIONS.find(i => i.id === integrationId);
    if (!integration) return;
    const values = {};
    integration.fields.forEach(field => {
      const input = $('api-field-' + field.key);
      if (!input) return;
      if (field.type === 'checkbox') values[field.key] = input.checked;
      else if (field.type === 'number') values[field.key] = parseFloat(input.value) || 0;
      else values[field.key] = input.value.trim();
    });
    const hasAny = Object.values(values).some(v => !!v || v === true);
    await saveIntegration(integrationId, { values, status: hasAny ? 'configured' : 'disconnected' });
    closeApiModal();
    apiToast('Configuração salva com sucesso.', 'success');
    await renderIntegrations();
  }

  async function removeConfigFromModal() {
    const integrationId = $('api-modal-body').dataset.integrationId;
    await saveIntegration(integrationId, { values: {}, status: 'disconnected' });
    closeApiModal();
    apiToast('Credenciais removidas.', 'info');
    await renderIntegrations();
  }

  function closeApiModal() {
    $('api-modal-backdrop').classList.remove('open');
  }

  // ---------------------------------------------------------------
  // Teste de conexão (preparado — usa o provedor configurado)
  // ---------------------------------------------------------------
  async function testConnection(integrationId) {
    const integration = INTEGRATIONS.find(i => i.id === integrationId);
    if (!integration) return;

    if (integration.id === 'drive') {
      const ok = await window.driveTest();
      await renderIntegrations();
      return ok;
    }

    const data = state.cache[integrationId] || { values: {}, status: 'disconnected', enabled: true };

    if (integration.id === 'ai') {
      const provider = data.values.provider || 'gemini';
      const apiKey = data.values.apiKey || '';
      if (!apiKey) {
        apiToast('Configure a API Key antes de testar.', 'error');
        return;
      }
      if (provider === 'gemini') {
        try {
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey));
          if (res.ok) {
            await saveIntegration('ai', { status: 'connected', lastTest: new Date().toISOString() });
            apiToast('Conexão com Gemini OK.', 'success');
          } else {
            await saveIntegration('ai', { status: 'configured' });
            apiToast('Falha na conexão: chave inválida ou sem permissão.', 'error');
          }
        } catch (err) {
          await saveIntegration('ai', { status: 'configured' });
          apiToast('Erro de rede ao testar a conexão.', 'error');
        }
      } else {
        apiToast(`Teste para o provedor "${provider}" será ativado em breve.`, 'info');
      }
    } else if (integration.id === 'gmail') {
      apiToast('Gmail: integração OAuth em preparação. Configure as credenciais.', 'info');
    }
    await renderIntegrations();
  }

  async function disconnect(integrationId) {
    if (integrationId === 'drive') {
      await window.driveDisconnect();
      await renderIntegrations();
      return;
    }
    await saveIntegration(integrationId, { status: 'disconnected' });
    apiToast('Integração desconectada.', 'info');
    await renderIntegrations();
  }

  window.driveSetEnabled = async function(checked) {
    const data = state.cache['drive'] || { values: {} };
    const values = { ...(data.values || {}), backupEnabled: checked };
    await saveIntegration('drive', { values });
    apiToast(checked ? 'Backup automático ativado.' : 'Backup automático desativado.', 'info');
    await renderIntegrations();
  };

  // ---------------------------------------------------------------
  // Expõe funções para onclick (escopo global da página)
  // ---------------------------------------------------------------
  window.openApiConfig = function(id) { openConfigModal(id); };
  window.testApiConnection = function(id) { testConnection(id); };
  window.disconnectApi = function(id) { disconnect(id); };
  window.saveApiConfig = function() { saveConfigFromModal(); };
  window.removeApiConfig = function() { removeConfigFromModal(); };
  window.closeApiModal = function() { closeApiModal(); };

  // ---------------------------------------------------------------
  // Tema escuro
  // ---------------------------------------------------------------
  function applyTheme() {
    document.body.classList.toggle('api-dark', document.body.classList.contains('theme-dark'));
  }

  function toggleTheme() {
    document.body.classList.toggle('theme-dark');
    document.body.classList.toggle('api-dark', document.body.classList.contains('theme-dark'));
    try { localStorage.setItem('api-theme', document.body.classList.contains('theme-dark') ? 'dark' : 'light'); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------
  function setup() {
    try {
      const savedTheme = localStorage.getItem('api-theme');
      if (savedTheme === 'dark') document.body.classList.add('theme-dark');
      applyTheme();
    } catch (e) {}

    $('api-login-form').addEventListener('submit', handleLogin);
    $('api-secret-form').addEventListener('submit', handleSecretSubmit);
    $('api-btn-logout').addEventListener('click', () => auth.signOut());
    $('api-btn-theme').addEventListener('click', toggleTheme);
    $('api-btn-back').addEventListener('click', () => { window.history.length > 1 ? window.history.back() : window.location.href = 'index.html'; });
    $('api-modal-backdrop').addEventListener('click', (e) => { if (e.target === $('api-modal-backdrop')) closeApiModal(); });
    $('api-modal-cancel').addEventListener('click', closeApiModal);
    $('api-modal-save').addEventListener('click', saveConfigFromModal);
    $('api-modal-delete').addEventListener('click', removeConfigFromModal);

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        state.unlocked = false;
        showScreen('api-login-screen');
        return;
      }
      // Determina papel (master/operador) do usuário atual
      try {
        const snap = await db.collection('users').where('email', '==', user.email).limit(1).get();
        window.isMasterUser = !snap.empty && (snap.docs[0].data().papel === 'master');
      } catch (e) {
        window.isMasterUser = false;
      }
      if (window.isMasterUser !== true) {
        apiToast('Somente o usuário master pode acessar a área de APIs.', 'error');
        // Mantém na tela de login para tentar outra conta
        showScreen('api-login-screen');
        return;
      }
      await openSecretGate();
    });
  }

  document.addEventListener('DOMContentLoaded', setup);
})();