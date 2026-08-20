/**
 * Módulo de Gestão de Produtos e Catálogo (Firestore Sync)
 */

window.productsCache = [];
let productInitialFilter = '';
const productsCurrentPage = { desktop: 1, mobile: 1 };
const PRODUCTS_PER_PAGE_DESKTOP = 10;
const PRODUCTS_PER_PAGE_MOBILE = 8;

function getFilteredProducts(searchTerm = '') {
  const term = String(searchTerm || '').trim().toLocaleLowerCase('pt-BR');
  return productsCache.filter(product => {
    const name = String(product.nome || product.name || '');
    const category = String(product.categoria || product.category || '');
    const matchesSearch = !term || `${name} ${category}`.toLocaleLowerCase('pt-BR').includes(term);
    const initial = name.trim().charAt(0).toLocaleUpperCase('pt-BR');
    return matchesSearch && (!productInitialFilter || initial === productInitialFilter);
  });
}

function renderProductResults() {
  const searchInput = document.getElementById('search-product');
  const filtered = getFilteredProducts(searchInput?.value || '');
  const desktopTbody = document.getElementById('products-desktop-tbody');
  const mobileList = document.getElementById('products-mobile-list');
  const desktopPage = getProductPage(PRODUCTS_PER_PAGE_DESKTOP, 'desktop');
  const mobilePage = getProductPage(PRODUCTS_PER_PAGE_MOBILE, 'mobile');
  if (desktopTbody) desktopTbody.innerHTML = generateProductsDesktopRows(desktopPage.products);
  if (mobileList) mobileList.innerHTML = generateProductsMobileCards(mobilePage.products);
  const desktopPagination = document.querySelector('.desktop-products-pagination');
  const mobilePagination = document.querySelector('.mobile-products-pagination');
  if (desktopPagination) desktopPagination.innerHTML = buildProductsPagination(PRODUCTS_PER_PAGE_DESKTOP, 'desktop');
  if (mobilePagination) mobilePagination.innerHTML = buildProductsPagination(PRODUCTS_PER_PAGE_MOBILE, 'mobile');
  bindProductsDOMEvents();
}

function getProductPage(pageSize, target) {
  const filtered = getFilteredProducts(document.getElementById('search-product')?.value || '');
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  productsCurrentPage[target] = Math.max(1, Math.min(productsCurrentPage[target], totalPages));
  const start = (productsCurrentPage[target] - 1) * pageSize;
  return { products: filtered.slice(start, start + pageSize), total: filtered.length, totalPages, start, currentPage: productsCurrentPage[target] };
}

function buildProductsPagination(pageSize, target) {
  const { total, totalPages, start, currentPage } = getProductPage(pageSize, target);
  if (!total) return '';
  const first = start + 1;
  const last = Math.min(start + pageSize, total);
  return `<nav class="products-pagination" aria-label="Paginação de produtos"><span>${first}–${last} de ${total}</span><div><button type="button" data-products-page="${currentPage - 1}" data-products-pagination-target="${target}" ${currentPage === 1 ? 'disabled' : ''} aria-label="Página anterior"><i class="ph ph-caret-left"></i></button><strong>${currentPage} / ${totalPages}</strong><button type="button" data-products-page="${currentPage + 1}" data-products-pagination-target="${target}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Próxima página"><i class="ph ph-caret-right"></i></button></div></nav>`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof auth !== 'undefined' && auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        initProductsModule();
      }
    });
  }
});

// Inicializa escuta em tempo real do Firestore
function initProductsModule() {
  const productsCollection = db.collection('products');

  productsCollection.onSnapshot((snapshot) => {
    window.productsCache = [];
    snapshot.forEach(doc => {
      window.productsCache.push({ id: doc.id, ...doc.data() });
    });
    window.productsCache.sort((a, b) => String(a.nome || a.name || '').localeCompare(String(b.nome || b.name || ''), 'pt-BR', { sensitivity: 'base' }));
    
    // Atualiza contadores no Dashboard
    updateDashboardMetrics();
    
    // Renderiza a tabela/cards de produtos
    renderProductsTable();

    if (typeof window.populateOrcamentoProductsSelect === 'function') {
      window.populateOrcamentoProductsSelect();
    }
    if (typeof renderCustomCatalogProducts === 'function') renderCustomCatalogProducts();
  }, (error) => {
    console.error("Erro ao carregar produtos:", error);
    if (typeof showToast === 'function') showToast("Erro ao sincronizar produtos com o banco.", "error");
  });

  setupProductEvents();
}

// Renderização do HTML da Gestão de Produtos
function renderProductsTable() {
  const container = document.getElementById('view-produtos');
  if (!container) return;

  container.innerHTML = `
    <!-- Header da view de produtos -->
    <div class="produtos-view-header">
      <h2 class="section-title">Gestão de Produtos</h2>
      <div class="produtos-action-btns">
        <button id="btn-mobile-import-menu" type="button" class="prod-card-btn" title="Importar / Exportar">
          <i class="ph ph-arrows-down-up"></i>
        </button>
        <button id="btn-new-product" type="button" class="prod-card-btn" title="Novo Produto">
          <i class="ph ph-file-plus"></i>
        </button>
      </div>
    </div>

    <!-- Mini-modal de Importar/Exportar (mobile bottom-sheet) -->
    <div id="import-export-modal" class="import-export-overlay hidden" aria-modal="true" role="dialog">
      <div class="import-export-backdrop" id="import-export-backdrop"></div>
      <div class="import-export-sheet">
        <div class="import-export-handle"></div>
        <p class="import-export-title">Importar / Exportar</p>
        <p class="import-export-description">Escolha o que deseja fazer</p>
        <div class="import-export-options">
          <button id="btn-import-json" class="import-export-btn">
            <span class="ie-icon-wrap"><i class="ph ph-upload-simple"></i></span>
            <span class="ie-text"><strong>Importar</strong><small>Importar dados para o aplicativo</small></span>
          </button>
          <button id="btn-export-json" class="import-export-btn">
            <span class="ie-icon-wrap"><i class="ph ph-download-simple"></i></span>
            <span class="ie-text"><strong>Exportar</strong><small>Salvar ou compartilhar seus dados</small></span>
          </button>
        </div>
        <button id="btn-close-import-export" class="import-export-close-btn">Cancelar</button>
      </div>
    </div>

    <div class="search-box form-group" style="position:relative; margin-bottom:1rem;">
      <i class="ph ph-magnifying-glass" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:#64748b; font-size:1.2rem;"></i>
      <input type="text" id="search-product" placeholder="Buscar produto por nome ou categoria..." class="form-control search-input" style="width:100%; min-height:48px; padding:12px 14px 12px 44px; border:1px solid #e2e8f0; border-radius:12px; font-size:0.875rem;">
    </div>

    <div class="product-alphabet-filter" aria-label="Filtrar produtos pela letra inicial">
      <button type="button" class="${!productInitialFilter ? 'active' : ''}" data-product-letter="">Todos</button>
      ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `<button type="button" class="${productInitialFilter === letter ? 'active' : ''}" data-product-letter="${letter}">${letter}</button>`).join('')}
    </div>

    <!-- Tabela Desktop (> 768px) -->
    <div class="desktop-only-table" style="overflow-x:auto; background:white; border-radius:8px; border:1px solid #e2e8f0;">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc; text-align:left; border-bottom:2px solid #e2e8f0;">
            <th style="padding:0.75rem;">Nome</th>
            <th style="padding:0.75rem;">Categoria</th>
            <th style="padding:0.75rem;">Variações (Volume / Preços)</th>
            <th style="padding:0.75rem;">Status</th>
            <th style="padding:0.75rem; text-align:right;">Ações</th>
          </tr>
        </thead>
        <tbody id="products-desktop-tbody">
          ${generateProductsDesktopRows(getProductPage(PRODUCTS_PER_PAGE_DESKTOP, 'desktop').products)}
        </tbody>
      </table>
    </div>
    <div class="desktop-products-pagination">${buildProductsPagination(PRODUCTS_PER_PAGE_DESKTOP, 'desktop')}</div>

    <!-- Lista em Cards Mobile (<= 768px, fiel a produtos.html) -->
    <div class="mobile-only-list products-list" id="products-mobile-list">
      ${generateProductsMobileCards(getProductPage(PRODUCTS_PER_PAGE_MOBILE, 'mobile').products)}
    </div>
    <div class="mobile-products-pagination">${buildProductsPagination(PRODUCTS_PER_PAGE_MOBILE, 'mobile')}</div>

    <!-- Modal de Cadastro / Edição de Produto (Fiel ao Design Mobile Bottom-Sheet) -->
    <div id="modal-product" class="modal hidden print-modal">
      <div class="modal-sheet print-modal-card" style="max-width:600px; width:90%; max-height:90vh; overflow-y:auto; position:relative;">
        <div class="sheet-handle"></div>
        <button type="button" class="btn-close modal-close-x" id="btn-close-product-x" aria-label="Fechar"><i class="ph ph-x"></i></button>
        <h3 id="modal-product-title" style="margin-bottom:1rem; font-weight:800;">Cadastrar Produto</h3>
        <form id="form-product">
          <input type="hidden" id="product-id">
          
          <div class="form-group">
            <label style="font-weight:700; font-size:0.8rem; color:#64748b; text-transform:uppercase;">Nome do Produto</label>
            <input type="text" id="product-nome" required placeholder="Ex: Abrilhantador RB100" class="form-control">
          </div>

          <div class="form-group">
            <label style="font-weight:700; font-size:0.8rem; color:#64748b; text-transform:uppercase;">Categoria</label>
            <input type="text" id="product-categoria" required placeholder="Ex: Limpeza Automotiva" class="form-control">
          </div>

          <div class="form-group">
            <label style="font-weight:700; font-size:0.8rem; color:#64748b; text-transform:uppercase;">Descrição</label>
            <textarea id="product-descricao" rows="2" placeholder="Opcional" class="form-control"></textarea>
          </div>

          <div class="form-group" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="product-ativo" checked style="width:auto; min-height:auto;">
            <label for="product-ativo" style="margin-bottom:0; font-weight:700; font-size:0.85rem;">Produto Ativo</label>
          </div>

          <hr style="margin:1rem 0; border:0; border-top:1px solid #e2e8f0;">
          <h4 style="font-size:0.95rem; font-weight:700;">Variações de Volume e Preço</h4>
          <p style="font-size:0.8rem; color:#64748b; margin-bottom:0.5rem;">Adicione volumes, preços e fragrâncias.</p>

          <div id="variations-container"></div>
          
          <button type="button" id="btn-add-variation" class="btn btn-outline btn-sm" style="margin-top:0.5rem; width:100%; border-style:dashed;">+ Adicionar Volume</button>

          <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
            <button type="button" id="btn-cancel-product" class="btn btn-outline">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar Produto</button>
          </div>
        </form>
      </div>
    </div>
  `;

  bindProductsDOMEvents();
}

// Gera linhas da tabela Desktop
function generateProductsDesktopRows(products) {
  if (!products || products.length === 0) {
    return `<tr><td colspan="5" style="padding:1.5rem; text-align:center; color:#64748b;">Nenhum produto cadastrado.</td></tr>`;
  }

  return products.map(prod => {
    const isAtivo = prod.ativo !== false;
    const nome = escapeProductHtml(prod.nome || prod.name || 'Sem nome');
    const categoria = escapeProductHtml(prod.categoria || 'Geral');

    const variationsList = (prod.variacoes || []).map((v, index) => {
      const fragList = Array.isArray(v.fragrancias) ? v.fragrancias.join(', ') : (v.fragrancias || '');
      const precoAtacado = typeof formatCurrency === 'function' ? formatCurrency(v.precoAtacado) : 'R$ ' + (v.precoAtacado || 0);
      const precoVarejo = typeof formatCurrency === 'function' ? formatCurrency(v.precoVarejo) : 'R$ ' + (v.precoVarejo || 0);
      const precoNF = typeof formatCurrency === 'function' ? formatCurrency(v.precoNotaFiscal !== undefined ? v.precoNotaFiscal : v.precoVarejo) : 'R$ ' + (v.precoNotaFiscal || v.precoVarejo || 0);
      const precoEspecial = typeof formatCurrency === 'function' ? formatCurrency(v.precoEspecial !== undefined ? v.precoEspecial : v.precoAtacado) : 'R$ ' + (v.precoEspecial || v.precoAtacado || 0);

      return `
        <div style="margin-bottom:0.35rem;">
          ${v.codigo ? `<span style="display:inline-block; padding:0.1rem 0.45rem; border-radius:8px; font-size:0.72rem; font-weight:800; background:#e0f2fe; color:#0369a1; margin-right:0.3rem;">${escapeProductHtml(v.codigo)}</span>` : ''}
          <strong>${escapeProductHtml(v.volume || 'Padrão')}</strong> ${fragList ? `<small style="color:#64748b;">(${fragList})</small>` : ''} — 
          Atacado: <span class="quick-edit-price" style="cursor:pointer; color:#0284c7; font-weight:600;" data-id="${prod.id}" data-vindex="${index}" data-field="precoAtacado">${precoAtacado}</span> | 
          Varejo: <span class="quick-edit-price" style="cursor:pointer; color:#0284c7; font-weight:600;" data-id="${prod.id}" data-vindex="${index}" data-field="precoVarejo">${precoVarejo}</span> | 
          NF: <span class="quick-edit-price" style="cursor:pointer; color:#0284c7; font-weight:600;" data-id="${prod.id}" data-vindex="${index}" data-field="precoNotaFiscal">${precoNF}</span> | 
          Especial: <span class="quick-edit-price" style="cursor:pointer; color:#d97706; font-weight:700;" data-id="${prod.id}" data-vindex="${index}" data-field="precoEspecial">${precoEspecial}</span>
        </div>
      `;
    }).join('');

    return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:0.75rem; font-weight:bold;">${nome}</td>
        <td style="padding:0.75rem;">${categoria}</td>
        <td style="padding:0.75rem;">${variationsList}</td>
        <td style="padding:0.75rem;">
          <span style="padding:0.25rem 0.5rem; border-radius:12px; font-size:0.75rem; font-weight:bold; background:${isAtivo ? '#dcfce7' : '#fee2e2'}; color:${isAtivo ? '#16a34a' : '#ef4444'};">
            ${isAtivo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td style="padding:0.75rem; text-align:right;">
          <button onclick="editProduct('${prod.id}')" class="btn btn-outline btn-sm" type="button">Editar</button>
          <button onclick="deleteProduct('${prod.id}')" class="btn btn-outline btn-sm" style="color:#ef4444; border-color:#fca5a5;" type="button">Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Gera cards Mobile (Fiel ao produtos.html)
function generateProductsMobileCards(products) {
  if (!products || products.length === 0) {
    return `<div class="empty-card" style="padding:2rem; text-align:center; color:#64748b; background:white; border-radius:16px; border:1px dashed #cbd5e1;">Nenhum produto cadastrado.</div>`;
  }

  return products.map((prod, i) => {
    const isAtivo = prod.ativo !== false;
    const nome = escapeProductHtml(prod.nome || prod.name || 'Sem nome');
    const categoria = escapeProductHtml(prod.categoria || 'Geral');

    const variationsList = (prod.variacoes || []).map((v, index) => {
      const fragList = Array.isArray(v.fragrancias) ? v.fragrancias.join(', ') : (v.fragrancias || '');
      const precoAtacado = typeof formatCurrency === 'function' ? formatCurrency(v.precoAtacado) : 'R$ ' + (v.precoAtacado || 0);
      const precoVarejo = typeof formatCurrency === 'function' ? formatCurrency(v.precoVarejo) : 'R$ ' + (v.precoVarejo || 0);
      const precoNF = typeof formatCurrency === 'function' ? formatCurrency(v.precoNotaFiscal !== undefined ? v.precoNotaFiscal : v.precoVarejo) : 'R$ ' + (v.precoNotaFiscal || v.precoVarejo || 0);
      const precoEspecial = typeof formatCurrency === 'function' ? formatCurrency(v.precoEspecial !== undefined ? v.precoEspecial : v.precoAtacado) : 'R$ ' + (v.precoEspecial || v.precoAtacado || 0);

      return `
        <div class="variation-block">
          <div class="variation-title"><i class="ph ph-drop"></i> ${v.codigo ? `<span class="catalog-code-tag">${escapeProductHtml(v.codigo)}</span>` : ''} <strong>${escapeProductHtml(v.volume || 'Padrão')}</strong> ${fragList ? `<small style="color:#64748b;">(${fragList})</small>` : ''}</div>
          <div class="prices-flex">
            <span class="price-tag">Atacado: <strong class="quick-edit-price" data-id="${prod.id}" data-vindex="${index}" data-field="precoAtacado">${precoAtacado}</strong></span>
            <span class="price-tag">Varejo: <strong class="quick-edit-price" data-id="${prod.id}" data-vindex="${index}" data-field="precoVarejo">${precoVarejo}</strong></span>
            <span class="price-tag">NF: <strong class="quick-edit-price" data-id="${prod.id}" data-vindex="${index}" data-field="precoNotaFiscal">${precoNF}</strong></span>
            <span class="price-tag">Especial: <strong class="quick-edit-price" data-id="${prod.id}" data-vindex="${index}" data-field="precoEspecial">${precoEspecial}</strong></span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <article class="product-card" style="animation-delay:${(i * 0.04).toFixed(2)}s;">
        <div class="product-header">
          <h3 class="product-title">${nome}</h3>
          <span class="badge-status ${isAtivo ? 'status-active' : 'status-inactive'}">${isAtivo ? 'Ativo' : 'Inativo'}</span>
        </div>
        <p class="product-category">Categoria: <strong>${categoria}</strong></p>

        ${variationsList}

        <div class="card-actions">
          <button onclick="editProduct('${prod.id}')" class="btn btn-edit" type="button"><i class="ph ph-pencil-simple"></i> Editar</button>
          <button onclick="deleteProduct('${prod.id}')" class="btn btn-delete" type="button"><i class="ph ph-trash"></i> Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

// Configuração de Eventos
function setupProductEvents() {
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-product') {
      productsCurrentPage.desktop = 1;
      productsCurrentPage.mobile = 1;
      renderProductResults();
    }
  });
}

function bindProductsDOMEvents() {
  const modal = document.getElementById('modal-product');
  const btnNew = document.getElementById('btn-new-product');
  const btnCancel = document.getElementById('btn-cancel-product');
  const form = document.getElementById('form-product');
  const btnAddVar = document.getElementById('btn-add-variation');

  document.querySelectorAll('[data-product-letter]').forEach(button => {
    button.onclick = () => {
      productInitialFilter = button.dataset.productLetter || '';
      productsCurrentPage.desktop = 1;
      productsCurrentPage.mobile = 1;
      document.querySelectorAll('[data-product-letter]').forEach(item => item.classList.toggle('active', item === button));
      renderProductResults();
    };
  });

  document.querySelectorAll('[data-products-page]').forEach(button => {
    button.onclick = () => {
      if (button.disabled) return;
      productsCurrentPage[button.dataset.productsPaginationTarget] = Number(button.dataset.productsPage);
      renderProductResults();
      document.getElementById('search-product')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });

  // Import / Export mini-modal
  const importMenuBtn = document.getElementById('btn-mobile-import-menu');
  const importExportModal = document.getElementById('import-export-modal');
  const importExportBackdrop = document.getElementById('import-export-backdrop');
  const btnCloseIE = document.getElementById('btn-close-import-export');

  const openImportExport = () => { if (importExportModal) { importExportModal.classList.remove('hidden'); } };
  const closeImportExport = () => { if (importExportModal) { importExportModal.classList.add('hidden'); } };

  if (importMenuBtn) importMenuBtn.onclick = openImportExport;
  if (btnCloseIE) btnCloseIE.onclick = closeImportExport;
  if (importExportBackdrop) importExportBackdrop.onclick = closeImportExport;

  // Fecha o modal ao escolher Importar ou Exportar (a ação é tratada em backup.js)
  const btnImportIE = document.getElementById('btn-import-json');
  const btnExportIE = document.getElementById('btn-export-json');
  if (btnImportIE) btnImportIE.onclick = closeImportExport;
  if (btnExportIE) btnExportIE.onclick = closeImportExport;

  if (btnNew) {
    btnNew.onclick = () => openProductModal();
  }

  if (btnCancel) {
    btnCancel.onclick = () => closeProductModal();
  }

  const btnCloseX = document.getElementById('btn-close-product-x');
  if (btnCloseX) {
    btnCloseX.onclick = () => closeProductModal();
  }

  if (btnAddVar) {
    btnAddVar.onclick = () => addVariationRow();
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await saveProductForm();
    };
  }

  // Evento de Edição Rápida de Preços ao clicar no valor
  document.querySelectorAll('.quick-edit-price').forEach(elem => {
    elem.onclick = async () => {
      const prodId = elem.getAttribute('data-id');
      const vIndex = parseInt(elem.getAttribute('data-vindex'), 10);
      const field = elem.getAttribute('data-field');
      
      const product = productsCache.find(p => p.id === prodId);
      if (!product || !product.variacoes || !product.variacoes[vIndex]) return;

      const currentVal = product.variacoes[vIndex][field] || 0;
      const newValStr = prompt(`Informe o novo ${field === 'precoAtacado' ? 'Preço de Atacado' : field === 'precoNotaFiscal' ? 'Preço Nota Fiscal' : field === 'precoEspecial' ? 'Preço Especial (DF)' : 'Preço de Varejo'}:`, currentVal);

      if (newValStr !== null) {
        const newVal = typeof parseCurrency === 'function' ? parseCurrency(newValStr) : parseFloat(newValStr) || 0;
        product.variacoes[vIndex][field] = newVal;
        product.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

        try {
          await db.collection('products').doc(prodId).update({
            variacoes: product.variacoes,
            updatedAt: product.updatedAt
          });
          if (typeof showToast === 'function') showToast("Preço atualizado com sucesso!", "success");
        } catch (err) {
          console.error("Erro ao atualizar preço:", err);
          if (typeof showToast === 'function') showToast("Não foi possível salvar o preço.", "error");
        }
      }
    };
  });
}

// Abre Modal (Modo Criação ou Edição)
function openProductModal(product = null) {
  const modal = document.getElementById('modal-product');
  const title = document.getElementById('modal-product-title');
  const container = document.getElementById('variations-container');
  
  if (!modal) return;

  container.innerHTML = '';

  if (product) {
    title.textContent = 'Editar Produto';
    document.getElementById('product-id').value = product.id || '';
    document.getElementById('product-nome').value = product.nome || product.name || '';
    document.getElementById('product-categoria').value = product.categoria || '';
    document.getElementById('product-descricao').value = product.descricao || '';
    document.getElementById('product-ativo').checked = product.ativo !== false;

    if (Array.isArray(product.variacoes) && product.variacoes.length > 0) {
      product.variacoes.forEach(v => addVariationRow(v));
    } else {
      addVariationRow();
    }
  } else {
    title.textContent = 'Cadastrar Produto';
    const form = document.getElementById('form-product');
    if (form) form.reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-ativo').checked = true;
    addVariationRow();
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeProductModal() {
  const modal = document.getElementById('modal-product');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Linhas Dinâmicas de Variação (Volume / Preços / Fragrâncias)
function addVariationRow(data = null) {
  const container = document.getElementById('variations-container');
  if (!container) return;

  const rowId = Date.now() + Math.random().toString(36).substring(2, 5);

  const volume = data ? (data.volume || '') : '';
  const precoAtacado = data ? (data.precoAtacado !== undefined ? data.precoAtacado : '') : '';
  const precoVarejo = data ? (data.precoVarejo !== undefined ? data.precoVarejo : '') : '';
  const precoNotaFiscal = data ? (data.precoNotaFiscal !== undefined ? data.precoNotaFiscal : precoVarejo) : '';
  const precoEspecial = data ? (data.precoEspecial !== undefined ? data.precoEspecial : precoAtacado) : '';
  const codigo = data ? (data.codigo || '') : '';
  
  let fragrancias = '';
  if (data && data.fragrancias) {
    fragrancias = Array.isArray(data.fragrancias) ? data.fragrancias.join(', ') : String(data.fragrancias);
  }

  const row = document.createElement('div');
  row.className = 'variation-row';
  row.id = `row-${rowId}`;
  row.style.cssText = 'background:#f8fafc; padding:0.75rem; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:0.5rem;';

  row.innerHTML = `
    <div style="margin-bottom:0.5rem;">
      <label style="font-size:0.75rem; font-weight:700;">Volume/Unidade</label>
      <input type="text" class="v-volume form-control" value="${volume}" placeholder="Ex: 1L, 5L" required style="width:100%; padding:0.4rem;">
    </div>
    <div style="margin-bottom:0.5rem;">
      <label style="font-size:0.75rem; font-weight:700;">Código do Catálogo</label>
      <div style="display:flex; gap:0.4rem; align-items:center;">
        <input type="text" class="v-codigo form-control" value="${codigo}" placeholder="Ex: CL2, AM5, AR60" style="flex:1; padding:0.4rem; text-transform:uppercase;">
        <button type="button" class="btn-suggest-code" title="Sugerir código automaticamente" style="padding:0.4rem 0.6rem; font-size:0.75rem; font-weight:700; border:1px solid #cbd5e1; border-radius:8px; background:#fff; cursor:pointer; color:#0284c7;"><i class="ph ph-magic-wand"></i></button>
      </div>
      <small style="color:#64748b; font-size:0.7rem;">Vincula este produto ao catálogo visual offline (ex.: CL2 = Cloro 2L).</small>
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:0.5rem; margin-bottom:0.5rem;">
      <div>
        <label style="font-size:0.75rem; font-weight:700;">Atacado (R$)</label>
        <input type="number" step="0.01" class="v-atacado form-control" value="${precoAtacado}" inputmode="decimal" placeholder="0.00" required autocomplete="off" data-numeric-only="decimal" style="width:100%; padding:0.4rem;">
      </div>
      <div>
        <label style="font-size:0.75rem; font-weight:700;">Varejo (R$)</label>
        <input type="number" step="0.01" class="v-varejo form-control" value="${precoVarejo}" inputmode="decimal" placeholder="0.00" required autocomplete="off" data-numeric-only="decimal" style="width:100%; padding:0.4rem;">
      </div>
      <div>
        <label style="font-size:0.75rem; font-weight:700;">Nota Fiscal (R$)</label>
        <input type="number" step="0.01" class="v-nota-fiscal form-control" value="${precoNotaFiscal}" inputmode="decimal" placeholder="Usa varejo" autocomplete="off" data-numeric-only="decimal" style="width:100%; padding:0.4rem;">
      </div>
      <div>
        <label style="font-size:0.75rem; font-weight:700; color:#b45309;">Especial / DF (R$)</label>
        <input type="number" step="0.01" class="v-especial form-control" value="${precoEspecial}" inputmode="decimal" placeholder="Usa atacado" autocomplete="off" data-numeric-only="decimal" style="width:100%; padding:0.4rem;">
      </div>
    </div>
    <div>
      <label style="font-size:0.75rem; font-weight:700;">Fragrâncias (Separadas por vírgula)</label>
      <input type="text" class="v-fragrancias form-control" value="${fragrancias}" placeholder="Ex: Lavanda, Floral, Talco" style="width:100%; padding:0.4rem;">
    </div>
    <div style="text-align:right; margin-top:0.4rem;">
      <button type="button" onclick="document.getElementById('row-${rowId}').remove()" style="color:#ef4444; background:none; border:none; font-size:0.8rem; font-weight:700; cursor:pointer;"><i class="ph ph-trash"></i> Remover Variação</button>
    </div>
  `;

  container.appendChild(row);

  // Botão de sugestão automática de código (nome do produto + volume)
  const suggestBtn = row.querySelector('.btn-suggest-code');
  if (suggestBtn) {
    suggestBtn.addEventListener('click', () => {
      const nomeInput = document.getElementById('product-nome');
      const nome = nomeInput ? nomeInput.value.trim() : '';
      const volInput = row.querySelector('.v-volume');
      const volume = volInput ? volInput.value.trim() : '';
      if (!nome) {
        if (typeof showToast === 'function') showToast("Preencha o nome do produto primeiro.", "error");
        return;
      }
      if (!volume) {
        if (typeof showToast === 'function') showToast("Preencha o volume da variação primeiro.", "error");
        return;
      }
      const code = suggestCatalogCode(nome, volume);
      const codigoInput = row.querySelector('.v-codigo');
      if (codigoInput) codigoInput.value = code;
      if (typeof showToast === 'function') showToast(`Código sugerido: ${code}`, "info");
    });
  }
}

// Salva Produto no Firestore
async function saveProductForm() {
  const id = document.getElementById('product-id').value;
  const nome = document.getElementById('product-nome').value.trim();
  const categoria = document.getElementById('product-categoria').value.trim();
  const descricao = document.getElementById('product-descricao').value.trim();
  const ativo = document.getElementById('product-ativo').checked;

  const variationRows = document.querySelectorAll('.variation-row');
  const variacoes = [];

  variationRows.forEach(row => {
    const volume = row.querySelector('.v-volume').value.trim();
    const atacadoVal = row.querySelector('.v-atacado').value;
    const varejoVal = row.querySelector('.v-varejo').value;

    const precoAtacado = typeof parseCurrency === 'function' ? parseCurrency(atacadoVal) : parseFloat(atacadoVal) || 0;
    const precoVarejo = typeof parseCurrency === 'function' ? parseCurrency(varejoVal) : parseFloat(varejoVal) || 0;
    const notaFiscalVal = row.querySelector('.v-nota-fiscal').value;
    const precoNotaFiscal = typeof parseCurrency === 'function' ? parseCurrency(notaFiscalVal) : parseFloat(notaFiscalVal) || 0;
    const especialVal = row.querySelector('.v-especial').value;
    const precoEspecial = typeof parseCurrency === 'function' ? parseCurrency(especialVal) : parseFloat(especialVal) || 0;
    const fragStr = row.querySelector('.v-fragrancias').value;
    const codigoInput = row.querySelector('.v-codigo');
    const codigo = codigoInput ? codigoInput.value.trim().toUpperCase() : '';
    
    const fragrancias = fragStr ? fragStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    if (volume) {
      variacoes.push({
        volume,
        codigo: codigo || suggestCatalogCode(nome, volume),
        precoAtacado,
        precoVarejo,
        precoNotaFiscal: precoNotaFiscal || precoVarejo,
        precoEspecial: precoEspecial || precoAtacado,
        fragrancias
      });
    }
  });

  if (variacoes.length === 0) {
    if (typeof showToast === 'function') showToast("Adicione pelo menos uma variação de volume/preço.", "error");
    return;
  }

  const payload = {
    nome,
    categoria,
    descricao,
    ativo,
    variacoes,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await db.collection('products').doc(id).update(payload);
      if (typeof showToast === 'function') showToast("Produto atualizado com sucesso!", "success");
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').add(payload);
      if (typeof showToast === 'function') showToast("Produto criado com sucesso!", "success");
    }

    closeProductModal();
  } catch (err) {
    console.error("Erro ao salvar produto:", err);
    if (typeof showToast === 'function') showToast("Erro ao salvar produto.", "error");
  }
}

// Funções de Edição e Exclusão chamadas pela tabela
window.editProduct = (id) => {
  const prod = productsCache.find(p => p.id === id);
  if (prod) {
    openProductModal(prod);
  } else {
    console.warn("Produto não encontrado no cache:", id);
  }
};

window.deleteProduct = async (id) => {
  const prod = productsCache.find(p => p.id === id);
  const nome = prod?.nome || prod?.name || 'este produto';
  if (confirm(`Deseja realmente remover o produto "${nome}"?`)) {
    try {
      await db.collection('products').doc(id).delete();
      if (typeof showToast === 'function') showToast("Produto removido com sucesso.", "info");
    } catch (err) {
      console.error("Erro ao excluir:", err);
      if (typeof showToast === 'function') showToast("Não foi possível excluir o produto.", "error");
    }
  }
};

// Atualização de dados do Dashboard
function updateDashboardMetrics() {
  const activeElem = document.getElementById('dash-active-products');
  const totalElem = document.getElementById('dash-total-products');
  const mobActiveElem = document.getElementById('mob-dash-active-products');
  const mobTotalElem = document.getElementById('mob-dash-total-products');

  const activeCount = productsCache.filter(p => p.ativo !== false).length;
  const totalCount = productsCache.length;

  if (activeElem) activeElem.textContent = activeCount;
  if (totalElem) totalElem.textContent = totalCount;
  if (mobActiveElem) mobActiveElem.textContent = activeCount;
  if (mobTotalElem) mobTotalElem.textContent = totalCount;

  if (typeof window.updateDashboardCategories === 'function') {
    window.updateDashboardCategories();
  }
}
