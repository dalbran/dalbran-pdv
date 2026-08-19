/** Cadastro de clientes e histórico de orçamentos (Firestore). */
window.clientsCache = [];
window.quotesCache = [];

document.addEventListener('DOMContentLoaded', () => {
  _bindClientModalEvents();
  if (typeof auth === 'undefined') return;
  auth.onAuthStateChanged(user => {
    if (user) initClientsModule();
  });
});

function initClientsModule() {
  db.collection('clients').orderBy('nome', 'asc').onSnapshot(snapshot => {
    window.clientsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderClientsView();
    updateDashboardClients();
    if (typeof window.populateOrcamentoClientsSelect === 'function') window.populateOrcamentoClientsSelect();
  }, error => {
    console.error('Erro ao carregar clientes:', error);
    showToast('Não foi possível sincronizar os clientes.', 'error');
  });

  db.collection('quotes').orderBy('createdAt', 'desc').limit(100).onSnapshot(snapshot => {
    window.quotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSavedQuotesSidebar();
    if (typeof window.updateDashboardFinancial === 'function') window.updateDashboardFinancial();
  }, error => {
    console.error('Erro ao carregar orçamentos:', error);
  });
}

function renderClientsView() {
  const container = document.getElementById('view-clientes');
  if (!container) return;
  container.innerHTML = `
    <div class="view-header top-section" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h2 class="section-title">Clientes</h2>
      <button id="btn-new-client" class="btn btn-primary btn-sm"><i class="ph ph-user-plus"></i> Novo cliente</button>
    </div>
    <div class="search-box form-group" style="position:relative; margin-bottom:1rem;">
      <i class="ph ph-magnifying-glass" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:#64748b; font-size:1.2rem;"></i>
      <input id="search-client" class="search-input" type="search" placeholder="Buscar por nome, empresa ou doc..." style="width:100%; min-height:48px; padding:12px 14px 12px 44px; border-radius:12px; border:1px solid #e2e8f0; font-size:0.875rem;">
    </div>

    <!-- Tabela Desktop (> 768px) -->
    <div class="desktop-only-table" style="overflow-x:auto;background:white;border:1px solid #e2e8f0;border-radius:8px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;text-align:left;border-bottom:2px solid #e2e8f0;">
            <th style="padding:.75rem">Cliente</th>
            <th style="padding:.75rem">Tipo de preço</th>
            <th style="padding:.75rem">Contato</th>
            <th style="padding:.75rem;text-align:right">Ação</th>
          </tr>
        </thead>
        <tbody id="clients-desktop-tbody">
          ${generateClientsDesktopRows(window.clientsCache)}
        </tbody>
      </table>
    </div>

    <!-- Lista em Cards Mobile (<= 768px, fiel a clientes.html) -->
    <div class="mobile-only-list clients-list" id="clients-mobile-list">
      ${generateClientsMobileCards(window.clientsCache)}
    </div>

    <!-- Modal de Perfil e Histórico do Cliente (Fiel ao modal-clientes.html) -->
    <div id="modal-client-profile" class="modal hidden print-modal modal-backdrop">
      <div class="modal-sheet print-modal-card client-profile-card">
        <div class="sheet-handle"></div>
        <button type="button" class="btn-close" id="btn-close-client-profile" aria-label="Fechar"><i class="ph ph-x"></i></button>
        <div id="client-profile-content"></div>
      </div>
    </div>
  `;
  bindClientsEvents();
}

function generateClientsDesktopRows(clients) {
  if (!clients || clients.length === 0) {
    return '<tr><td colspan="4" style="padding:1.5rem;text-align:center;color:#64748b;">Nenhum cliente cadastrado.</td></tr>';
  }

  return clients.map(client => {
    const whatsapp = String(client.whatsapp || '').replace(/\D/g, '');
    const name = escapeClientHtml(client.nome || 'Cliente sem nome');
    const fantasia = escapeClientHtml(client.nomeFantasia || '');
    const contact = escapeClientHtml(client.whatsapp || client.telefone || '-');
    const doc = escapeClientHtml(client.documento || '');
    const tabela = client.tipoPreco === 'especial' ? 'Especial ⭐ (DF)' : client.tipoPreco === 'notaFiscal' ? 'Nota fiscal' : client.tipoPreco === 'atacado' ? 'Atacado' : 'Varejo';

    return `
      <tr style="border-top:1px solid #e2e8f0">
        <td style="padding:.75rem">
          <button class="client-profile-trigger" type="button" onclick="openClientProfile('${client.id}')">
            <div class="client-identity">
              <img class="client-avatar" src="${getClientAvatar(client)}" alt="Foto de ${name}">
              <div>
                <strong>${name}</strong>
                ${fantasia ? `<br><small style="color:#64748b;">${fantasia}</small>` : ''}
              </div>
            </div>
          </button>
        </td>
        <td style="padding:.75rem">${tabela}</td>
        <td style="padding:.75rem">${contact}${doc ? `<br><small style="color:#64748b;">${doc}</small>` : ''}</td>
        <td style="padding:.75rem;text-align:right">
          <div class="client-actions">
            <button class="client-favorite-button ${client.tipoPreco === 'especial' ? 'active' : ''}" type="button" onclick="toggleClientFavorite('${client.id}')" title="${client.tipoPreco === 'especial' ? 'Remover preço especial (DF)' : 'Ativar preço especial (DF)'}" aria-label="Preço especial (DF)"><i class="${client.tipoPreco === 'especial' ? 'ph-fill' : 'ph'} ph-star"></i></button>
            ${whatsapp ? `<button class="btn-whatsapp" type="button" onclick="openClientWhatsApp('${whatsapp}')" title="WhatsApp"><i class="ph-fill ph-whatsapp-logo"></i></button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="editClient('${client.id}')">Editar</button>
            <button class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fca5a5;" onclick="deleteClient('${client.id}')">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function generateClientsMobileCards(clients) {
  if (!clients || clients.length === 0) {
    return `<div class="empty-card" style="padding:2rem; text-align:center; color:#64748b; background:white; border-radius:16px; border:1px dashed #cbd5e1;">Nenhum cliente cadastrado.</div>`;
  }

  return clients.map((client, i) => {
    const whatsapp = String(client.whatsapp || '').replace(/\D/g, '');
    const name = escapeClientHtml(client.nome || 'Cliente sem nome');
    const fantasia = escapeClientHtml(client.nomeFantasia || '');
    const contact = escapeClientHtml(client.whatsapp || client.telefone || '-');
    const doc = escapeClientHtml(client.documento || 'Não informado');
    const tabelaLabel = client.tipoPreco === 'especial' ? 'Especial ⭐ (DF)' : client.tipoPreco === 'notaFiscal' ? 'Nota Fiscal' : client.tipoPreco === 'atacado' ? 'Atacado' : 'Varejo';
    const initials = (name.split(' ').map(n => n[0]).slice(0, 2).join('') || 'CL').toUpperCase();

    return `
      <article class="client-card" style="animation-delay:${(i * 0.04).toFixed(2)}s;">
        <div class="client-header" onclick="openClientProfile('${client.id}')">
          <div class="avatar">${client.fotoUrl ? `<img src="${client.fotoUrl}" class="client-avatar" alt="">` : initials}</div>
          <div class="client-info">
            <h3 class="client-name">${name}</h3>
            <p class="client-company">${fantasia || 'Pessoa Física'}</p>
          </div>
          <button class="client-favorite-button client-card-favorite ${client.tipoPreco === 'especial' ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleClientFavorite('${client.id}')" title="${client.tipoPreco === 'especial' ? 'Remover preço especial (DF)' : 'Ativar preço especial (DF)'}" aria-label="Preço especial (DF)"><i class="${client.tipoPreco === 'especial' ? 'ph-fill' : 'ph'} ph-star"></i></button>
        </div>

        <div class="client-details">
          <div class="detail-item">
            <i class="ph ph-tag"></i>
            Tabela: <span class="tag-table">${tabelaLabel}</span>
          </div>
          <div class="detail-item">
            <i class="ph ph-phone"></i>
            ${contact}
          </div>
          <div class="detail-item">
            <i class="ph ph-identification-card"></i>
            CPF/Doc: ${doc}
          </div>
        </div>

        <div class="client-actions">
          ${whatsapp ? `<a href="https://wa.me/55${whatsapp}" target="_blank" class="btn-whatsapp" title="Abrir WhatsApp" aria-label="Abrir WhatsApp"><i class="ph-fill ph-whatsapp-logo"></i></a>` : ''}
          <button class="btn btn-edit-client" type="button" onclick="editClient('${client.id}')">
            <i class="ph ph-pencil-simple"></i> Editar
          </button>
          <button class="btn-delete-client" type="button" title="Excluir Cliente" onclick="deleteClient('${client.id}')">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function escapeClientHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
function getClientAvatar(client) { return client.fotoUrl || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#e2e8f0"/><circle cx="40" cy="29" r="14" fill="#94a3b8"/><path d="M15 74c3-16 13-25 25-25s22 9 25 25" fill="#94a3b8"/></svg>'); }
window.openClientWhatsApp = phone => window.open(`https://wa.me/55${String(phone).replace(/^55/, '')}`, '_blank', 'noopener');

function updateDashboardClients() {
  const count = window.clientsCache.length;
  const total = document.getElementById('dash-total-clients');
  const mobTotal = document.getElementById('mob-dash-total-clients');
  const label = document.getElementById('dash-clients-count');
  const list = document.getElementById('dash-clients-list');
  if (total) total.textContent = count;
  if (mobTotal) mobTotal.textContent = count;
  if (label) label.textContent = `${count} ${count === 1 ? 'cliente' : 'clientes'}`;
  if (!list) return;
  list.innerHTML = count ? window.clientsCache.map(client => `<button type="button" class="dashboard-client" onclick="navigateToClientProfile('${client.id}')"><img class="client-avatar" src="${getClientAvatar(client)}" alt=""><div><strong>${escapeClientHtml(client.nome || 'Cliente sem nome')}</strong>${client.nomeFantasia ? `<small>${escapeClientHtml(client.nomeFantasia)}</small>` : ''}</div></button>`).join('') : '<p class="empty-state">Nenhum cliente cadastrado.</p>';
}

window.navigateToClientProfile = id => { if (typeof window.navigateToView === 'function') window.navigateToView('view-clientes'); window.setTimeout(() => window.openClientProfile(id), 0); };

function bindClientsEvents() {
  const btnNew = document.getElementById('btn-new-client');
  if (btnNew) btnNew.onclick = () => openClientModal();

  const btnCloseProfile = document.getElementById('btn-close-client-profile');
  if (btnCloseProfile) btnCloseProfile.onclick = () => {
    const modal = document.getElementById('modal-client-profile');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  };

  const searchInput = document.getElementById('search-client');
  if (searchInput) {
    searchInput.oninput = event => {
      const term = normalizeSearchText(event.target.value);
      const filtered = window.clientsCache.filter(c => normalizeSearchText(`${c.nome} ${c.nomeFantasia} ${c.telefone} ${c.whatsapp} ${c.documento}`).includes(term));
      const desktopTbody = document.getElementById('clients-desktop-tbody');
      const mobileList = document.getElementById('clients-mobile-list');
      if (desktopTbody) desktopTbody.innerHTML = generateClientsDesktopRows(filtered);
      if (mobileList) mobileList.innerHTML = generateClientsMobileCards(filtered);
    };
  }
}

function _bindClientModalEvents() {
  // Listeners do modal global (inicializados uma vez no DOMContentLoaded)
  const btnCancel = document.getElementById('btn-cancel-client');
  if (btnCancel) btnCancel.onclick = closeClientModal;

  const btnCloseX = document.getElementById('btn-close-client-x');
  if (btnCloseX) btnCloseX.onclick = closeClientModal;

  const form = document.getElementById('form-client');
  if (form) form.onsubmit = saveClient;

  // Fechar clicando no backdrop
  const modal = document.getElementById('modal-client');
  if (modal) modal.addEventListener('click', e => {
    if (e.target === modal) closeClientModal();
  });
}

window.openClientModal = function(client = null) {
  const modal = document.getElementById('modal-client');
  if (!modal) return;
  document.getElementById('form-client').reset();
  document.getElementById('client-id').value = client?.id || '';
  const titleEl = document.getElementById('client-modal-title');
  const subtitleEl = document.querySelector('#modal-client .client-modal-subtitle');
  if (titleEl) titleEl.textContent = client ? 'Editar cliente' : 'Cadastrar cliente';
  if (subtitleEl) subtitleEl.textContent = client ? 'Edite os dados do cliente abaixo' : 'Preencha os dados do cliente abaixo';
  if (client) ['nome','email','telefone','whatsapp','documento'].forEach(field => { const el = document.getElementById(`client-${field}`); if (el) el.value = client[field] || ''; });
  const fotoEl = document.getElementById('client-foto-url');
  const fantasiaEl = document.getElementById('client-fantasia');
  const tipoPrecoEl = document.getElementById('client-tipo-preco');
  const favoritoEl = document.getElementById('client-favorito');
  if (fotoEl) fotoEl.value = client?.fotoUrl || '';
  if (fantasiaEl) fantasiaEl.value = client?.nomeFantasia || '';
  if (tipoPrecoEl) tipoPrecoEl.value = client?.tipoPreco || '';
  if (favoritoEl) favoritoEl.checked = Boolean(client?.favorito);
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  // Foco no primeiro campo
  setTimeout(() => document.getElementById('client-nome')?.focus(), 50);
};
function openClientModal(client = null) { window.openClientModal(client); }

function closeClientModal() { 
  const modal = document.getElementById('modal-client'); 
  if (modal) {
    modal.classList.add('hidden'); 
    modal.style.display = 'none'; 
  }
}

window.editClient = id => { 
  const client = window.clientsCache.find(c => c.id === id); 
  if (client) openClientModal(client); 
};

window.toggleClientFavorite = async id => {
  const client = window.clientsCache.find(item => item.id === id);
  if (!client) return;
  const isSpecial = client.tipoPreco === 'especial';
  try {
    await db.collection('clients').doc(id).set({ tipoPreco: isSpecial ? 'varejo' : 'especial', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Erro ao atualizar preço especial:', error);
    showToast('Não foi possível atualizar o preço especial.', 'error');
  }
};

window.deleteClient = async (id) => {
  const client = window.clientsCache.find(c => c.id === id);
  const name = client?.nome || 'este cliente';
  if (confirm(`Deseja realmente remover o cliente "${name}"?`)) {
    try {
      await db.collection('clients').doc(id).delete();
      showToast(`Cliente ${name} removido com sucesso.`, 'info');
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      showToast('Não foi possível excluir o cliente.', 'error');
    }
  }
};

window.openClientProfile = id => {
  const client = window.clientsCache.find(c => c.id === id); 
  const modal = document.getElementById('modal-client-profile'); 
  const content = document.getElementById('client-profile-content');
  if (!client || !modal || !content) return;

  const clientQuotes = window.quotesCache.filter(q => q.cliente?.id === id && q.tipo !== 'venda');
  const clientSales = window.quotesCache.filter(q => q.cliente?.id === id && q.tipo === 'venda');
  const tabelaLabel = client.tipoPreco === 'especial' ? 'Especial ⭐ (DF)' : client.tipoPreco === 'notaFiscal' ? 'Nota Fiscal' : client.tipoPreco === 'atacado' ? 'Atacado' : 'Varejo';
  const name = escapeClientHtml(client.nome || 'Cliente');
  const contact = escapeClientHtml(client.whatsapp || client.telefone || 'Sem contato');
  const initials = (name.split(' ').map(n => n[0]).slice(0, 2).join('') || 'CL').toUpperCase();
  const avatarHtml = client.fotoUrl ? `<img src="${client.fotoUrl}" class="client-avatar client-avatar-large" alt="">` : initials;

  const quotesListHtml = clientQuotes.length ? `
    <div class="history-list">
      ${clientQuotes.map(q => `
        <div class="sale-card" onclick="openSavedQuoteActions('${q.id}')">
          <div>
            <div class="sale-code">${escapeClientHtml(q.numero || q.id)}</div>
            <div class="sale-date">${q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : '-'}</div>
          </div>
          <div class="sale-value">${formatCurrency(q.financeiro?.totalGeral)}</div>
        </div>
      `).join('')}
    </div>
  ` : `<div class="empty-card">Nenhum orçamento emitido para este cliente.</div>`;

  const salesListHtml = clientSales.length ? `
    <div class="history-list">
      ${clientSales.map(s => `
        <div class="sale-card" onclick="openSavedQuoteActions('${s.id}')">
          <div>
            <div class="sale-code">${escapeClientHtml(s.numero || s.id)}</div>
            <div class="sale-date">${s.createdAt?.toDate ? formatDateTime(s.createdAt.toDate()) : '-'} • ${(s.financeiro?.formaPag || 'PIX').toUpperCase()}</div>
          </div>
          <div class="sale-value">${formatCurrency(s.financeiro?.totalGeral)}</div>
        </div>
      `).join('')}
    </div>
  ` : `<div class="empty-card">Nenhuma venda finalizada para este cliente.</div>`;

  content.innerHTML = `
    <div class="client-profile-header">
      <div class="profile-avatar">
        ${avatarHtml}
      </div>
      <h3 class="profile-name">${name}</h3>
      <p class="profile-phone">${contact}</p>
      <span class="profile-tag">${tabelaLabel}</span>
    </div>

    <div class="section-block">
      <div class="block-header">
        <h4 class="block-title">Orçamentos emitidos <span class="block-count">(${clientQuotes.length})</span></h4>
      </div>
      ${quotesListHtml}
    </div>

    <div class="section-block">
      <div class="block-header">
        <h4 class="block-title">Vendas finalizadas no PDV <span class="block-count">(${clientSales.length})</span></h4>
      </div>
      ${salesListHtml}
    </div>
  `;

  modal.classList.remove('hidden'); 
  modal.style.display = 'flex';
};

async function saveClient(event) {
  event.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = { 
    nome: document.getElementById('client-nome').value.trim(), 
    nomeFantasia: document.getElementById('client-fantasia').value.trim(), 
    email: document.getElementById('client-email').value.trim(), 
    telefone: document.getElementById('client-telefone').value.trim(), 
    whatsapp: document.getElementById('client-whatsapp').value.trim(), 
    documento: document.getElementById('client-documento').value.trim(), 
    fotoUrl: document.getElementById('client-foto-url').value.trim(), 
    tipoPreco: document.getElementById('client-tipo-preco').value, 
    favorito: document.getElementById('client-favorito').checked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
  };
  try { 
    if (id) {
      await db.collection('clients').doc(id).set(payload, { merge: true }); 
    } else { 
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp(); 
      await db.collection('clients').add(payload); 
    } 
    closeClientModal(); 
    showToast('Cliente salvo com sucesso!', 'success'); 
  } catch (error) { 
    console.error('Erro ao salvar cliente:', error); 
    showToast('Não foi possível salvar o cliente.', 'error'); 
  }
}

function renderSavedQuotesSidebar() {
  const container = document.getElementById('saved-quotes-list');
  const count = document.getElementById('saved-quotes-count');
  const isPdv = typeof documentMode !== 'undefined' && documentMode === 'pdv';
  const allDocuments = window.quotesCache.filter(q => isPdv ? q.tipo === 'venda' : q.tipo !== 'venda');
  const search = normalizeSearchText(sidebarSearch || '');
  const documents = allDocuments.filter(q => {
    const date = q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : '';
    return !search || normalizeSearchText(`${q.numero || ''} ${date}`).includes(search);
  });
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize));
  sidebarPage = Math.min(Math.max(1, sidebarPage), totalPages);
  const visibleDocuments = documents.slice((sidebarPage - 1) * pageSize, sidebarPage * pageSize);
  if (count) count.textContent = allDocuments.length;
  if (!container) return;
  container.innerHTML = visibleDocuments.length ? visibleDocuments.map(q => `<div class="saved-quote-row"><button type="button" class="saved-quote" onclick="openSavedQuoteActions('${q.id}')"><strong>${escapeClientHtml(q.numero || q.id)}</strong><span>${escapeClientHtml(q.cliente?.nome || 'Cliente não informado')}</span><b>${formatCurrency(q.financeiro?.totalGeral)}</b><small>${q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : 'Data não informada'}</small></button><button type="button" class="quick-delete-document" onclick="quickDeleteDocument('${q.id}')" title="Excluir" aria-label="Excluir">×</button></div>`).join('') : `<p class="empty-state">Nenhuma ${isPdv ? 'venda' : 'orçamento'} encontrada.</p>`;
  const pagination = document.getElementById('saved-documents-pagination');
  const searchInput = document.getElementById('saved-documents-search');
  if (searchInput) { searchInput.value = sidebarSearch; searchInput.oninput = event => { sidebarSearch = event.target.value; sidebarPage = 1; renderSavedQuotesSidebar(); }; }
  if (pagination) pagination.innerHTML = totalPages > 1 ? `<button type="button" ${sidebarPage === 1 ? 'disabled' : ''} onclick="changeSavedDocumentsPage(-1)">‹</button><span>${sidebarPage} / ${totalPages}</span><button type="button" ${sidebarPage === totalPages ? 'disabled' : ''} onclick="changeSavedDocumentsPage(1)">›</button>` : '';
}

window.changeSavedDocumentsPage = delta => { sidebarPage += delta; renderSavedQuotesSidebar(); };
window.quickDeleteDocument = id => { const documentItem = (window.quotesCache || []).find(item => item.id === id); if (documentItem && typeof deleteSavedDocument === 'function') deleteSavedDocument(documentItem); };
