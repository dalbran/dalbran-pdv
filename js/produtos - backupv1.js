/**
 * Módulo de Gestão de Produtos e Catálogo (Firestore Sync)
 */

// 1. Torna o cache acessível globalmente via window
window.productsCache = [];

document.addEventListener('DOMContentLoaded', () => {
  if (auth) {
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
    
    // Atualiza contadores no Dashboard
    updateDashboardMetrics();
    
    // Renderiza a tabela de produtos
    renderProductsTable();

    // 2. NOVO: Preenche a lista do select de Orçamentos assim que os dados chegarem do BD
    if (typeof window.populateOrcamentoProductsSelect === 'function') {
      window.populateOrcamentoProductsSelect();
    }
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
    <div class="view-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <h2>Gestão de Produtos</h2>
      <div style="display:flex; gap:0.5rem;">
        <button id="btn-import-json" class="btn btn-outline btn-sm">Importar JSON</button>
        <button id="btn-export-json" class="btn btn-outline btn-sm">Exportar JSON</button>
        <button id="btn-new-product" class="btn btn-primary btn-sm">+ Novo Produto</button>
      </div>
    </div>

    <div style="margin-bottom: 1rem;">
      <input type="text" id="search-product" placeholder="Buscar produto por nome ou categoria..." class="form-control" style="width:100%; padding:0.6rem; border:1px solid #ccc; border-radius:4px;">
    </div>

    <div class="table-responsive" style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; background:white; border-radius:8px; overflow:hidden;">
        <thead>
          <tr style="background:#f1f5f9; text-align:left; border-bottom:2px solid #e2e8f0;">
            <th style="padding:0.75rem;">Nome</th>
            <th style="padding:0.75rem;">Categoria</th>
            <th style="padding:0.75rem;">Variações (Volume / Preços)</th>
            <th style="padding:0.75rem;">Status</th>
            <th style="padding:0.75rem; text-align:right;">Ações</th>
          </tr>
        </thead>
        <tbody id="products-table-body">
          ${generateProductsRows(productsCache)}
        </tbody>
      </table>
    </div>

    <div id="modal-product" class="modal hidden" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center; z-index:1000;">
      <div style="background:white; padding:2rem; border-radius:8px; max-width:600px; width:90%; max-height:90vh; overflow-y:auto;">
        <h3 id="modal-product-title" style="margin-bottom:1rem;">Cadastrar Produto</h3>
        <form id="form-product">
          <input type="hidden" id="product-id">
          
          <div class="form-group">
            <label>Nome do Produto</label>
            <input type="text" id="product-nome" required placeholder="Ex: Desinfetante">
          </div>

          <div class="form-group">
            <label>Categoria</label>
            <input type="text" id="product-categoria" required placeholder="Ex: Limpeza Geral">
          </div>

          <div class="form-group">
            <label>Descrição</label>
            <textarea id="product-descricao" rows="2" placeholder="Opcional"></textarea>
          </div>

          <div class="form-group">
            <label><input type="checkbox" id="product-ativo" checked> Produto Ativo</label>
          </div>

          <hr style="margin:1rem 0;">
          <h4>Variações de Volume e Preço</h4>
          <p style="font-size:0.8rem; color:#666; margin-bottom:0.5rem;">Adicione volumes, preços e fragrâncias. Não duplique o produto para cada fragrância.</p>

          <div id="variations-container"></div>
          
          <button type="button" id="btn-add-variation" class="btn btn-outline btn-sm" style="margin-top:0.5rem;">+ Adicionar Volume</button>

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

// Gera as linhas da tabela
function generateProductsRows(products) {
  if (!products || products.length === 0) {
    return `<tr><td colspan="5" style="padding:1.5rem; text-align:center; color:#666;">Nenhum produto cadastrado.</td></tr>`;
  }

  return products.map(prod => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:0.75rem; font-weight:bold;">${prod.nome || prod.name || 'Sem nome'}</td>
      <td style="padding:0.75rem;">${prod.categoria || '-'}</td>
      <td style="padding:0.75rem;">
        ${(prod.variacoes || []).map((v, index) => {
          const fragList = Array.isArray(v.fragrancias) ? v.fragrancias.join(', ') : (v.fragrancias || 'Nenhuma');
          return `
            <div style="font-size:0.85rem; margin-bottom:0.25rem; background:#f8fafc; padding:0.25rem 0.5rem; border-radius:4px;">
              <strong>${v.volume || 'Padrão'}:</strong> 
              Atacado: <span class="quick-edit-price" data-id="${prod.id}" data-vindex="${index}" data-field="precoAtacado" style="cursor:pointer; text-decoration:underline; color:#0284c7;">${typeof formatCurrency === 'function' ? formatCurrency(v.precoAtacado) : 'R$ ' + (v.precoAtacado || 0)}</span> | 
              Varejo: <span class="quick-edit-price" data-id="${prod.id}" data-vindex="${index}" data-field="precoVarejo" style="cursor:pointer; text-decoration:underline; color:#0284c7;">${typeof formatCurrency === 'function' ? formatCurrency(v.precoVarejo) : 'R$ ' + (v.precoVarejo || 0)}</span>
              <br><small style="color:#64748b;">Fragrâncias: ${fragList}</small>
            </div>
          `;
        }).join('')}
      </td>
      <td style="padding:0.75rem;">
        <span style="padding:0.25rem 0.5rem; border-radius:12px; font-size:0.75rem; font-weight:bold; background:${prod.ativo !== false ? '#dcfce7' : '#fee2e2'}; color:${prod.ativo !== false ? '#166534' : '#991b1b'};">
          ${prod.ativo !== false ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td style="padding:0.75rem; text-align:right;">
        <button onclick="editProduct('${prod.id}')" class="btn btn-outline btn-sm">Editar</button>
        <button onclick="deleteProduct('${prod.id}')" class="btn btn-outline btn-sm" style="color:red; border-color:#fca5a5;">Excluir</button>
      </td>
    </tr>
  `).join('');
}

// Configuração de Eventos
function setupProductEvents() {
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-product') {
      const term = e.target.value.toLowerCase();
      const filtered = productsCache.filter(p => 
        (p.nome && p.nome.toLowerCase().includes(term)) || 
        (p.categoria && p.categoria.toLowerCase().includes(term))
      );
      const tbody = document.getElementById('products-table-body');
      if (tbody) tbody.innerHTML = generateProductsRows(filtered);
    }
  });
}

function bindProductsDOMEvents() {
  const modal = document.getElementById('modal-product');
  const btnNew = document.getElementById('btn-new-product');
  const btnCancel = document.getElementById('btn-cancel-product');
  const form = document.getElementById('form-product');
  const btnAddVar = document.getElementById('btn-add-variation');

  if (btnNew) {
    btnNew.onclick = () => {
      openProductModal();
    };
  }

  if (btnCancel) {
    btnCancel.onclick = () => {
      closeProductModal();
    };
  }

  if (btnAddVar) {
    btnAddVar.onclick = () => {
      addVariationRow();
    };
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
      const newValStr = prompt(`Informe o novo ${field === 'precoAtacado' ? 'Preço de Atacado' : 'Preço de Varejo'}:`, currentVal);

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
    addVariationRow(); // Adiciona linha padrão
  }

  // Remove a classe hidden e define display flex para garantir exibição
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
  
  let fragrancias = '';
  if (data && data.fragrancias) {
    fragrancias = Array.isArray(data.fragrancias) ? data.fragrancias.join(', ') : String(data.fragrancias);
  }

  const row = document.createElement('div');
  row.className = 'variation-row';
  row.id = `row-${rowId}`;
  row.style.cssText = 'background:#f8fafc; padding:0.75rem; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:0.5rem;';

  row.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:0.5rem; margin-bottom:0.5rem;">
      <div>
        <label style="font-size:0.75rem;">Volume/Unidade</label>
        <input type="text" class="v-volume" value="${volume}" placeholder="Ex: 2L, 500ml" required style="width:100%; padding:0.4rem;">
      </div>
      <div>
        <label style="font-size:0.75rem;">Preço Atacado (R$)</label>
        <input type="number" step="0.01" class="v-atacado" value="${precoAtacado}" placeholder="0.00" required style="width:100%; padding:0.4rem;">
      </div>
      <div>
        <label style="font-size:0.75rem;">Preço Varejo (R$)</label>
        <input type="number" step="0.01" class="v-varejo" value="${precoVarejo}" placeholder="0.00" required style="width:100%; padding:0.4rem;">
      </div>
    </div>
    <div>
      <label style="font-size:0.75rem;">Fragrâncias (Separadas por vírgula)</label>
      <input type="text" class="v-fragrancias" value="${fragrancias}" placeholder="Ex: Lavanda, Floral, Talco" style="width:100%; padding:0.4rem;">
    </div>
    <div style="text-align:right; margin-top:0.4rem;">
      <button type="button" onclick="document.getElementById('row-${rowId}').remove()" style="color:red; background:none; border:none; font-size:0.8rem; cursor:pointer;">Remover Variação</button>
    </div>
  `;

  container.appendChild(row);
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
    const fragStr = row.querySelector('.v-fragrancias').value;
    
    const fragrancias = fragStr ? fragStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    if (volume) {
      variacoes.push({
        volume,
        precoAtacado,
        precoVarejo,
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
  if (confirm("Tem certeza que deseja excluir este produto?")) {
    try {
      await db.collection('products').doc(id).delete();
      if (typeof showToast === 'function') showToast("Produto removido.", "info");
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

  if (activeElem && totalElem) {
    const activeCount = productsCache.filter(p => p.ativo !== false).length;
    activeElem.textContent = activeCount;
    totalElem.textContent = productsCache.length;
  }
}