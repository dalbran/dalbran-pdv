/**
 * Módulo de Configurações da Empresa, Taxas de Cartão e Parâmetros Comerciais
 */

let currentSettings = {
  nomeFantasia: "DALBRAN DISTRIBUIDORA",
  razaoSocial: "Dalbran do Brasil-Distribuidora, Comercio e Servicos LTDA",
  cnpj: "03.822.789/0001-54",
  telefone: "",
  whatsapp: "",
  email: "",
  endereco: "",
  taxaDebito: 1.5,
  taxaCredito: 3.5,
  metodoCalculoTaxa: "add", // 'add' ou 'liquid'
  prazoValidadeDias: 1,
  avisoEstoque: "Este orçamento possui validade limitada e está sujeito à disponibilidade de estoque, podendo os produtos esgotar sem aviso prévio.",
  mensagemPadrao: "Agradecemos a preferência!",
  formatoPadraoCupom: "80mm",
  fonteCupom: "Arial",
  tamanhoFonteCupom: 12,
  exibirAvisoNoCupom: true,
  compartilharWhatsAppAtivo: true,
  pixKey: "21998852318",
  pixCidade: "RIO DE JANEIRO",
  pixKeyCnpj: "03822789000154",
  pixTipo: "celular",
  pixRecebedor: "",
  mensagemRecibo: "",
  mensagemOrcamento: "",
  mensagemPedido: "",
  formatoData: "dd/mm/aaaa",
  formatoMoeda: "BRL",
  sincronizacaoAutomatica: true,
  logoUrl: "",
  logoLoginUrl: "logodash.png",
  logoHeaderUrl: "logoweb2.png",
  logoCupomUrl: "logoweb2.png",
  boletoUrl: "",
  gmailRemetente: "",
  updateManifestUrl: "https://dalbran.github.io/dalbran-pdv/versao.json",
  updateApkUrl: "https://github.com/dalbran/dalbran-pdv/releases/download/v{VERSION}/Dalbran-v{VERSION}.apk",
  updateChannel: "stable",
  updateCheckOnStart: true,
  updateCheckWeb: true,
  updateCheckApk: true,
  updateIntervalMinutes: 0
};
window.operatorsCache = [];

function ensureCurrentOperator(user) {
  if (!user?.email) return;
  db.collection('users').where('email', '==', user.email).limit(1).get().then(async snapshot => {
    if (!snapshot.empty) return;
    const masters = await db.collection('users').where('papel', '==', 'master').limit(1).get();
    return db.collection('users').add({ nome: user.displayName || user.email.split('@')[0], email: user.email, ativo: true, papel: masters.empty ? 'master' : 'operador', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  }).catch(error => console.error('Erro ao registrar operador atual:', error));
}

function initOperatorsModule() {
  db.collection('users').orderBy('nome', 'asc').onSnapshot(snapshot => {
    const allOps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(operator => operator.ativo !== false);
    // Deduplicate by email — keep only one entry per email (the first/oldest)
    const seen = new Set();
    window.operatorsCache = allOps.filter(op => {
      const key = (op.email || '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    window.currentOperator = window.operatorsCache.find(operator => operator.email === auth.currentUser?.email) || null;
    window.isMasterUser = window.currentOperator?.papel === 'master';
    if (typeof window.populateVendedorSelect === 'function') window.populateVendedorSelect();
    if (document.getElementById('operators-list')) renderOperatorsList();
  }, error => console.error('Erro ao carregar operadores:', error));
}

document.addEventListener('DOMContentLoaded', () => {
  if (auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        initSettingsModule();
        ensureCurrentOperator(user);
        initOperatorsModule();
      }
    });
  }
});

// Inicializa escuta das configurações no Firestore
function initSettingsModule() {
  const settingsDoc = db.collection('settings').doc('company');

  settingsDoc.onSnapshot((doc) => {
    if (doc.exists) {
      currentSettings = { ...currentSettings, ...doc.data() };
    } else {
      // Cria registro inicial com valores padrão
      settingsDoc.set(currentSettings).catch(err => console.error("Erro ao criar settings iniciais:", err));
    }
    applyCompanyBranding();
    renderSettingsView();
  }, (error) => {
    console.error("Erro ao carregar configurações:", error);
  });
}

function applyCompanyBranding() {
  const name = currentSettings.nomeFantasia || 'DALBRAN';
  ['login-brand-name'].forEach(id => { const element = document.getElementById(id); if (element) element.textContent = name; });
  const logos = { 'login-logo-image': currentSettings.logoLoginUrl || currentSettings.logoUrl, 'header-logo-image': currentSettings.logoHeaderUrl === 'logoweb.png' ? 'logoweb2.png' : (currentSettings.logoHeaderUrl || currentSettings.logoUrl) };
  Object.entries(logos).forEach(([id, url]) => { const image = document.getElementById(id); if (!image) return; image.src = url || ''; image.classList.toggle('hidden', !url); });
}

// Renderiza a Interface de Configurações
function renderSettingsView() {
  const container = document.getElementById('view-configuracoes');
  if (!container) return;

  const masterOnly = window.isMasterUser === false ? 'disabled' : '';
  const masterNotice = window.isMasterUser === false ? '<p class="master-notice">Somente o usuário master pode editar as configurações da empresa.</p>' : '';
  container.innerHTML = `
    <div class="view-header" style="margin-bottom:1.5rem;">
      <h2>Configurações do Sistema</h2>
    </div>

    <div class="settings-blocks">

      <!-- BLOCO 1: Usuário e Sessão -->
      <section class="settings-block" aria-label="Usuário e sessão">
        <div class="settings-block-header"><i class="ph ph-user-circle" aria-hidden="true"></i><div><h3>Usuário e Sessão</h3><p>Conta conectada, perfil, login e preferências do usuário.</p></div></div>
        <div class="settings-block-body">
          <div class="mobile-appearance-panel" aria-label="Aparência no celular">
            <div><h3>Aparência</h3><p>Personalize a leitura neste telefone.</p></div>
            <div class="mobile-appearance-actions">
              <div class="mobile-text-size-control"><span>Tamanho do texto</span><div><button type="button" id="mobile-settings-font-decrease" aria-label="Diminuir texto">A−</button><strong id="mobile-settings-font-size">100%</strong><button type="button" id="mobile-settings-font-increase" aria-label="Aumentar texto">A+</button></div></div>
              <button type="button" class="mobile-theme-control" id="mobile-settings-theme"><i class="ph ph-moon" aria-hidden="true"></i><span>Modo escuro</span></button>
            </div>
          </div>
          <div class="mobile-account-panel" aria-label="Conta conectada">
            <i class="ph ph-user-circle" aria-hidden="true"></i>
            <div><h3>Conta conectada</h3><p>${auth?.currentUser?.email || 'Usuário conectado'}</p></div>
            <button type="button" id="mobile-settings-logout">Sair</button>
          </div>
        </div>
      </section>

      ${masterNotice}<form id="form-settings">

      <!-- BLOCO 2: Impressão e Recibos -->
      <section class="settings-block" aria-label="Impressão e recibos">
        <div class="settings-block-header"><i class="ph ph-printer" aria-hidden="true"></i><div><h3>Impressão e Recibos</h3><p>Impressora, formato do cupom, fonte e conteúdo do recibo.</p></div></div>
        <div class="settings-block-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:0.5rem;">
            <div class="form-group"><label>Formato padrão de impressão</label><select id="set-formatoPadraoCupom"><option value="a4" ${currentSettings.formatoPadraoCupom === 'a4' ? 'selected' : ''}>A4 / PDF</option><option value="80mm" ${currentSettings.formatoPadraoCupom === '80mm' ? 'selected' : ''}>Cupom térmico 80 mm</option><option value="58mm" ${currentSettings.formatoPadraoCupom === '58mm' ? 'selected' : ''}>Cupom térmico 58 mm</option></select></div>
            <div class="form-group"><label>Fonte do cupom</label><select id="set-fonteCupom"><option value="Arial" ${currentSettings.fonteCupom === 'Arial' ? 'selected' : ''}>Arial</option><option value="Courier New" ${currentSettings.fonteCupom === 'Courier New' ? 'selected' : ''}>Courier New</option><option value="Verdana" ${currentSettings.fonteCupom === 'Verdana' ? 'selected' : ''}>Verdana</option></select></div>
            <div class="form-group"><label>Tamanho da fonte (px)</label><input id="set-tamanhoFonteCupom" type="number" step="1" inputmode="numeric" pattern="[0-9]*" min="8" max="18" value="${currentSettings.tamanhoFonteCupom || 12}" autocomplete="off" data-numeric-only="int"></div>
          </div>
          <div class="form-group"><label>Rodapé / Mensagem final do recibo</label><textarea id="set-mensagemPadrao" rows="2">${currentSettings.mensagemPadrao || ''}</textarea></div>
          <div class="form-group"><label>Aviso de estoque / validade (exibido no cupom)</label><textarea id="set-avisoEstoque" rows="2">${currentSettings.avisoEstoque || ''}</textarea></div>
          <div style="display:flex;gap:1.5rem;flex-wrap:wrap;"><label><input id="set-exibirAvisoNoCupom" type="checkbox" ${currentSettings.exibirAvisoNoCupom !== false ? 'checked' : ''}> Exibir aviso/validade no cupom</label></div>
        </div>
      </section>

      <!-- BLOCO 3: Empresa e Branding -->
      <section class="settings-block" aria-label="Empresa e branding">
        <div class="settings-block-header"><i class="ph ph-buildings" aria-hidden="true"></i><div><h3>Empresa e Branding</h3><p>Identidade da empresa exibida em recibos, vendas e documentos.</p></div></div>
        <div class="settings-block-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:0.5rem;">
            <div class="form-group">
              <label>Nome Fantasia</label>
              <input type="text" id="set-nomeFantasia" value="${currentSettings.nomeFantasia || ''}" required>
            </div>
            <div class="form-group">
              <label>Razão Social</label>
              <input type="text" id="set-razaoSocial" value="${currentSettings.razaoSocial || ''}" required>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:1rem;">
            <div class="form-group">
              <label>CNPJ</label>
              <input type="text" id="set-cnpj" value="${currentSettings.cnpj || ''}">
            </div>
            <div class="form-group">
              <label>Telefone</label>
              <input type="text" id="set-telefone" value="${currentSettings.telefone || ''}">
            </div>
            <div class="form-group">
              <label>E-mail</label>
              <input type="email" id="set-email" value="${currentSettings.email || ''}">
            </div>
            <div class="form-group">
              <label>Endereço Completo</label>
              <input type="text" id="set-endereco" value="${currentSettings.endereco || ''}">
            </div>
          </div>
          <div class="brand-settings">
            <button type="button" id="btn-toggle-logo-settings" style="display:flex;align-items:center;gap:8px;background:none;border:none;padding:0;cursor:pointer;font-size:0.95rem;font-weight:700;color:var(--accent,#0284c7);margin-bottom:0.5rem;">
              <i class="ph ph-caret-right" id="logo-settings-caret" style="transition:transform 0.25s;"></i> Logo / Branding
            </button>
            <div id="logo-settings-body" style="display:none;">
              <p style="margin-bottom:0.75rem;font-size:0.85rem;color:#64748b;">Insira a URL da imagem ou faça o upload de um arquivo. Para cupom térmico, prefira logo simples, PNG, horizontal e compacta.</p>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem">
                <div class="form-group">
                  <label>Logo do login (URL ou arquivo)</label>
                  <input type="url" id="set-logoLoginUrl" value="${currentSettings.logoLoginUrl || currentSettings.logoUrl || ''}" placeholder="https://exemplo.com/logo-login.png">
                  <input type="file" id="set-logoLoginFile" accept="image/*" style="margin-top:4px;font-size:0.78rem;">
                  <small id="set-logoLoginPath" style="color:#64748b;font-size:0.72rem;word-break:break-all;">${currentSettings.logoLoginUrl ? 'Salvo: ' + currentSettings.logoLoginUrl : ''}</small>
                </div>
                <div class="form-group">
                  <label>Logo do cabeçalho (URL ou arquivo)</label>
                  <input type="url" id="set-logoHeaderUrl" value="${currentSettings.logoHeaderUrl === 'logoweb.png' ? 'logoweb2.png' : (currentSettings.logoHeaderUrl || currentSettings.logoUrl || '')}" placeholder="https://exemplo.com/logo-cabecalho.png">
                  <input type="file" id="set-logoHeaderFile" accept="image/*" style="margin-top:4px;font-size:0.78rem;">
                  <small id="set-logoHeaderPath" style="color:#64748b;font-size:0.72rem;word-break:break-all;">${currentSettings.logoHeaderUrl ? 'Salvo: ' + currentSettings.logoHeaderUrl : ''}</small>
                </div>
                <div class="form-group">
                  <label>Logo do cupom térmico (URL ou arquivo)</label>
                  <input type="url" id="set-logoCupomUrl" value="${currentSettings.logoCupomUrl || currentSettings.logoUrl || ''}" placeholder="https://exemplo.com/logo-cupom.png">
                  <input type="file" id="set-logoCupomFile" accept="image/*" style="margin-top:4px;font-size:0.78rem;">
                  <small id="set-logoCupomPath" style="color:#64748b;font-size:0.72rem;word-break:break-all;">${currentSettings.logoCupomUrl ? 'Salvo: ' + currentSettings.logoCupomUrl : ''}</small>
                </div>
              </div>
              <small style="color:#94a3b8;">Para térmica: PNG de até 384 px de largura, sem transparências complexas.</small>
            </div>
          </div>
        </div>
      </section>

      <!-- BLOCO 4: WhatsApp e Mensagens -->
      <section class="settings-block" aria-label="WhatsApp e mensagens">
        <div class="settings-block-header"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i><div><h3>WhatsApp e Mensagens</h3><p>Número padrão de envio e mensagens automáticas.</p></div></div>
        <div class="settings-block-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:0.5rem;">
            <div class="form-group"><label>Número de WhatsApp</label><input type="text" id="set-whatsapp" value="${currentSettings.whatsapp || ''}"></div>
            <div class="form-group"><label>WhatsApp remetente (preparação)</label><input id="set-gmailRemetente" type="text" value="${currentSettings.gmailRemetente || ''}" placeholder="número ou conta de envio"><small style="color:#94a3b8;">O envio automático será ativado depois com integração segura.</small></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
            <div class="form-group"><label>Mensagem de recibo</label><textarea id="set-mensagemRecibo" rows="2" placeholder="Usa a mensagem padrão quando vazio.">${currentSettings.mensagemRecibo || ''}</textarea></div>
            <div class="form-group"><label>Mensagem de orçamento</label><textarea id="set-mensagemOrcamento" rows="2" placeholder="Usa a mensagem padrão quando vazio.">${currentSettings.mensagemOrcamento || ''}</textarea></div>
            <div class="form-group"><label>Mensagem de pedido</label><textarea id="set-mensagemPedido" rows="2" placeholder="Usa a mensagem padrão quando vazio.">${currentSettings.mensagemPedido || ''}</textarea></div>
          </div>
          <div style="display:flex;gap:1.5rem;flex-wrap:wrap;"><label><input id="set-compartilharWhatsAppAtivo" type="checkbox" ${currentSettings.compartilharWhatsAppAtivo !== false ? 'checked' : ''}> Habilitar compartilhamento via WhatsApp</label></div>
        </div>
      </section>

      <!-- BLOCO 5: Pix e Pagamentos -->
      <section class="settings-block" aria-label="Pix e pagamentos">
        <div class="settings-block-header"><i class="ph ph-qr-code" aria-hidden="true"></i><div><h3>Pix e Pagamentos</h3><p>Chave Pix, recebedor e regras de pagamento exibidas no recibo.</p></div></div>
        <div class="settings-block-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:0.5rem;">
            <div class="form-group"><label>Chave PIX</label><input id="set-pixKey" inputmode="numeric" value="${currentSettings.pixKey || ''}"></div>
            <div class="form-group"><label>Tipo da chave PIX</label><select id="set-pixTipo"><option value="celular" ${(currentSettings.pixTipo || 'celular') === 'celular' ? 'selected' : ''}>Celular</option><option value="cnpj" ${currentSettings.pixTipo === 'cnpj' ? 'selected' : ''}>CNPJ</option><option value="cpf" ${currentSettings.pixTipo === 'cpf' ? 'selected' : ''}>CPF</option><option value="email" ${currentSettings.pixTipo === 'email' ? 'selected' : ''}>E-mail</option><option value="aleatoria" ${currentSettings.pixTipo === 'aleatoria' ? 'selected' : ''}>Chave aleatória</option></select></div>
            <div class="form-group"><label>Nome do recebedor</label><input id="set-pixRecebedor" value="${currentSettings.pixRecebedor || ''}" placeholder="Ex.: DALBRAN DISTRIBUIDORA"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div class="form-group"><label>Chave PIX (CNPJ)</label><input id="set-pixKeyCnpj" value="${currentSettings.pixKeyCnpj || ''}"></div>
            <div class="form-group"><label>Cidade do recebedor (PIX)</label><input id="set-pixCidade" value="${currentSettings.pixCidade || ''}"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
            <div class="form-group"><label>Taxa Débito (%)</label><input type="number" step="0.01" inputmode="decimal" id="set-taxaDebito" value="${currentSettings.taxaDebito || 0}" placeholder="Ex: 1,6"></div>
            <div class="form-group"><label>Taxa Crédito (%)</label><input type="number" step="0.01" inputmode="decimal" id="set-taxaCredito" value="${currentSettings.taxaCredito || 0}" placeholder="Ex: 1,6"></div>
            <div class="form-group"><label>Método de Cálculo da Taxa</label><select id="set-metodoCalculoTaxa"><option value="add" ${currentSettings.metodoCalculoTaxa === 'add' ? 'selected' : ''}>Acrescentar taxa (Subtotal + X%)</option><option value="liquid" ${currentSettings.metodoCalculoTaxa === 'liquid' ? 'selected' : ''}>Calcular valor para receber o líquido</option></select></div>
          </div>
          <div class="bank-future-note"><strong>Integração bancária futura</strong><span>Os boletos são definidos individualmente em cada venda. Uma integração automática poderá ser configurada aqui futuramente.</span></div>
        </div>
      </section>

      <!-- BLOCO 6: Configurações Gerais do Sistema -->
      <section class="settings-block" aria-label="Configurações gerais">
        <div class="settings-block-header"><i class="ph ph-sliders-horizontal" aria-hidden="true"></i><div><h3>Configurações Gerais</h3><p>Preferências do sistema, formatos, sincronização e banco de dados.</p></div></div>
        <div class="settings-block-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:0.5rem;">
            <div class="form-group"><label>Validade do Orçamento (Dias)</label><input type="number" step="1" inputmode="numeric" pattern="[0-9]*" id="set-prazoValidadeDias" value="${currentSettings.prazoValidadeDias || 1}" autocomplete="off" data-numeric-only="int"></div>
            <div class="form-group"><label>Formato de data</label><select id="set-formatoData"><option value="dd/mm/aaaa" ${(currentSettings.formatoData || 'dd/mm/aaaa') === 'dd/mm/aaaa' ? 'selected' : ''}>DD/MM/AAAA</option><option value="mm/dd/aaaa" ${currentSettings.formatoData === 'mm/dd/aaaa' ? 'selected' : ''}>MM/DD/AAAA</option><option value="aaaa-mm-dd" ${currentSettings.formatoData === 'aaaa-mm-dd' ? 'selected' : ''}>AAAA-MM-DD</option></select></div>
            <div class="form-group"><label>Formato de moeda</label><select id="set-formatoMoeda"><option value="BRL" ${(currentSettings.formatoMoeda || 'BRL') === 'BRL' ? 'selected' : ''}>Real (R$)</option><option value="USD" ${currentSettings.formatoMoeda === 'USD' ? 'selected' : ''}>Dólar (US$)</option><option value="EUR" ${currentSettings.formatoMoeda === 'EUR' ? 'selected' : ''}>Euro (€)</option></select></div>
          </div>
          <div style="display:flex;gap:1.5rem;flex-wrap:wrap;"><label><input id="set-sincronizacaoAutomatica" type="checkbox" ${currentSettings.sincronizacaoAutomatica !== false ? 'checked' : ''}> Sincronização automática do banco de dados</label></div>
          <div class="api-admin-link">
            <div><i class="ph ph-plug" aria-hidden="true"></i><div><strong>APIs e Integrações</strong><span>Gerencie Gmail, Inteligência Artificial e outras integrações em uma área segura e separada.</span></div></div>
            <button type="button" class="btn btn-outline" onclick="openApiAdminPage()"><i class="ph ph-arrow-square-out" aria-hidden="true"></i> Abrir página de APIs</button>
          </div>
        </div>
      </section>

      <!-- BLOCO 7: Atualizações do Aplicativo -->
      <section class="settings-block" aria-label="Atualizações do aplicativo">
        <div class="settings-block-header"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i><div><h3>Atualizações do Aplicativo</h3><p>Atualização modular (web) sem reinstalar o APK; APK completo apenas quando houver mudança nativa.</p></div></div>
        <div class="settings-block-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:0.5rem;">
            <div class="form-group"><label>URL do manifest de versão (versao.json)</label><input type="url" id="set-updateManifestUrl" value="${currentSettings.updateManifestUrl || ''}" placeholder="https://SEU_USUARIO.github.io/REPO/versao.json"></div>
            <div class="form-group"><label>URL do APK (opcional)</label><input type="url" id="set-updateApkUrl" value="${currentSettings.updateApkUrl || ''}" placeholder="https://github.com/USUARIO/REPO/releases/download/v0.0.5/Dalbran-v{VERSION}.apk"></div>
            <div class="form-group"><label>Canal de atualização</label><select id="set-updateChannel"><option value="stable" ${(currentSettings.updateChannel || 'stable') === 'stable' ? 'selected' : ''}>Estável (stable)</option><option value="beta" ${currentSettings.updateChannel === 'beta' ? 'selected' : ''}>Beta</option></select></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1rem;">
            <div class="form-group"><label>Intervalo (minutos) — 0 = somente ao abrir</label><input type="number" step="1" inputmode="numeric" pattern="[0-9]*" id="set-updateIntervalMinutes" value="${currentSettings.updateIntervalMinutes || 0}" data-numeric-only="int"></div>
            <div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center;margin-top:1.4rem;">
              <label><input id="set-updateCheckOnStart" type="checkbox" ${currentSettings.updateCheckOnStart !== false ? 'checked' : ''}> Verificar ao iniciar</label>
              <label><input id="set-updateCheckWeb" type="checkbox" ${currentSettings.updateCheckWeb !== false ? 'checked' : ''}> Atualização web modular</label>
              <label><input id="set-updateCheckApk" type="checkbox" ${currentSettings.updateCheckApk !== false ? 'checked' : ''}> Avisar novo APK</label>
            </div>
          </div>
          <div class="update-version-info" id="update-version-info">
            <span><strong>Web (modular):</strong> <span id="uv-info-web">-</span></span>
            <span><strong>Nativa (APK):</strong> <span id="uv-info-native">-</span></span>
            <span><strong>Dispositivo:</strong> <span id="uv-info-device">-</span></span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:0.75rem;padding-top:0.9rem;border-top:1px solid var(--border);">
            <div>
              <strong style="font-size:0.85rem;">Versão instalada:</strong>
              <span style="font-size:0.82rem;color:var(--text-muted);">${window.AppUpdater ? window.AppUpdater.APP_VERSION.name + ' (code ' + window.AppUpdater.APP_VERSION.code + ')' : '0.0.16 (code 16)'}</span>
            </div>
            <button type="button" id="btn-check-updates" class="btn btn-outline" onclick="window.checkAppUpdates()"><i class="ph ph-magnifying-glass" aria-hidden="true"></i> Verificar atualizações agora</button>
            <button type="button" id="btn-download-apk" class="btn btn-outline" onclick="window.downloadLatestApk()"><i class="ph ph-download-simple" aria-hidden="true"></i> Baixar e instalar APK</button>
          </div>
          <div id="update-check-log-wrap" class="update-check-log-wrap hidden">
            <div class="update-check-log-header"><span class="update-check-spinner"></span><strong>Verificação de atualização</strong></div>
            <pre id="update-check-log" class="update-check-log"></pre>
          </div>
        </div>
      </section>

      <!-- BLOCO 8: Suporte e Erros -->
      <section class="settings-block" aria-label="Suporte e erros">
        <div class="settings-block-header"><i class="ph ph-lifebuoy" aria-hidden="true"></i><div><h3>Suporte e Erros</h3><p>Envie relatórios de erros e consulte a versão do aplicativo.</p></div></div>
        <div class="settings-block-body">
          <div style="display:flex;flex-direction:column;gap:0.6rem;margin-top:0.5rem;">
            <div style="display:flex;gap:0.8rem;flex-wrap:wrap;">
              <button type="button" class="btn btn-outline" onclick="window.sendBugReport()"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i> Enviar relatório de erros</button>
              <button type="button" class="btn btn-outline" onclick="window.downloadBugLog()"><i class="ph ph-download-simple" aria-hidden="true"></i> Baixar log</button>
              <button type="button" class="btn btn-outline" onclick="window.showUpdateDiagnostics()"><i class="ph ph-bug" aria-hidden="true"></i> Diagnóstico de atualização</button>
            </div>
            <small style="color:var(--text-muted);font-size:0.78rem;line-height:1.5;">Erros de uso são capturados automaticamente e enviados para análise (coleção <code>bug_reports</code>). Você também pode enviar manualmente quando quiser. O relatório contém a versão do app, aparelho e os últimos erros registrados.</small>
          </div>
        </div>
      </section>

      <div style="text-align:right; margin-top:1.5rem;">
        <button type="submit" class="btn btn-primary" ${masterOnly}>Salvar Configurações</button>
      </div>
    </form>

    <section class="operators-panel ${window.isMasterUser === false ? 'hidden' : ''}">
      <div class="view-header"><h3>vendedores / operadores</h3><span>Cadastre quem poderá ser selecionado nos orçamentos e vendas.</span></div>
      <form id="form-operator" class="operator-form"><div class="form-group"><label>Nome do vendedor</label><input id="operator-nome" required placeholder="Ex.: João Silva"></div><div class="form-group"><label>E-mail de login</label><input id="operator-email" type="email" required placeholder="vendedor@empresa.com"></div><button class="btn btn-primary" type="submit">Adicionar vendedor</button></form>
      <div id="operators-list" class="operators-list"></div>
    </section>
    </div>
  `;

  bindSettingsFormEvent();
  bindMobileAppearanceControls();
  bindSettingsAccordion();
  document.querySelectorAll('#form-settings input, #form-settings select, #form-settings textarea').forEach(element => { if (window.isMasterUser === false) element.disabled = true; });
  bindOperatorsEvents();
  if (window.refreshUpdateVersionInfo) window.refreshUpdateVersionInfo();
}

// Configurações em estilo de categorias (acordeão estilo Android):
// clica no título para abrir/fechar as opções daquela categoria.
function bindSettingsAccordion() {
  document.querySelectorAll('.settings-block').forEach((block, idx) => {
    const header = block.querySelector('.settings-block-header');
    if (!header) return;
    header.classList.add('settings-block-header--clickable');
    if (!header.querySelector('.settings-block-chevron')) {
      const chev = document.createElement('i');
      chev.className = 'ph ph-caret-down settings-block-chevron';
      chev.setAttribute('aria-hidden', 'true');
      header.appendChild(chev);
    }
    header.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, select, label')) return;
      block.classList.toggle('open');
    });
    if (idx === 0) block.classList.add('open');
  });
}

// Abre a página administrativa de APIs em uma área separada e protegida.
// Navegação in-app preserva a sessão do Firebase dentro do WebView do app.
window.openApiAdminPage = function() {
  window.location.href = 'API.html';
};

function bindMobileAppearanceControls() {
  const BASE_FONT_SIZE = 21.5;
  const readFontPercent = () => Math.round((parseFloat(document.documentElement.style.fontSize || String(BASE_FONT_SIZE)) / BASE_FONT_SIZE) * 100);
  const update = () => {
    const size = document.getElementById('mobile-settings-font-size');
    const theme = document.getElementById('mobile-settings-theme');
    if (size) size.textContent = `${readFontPercent()}%`;
    if (theme) {
      const dark = document.body.classList.contains('theme-dark');
      theme.classList.toggle('is-dark', dark);
      theme.querySelector('span').textContent = dark ? 'Modo claro' : 'Modo escuro';
      theme.querySelector('i').className = dark ? 'ph ph-sun' : 'ph ph-moon';
    }
  };
  document.getElementById('mobile-settings-font-decrease')?.addEventListener('click', () => { document.getElementById('btn-font-decrease')?.click(); update(); });
  document.getElementById('mobile-settings-font-increase')?.addEventListener('click', () => { document.getElementById('btn-font-increase')?.click(); update(); });
  document.getElementById('mobile-settings-theme')?.addEventListener('click', () => { document.getElementById('btn-theme-toggle')?.click(); update(); });
  document.getElementById('mobile-settings-logout')?.addEventListener('click', () => document.getElementById('btn-logout')?.click());
  update();
}

function renderOperatorsList() {
  const list = document.getElementById('operators-list');
  if (!list) return;
  list.innerHTML = window.operatorsCache.length
    ? window.operatorsCache.map(operator => `<div class="operator-row"><div><strong>${escapeOperatorHtml(operator.nome || operator.email)}</strong><small>${escapeOperatorHtml(operator.email || '')}${operator.papel === 'master' ? ' · master' : ''}</small></div><button type="button" class="btn btn-outline btn-sm" onclick="toggleOperator('${operator.id}')">Desativar</button></div>`).join('')
    : '<p class="empty-state">Nenhum vendedor cadastrado.</p>';
}
function escapeOperatorHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
function bindOperatorsEvents() {
  const form = document.getElementById('form-operator');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    const nome = document.getElementById('operator-nome').value.trim();
    const email = document.getElementById('operator-email').value.trim().toLowerCase();
    // Check for duplicate in cache first (fast) then in Firestore (authoritative)
    const dupInCache = window.operatorsCache.some(op => (op.email || '').toLowerCase().trim() === email);
    if (dupInCache) { showToast('Este e-mail já está cadastrado como operador.', 'error'); return; }
    try {
      const found = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!found.empty) {
        // Reactivate if already exists but was deactivated
        const existingDoc = found.docs[0];
        await existingDoc.ref.set({ nome, ativo: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        form.reset();
        showToast('Vendedor reativado.', 'success');
        return;
      }
      await db.collection('users').add({ nome, email, ativo: true, papel: 'operador', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      form.reset();
      showToast('Vendedor cadastrado.', 'success');
    } catch (error) { console.error(error); showToast('Não foi possível cadastrar o vendedor.', 'error'); }
  };

  // Logo settings accordion toggle
  const btnToggleLogo = document.getElementById('btn-toggle-logo-settings');
  if (btnToggleLogo) {
    btnToggleLogo.onclick = () => {
      const body = document.getElementById('logo-settings-body');
      const caret = document.getElementById('logo-settings-caret');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      if (caret) caret.style.transform = isOpen ? '' : 'rotate(90deg)';
    };
  }

  // Logo file upload → convert to base64 data URL and fill the URL field
  [['set-logoLoginFile','set-logoLoginUrl','set-logoLoginPath'],
   ['set-logoHeaderFile','set-logoHeaderUrl','set-logoHeaderPath'],
   ['set-logoCupomFile','set-logoCupomUrl','set-logoCupomPath']
  ].forEach(([fileId, urlId, pathId]) => {
    const fileInput = document.getElementById(fileId);
    if (!fileInput) return;
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const urlInput = document.getElementById(urlId);
        const pathEl = document.getElementById(pathId);
        if (urlInput) urlInput.value = e.target.result;
        if (pathEl) pathEl.textContent = 'Arquivo: ' + file.name;
      };
      reader.readAsDataURL(file);
    };
  });
}
window.toggleOperator = async id => { try { await db.collection('users').doc(id).set({ ativo: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); showToast('Vendedor desativado.', 'info'); } catch (error) { console.error(error); showToast('Não foi possível desativar o vendedor.', 'error'); } };

// Evento de Gravação no Firestore
function bindSettingsFormEvent() {
  const form = document.getElementById('form-settings');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();

    const payload = {
      nomeFantasia: document.getElementById('set-nomeFantasia').value.trim(),
      razaoSocial: document.getElementById('set-razaoSocial').value.trim(),
      cnpj: document.getElementById('set-cnpj').value.trim(),
      telefone: document.getElementById('set-telefone').value.trim(),
      whatsapp: document.getElementById('set-whatsapp').value.trim(),
      email: document.getElementById('set-email').value.trim(),
      endereco: document.getElementById('set-endereco').value.trim(),
      taxaDebito: parseCurrency(document.getElementById('set-taxaDebito').value),
      taxaCredito: parseCurrency(document.getElementById('set-taxaCredito').value),
      prazoValidadeDias: parseInt(document.getElementById('set-prazoValidadeDias').value, 10) || 1,
      metodoCalculoTaxa: document.getElementById('set-metodoCalculoTaxa').value,
      avisoEstoque: document.getElementById('set-avisoEstoque').value.trim(),
      mensagemPadrao: document.getElementById('set-mensagemPadrao').value.trim(),
      formatoPadraoCupom: document.getElementById('set-formatoPadraoCupom').value,
      fonteCupom: document.getElementById('set-fonteCupom').value,
      tamanhoFonteCupom: Math.min(18, Math.max(8, parseInt(document.getElementById('set-tamanhoFonteCupom').value, 10) || 12)),
      exibirAvisoNoCupom: document.getElementById('set-exibirAvisoNoCupom').checked,
      compartilharWhatsAppAtivo: document.getElementById('set-compartilharWhatsAppAtivo').checked,
      mensagemRecibo: document.getElementById('set-mensagemRecibo').value.trim(),
      mensagemOrcamento: document.getElementById('set-mensagemOrcamento').value.trim(),
      mensagemPedido: document.getElementById('set-mensagemPedido').value.trim(),
      formatoData: document.getElementById('set-formatoData').value,
      formatoMoeda: document.getElementById('set-formatoMoeda').value,
      sincronizacaoAutomatica: document.getElementById('set-sincronizacaoAutomatica').checked,
      pixKey: document.getElementById('set-pixKey').value.trim(),
      pixKeyCnpj: document.getElementById('set-pixKeyCnpj').value.trim(),
      pixCidade: document.getElementById('set-pixCidade').value.trim().toUpperCase(),
      pixTipo: document.getElementById('set-pixTipo').value,
      pixRecebedor: document.getElementById('set-pixRecebedor').value.trim(),
      logoUrl: document.getElementById('set-logoLoginUrl').value.trim(),
      logoLoginUrl: document.getElementById('set-logoLoginUrl').value.trim(),
      logoHeaderUrl: document.getElementById('set-logoHeaderUrl').value.trim(),
      logoCupomUrl: document.getElementById('set-logoCupomUrl').value.trim(),
      gmailRemetente: document.getElementById('set-gmailRemetente').value.trim(),
      updateManifestUrl: document.getElementById('set-updateManifestUrl').value.trim(),
      updateApkUrl: document.getElementById('set-updateApkUrl').value.trim(),
      updateChannel: document.getElementById('set-updateChannel').value,
      updateCheckOnStart: document.getElementById('set-updateCheckOnStart').checked,
      updateCheckWeb: document.getElementById('set-updateCheckWeb').checked,
      updateCheckApk: document.getElementById('set-updateCheckApk').checked,
      updateIntervalMinutes: parseInt(document.getElementById('set-updateIntervalMinutes').value, 10) || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db.collection('settings').doc('company').set(payload, { merge: true });
      showToast("Configurações salvas com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar configurações:", err);
      showToast("Erro ao salvar configurações.", "error");
    }
  };
}

// Exporta objeto de configurações globalmente para o motor de orçamentos
window.getCompanySettings = () => currentSettings;
