/**
 * Módulo de Orçamentos e Motor Comercial (com suporte total a Mobile e Desktop)
 */

let cart = [];
let quotesHistory = [];
let quotesUnsubscribe = null;
let currentQuoteNumber = null;
let selectedClientId = '';
let savedQuoteId = null;
let documentMode = 'orcamento';
let sidebarSearch = '';
let sidebarPage = 1;
let selectedVendedorId = '';
let lastFinalizedSale = null;
let justFinalizedSaleId = null;
let pdvQuickSelection = { productId: '', variationIndex: null, fragrances: {}, editingIndex: -1 };
let pdvQuickPage = 1;
let orcamentoQuickPage = 1;

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getQuoteNumber(prefix = 'ORC') {
  return currentQuoteNumber || `${prefix}--`;
}

async function reserveDocumentNumber(prefix) {
  const counterRef = db.collection('settings').doc(`counter-${prefix.toLowerCase()}`);
  const next = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(counterRef);
    const value = (snapshot.exists ? Number(snapshot.data().lastNumber) || 0 : 0) + 1;
    transaction.set(counterRef, { lastNumber: value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return value;
  });
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

window.populateOrcamentoClientsSelect = function() {
  const select = document.getElementById('orc-select-cliente');
  if (!select) return;
  const value = select.value || selectedClientId;
  select.innerHTML = '<option value="">Consumidor Final (Balcão)</option>' + (window.clientsCache || []).map(client => `<option value="${client.id}">${escapeProductHtml(client.nome || client.nomeFantasia || 'Cliente sem nome')}</option>`).join('');
  if (value && (window.clientsCache || []).some(client => client.id === value)) select.value = value;
};

window.populateVendedorSelect = function() {
  const select = document.getElementById('orc-select-vendedor');
  if (!select) return;
  const previousValue = select.value || selectedVendedorId;
  const currentUser = typeof auth !== 'undefined' ? auth.currentUser : null;
  const operators = window.operatorsCache || [];
  select.innerHTML = '<option value="">dalbran (master)</option>' + operators.map(operator => `<option value="${operator.id}">${escapeProductHtml(operator.nome || operator.email)}${operator.papel === 'master' ? ' (master)' : ''}</option>`).join('');
  const currentOperator = operators.find(operator => operator.email === currentUser?.email);
  const value = previousValue || currentOperator?.id || '';
  if (value && operators.some(operator => operator.id === value)) { select.value = value; selectedVendedorId = value; }
};

function getSelectedVendedor() { return (window.operatorsCache || []).find(operator => operator.id === selectedVendedorId) || null; }

function getSelectedClient() {
  return (window.clientsCache || []).find(client => client.id === selectedClientId) || null;
}

function getVariationPrice(variation, priceTable) {
  const price = priceTable === 'atacado' ? variation.precoAtacado : priceTable === 'notaFiscal' ? (variation.precoNotaFiscal !== undefined ? variation.precoNotaFiscal : variation.precoVarejo) : priceTable === 'especial' ? (variation.precoEspecial !== undefined ? variation.precoEspecial : variation.precoAtacado) : variation.precoVarejo;
  return price;
}

// ---------------------------------------------------------------
// Variantes de item (genérico: fragrância, cor, sabor, etc.)
// Um item do carrinho pode carregar:
//   - fragrancia: string única (legado, ex.: "Maçã" ou "Padrão")
//   - fragrancias: [{ nome, qtd }] (novo, multi-seleção agrupada)
// O banco continua guardando o nome completo; a abreviação é só visual.
// ---------------------------------------------------------------
function variantesDoItem(item) {
  if (!item) return [];
  if (Array.isArray(item.fragrancias) && item.fragrancias.length) {
    return item.fragrancias
      .map(v => ({ nome: String(v.nome || v.name || ''), qtd: Number(v.qtd ?? v.quantidade) || 0 }))
      .filter(v => v.nome);
  }
  const single = String(item.fragrancia || '');
  if (single && single !== 'Padrão') return [{ nome: single, qtd: Number(item.quantidade) || 0 }];
  return [];
}

// Abreviação inteligente só para renderização compacta (ex.: Maçã→Mac).
function abreviarVariante(nome) {
  const original = String(nome || '').trim();
  const flat = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!flat || flat.length <= 3) return original;
  const ab = flat.slice(0, 3);
  return ab.charAt(0).toUpperCase() + ab.slice(1).toLowerCase();
}

// Resumo compacto: "5 Maçã • 5 Coco • 5 Neutro" (ignora qtd 0).
function resumoVariantes(item, opts) {
  const abrev = !!(opts && opts.abreviar);
  return variantesDoItem(item)
    .filter(v => (Number(v.qtd) || 0) > 0)
    .map(v => `${v.qtd} ${(abrev ? abreviarVariante(v.nome) : v.nome)}`)
    .join(' • ');
}

// Quebra o resumo em linhas de no máx. maxChars sem cortar palavras.
function quebrarResumoVariantes(item, maxChars, opts) {
  const parts = variantesDoItem(item)
    .filter(v => (Number(v.qtd) || 0) > 0)
    .map(v => `${v.qtd} ${(opts && opts.abreviar ? abreviarVariante(v.nome) : v.nome)}`);
  const lines = [];
  let cur = '';
  parts.forEach(p => {
    const cand = cur ? cur + ' • ' + p : p;
    if (cur && cand.length > maxChars) { lines.push(cur); cur = p; }
    else cur = cand;
  });
  if (cur) lines.push(cur);
  return lines;
}

// Linha HTML do resumo de variantes para o carrinho (ou legado Frag:).
function linhaVarianteItem(item) {
  const resumo = resumoVariantes(item);
  if (resumo) return `<small class="cart-variant-summary">${escapeProductHtml(resumo)}</small>`;
  if (item.fragrancia && item.fragrancia !== 'Padrão') return `<small>Frag: ${escapeProductHtml(item.fragrancia)}</small>`;
  return '';
}

// Linha "20 UN x R$ 11,99" para recibos/impressão (preço unitário sempre visível).
function linhaUnidadeItem(item) {
  return `${item.quantidade || 0} UN x ${formatCurrency(item.precoUnitario || 0)}`;
}

// Fragmento "<br><small>resumo das variantes</small>" para recibos/cupons.
// opts: { abreviar, maxChars, classe }. Sem variantes, usa a fragrância única legada.
function fragmentoVarianteImpressao(item, opts) {
  const abrev = !!(opts && opts.abreviar);
  const max = (opts && opts.maxChars) || 0;
  let linhas = [];
  if (variantesDoItem(item).length) {
    linhas = max > 0 ? quebrarResumoVariantes(item, max, { abreviar: abrev }) : [resumoVariantes(item, { abreviar: abrev })];
    linhas = linhas.filter(Boolean);
  }
  if (!linhas.length && item.fragrancia && item.fragrancia !== 'Padrão') linhas = [String(item.fragrancia)];
  if (!linhas.length) return '';
  const cls = (opts && opts.classe) ? ` class="${opts.classe}"` : '';
  const style = (opts && opts.estilo) ? ` style="${opts.estilo}"` : '';
  return '<br><small' + cls + style + '>' + linhas.map(escapeProductHtml).join('<br>') + '</small>';
}

// Opções de compactação por formato de impressão.
function opcoesVariantePorFormato(format) {
  if (format === '58mm') return { abreviar: true, maxChars: 30 };
  if (format === '80mm') return { abreviar: false, maxChars: 42 };
  return { abreviar: false, maxChars: 0 };
}

function recalcularItemAgrupado(item) {
  const vars = variantesDoItem(item);
  if (!vars.length) return item;
  const total = vars.reduce((acc, v) => acc + (Number(v.qtd) || 0), 0);
  item.quantidade = total;
  item.subtotal = Number((Number(item.precoUnitario || 0) * total).toFixed(2));
  return item;
}

function chaveAgrupamentoItem(item) {
  return [(item.produtoId || ''), normalizeSearchText(item.volume), Number(item.precoUnitario) || 0].join('|');
}

// Agrupa no carrinho quando produto+volume+preço forem iguais; soma o
// detalhamento por variante. Retorna o índice do item. Itens sem variante
// somam quantidade normalmente.
function mesclarItemNoCarrinho(carrinho, novo) {
  const key = chaveAgrupamentoItem(novo);
  const novoVars = variantesDoItem(novo);
  for (let i = 0; i < carrinho.length; i++) {
    const cur = carrinho[i];
    if (chaveAgrupamentoItem(cur) !== key) continue;
    const map = new Map();
    variantesDoItem(cur).forEach(v => map.set(v.nome, (map.get(v.nome) || 0) + (Number(v.qtd) || 0)));
    novoVars.forEach(v => map.set(v.nome, (map.get(v.nome) || 0) + (Number(v.qtd) || 0)));
    if (map.size) {
      cur.fragrancias = [...map.entries()].map(([nome, qtd]) => ({ nome, qtd }));
      recalcularItemAgrupado(cur);
    } else {
      cur.quantidade = (Number(cur.quantidade) || 0) + (Number(novo.quantidade) || 0);
      cur.subtotal = Number((Number(cur.precoUnitario || 0) * cur.quantidade).toFixed(2));
    }
    return i;
  }
  if (novoVars.length) {
    novo.fragrancias = novoVars.map(v => ({ nome: v.nome, qtd: v.qtd }));
    recalcularItemAgrupado(novo);
  }
  carrinho.push(novo);
  return carrinho.length - 1;
}

function markQuoteDirty() { savedQuoteId = null; }

window.populateOrcamentoProductsSelect = function(searchTerm = '') {
  const selectProd = document.getElementById('orc-select-produto');
  if (!selectProd) return;

  const currentValue = selectProd.value;
  const normalizedTerm = normalizeSearchText(searchTerm);
  const products = (window.productsCache || []).filter(p => {
    const productName = p.nome || p.name || '';
    return p.ativo !== false && (!normalizedTerm || normalizeSearchText(productName).includes(normalizedTerm));
  });

  let optionsHTML = '<option value="">-- Selecione o produto... --</option>';
  optionsHTML += products.map(p => {
    const firstVar = (p.variacoes && p.variacoes[0]) ? p.variacoes[0] : null;
    const priceText = firstVar ? ` (${firstVar.volume} - ${formatCurrency(firstVar.precoVarejo || firstVar.precoAtacado || 0)})` : '';
    return `<option value="${p.id}">${escapeProductHtml(p.nome || p.name)}${priceText}</option>`;
  }).join('');

  selectProd.innerHTML = optionsHTML;

  if (currentValue && products.some(p => p.id === currentValue)) {
    selectProd.value = currentValue;
  }
  renderPdvQuickProducts();
};

function getPdvQuickProducts() {
  const products = (window.productsCache || []).filter(product => product.ativo !== false);
  const soldQuantity = new Map();
  (window.quotesCache || []).filter(doc => doc.tipo === 'venda').forEach(sale => {
    (sale.itens || []).forEach(item => {
      const productKey = item.produtoId || normalizeSearchText(item.nome);
      const variationKey = `${productKey}::${normalizeSearchText(item.volume)}`;
      const quantity = Number(item.quantidade) || 1;
      soldQuantity.set(productKey, (soldQuantity.get(productKey) || 0) + quantity);
      soldQuantity.set(variationKey, (soldQuantity.get(variationKey) || 0) + quantity);
    });
  });
  const preferredNames = ['cloro', 'desinfetante', 'detergente', 'amaciante', 'multiuso', 'multilimp', 'sabao de roupas', 'roupex', 'aromatizante', 'hipoclorito', 'desinfetante concentrado'];
  const ranked = products.map(product => {
    const name = normalizeSearchText(product.nome || product.name);
    const productHistory = soldQuantity.get(product.id) || soldQuantity.get(name) || 0;
    const fallbackIndex = preferredNames.findIndex(term => name.includes(term));
    return { product, history: productHistory, fallbackIndex, score: (productHistory * 1000) + (fallbackIndex >= 0 ? 100 - fallbackIndex : 0) };
  });
  return ranked.sort((a, b) => b.score - a.score || String(a.product.nome || a.product.name).localeCompare(String(b.product.nome || b.product.name), 'pt-BR'));
}

function buildQuickProducts(mode = documentMode) {
  const products = getPdvQuickProducts();
  if (!products.length) return '<p class="pdv-quick-empty">Cadastre produtos para ver os atalhos rápidos.</p>';
  // No desktop/tablet colocamos paginação dinâmica (16 itens por página) para manter cards compactos e ágeis
  const isDesktop = window.innerWidth >= 769 && mode === documentMode;
  const pageSize = isDesktop ? 16 : 6;
  const totalPages = Math.ceil(products.length / pageSize) || 1;
  const isPdv = mode === 'pdv';
  const page = isPdv ? pdvQuickPage : orcamentoQuickPage;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  if (isPdv) pdvQuickPage = currentPage;
  else orcamentoQuickPage = currentPage;
  const priceTable = document.getElementById('orc-select-tabela')?.value || 'varejo';
  const priceTableLabel = priceTable === 'atacado' ? 'Atacado' : priceTable === 'notaFiscal' ? 'Nota fiscal' : priceTable === 'especial' ? 'Especial ⭐ (DF)' : 'Varejo';
  const pageProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const cards = pageProducts.map(({ product, history }) => {
    const name = escapeProductHtml(product.nome || product.name || 'Produto');
    const volumes = product.variacoes?.length || 0;
    const firstVariation = product.variacoes?.[0];
    const price = firstVariation ? formatCurrency(getVariationPrice(firstVariation, priceTable)) : '';
    const subtitle = history ? `${history} un. vendidas` : (volumes > 1 ? `${volumes} opções` : (firstVariation?.volume || 'Padrão'));
    return `<button type="button" class="pdv-quick-product" data-pdv-product-id="${product.id}" title="${name}${price ? ` - ${price}` : ''}"><i class="ph ph-plus-circle" aria-hidden="true"></i><span class="pdv-quick-name">${name}</span><small class="pdv-quick-meta">${subtitle}${price ? ` · ${price}` : ''}</small></button>`;
  }).join('');
  const pagination = totalPages > 1 ? `<div class="pdv-quick-pagination"><button type="button" data-quick-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} title="Página anterior"><i class="ph ph-caret-left"></i></button><span>${currentPage} de ${totalPages} (${products.length} itens) · ${priceTableLabel}</span><button type="button" data-quick-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} title="Próxima página"><i class="ph ph-caret-right"></i></button></div>` : `<div class="pdv-quick-pagination pdv-quick-price-label"><span>${products.length} produto(s) · ${priceTableLabel}</span></div>`;
  return cards + pagination;
}

function buildPdvQuickProducts() { return buildQuickProducts('pdv'); }
function buildOrcamentoQuickProducts() { return buildQuickProducts('orcamento'); }

function renderPdvQuickProducts() {
  const container = document.getElementById('pdv-quick-products');
  if (container) container.innerHTML = buildPdvQuickProducts();
  const quoteContainer = document.getElementById('orcamento-quick-products');
  if (quoteContainer) quoteContainer.innerHTML = buildOrcamentoQuickProducts();
  const desktopContainer = document.getElementById('desktop-quick-products');
  if (desktopContainer) desktopContainer.innerHTML = buildQuickProducts(documentMode);
}

window.selectPdvQuickProduct = function(productId) {
  selectProductFromSearch(productId);
  openPdvQuickQuantityModal(productId);
};

window.closePdvQuickQuantityModal = function() {
  const modal = document.getElementById('pdv-quick-quantity-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('open');
  }
};

function focusQuantityInputAtEnd() {
  const input = document.getElementById('pdv-quick-quantity-input');
  if (!input) return;
  input.focus();
  const length = input.value ? String(input.value).length : 0;
  try { input.setSelectionRange(length, length); } catch (e) { /* sem suporte */ }
}

function getPdvQuickQuantityModal() {
  let modal = document.getElementById('pdv-quick-quantity-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'pdv-quick-quantity-modal';
  modal.className = 'pdv-quantity-modal hidden';
  modal.innerHTML = `<div class="pdv-quantity-backdrop"></div><section class="pdv-quantity-sheet" role="dialog" aria-modal="true" aria-labelledby="pdv-quantity-title"><div class="sheet-handle"></div><button type="button" class="pdv-quantity-close" aria-label="Fechar"><i class="ph ph-x"></i></button><h3 id="pdv-quantity-title"></h3><p class="pdv-quantity-instruction">Escolha a litragem para continuar.</p><div class="pdv-quantity-body"><div class="pdv-volume-options"></div><div class="pdv-fragrance-options hidden"></div><div class="pdv-quantity-controls hidden"><label>Quantidade de unidades</label><div class="pdv-quantity-row"><div class="pdv-quantity-stepper"><button type="button" data-pdv-quantity="-1" aria-label="Diminuir">−</button><input id="pdv-quick-quantity-input" type="text" inputmode="numeric" pattern="[0-9]*" value="1" autocomplete="off" data-numeric-only="int"><button type="button" data-pdv-quantity="1" aria-label="Aumentar">+</button></div><div class="pdv-quick-adds"><button type="button" data-pdv-quick-add="1">+1</button><button type="button" data-pdv-quick-add="5">+5</button><button type="button" data-pdv-quick-add="10">+10</button></div></div></div><button type="button" class="pdv-quantity-confirm">Adicionar ao carrinho</button></div></section>`;
  document.body.appendChild(modal);
  const close = () => { window.closePdvQuickQuantityModal(); };
  modal.querySelector('.pdv-quantity-backdrop').onclick = close;
  modal.querySelector('.pdv-quantity-close').onclick = close;
  modal.querySelector('.pdv-volume-options').onclick = event => {
    const button = event.target.closest('[data-pdv-volume-index]');
    if (!button) return;
    pdvQuickSelection.variationIndex = Number(button.dataset.pdvVolumeIndex);
    modal.querySelectorAll('[data-pdv-volume-index]').forEach(item => item.classList.toggle('active', item === button));
    const variation = document.getElementById('orc-select-variacao');
    if (variation) { variation.value = String(pdvQuickSelection.variationIndex); variation.dispatchEvent(new Event('change')); }

    const product = (window.productsCache || []).find(p => p.id === pdvQuickSelection.productId);
    const selectedVar = product?.variacoes?.[pdvQuickSelection.variationIndex];

    if (selectedVar && selectedVar.fragrancias && selectedVar.fragrancias.length > 0) {
      renderPdvFragGrid(modal, selectedVar.fragrancias);
      modal.querySelector('.pdv-quantity-controls').classList.add('hidden');
      modal.querySelector('.pdv-quantity-instruction').textContent = 'Toque nas fragrâncias e informe as quantidades.';
    } else {
      modal.querySelector('.pdv-fragrance-options').classList.add('hidden');
      modal.querySelector('.pdv-quantity-instruction').textContent = 'Informe a quantidade de unidades.';
      modal.querySelector('.pdv-quantity-controls').classList.remove('hidden');
      focusQuantityInputAtEnd();
    }
    atualizarPdvFragTotal(modal);
  };
  // Grade multi-fragrâncias: eventos ligados em renderPdvFragGrid (ligarEventosGrade).
  modal.querySelectorAll('[data-pdv-quantity]').forEach(button => button.onclick = () => {
    const input = modal.querySelector('#pdv-quick-quantity-input');
    input.value = Math.max(1, (parseInt(input.value, 10) || 1) + Number(button.dataset.pdvQuantity));
  });
  modal.querySelectorAll('[data-pdv-quick-add]').forEach(button => button.onclick = () => {
    const input = modal.querySelector('#pdv-quick-quantity-input');
    input.value = Math.max(1, (parseInt(input.value, 10) || 1) + Number(button.dataset.pdvQuickAdd));
    focusQuantityInputAtEnd();
  });
  modal.querySelector('.pdv-quantity-confirm').onclick = () => {
    if (pdvQuickSelection.variationIndex === null) return;
    const fragTotal = totalPdvFragMap();
    const gridVisible = !modal.querySelector('.pdv-fragrance-options').classList.contains('hidden');
    if (gridVisible && fragTotal > 0) {
      confirmarItemAgrupadoDoModal(modal);
      close();
      return;
    }
    if (gridVisible && fragTotal === 0) { showToast('Informe a quantidade de ao menos uma fragrância.', 'error'); return; }
    const quantity = Math.max(1, parseInt(modal.querySelector('#pdv-quick-quantity-input').value, 10) || 1);
    const quantityInput = document.getElementById('orc-input-qtd');
    if (quantityInput) quantityInput.value = quantity;
    document.getElementById('btn-add-item')?.click();
    close();
  };
  return modal;
}

// Núcleo reutilizável da grade multi-fragrâncias (modal rápido + formulário).
// `map` é o objeto { nome: qtd } que guarda o estado da grade.
function gradeFragHTML(fragrancias, preset) {
  return `<div class="pdv-frag-total">Total: <b>0</b> un.</div>` + (fragrancias || []).map(f => {
    const name = String(f);
    const qtd = Math.max(0, parseInt(preset && preset[name], 10) || 0);
    return `<div class="pdv-frag-row" data-frag-name="${escapeProductHtml(name)}">`
      + `<span class="pdv-frag-name">${escapeProductHtml(name)}</span>`
      + `<div class="pdv-frag-stepper"><button type="button" data-frag-dec aria-label="Diminuir">−</button>`
      + `<input data-frag-input type="text" inputmode="numeric" pattern="[0-9]*" value="${qtd}" autocomplete="off">`
      + `<button type="button" data-frag-inc aria-label="Aumentar">+</button></div></div>`;
  }).join('');
}

function preencherMapaFrag(map, fragrancias, preset) {
  Object.keys(map).forEach(k => delete map[k]);
  (fragrancias || []).forEach(f => {
    const name = String(f);
    map[name] = Math.max(0, parseInt(preset && preset[name], 10) || 0);
  });
}

function totalMapaFrag(map) {
  return Object.values(map || {}).reduce((acc, q) => acc + (Number(q) || 0), 0);
}

function atualizarTotalGrade(container, map) {
  const total = totalMapaFrag(map);
  const el = container ? container.querySelector('.pdv-frag-total b') : null;
  if (el) el.textContent = total;
  return total;
}

// Liga (de forma idempotente) os steppers + digitação da grade.
function ligarEventosGrade(container, map, aoMudar) {
  if (!container) return;
  container.onclick = event => {
    const btn = event.target.closest('[data-frag-inc],[data-frag-dec]');
    if (!btn) return;
    const row = event.target.closest('[data-frag-name]');
    const input = row ? row.querySelector('[data-frag-input]') : null;
    if (!input || !row) return;
    const delta = btn.hasAttribute('data-frag-inc') ? 1 : -1;
    input.value = Math.max(0, (parseInt(input.value, 10) || 0) + delta);
    map[row.dataset.fragName] = Number(input.value) || 0;
    atualizarTotalGrade(container, map);
    if (typeof aoMudar === 'function') aoMudar();
  };
  container.oninput = event => {
    const input = event.target.closest('[data-frag-input]');
    if (!input) return;
    const row = event.target.closest('[data-frag-name]');
    if (!row) return;
    input.value = String(Math.max(0, parseInt(input.value, 10) || 0));
    map[row.dataset.fragName] = Number(input.value) || 0;
    atualizarTotalGrade(container, map);
    if (typeof aoMudar === 'function') aoMudar();
  };
}

// Desenha a grade multi-fragrâncias com steppers. `preset` = { nome: qtd } (edição).
function renderPdvFragGrid(modal, fragrancias, preset) {
  const fragContainer = modal.querySelector('.pdv-fragrance-options');
  ligarEventosGrade(fragContainer, pdvQuickSelection.fragrances, () => atualizarPdvFragTotal(modal));
  preencherMapaFrag(pdvQuickSelection.fragrances, fragrancias, preset);
  fragContainer.innerHTML = gradeFragHTML(fragrancias, preset);
  fragContainer.classList.remove('hidden');
  atualizarPdvFragTotal(modal);
}

function totalPdvFragMap() {
  return totalMapaFrag(pdvQuickSelection.fragrances);
}

function atualizarPdvFragTotal(modal) {
  const total = totalPdvFragMap();
  const el = modal.querySelector('.pdv-frag-total b');
  if (el) el.textContent = total;
  const btn = modal.querySelector('.pdv-quantity-confirm');
  if (btn) btn.textContent = pdvQuickSelection.editingIndex >= 0 ? 'Salvar alterações' : (total > 0 ? `Adicionar (${total} un.)` : 'Adicionar ao carrinho');
}

// Grade multi-fragrâncias no formulário (Produto → Volume → grade).
let formFragMap = {};

function formFragGridEl() { return document.getElementById('orc-frag-grid'); }
function formFragVisivel() { const g = formFragGridEl(); return !!(g && !g.classList.contains('hidden')); }
function totalFormFrag() { return totalMapaFrag(formFragMap); }

function esconderFormFragGrid() {
  const g = formFragGridEl();
  if (g) g.classList.add('hidden');
  formFragMap = {};
}

function mostrarFormFragGrid(fragrancias) {
  const g = formFragGridEl();
  if (!g) return;
  ligarEventosGrade(g, formFragMap, null);
  preencherMapaFrag(formFragMap, fragrancias, null);
  g.innerHTML = gradeFragHTML(fragrancias, null);
  g.classList.remove('hidden');
  atualizarTotalGrade(g, formFragMap);
}

// Cria (ou atualiza, em edição) o item agrupado a partir da grade do modal.
function confirmarItemAgrupadoDoModal(modal) {
  const product = (window.productsCache || []).find(p => p.id === pdvQuickSelection.productId);
  const variacao = product?.variacoes?.[pdvQuickSelection.variationIndex];
  if (!product || !variacao) return;
  const tabela = document.getElementById('orc-select-tabela')?.value || 'varejo';
  const precoUnit = Number(getVariationPrice(variacao, tabela)) || 0;
  const frags = Object.entries(pdvQuickSelection.fragrances || {})
    .map(([nome, qtd]) => ({ nome, qtd: Number(qtd) || 0 }))
    .filter(v => v.qtd > 0);
  if (!frags.length) return;
  finalizarItemAgrupado({
    produtoId: product.id,
    nome: product.nome || product.name || 'Produto sem nome',
    volume: variacao.volume,
    precoUnitario: precoUnit,
    quantidade: 0,
    subtotal: 0,
    fragrancias: frags
  }, pdvQuickSelection.editingIndex);
}

// Persiste o item agrupado: mescla no carrinho, recalcula e atualiza a tela.
function finalizarItemAgrupado(item, editando) {
  const emEdicao = Number.isInteger(editando) && editando >= 0 && !!cart[editando];
  recalcularItemAgrupado(item);
  if (emEdicao) {
    cart[editando] = item;
  } else {
    mesclarItemNoCarrinho(cart, item);
  }
  justFinalizedSaleId = null;
  renderCartTable();
  markQuoteDirty();
  updateTotals();
  showToast(emEdicao ? 'Item atualizado!' : 'Item adicionado!', 'info');
}

function openPdvQuickQuantityModal(productId, editIndex) {
  const product = (window.productsCache || []).find(item => item.id === productId);
  if (!product) return;
  const editing = Number.isInteger(editIndex) && editIndex >= 0 && cart[editIndex] ? cart[editIndex] : null;
  const modal = getPdvQuickQuantityModal();
  modal.classList.toggle('orcamento-quantity-modal', documentMode !== 'pdv');
  const variations = product.variacoes?.length ? product.variacoes : [{ volume: 'Padrão', precoVarejo: 0 }];
  let startVariation = variations.length === 1 ? 0 : null;
  let preset = null;
  if (editing) {
    const vi = variations.findIndex(v => (v.volume || 'Padrão') === (editing.volume || 'Padrão'));
    if (vi >= 0) startVariation = vi;
    preset = {};
    variantesDoItem(editing).forEach(v => { preset[v.nome] = v.qtd; });
  }
  pdvQuickSelection = { productId, variationIndex: startVariation, fragrances: {}, editingIndex: editing ? editIndex : -1 };
  modal.querySelector('#pdv-quantity-title').textContent = product.nome || product.name || 'Produto';
  modal.querySelector('.pdv-volume-options').innerHTML = variations.map((variation, index) => `<button type="button" data-pdv-volume-index="${index}" class="pdv-volume-option${index === startVariation ? ' active' : ''}"><strong>${escapeProductHtml(variation.volume || 'Padrão')}</strong><small>${formatCurrency(getVariationPrice(variation, document.getElementById('orc-select-tabela')?.value || 'varejo'))}</small></button>`).join('');

  const controls = modal.querySelector('.pdv-quantity-controls');
  const fragContainer = modal.querySelector('.pdv-fragrance-options');
  fragContainer.classList.add('hidden');

  modal.querySelector('#pdv-quick-quantity-input').value = editing ? (editing.quantidade || 1) : 1;

  const showFragFor = (selectedVar) => {
    if (selectedVar && selectedVar.fragrancias && selectedVar.fragrancias.length > 0) {
      renderPdvFragGrid(modal, selectedVar.fragrancias, preset);
      controls.classList.add('hidden');
      modal.querySelector('.pdv-volume-options').classList.add('hidden');
      modal.querySelector('.pdv-quantity-instruction').textContent = 'Toque nas fragrâncias e informe as quantidades.';
      return true;
    }
    return false;
  };

  if (variations.length === 1 || (editing && startVariation !== null)) {
    const variationSelect = document.getElementById('orc-select-variacao');
    if (variationSelect && startVariation !== null) { variationSelect.value = String(startVariation); variationSelect.dispatchEvent(new Event('change')); }

    const selectedVar = startVariation !== null ? variations[startVariation] : null;
    if (!showFragFor(selectedVar)) {
      controls.classList.remove('hidden');
      modal.querySelector('.pdv-volume-options').classList.add('hidden');
      modal.querySelector('.pdv-quantity-instruction').textContent = 'Informe a quantidade de unidades.';
      setTimeout(focusQuantityInputAtEnd, 50);
    }
  } else {
    controls.classList.add('hidden');
    modal.querySelector('.pdv-volume-options').classList.remove('hidden');
    modal.querySelector('.pdv-quantity-instruction').textContent = 'Escolha a litragem para continuar.';
  }

  atualizarPdvFragTotal(modal);
  modal.classList.remove('hidden');
  modal.classList.add('open');
}

// Reabre o item do carrinho no modal rápido para editar as fragrâncias.
window.editarItemCarrinho = function(index) {
  const item = cart[index];
  if (!item || !item.produtoId) { showToast('Este item não pode ser editado aqui.', 'error'); return; }
  openPdvQuickQuantityModal(item.produtoId, index);
};

function renderProductSearchResults(searchTerm = '') {
  const container = document.getElementById('orc-search-results');
  if (!container) return;
  const term = normalizeSearchText(searchTerm);
  if (!term) {
    container.innerHTML = '';
    return;
  }
  const products = (window.productsCache || []).filter(product => {
    const name = product.nome || product.name || '';
    const cat = product.categoria || '';
    return product.ativo !== false && (
      normalizeSearchText(name).includes(term) ||
      normalizeSearchText(cat).includes(term)
    );
  }).slice(0, 8);
  container.innerHTML = products.length
    ? products.map(product => `<button type="button" class="product-search-result" data-product-id="${product.id}"><span>${escapeProductHtml(product.nome || product.name || 'Produto sem nome')}</span><small>${Array.isArray(product.variacoes) ? `${product.variacoes.length} variação(ões)` : 'Sem variações'}</small></button>`).join('')
    : '<p class="product-search-empty">Nenhum produto encontrado.</p>';
}

function escapeProductHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

function selectProductFromSearch(productId) {
  const select = document.getElementById('orc-select-produto');
  const product = (window.productsCache || []).find(item => item.id === productId);
  if (!select || !product) return;
  select.value = productId;
  select.dispatchEvent(new Event('change'));
  const searchInput = document.getElementById('orc-search-produto');
  if (searchInput) searchInput.value = product.nome || product.name || '';
  const searchResults = document.getElementById('orc-search-results');
  if (searchResults) searchResults.innerHTML = '';
  setPdvProductOptionsOpen(true);
}

function setPdvProductOptionsOpen(open) {
  const panel = document.getElementById('pdv-product-options-panel');
  const button = document.getElementById('btn-toggle-product-options');
  if (!panel || !button) return;
  panel.classList.toggle('hidden', !open);
  button.setAttribute('aria-expanded', String(open));
  button.classList.toggle('open', open);
}

document.addEventListener('DOMContentLoaded', () => {
  renderOrcamentoView();

  if (typeof auth !== 'undefined' && auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        initOrcamentoModule();
      }
    });
  }

});

function initOrcamentoModule() {
  if (typeof quotesUnsubscribe === 'function') {
    quotesUnsubscribe();
  }

  renderOrcamentoView();

  if (typeof db === 'undefined' || !db) {
    console.error('Firestore is unavailable for quotes.');
    return;
  }
  quotesUnsubscribe = db.collection('quotes').orderBy('createdAt', 'desc').limit(100)
    .onSnapshot((snapshot) => {
      quotesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      window.quotesCache = quotesHistory;
      updateDashboardQuoteMetrics();
      renderSavedQuotesSidebar();
      renderMobileSavedTab();
      renderPdvQuickProducts();
    }, (error) => {
      console.error('Failed to load quote history:', error);
      updateDashboardQuoteMetrics();
    });
}

// Renderiza a interface do módulo de Orçamento / PDV
function renderMobileOrcamentoView(viewId = 'view-orcamento', mode = 'orcamento') {
  const container = document.getElementById(viewId);
  if (!container) return;
  documentMode = mode;
  const isPdv = mode === 'pdv';
  const otherView = document.getElementById(viewId === 'view-pdv' ? 'view-orcamento' : 'view-pdv');
  if (otherView) otherView.innerHTML = '';

  const savedCount = (window.quotesCache || []).filter(q => isPdv ? q.tipo === 'venda' : q.tipo !== 'venda').length;

  // Atualiza barra de status do sistema operacional
  if (typeof window.updateAppStatusBar === 'function') {
    window.updateAppStatusBar(viewId);
  }

  container.innerHTML = `
    <!-- Header Especial para PDV Mobile -->
    ${isPdv ? `
      <div class="header-pdv mobile-only-header">
        <div class="brand-info">
          <div class="pdv-badge"><i class="ph ph-shopping-cart-simple"></i></div>
        </div>
        <div class="caixa-status">
          <span class="status-dot"></span> CAIXA ABERTO
        </div>
      </div>
    ` : `
      <div class="view-header top-section desktop-only-header" style="margin-bottom:1rem;">
        <h2 class="section-title">Novo Orçamento</h2>
      </div>
    `}

    <!-- Alternador de Abas Mobile (Fiel aos modelos orcamentos.html e PDV.html) -->
    <div class="tab-toggle">
      <button class="tab-btn active" id="tab-btn-novo" onclick="switchDocumentTab('novo')">
        <i class="ph ${isPdv ? 'ph-plus-circle' : 'ph-file-plus'}"></i> ${isPdv ? 'Nova Venda' : 'Novo Orçamento'}
      </button>
      <button class="tab-btn" id="tab-btn-salvos" onclick="switchDocumentTab('salvos')">
        <i class="ph ${isPdv ? 'ph-receipt' : 'ph-clock-counter-clockwise'}"></i> ${isPdv ? 'Histórico' : 'Salvos'} <span id="tab-saved-count" style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:10px;background:var(--accent,#0284c7);color:#fff;font-size:0.7rem;font-weight:800;padding:0 5px;margin-left:4px;">${savedCount}</span>
      </button>
    </div>

    <nav class="mobile-pdv-flow-nav ${isPdv ? '' : 'mobile-orcamento-flow-nav'}" aria-label="Etapas do ${isPdv ? 'pedido' : 'orçamento'}"><button type="button" class="active" data-mobile-step-target="section-client-card"><b>1</b><span>Cliente</span></button><button type="button" data-mobile-step-target="section-items-card"><b>2</b><span>Produtos</span></button><button type="button" data-mobile-step-target="section-finish-card"><b>3</b><span>${isPdv ? 'Pagamento' : 'Finalizar'}</span></button></nav>

    <!-- CONTEÚDO DA ABA 1: NOVO ORÇAMENTO / NOVA VENDA -->
    <div id="tab-content-novo" class="tab-content active">
      
      <!-- 1. DADOS DO CLIENTE E OPERADOR -->
      <section class="section-card step-section step-section-client" data-step="1" id="section-client-card">

        <!-- Cabeçalho clicável para expandir/compactar -->
        <div class="section-card-title section-card-title-toggle" id="btn-toggle-client-section">
          <span style="display:flex;align-items:center;gap:8px;">
            <i class="ph ${isPdv ? 'ph-user-check' : 'ph-user'}"></i>
            1. ${isPdv ? 'Operação & Cliente' : 'Dados do Cliente'}
          </span>
          <span class="client-section-summary" id="client-section-summary" style="display:none;"></span>
          <button type="button" class="btn-collapse-section" id="btn-collapse-client" aria-label="Expandir/Compactar">
            <i class="ph ph-caret-up" id="collapse-icon-client"></i>
          </button>
        </div>

        <!-- Corpo expansível -->
        <div id="client-section-body">
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">${isPdv ? 'Operador' : 'Vendedor Responsável'}</label>
            <select class="form-control" id="orc-select-vendedor"><option value="">dalbran (master)</option></select>
          </div>

          <div class="form-group">
            <label class="form-label">${isPdv ? 'Tipo de Venda' : 'Tipo de Orçamento'} / Tabela de Preço</label>
            <div class="tipo-venda-toggle" id="tipo-venda-toggle">
              <button type="button" class="tipo-venda-btn active" data-tabela="varejo" onclick="selectTipoVenda('varejo')"><i class="ph ph-storefront"></i> Varejo</button>
              <button type="button" class="tipo-venda-btn" data-tabela="atacado" onclick="selectTipoVenda('atacado')"><i class="ph ph-package"></i> Atacado</button>
              <button type="button" class="tipo-venda-btn" data-tabela="notaFiscal" onclick="selectTipoVenda('notaFiscal')"><i class="ph ph-receipt"></i> Nota Fiscal</button>
              <button type="button" class="tipo-venda-btn tipo-venda-btn-especial" data-tabela="especial" onclick="selectTipoVenda('especial')"><i class="ph ph-star"></i> Especial</button>
            </div>
          </div>

          <!-- Seletor: cliente cadastrado ou novo -->
          <div class="client-source-toggle" id="client-source-toggle">
            <button type="button" class="client-src-btn active" id="btn-src-cadastrado" onclick="switchClientSource('cadastrado')">
              <i class="ph ph-users"></i> Cadastrado
            </button>
            <button type="button" class="client-src-btn" id="btn-src-novo" onclick="switchClientSource('novo')">
              <i class="ph ph-user-plus"></i> Novo
            </button>
          </div>

          <!-- Painel: cliente cadastrado -->
          <div id="panel-client-cadastrado">
            <div class="form-group">
              <label class="form-label">Selecionar cliente</label>
              <select class="form-control" id="orc-select-cliente"><option value="">Consumidor Final (Balcão)</option></select>
            </div>
          </div>

          <!-- Painel: novo cliente (manual) -->
          <div id="panel-client-novo" style="display:none;">
            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Nome completo / Razão social</label>
                <input type="text" class="form-control" id="orc-cliente-nome" placeholder="Ex: Mercado Silva">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Nome fantasia</label>
                <input type="text" class="form-control" id="orc-cliente-fantasia" placeholder="Opcional">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:1;"><label class="form-label">WhatsApp</label><input type="text" class="form-control" id="orc-cliente-whatsapp" placeholder="(00) 00000-0000"></div>
              <div class="form-group" style="flex:1;"><label class="form-label">Telefone</label><input type="text" class="form-control" id="orc-cliente-telefone" placeholder="Opcional"></div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:1;"><label class="form-label">E-mail</label><input type="email" class="form-control" id="orc-cliente-email" placeholder="cliente@exemplo.com"></div>
              <div class="form-group" style="flex:1;"><label class="form-label">CPF ou CNPJ</label><input type="text" class="form-control" id="orc-cliente-documento" placeholder="Opcional"></div>
            </div>
          </div>

          <!-- Botão compactar -->
          <button type="button" class="btn-compact-client" id="btn-compact-client" onclick="compactClientSection()">
            <i class="ph ph-check-circle"></i> Confirmar e Compactar
          </button>
        </div>
      </section>

      <!-- 2. ADICIONAR PRODUTOS / LANÇAR ITENS -->
      <section class="section-card step-section step-section-items" data-step="2" id="section-items-card">
        <div class="section-card-title ${isPdv ? 'pdv-products-title' : ''}">
          <span><i class="ph ${isPdv ? 'ph-barcode' : 'ph-package'}"></i> 2. ${isPdv ? 'Lançar Produtos' : 'Adicionar Produtos'}</span>
          ${isPdv ? `<button type="button" class="pdv-price-mode-button" id="btn-pdv-price-mode" aria-label="Alterar tabela de preço"><i class="ph ph-arrows-left-right"></i></button>` : ''}
        </div>
        ${isPdv ? `<div id="pdv-price-mode-menu" class="pdv-price-mode-menu hidden"><button type="button" data-pdv-price-mode="varejo">Varejo</button><button type="button" data-pdv-price-mode="atacado">Atacado</button><button type="button" data-pdv-price-mode="notaFiscal">Nota Fiscal</button><button type="button" data-pdv-price-mode="especial">Especial ⭐</button></div>` : ''}

        <div class="pdv-quick-products-wrap ${isPdv ? '' : 'orcamento-quick-products-wrap'}"><div class="pdv-quick-products-header"><span>Produtos mais vendidos</span><small>Baseado nas vendas e no catálogo</small></div><div id="${isPdv ? 'pdv-quick-products' : 'orcamento-quick-products'}" class="pdv-quick-products">${isPdv ? buildPdvQuickProducts() : buildOrcamentoQuickProducts()}</div></div>

        <div class="quick-search-box search-box" style="position:relative; margin-bottom:12px;">
          <i class="ph ph-magnifying-glass" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:#64748b; font-size:1.2rem;"></i>
          <input type="search" id="orc-search-produto" class="form-control quick-search-input search-input" placeholder="${isPdv ? 'Digite o nome ou código do produto...' : 'Buscar produto por nome ou categoria...'}" autocomplete="off" style="padding-left:42px;">
        </div>
        <div id="orc-search-results" class="product-search-results" aria-live="polite"></div>

        <button type="button" class="pdv-product-options-toggle ${isPdv ? '' : 'orcamento-product-options-toggle'}" id="btn-toggle-product-options" aria-expanded="false"><span><i class="ph ph-sliders-horizontal"></i> Produto, opções e quantidade</span><i class="ph ph-caret-down"></i></button><div id="pdv-product-options-panel" class="pdv-product-options-panel hidden">
        <div class="form-group">
          <label class="form-label">Produto Selecionado</label>
          <select id="orc-select-produto" class="form-control">
            <option value="">-- Selecione o produto... --</option>
          </select>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Volume / Variação</label>
            <select id="orc-select-variacao" class="form-control" disabled>
              <option value="">-- Selecione o volume --</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Fragrância / Opção</label>
            <select id="orc-select-fragrancia" class="form-control" disabled>
              <option value="">-- Nenhuma / Padrão --</option>
            </select>
          </div>
        </div>
        <div id="orc-frag-grid" class="pdv-fragrance-options hidden" style="margin-bottom:.75rem;"></div>

        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Tabela de Preço</label>
            <select id="orc-select-tabela" class="form-control">
              <option value="varejo">Varejo</option>
              <option value="atacado">Atacado</option>
              <option value="notaFiscal">Nota Fiscal</option>
              <option value="especial">Especial ⭐ (DF)</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Qtd</label>
            <div class="quantity-control">
              <button type="button" id="btn-qtd-minus" aria-label="Diminuir quantidade">−</button>
              <input type="number" step="1" id="orc-input-qtd" min="1" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-numeric-only="int">
              <button type="button" id="btn-qtd-plus" aria-label="Aumentar quantidade">+</button>
            </div>
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Preço Unit. (R$)</label>
            <input type="text" id="orc-input-preco" class="form-control" placeholder="0,00" readonly style="background:#fafafa; font-weight:700;">
          </div>
        </div>

        <button type="button" id="btn-add-item" class="btn btn-add-item ${isPdv ? 'btn-add-item-pdv' : ''}">
          <i class="ph ph-plus-circle"></i> ${isPdv ? 'Adicionar Item ao Carrinho' : 'Adicionar Item ao Orçamento'}
        </button>
        </div>

        <!-- Lista de Itens do Carrinho (Fiel a orcamentos.html e PDV.html) -->
        <div class="items-list cart-list" id="cart-table-body">
          ${generateCartRows(false)}
        </div>
      </section>

      <!-- 3. FORMA DE PAGAMENTO E FECHAMENTO -->
      <section class="section-card step-section step-section-finish" data-step="3" id="section-finish-card">
        <div class="section-card-title">
          <i class="ph ${isPdv ? 'ph-currency-dollar' : 'ph-credit-card'}"></i> 3. ${isPdv ? 'Forma de Pagamento' : 'Pagamento e Entrega'}
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Meio de Pagamento</label>
            <select id="orc-forma-pagamento" class="form-control" style="font-weight:700;">
              <option value="pix">PIX (Sem Taxa)</option>
              <option value="dinheiro">Dinheiro (Espécie)</option>
              <option value="debito">Cartão de Débito</option>
              <option value="credito">Cartão de Crédito</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="receber">A receber</option>
            </select>
          </div>

          <div class="form-group" style="flex:1;">
            <label class="form-label">Desconto (R$)</label>
            <input type="number" step="0.01" inputmode="decimal" id="orc-desconto" class="form-control" value="0.00" min="0" autocomplete="off" data-numeric-only="decimal">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Prazo de Entrega</label>
            <input type="text" id="orc-prazo-entrega" class="form-control" placeholder="Ex: 2 dias úteis">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Observação</label>
            <input type="text" id="orc-observacao" class="form-control" placeholder="Opcional">
          </div>
        </div>

        <div id="orc-pix-panel" class="pix-panel hidden" style="margin-top:0.75rem;">
          <label class="form-label">Chave PIX para esta operação</label>
          <select id="orc-pix-key" class="form-control"><option value="celular">Celular</option><option value="cnpj">CNPJ</option></select>
          <button type="button" id="btn-generate-pix" class="btn btn-outline btn-block" style="margin-top:6px;">Gerar PIX copia e cola / QR Code</button>
          <div id="orc-pix-result" class="pix-result"></div>
        </div>

        <div id="orc-boleto-panel" class="boleto-panel hidden" style="margin-top:0.75rem;">
          <label class="form-label">URL do boleto desta venda</label>
          <input type="url" id="orc-boleto-url" class="form-control" placeholder="https://drive.google.com/...">
        </div>
      </section>

      <!-- CARD DE RESUMO E FECHAMENTO -->
      <div class="${isPdv ? 'summary-pdv' : 'summary-card'}">
        <div class="summary-row">
          <span>${isPdv ? 'Itens no Carrinho' : 'Subtotal'}</span>
          <span id="${isPdv ? 'summary-items-count' : 'orc-subtotal-val'}">R$ 0,00</span>
        </div>
        ${isPdv ? `
          <div class="summary-row">
            <span>Subtotal</span>
            <span id="orc-subtotal-val">R$ 0,00</span>
          </div>
        ` : ''}
        <div class="summary-row">
          <span>Desconto</span>
          <span id="orc-desconto-val">R$ 0,00</span>
        </div>
        <div class="summary-row ${isPdv ? 'hidden' : ''}" id="row-card-fee">
          <span>Taxa Cartão</span>
          <span id="orc-taxa-val">+ R$ 0,00</span>
        </div>
        <div class="${isPdv ? 'summary-total-pdv' : 'summary-total'}">
          <span>${isPdv ? 'TOTAL A PAGAR' : 'Total Geral'}</span>
          <span class="${isPdv ? 'total-val' : ''}" id="orc-total-val">R$ 0,00</span>
        </div>

        <button id="btn-save-orcamento" class="${isPdv ? 'btn-finish-sale' : 'btn-submit'}" type="button">
          <i class="ph ${isPdv ? 'ph-check-bold' : 'ph-check-circle'}"></i> ${isPdv ? 'CONCLUIR VENDA E GERAR RECIBO' : 'Finalizar e Salvar Orçamento'}
        </button>

        <div style="display:grid; grid-template-columns:auto 1fr; gap:8px; margin-top:10px;">
          <button id="btn-whatsapp-orcamento" class="btn btn-outline" style="border-color:#10b981; color:#10b981; background:white; display:inline-flex; align-items:center; justify-content:center; padding-left:0.95rem; padding-right:0.95rem;" type="button" title="${isPdv ? 'Compartilhar' : 'WhatsApp'}">
            <i class="ph-fill ph-whatsapp-logo"></i>${isPdv ? '' : ' WhatsApp'}
          </button>
          <button id="btn-print-cupom" class="btn btn-outline" style="background:white;" type="button">
            <i class="ph ph-printer"></i> Imprimir
          </button>
        </div>
      </div>

    </div>

    <!-- CONTEÚDO DA ABA 2: SALVOS / HISTÓRICO -->
    <div id="tab-content-salvos" class="tab-content" style="display:none;">
      <div class="form-group search-box" style="position:relative; margin-bottom:14px;">
        <i class="ph ph-magnifying-glass" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:#64748b; font-size:1.2rem;"></i>
        <input type="text" id="search-saved-input" class="form-control search-input" placeholder="${isPdv ? 'Buscar venda por código, cliente ou valor...' : 'Buscar por número, cliente ou data...'}" style="padding-left:42px;">
      </div>

      <div id="mobile-saved-list-container" class="saved-cards-container">
        <!-- Renderizado dinamicamente -->
      </div>
    </div>

    <!-- Modais Auxiliares -->
    <div id="modal-saved-quote" class="modal hidden print-modal"><div class="modal-sheet print-modal-card"><div class="sheet-handle"></div><button type="button" class="btn-close" id="btn-close-saved-quote" aria-label="Fechar"><i class="ph ph-x"></i></button><div id="saved-quote-actions"></div></div></div>
    
    <div id="modal-print-type" class="modal hidden print-modal">
      <div class="modal-sheet print-modal-card">
        <div class="sheet-handle"></div>
        <button type="button" class="btn-close" id="btn-close-print-modal" aria-label="Fechar"><i class="ph ph-x"></i></button>
        <h3>Formato de impressão</h3>
        <p>Escolha o formato adequado para sua impressora.</p>
        <button type="button" class="btn btn-primary btn-block" data-print-type="a4">A4 / Salvar como PDF</button>
        <button type="button" class="btn btn-outline btn-block" data-print-type="80mm">Cupom térmico 80 mm</button>
        <button type="button" class="btn btn-outline btn-block" data-print-type="58mm">Cupom térmico 58 mm</button>
      </div>
    </div>

    <!-- MODAL DE RECIBO TÉRMICO 80MM (Fiel a PDV.html) -->
    <div class="modal-overlay modal hidden" id="modal-receipt">
      <div class="modal-receipt-container">
        <div class="modal-header-receipt">
          <h3><i class="ph ph-receipt"></i> Comprovante de Venda</h3>
          <button class="btn-close-modal" id="btn-close-receipt"><i class="ph ph-x"></i></button>
        </div>

        <div class="receipt-scroll-area">
          <div class="thermal-paper" id="thermal-receipt-content"></div>
        </div>

        <div class="receipt-actions-footer">
          <button class="btn-receipt-action btn-receipt-whatsapp" id="btn-receipt-whatsapp" style="width:100%; border-color:#25d366; color:#16a34a; background:#ecfdf5; margin-bottom:8px;">
            <i class="ph-fill ph-whatsapp-logo"></i>
            <span>Enviar no WhatsApp</span>
          </button>
          <div class="actions-grid">
            <button class="btn-receipt-action" id="btn-receipt-print">
              <i class="ph ph-printer"></i>
              <span>Imprimir</span>
            </button>
            <button class="btn-receipt-action" id="btn-receipt-pdf">
              <i class="ph ph-file-pdf"></i>
              <span>Gerar PDF</span>
            </button>
            <button class="btn-receipt-action" id="btn-receipt-image">
              <i class="ph ph-image"></i>
              <span>Gerar Imagem</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div id="print-area" class="print-document" style="display:none;"></div>
  `;

  bindOrcamentoEvents();

  window.populateOrcamentoProductsSelect();
  window.populateOrcamentoClientsSelect();
  window.populateVendedorSelect();
  renderMobileSavedTab();
}

// A interface mobile permanece independente. Em telas maiores, recupera o
// fluxo sequencial usado originalmente na versão web.
function renderOrcamentoView(viewId = 'view-orcamento', mode = 'orcamento') {
  if (window.matchMedia('(min-width: 769px)').matches) {
    renderDesktopOrcamentoView(viewId, mode);
    return;
  }
  renderMobileOrcamentoView(viewId, mode);
}

function renderDesktopOrcamentoView(viewId = 'view-orcamento', mode = 'orcamento') {
  const container = document.getElementById(viewId);
  if (!container) return;
  documentMode = mode;
  const isPdv = mode === 'pdv';
  const otherView = document.getElementById(viewId === 'view-pdv' ? 'view-orcamento' : 'view-pdv');
  if (otherView) {
    otherView.innerHTML = '';
    otherView.classList.remove('desktop-pdv-workspace', 'desktop-pdv-expanded', 'desktop-orcamento-workspace', 'pdv-mode');
  }

  container.classList.toggle('pdv-mode', isPdv);
  container.classList.toggle('desktop-pdv-workspace', isPdv);
  container.classList.toggle('desktop-orcamento-workspace', !isPdv);
  if (isPdv) container.classList.add('desktop-pdv-expanded');

  const accentColor = isPdv ? '#08a979' : '#0b91cf';

  container.innerHTML = `
    <!-- Header / Module Bar -->
    <section class="module" style="background:#0d172a; color:#fff; height:52px; display:flex; align-items:center; padding:0 16px; gap:12px; border-radius:9px 9px 0 0; margin-bottom:8px;">
      <div style="width:32px; height:32px; border-radius:8px; background:${accentColor}; display:grid; place-items:center; font-size:1.1rem; color:#fff;">
        <i class="ph ${isPdv ? 'ph-desktop-tower' : 'ph-file-text'}"></i>
      </div>
      <div>
        <div class="module-title" style="font-weight:800; font-size:14px; color:#fff; line-height:1.2;">
          ${isPdv ? 'Dalbran Vendas (PDV) Web' : 'Dalbran Orçamentos Web'}
        </div>
        <small style="display:block; color:#a9b7ca; font-weight:400; font-size:10px;">
          ${isPdv ? 'Estação de vendas' : 'Gestão de orçamentos e pedidos'}
        </small>
      </div>

      <!-- Segment Tabs no Header -->
      <div class="desktop-header-tab-toggle tab-toggle" style="margin-left:20px;">
        <button type="button" class="tab-btn active" id="tab-btn-novo" onclick="switchDocumentTab('novo')">
          <i class="ph ${isPdv ? 'ph-plus-circle' : 'ph-file-plus'}"></i> ${isPdv ? 'Nova Venda' : 'Novo Orçamento'}
        </button>
        <button type="button" class="tab-btn" id="tab-btn-salvos" onclick="switchDocumentTab('salvos')">
          <i class="ph ${isPdv ? 'ph-receipt' : 'ph-clock-counter-clockwise'}"></i> ${isPdv ? 'Histórico Vendas' : 'Orçamentos Salvos'}
        </button>
      </div>

      <div class="module-actions" style="margin-left:auto; display:flex; align-items:center; gap:8px;">
        <button type="button" id="btn-toggle-desktop-pdv" style="background:#26354b; color:#fff; border:1px solid #506078; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer;">
          <i class="ph ph-arrows-out-simple"></i> Expandir área
        </button>
        <button type="button" id="btn-exit-desktop-pdv" style="background:#26354b; color:#fff; border:1px solid #506078; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:700; cursor:pointer;">
          <i class="ph ph-arrow-left"></i> Voltar
        </button>
        ${isPdv ? '<span class="desktop-pdv-caixa" style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border:1px solid #08a979; border-radius:999px; background:rgba(8,169,121,.15); color:#69e1ad; font-size:10px; font-weight:800;"><i style="width:6px; height:6px; border-radius:50%; background:#08a979;"></i> CAIXA ABERTO</span>' : ''}
      </div>
    </section>

    <!-- Context Card: 1. Cliente & Vendedor -->
    <section class="context step-section step-section-client" id="desktop-client-step-card">
      <div class="context-head">
        <span class="context-title">
          <i class="ph ph-user-circle context-header-icon" aria-hidden="true"></i>
          <span><small>ETAPA 1</small>Cliente e Vendedor</span>
        </span>
        <div class="steps">
          <button type="button" class="step on flow-step-btn active" data-step="0">1 Cliente</button>
          <button type="button" class="step flow-step-btn" data-step="1">2 Itens</button>
          <button type="button" class="step flow-step-btn" data-step="2">3 Pagamento</button>
        </div>
        <span class="client-section-summary" id="desktop-client-summary" style="display:none; font-size:11px; color:${accentColor}; background:#edf8ff; padding:2px 8px; border-radius:12px; font-weight:700; margin-left:8px;"></span>
        <button type="button" id="btn-toggle-client-desktop" onclick="window.toggleClientSectionDesktop(event)" style="margin-left:auto; border:1px solid var(--line); background:#fff; border-radius:5px; padding:4px 9px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
          <i class="ph ph-caret-up" id="desktop-client-toggle-icon"></i> <span id="desktop-client-toggle-text">Recolher</span>
        </button>
      </div>

      <div id="desktop-client-body">
        <div class="context-grid">
          <div class="field">
            <label>Vendedor</label>
            <select id="orc-select-vendedor"><option value="">Selecione o vendedor</option></select>
          </div>
          <div class="field desktop-client-picker" id="panel-client-cadastrado">
            <label>Selecionar cliente</label>
            <select class="form-control" id="orc-select-cliente"><option value="">Consumidor Final (Balcão)</option></select>
          </div>
          <div class="field">
            <label style="text-align: center; display: block;">Novo</label>
            <button type="button" class="btn btn-primary" style="width: 100%; min-height: 42px; display: flex; align-items: center; justify-content: center; padding: 0;" onclick="openClientModal()" title="Cadastrar novo cliente">
              <i class="ph ph-user-plus" style="font-size: 1.25rem; margin: 0;"></i>
            </button>
          </div>
          <div class="field desktop-price-table">
            <label>Tabela de preço</label>
            <div class="segment tipo-venda-toggle">
              <button type="button" class="tipo-venda-btn selected active" data-tabela="varejo" onclick="selectTipoVenda('varejo')">Varejo</button>
              <button type="button" class="tipo-venda-btn" data-tabela="atacado" onclick="selectTipoVenda('atacado')">Atacado</button>
              <button type="button" class="tipo-venda-btn" data-tabela="notaFiscal" onclick="selectTipoVenda('notaFiscal')">NF</button>
              <button type="button" class="tipo-venda-btn tipo-venda-btn-especial" data-tabela="especial" onclick="selectTipoVenda('especial')">★ Especial</button>
            </div>
          </div>
        </div>
      </div>

    </section>

    <!-- Main Grid: 3 Painéis Lado a Lado (Adicionar Itens | Itens Selecionados | Pagamento) -->
    <main class="main-grid step-section step-section-items" id="desktop-main-grid">
      <!-- Painel 1: 2. Adicionar Itens -->
      <section class="panel">
        <div class="panel-head">
          <span>2. Adicionar Itens</span>
          <span id="desktop-price-mode-label" style="background:#edf8ff; color:${accentColor}; border:1px solid ${accentColor}; padding:2px 8px; border-radius:10px; font-weight:800; font-size:10px;">Varejo</span>
        </div>
        <div class="panel-body">
          <input class="search" placeholder="Digite parte do nome do produto..." id="orc-search-produto" autocomplete="off">
          <div id="orc-search-results" class="product-search-results"></div>
          
          <div class="quick-label">⌘ Produtos mais vendidos</div>
          <div class="quick" id="desktop-quick-products">
            ${buildQuickProducts(isPdv ? 'pdv' : 'orcamento')}
          </div>

          <div class="product-form">
            <div class="field field-prod">
              <label>Produto</label>
              <select id="orc-select-produto"><option value="">-- Selecione um produto --</option></select>
            </div>
            <div class="field field-var">
              <label>Variação / Volume</label>
              <select id="orc-select-variacao" disabled><option value="">-- Selecione --</option></select>
            </div>
            <div class="field field-frag">
              <label>Fragrância / Opção</label>
              <select id="orc-select-fragrancia" disabled><option value="">-- Nenhuma / Padrão --</option></select>
            </div>
            <div id="orc-frag-grid" class="pdv-fragrance-options hidden" style="grid-column:1 / -1;"></div>
            <div class="field field-tab">
              <label>Tabela de Preço</label>
              <select id="orc-select-tabela">
                <option value="varejo">Varejo</option>
                <option value="atacado">Atacado</option>
                <option value="notaFiscal">NF</option>
                <option value="especial">Especial ⭐ (DF)</option>
              </select>
            </div>
            <div class="field field-qty">
              <label>Quantidade</label>
              <div class="qty">
                <button type="button" id="btn-qtd-minus">−</button>
                <input type="number" step="1" id="orc-input-qtd" min="1" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-numeric-only="int">
                <button type="button" id="btn-qtd-plus">+</button>
              </div>
            </div>
            <div class="field field-price">
              <label>Preço Unitário (R$)</label>
              <input type="text" id="orc-input-preco" readonly placeholder="0,00">
            </div>
            <div class="field field-btn">
              <button type="button" id="btn-add-item" class="add" style="background:${accentColor}; width:100%;">+ Adicionar Item</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Painel 2: Itens Selecionados -->
      <section class="panel">
        <div class="panel-head">
          <span>Itens Selecionados</span>
          <span id="desktop-cart-count" style="color:var(--muted); font-size:10px; font-weight:600;">0 itens</span>
        </div>
        <div class="items-wrap desktop-cart-table">
          <table class="items">
            <thead>
              <tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th><th>Ação</th></tr>
            </thead>
            <tbody id="cart-table-body">
              ${generateCartRows(true)}
            </tbody>
          </table>
        </div>
      </section>

      <div class="panel-resize-handle" data-handle="1" title="Arraste para redimensionar"></div>

      <!-- Painel 3: 3. Forma de Pagamento e Finalização -->
      <aside class="panel step-section-finish">
        <div class="panel-head">3. Forma de Pagamento e Finalização</div>
        <div class="payment">
          <div class="field">
            <label>Forma de Pagamento</label>
            <select id="orc-forma-pagamento">
              <option value="pix">PIX (Sem Taxa)</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Cartão de Débito</option>
              <option value="credito">Cartão de Crédito</option>
              <option value="boleto">Boleto</option>
              <option value="receber">A receber</option>
            </select>
          </div>
          <div class="field">
            <label>Desconto adicional (R$)</label>
            <input type="number" step="0.01" inputmode="decimal" id="orc-desconto" value="0.00" min="0" autocomplete="off" data-numeric-only="decimal">
          </div>
          <div class="field">
            <label>Prazo de entrega</label>
            <input type="text" id="orc-prazo-entrega" placeholder="Ex.: 2 dias úteis">
          </div>
          <div class="field">
            <label>Observação extra</label>
            <textarea class="note" id="orc-observacao" placeholder="Opcional" style="width:100%; border:1px solid var(--line); border-radius:6px; padding:6px; resize:none;"></textarea>
          </div>
          <div id="orc-pix-panel" class="pix-panel hidden">
            <label style="font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase;">Chave PIX</label>
            <select id="orc-pix-key"><option value="celular">Celular</option><option value="cnpj">CNPJ</option></select>
            <button type="button" id="btn-generate-pix" class="btn btn-outline btn-sm" style="margin-top:4px; width:100%; font-size:11px;">Gerar QR Code PIX</button>
            <div id="orc-pix-result" class="pix-result"></div>
          </div>
          <div id="orc-boleto-panel" class="boleto-panel hidden">
            <label style="font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase;">URL do boleto</label>
            <input type="url" id="orc-boleto-url" placeholder="https://...">
          </div>
        </div>

        <div class="summary">
          <div class="sumrow"><span>Subtotal</span><b id="orc-subtotal-val">R$ 0,00</b></div>
          <div class="sumrow"><span>Desconto</span><b id="orc-desconto-val">− R$ 0,00</b></div>
          <div class="sumrow" id="row-card-fee"><span>Taxa Cartão</span><b id="orc-taxa-val">+ R$ 0,00</b></div>
          <div class="sumrow total"><span>Total Geral</span><b id="orc-total-val" style="color:${accentColor};">R$ 0,00</b></div>
        </div>

        <div class="final-actions">
          <button type="button" id="btn-save-orcamento" class="primary" style="background:${accentColor}; border-color:${accentColor};">
            <i class="ph ${isPdv ? 'ph-check-bold' : 'ph-check-circle'}"></i> ${isPdv ? 'Finalizar Venda' : 'Salvar Orçamento'}
          </button>
          <div class="final-actions-secondary" style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <button type="button" id="btn-whatsapp-orcamento" style="display:inline-flex; align-items:center; justify-content:center; gap:4px;">
              <i class="ph-fill ph-whatsapp-logo" style="color:#10b981;"></i> WhatsApp
            </button>
            <button type="button" id="btn-print-cupom" style="display:inline-flex; align-items:center; justify-content:center; gap:4px;">
              <i class="ph ph-printer"></i> Imprimir
            </button>
          </div>
        </div>
        <div class="footer-hint">Todos os recursos do sistema estão ativos.</div>
      </aside>
    </main>

    <!-- Seção Histórico Salvo (Oculto por padrão, abre sob demanda) -->
    <section class="desktop-saved-modal step-section step-section-saved" id="desktop-section-saved" role="dialog" aria-modal="true" aria-label="Histórico de documentos" onclick="if (event.target === this) window.switchDocumentTab('novo')" style="display:none;">
      <div class="panel" style="padding:18px;">
        <div class="panel-head" style="margin-bottom:14px; border:none; padding:0;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:8px; background:${accentColor}; color:#fff; display:grid; place-items:center; font-size:1.2rem;">
              <i class="ph ${isPdv ? 'ph-receipt' : 'ph-clock-counter-clockwise'}"></i>
            </div>
            <div>
              <h3 style="margin:0; font-size:1.15rem; color:#1e293b;">${isPdv ? 'Vendas Salvas no Sistema' : 'Orçamentos Salvos no Sistema'}</h3>
              <small style="color:#64748b; font-size:11px;" id="saved-quotes-count">Histórico completo de registros</small>
            </div>
          </div>
          <button type="button" onclick="window.switchDocumentTab('novo')" style="padding:6px 14px; font-weight:700; border-radius:6px; border:1px solid var(--line); background:#fff; cursor:pointer;">
            ✕ Fechar e Voltar
          </button>
        </div>
        <input id="saved-documents-search" class="saved-documents-search search" type="search" placeholder="Buscar por número, cliente ou data..." style="margin-bottom:12px;">
        <div id="saved-quotes-list" class="saved-quotes-list"></div>
        <div id="saved-documents-pagination"></div>
      </div>
    </section>

    <div id="print-area" class="print-document" style="display:none;"></div>
    <div id="modal-print-type" class="modal hidden print-modal"><div class="print-modal-card"><h3>Formato de impressão</h3><p>Escolha o formato adequado para sua impressora.</p><button type="button" class="btn btn-primary btn-block" data-print-type="a4">A4 / Salvar como PDF</button><button type="button" class="btn btn-outline btn-block" data-print-type="80mm">Cupom térmico 80 mm</button><button type="button" class="btn btn-outline btn-block" data-print-type="58mm">Cupom térmico 58 mm</button><button type="button" id="btn-close-print-modal" class="btn btn-outline btn-block">Cancelar</button></div></div>
    <div id="modal-saved-quote" class="modal hidden print-modal"><div class="print-modal-card"><button type="button" class="modal-close" id="btn-close-saved-quote">×</button><div id="saved-quote-actions"></div></div></div>`;
  bindOrcamentoEvents();
  window.populateOrcamentoProductsSelect(); window.populateOrcamentoClientsSelect(); window.populateVendedorSelect();
  if (typeof renderSavedQuotesSidebar === 'function') renderSavedQuotesSidebar();
  updateTotals();
  setupDesktopDocumentFlow(container, isPdv);
  setupResizablePanels(container, isPdv);
  setupWorkspaceWidthControl(container, isPdv);
}

function setupDesktopDocumentFlow(container, isPdv) {
  const titles = [
    'Dados do cliente e vendedor',
    isPdv ? 'Adicionar itens à venda' : 'Adicionar itens ao orçamento',
    'Forma de pagamento e finalização',
    isPdv ? 'Histórico de vendas salvas' : 'Histórico de orçamentos salvos'
  ];
  let current = 0;
  
  const updateWizardUI = (index) => {
    current = Math.max(0, Math.min(index, titles.length - 1));
    const titleEl = container.querySelector('.flow-current-title');
    if (titleEl) titleEl.textContent = titles[current];
    
    container.querySelectorAll('.flow-step-btn').forEach((button, i) => {
      button.classList.toggle('active', i === current);
      button.classList.toggle('completed', i < current);
    });
    
    const prevBtn = container.querySelector('#flow-prev-btn');
    const nextBtn = container.querySelector('#flow-next-btn');
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.textContent = current === 3 ? (isPdv ? 'Ver Vendas' : 'Ver Orçamentos') : 'Próximo →';
    
    if (current === 0) {
      document.getElementById('orc-select-cliente')?.focus();
    } else if (current === 1) {
      document.getElementById('orc-search-produto')?.focus();
    } else if (current === 2) {
      document.getElementById('orc-forma-pagamento')?.focus();
    } else if (current === 3) {
      window.switchDocumentTab('salvos');
    }
  };

  container.querySelectorAll('.flow-step-btn').forEach((button, i) => {
    button.onclick = () => updateWizardUI(i);
  });
  
  const prevBtn = container.querySelector('#flow-prev-btn');
  if (prevBtn) prevBtn.onclick = () => updateWizardUI(current - 1);
  
  const nextBtn = container.querySelector('#flow-next-btn');
  if (nextBtn) nextBtn.onclick = () => {
    if (current === 3) {
      window.switchDocumentTab('salvos');
    } else {
      updateWizardUI(current + 1);
    }
  };
}

// ── Resizable Panels: drag handles to resize columns, saved per user preset ──
function setupResizablePanels(container, isPdv) {
  const STORAGE_KEY = `desktop-panel-widths-v5-${isPdv ? 'pdv' : 'orc'}`;
  const grid = container.querySelector('#desktop-main-grid');
  if (!grid) return;

  // Load saved column widths
  const saved = localStorage.getItem(STORAGE_KEY);
  // A previous broken layout could have persisted only the three panel columns.
  // This workspace needs five tracks: panel, handle, panel, handle, panel.
  if (saved && saved.trim().split(/\s+/).length === 5) {
    try { grid.style.gridTemplateColumns = saved; } catch(e) {}
  }

  // Inject first handle between panel 1 and panel 2 (before the items panel)
  // The handle between panel 2 and panel 3 is already in the HTML (data-handle="1")
  const panels = Array.from(grid.children);
  if (panels.length >= 1) {
    const firstPanel = panels[0];
    const existingHandle = grid.querySelector('[data-handle="0"]');
    if (!existingHandle) {
      const h = document.createElement('div');
      h.className = 'panel-resize-handle';
      h.dataset.handle = '0';
      h.title = 'Arraste para redimensionar';
      firstPanel.after(h);
    }
  }

  grid.querySelectorAll('.panel-resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX;
      const computedCols = window.getComputedStyle(grid).gridTemplateColumns;
      // Parse pixel columns (filtering out handle-sized ones)
      const allCols = computedCols.split(' ').map(c => parseFloat(c));
      // Indexes: panel0=0, handle0=1, panel1=2, handle1=3, panel2=4
      const handleIdx = parseInt(handle.dataset.handle);
      const leftColIdx = handleIdx * 2;      // 0 or 2
      const rightColIdx = leftColIdx + 2;    // 2 or 4

      const origLeft = allCols[leftColIdx] || 300;
      const origRight = allCols[rightColIdx] || 250;

      grid.classList.add('is-resizing');

      const onMove = me => {
        const dx = me.clientX - startX;
        const newLeft = Math.max(180, origLeft + dx);
        const newRight = Math.max(160, origRight - dx);
        const newCols = [...allCols];
        newCols[leftColIdx] = newLeft;
        newCols[rightColIdx] = newRight;
        grid.style.gridTemplateColumns = newCols.map((v, i) => {
          // Handle columns (1 and 3) keep their fixed width
          if (i === 1 || i === 3) return '6px';
          return v + 'px';
        }).join(' ');
      };

      const onUp = () => {
        grid.classList.remove('is-resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        localStorage.setItem(STORAGE_KEY, grid.style.gridTemplateColumns);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── The web workspace always uses the available content width. ──
function setupWorkspaceWidthControl(container, isPdv) {
  container.style.width = '100%';
  container.style.maxWidth = 'none';
  container.style.marginLeft = '0';
  container.style.marginRight = '0';
}


window.switchClientSource = function(source) {
  const registered = source !== 'novo';
  const registeredPanel = document.getElementById('panel-client-cadastrado');
  const newPanel = document.getElementById('panel-client-novo');
  const registeredButton = document.getElementById('btn-src-cadastrado');
  const newButton = document.getElementById('btn-src-novo');

  if (registeredPanel) registeredPanel.style.display = registered ? 'block' : 'none';
  if (newPanel) newPanel.style.display = registered ? 'none' : 'block';
  registeredButton?.classList.toggle('active', registered);
  newButton?.classList.toggle('active', !registered);

  if (!registered) {
    selectedClientId = '';
    const select = document.getElementById('orc-select-cliente');
    if (select) select.value = '';
    document.getElementById('orc-cliente-nome')?.focus();
  }
};

window.selectTipoVenda = function(tabela) {
  document.querySelectorAll('.tipo-venda-btn').forEach(button => button.classList.toggle('active', button.dataset.tabela === tabela));
  const priceTable = document.getElementById('orc-select-tabela');
  if (priceTable) {
    priceTable.value = tabela;
    priceTable.dispatchEvent(new Event('change'));
  }
  // Sync the desktop price-mode button label
  const desktopLabel = document.getElementById('desktop-price-mode-label');
  if (desktopLabel) {
    const labels = { varejo: 'Varejo', atacado: 'Atacado', notaFiscal: 'Nota Fiscal', especial: 'Especial ⭐' };
    desktopLabel.textContent = labels[tabela] || tabela;
  }
  markQuoteDirty();
};

window.compactClientSection = function() {
  const newClientSelected = document.getElementById('btn-src-novo')?.classList.contains('active');
  const nameInput = document.getElementById('orc-cliente-nome');
  if (newClientSelected && !nameInput?.value.trim()) {
    showToast('Informe o nome do novo cliente antes de confirmar.', 'error');
    nameInput?.focus();
    return;
  }

  const selectedOption = document.getElementById('orc-select-cliente')?.selectedOptions?.[0];
  const clientName = newClientSelected
    ? nameInput.value.trim()
    : (selectedOption?.textContent || 'Consumidor Final (Balcão)');
  const body = document.getElementById('client-section-body');
  const summary = document.getElementById('client-section-summary');
  const icon = document.getElementById('collapse-icon-client');
  if (body) body.style.display = 'none';
  if (summary) { summary.textContent = clientName; summary.style.display = 'block'; }
  if (icon) icon.className = 'ph ph-caret-down';
  if (typeof ensureSaleClientSaved === 'function') ensureSaleClientSaved();
  markQuoteDirty();
};

function toggleClientSection() {
  const body = document.getElementById('client-section-body');
  const summary = document.getElementById('client-section-summary');
  const icon = document.getElementById('collapse-icon-client');
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? 'block' : 'none';
  if (summary) summary.style.display = isCollapsed ? 'none' : 'block';
  if (icon) icon.className = isCollapsed ? 'ph ph-caret-up' : 'ph ph-caret-down';
}

window.toggleClientSectionDesktop = function(e) {
  if (e && e.target && e.target.closest('#client-source-toggle, select, input, .tipo-venda-btn')) return;
  const body = document.getElementById('desktop-client-body');
  const summary = document.getElementById('desktop-client-summary');
  const icon = document.getElementById('desktop-client-toggle-icon');
  const text = document.getElementById('desktop-client-toggle-text');
  if (!body) return;
  
  const isCollapsed = body.style.display === 'none';
  if (isCollapsed) {
    body.style.display = 'block';
    if (summary) summary.style.display = 'none';
    if (icon) icon.className = 'ph ph-caret-up';
    if (text) text.textContent = 'Recolher';
  } else {
    window.compactClientSectionDesktop();
  }
};

window.compactClientSectionDesktop = function() {
  const body = document.getElementById('desktop-client-body');
  const summary = document.getElementById('desktop-client-summary');
  const icon = document.getElementById('desktop-client-toggle-icon');
  const text = document.getElementById('desktop-client-toggle-text');
  if (!body) return;

  const newClientSelected = document.getElementById('btn-src-novo')?.classList.contains('active');
  const nameInput = document.getElementById('orc-cliente-nome');
  const selectedOption = document.getElementById('orc-select-cliente')?.selectedOptions?.[0];
  const clientName = newClientSelected
    ? (nameInput?.value.trim() || 'Novo Cliente')
    : (selectedOption?.textContent || 'Consumidor Final (Balcão)');
  
  const activeTabela = document.querySelector('.tipo-venda-btn.active')?.dataset?.tabela || 'varejo';
  const tabelaLabels = { varejo: 'Varejo', atacado: 'Atacado', notaFiscal: 'NF', especial: 'Especial ⭐' };
  
  body.style.display = 'none';
  if (summary) {
    summary.textContent = `Cliente: ${clientName} (${tabelaLabels[activeTabela] || activeTabela})`;
    summary.style.display = 'inline-block';
  }
  if (icon) icon.className = 'ph ph-caret-down';
  if (text) text.textContent = 'Expandir';
  if (typeof ensureSaleClientSaved === 'function') ensureSaleClientSaved();
};

window.switchDocumentTab = function(tab) {
  const btnNovo = document.getElementById('tab-btn-novo');
  const btnSalvos = document.getElementById('tab-btn-salvos');
  const contentNovo = document.getElementById('tab-content-novo');
  const contentSalvos = document.getElementById('tab-content-salvos');

  const isDesktop = document.querySelector('.desktop-pdv-workspace, .desktop-orcamento-workspace');

  if (isDesktop) {
    const isNovo = tab === 'novo';
    const container = document.getElementById(documentMode === 'pdv' ? 'view-pdv' : 'view-orcamento');
    if (container) {
      const clientSection = container.querySelector('.step-section-client');
      const itemsSection = container.querySelector('.step-section-items');
      const finishSection = container.querySelector('.step-section-finish');
      const savedSection = container.querySelector('.step-section-saved');

      // On the web, history opens over the workspace instead of replacing it.
      if (clientSection) clientSection.style.display = 'block';
      if (itemsSection) itemsSection.style.display = 'grid';
      if (finishSection) finishSection.style.display = 'flex';
      if (savedSection) savedSection.style.display = isNovo ? 'none' : 'grid';

      container.querySelectorAll('.flow-step-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', isNovo ? idx === 0 : idx === 3);
      });
    }
    if (btnNovo) btnNovo.classList.toggle('active', isNovo);
    if (btnSalvos) btnSalvos.classList.toggle('active', !isNovo);

    if (!isNovo && typeof renderSavedQuotesSidebar === 'function') {
      renderSavedQuotesSidebar();
    }
    return;
  }

  if (!btnNovo || !btnSalvos || !contentNovo || !contentSalvos) return;

  if (tab === 'novo') {
    btnNovo.classList.add('active');
    btnSalvos.classList.remove('active');
    contentNovo.style.display = 'block';
    contentSalvos.style.display = 'none';
  } else {
    btnNovo.classList.remove('active');
    btnSalvos.classList.add('active');
    contentNovo.style.display = 'none';
    contentSalvos.style.display = 'block';
    renderMobileSavedTab();
  }
};

function renderMobileSavedTab() {
  const container = document.getElementById('mobile-saved-list-container');
  const countSpan = document.getElementById('tab-saved-count');
  if (!container) return;

  const isPdv = documentMode === 'pdv';
  const allDocs = (window.quotesCache || []).filter(q => isPdv ? q.tipo === 'venda' : q.tipo !== 'venda');
  if (countSpan) countSpan.textContent = allDocs.length;

  const searchInput = document.getElementById('search-saved-input');
  const term = normalizeSearchText(searchInput?.value || '');

  const filtered = allDocs.filter(q => {
    const code = q.numero || q.id || '';
    const client = q.cliente?.nome || '';
    const date = q.createdAt?.toDate ? formatDateTime(q.createdAt.toDate()) : '';
    return !term || normalizeSearchText(`${code} ${client} ${date}`).includes(term);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="cart-empty-msg" style="padding:20px; text-align:center; color:#64748b; background:#f8fafc; border-radius:12px; border:1px dashed #e2e8f0;">Nenhum registro encontrado.</div>`;
    return;
  }

  container.innerHTML = filtered.map(doc => {
    const code = escapeProductHtml(doc.numero || doc.id);
    const client = escapeProductHtml(doc.cliente?.nome || 'Cliente Balcão');
    const date = doc.createdAt?.toDate ? formatDateTime(doc.createdAt.toDate()) : 'Recente';
    const total = formatCurrency(doc.financeiro?.totalGeral);
    const payment = (doc.financeiro?.formaPag || 'PIX').toUpperCase();

    if (isPdv) {
      return `
        <div class="sale-history-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div onclick="openSavedQuoteActions('${doc.id}')" style="cursor:pointer; flex:1;">
            <div class="sale-code" style="font-size:0.875rem; font-weight:800; color:#10b981;">${code}</div>
            <div class="sale-client" style="font-size:0.85rem; font-weight:700; color:#0f172a; margin:2px 0;">${client}</div>
            <div class="sale-date" style="font-size:0.75rem; color:#64748b;">${date} • ${payment}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.95rem; font-weight:800; color:#0f172a; margin-bottom:6px;">${total}</div>
            <div class="sale-history-actions" style="display:flex; gap:4px; justify-content:flex-end;">
              <button class="sale-action-btn" type="button" onclick="openSavedQuoteActions('${doc.id}')" title="Visualizar recibo" aria-label="Visualizar recibo"><i class="ph ph-eye"></i></button>
              <button class="sale-action-btn" type="button" onclick="editSavedSale('${doc.id}')" title="Editar venda" aria-label="Editar venda"><i class="ph ph-pencil-simple"></i></button>
              <button class="sale-action-btn sale-action-delete" type="button" onclick="quickDeleteDocument('${doc.id}')" title="Excluir venda" aria-label="Excluir venda"><i class="ph ph-trash"></i></button>
              <button class="sale-action-btn" type="button" onclick="printSavedSale('${doc.id}')" title="Imprimir recibo" aria-label="Imprimir recibo"><i class="ph ph-printer"></i></button>
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="saved-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div onclick="openSavedQuoteActions('${doc.id}')" style="cursor:pointer; flex:1;">
            <div class="saved-code" style="font-size:0.875rem; font-weight:800; color:#0284c7;">${code}</div>
            <div class="saved-client" style="font-size:0.85rem; font-weight:700; color:#0f172a; margin:2px 0;">${client}</div>
            <div class="saved-date" style="font-size:0.75rem; color:#64748b;">${date}</div>
          </div>
          <div style="text-align:right;">
            <div class="saved-price" style="font-size:0.95rem; font-weight:800; color:#0f172a;">${total}</div>
            <button class="btn-remove-item" type="button" onclick="quickDeleteDocument('${doc.id}')" title="Excluir" style="color:#ef4444; background:none; border:none; cursor:pointer; font-size:1.1rem; margin-top:4px;"><i class="ph ph-trash"></i></button>
          </div>
        </div>
      `;
    }
  }).join('');
}

window.openQuoteView = function(reset = true) {
  if (reset) { cart = []; savedQuoteId = null; currentQuoteNumber = null; selectedClientId = ''; justFinalizedSaleId = null; }
  renderOrcamentoView('view-orcamento', 'orcamento');
};

window.openPdvView = function(reset = true) {
  if (reset) { cart = []; savedQuoteId = null; currentQuoteNumber = null; selectedClientId = ''; justFinalizedSaleId = null; }
  renderOrcamentoView('view-pdv', 'pdv');
};

// Limpa o rascunho (carrinho e campos) após concluir uma venda, para que o
// operador não veja o pedido anterior na tela e evite gerar duplicidade.
function resetPdvDraft() {
  cart = [];
  savedQuoteId = null;
  currentQuoteNumber = null;
  selectedClientId = '';
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('orc-cliente-nome', '');
  setVal('orc-cliente-fantasia', '');
  setVal('orc-cliente-whatsapp', '');
  setVal('orc-cliente-telefone', '');
  setVal('orc-cliente-email', '');
  setVal('orc-cliente-documento', '');
  const selCliente = document.getElementById('orc-select-cliente'); if (selCliente) selCliente.value = '';
  setVal('orc-forma-pagamento', 'pix');
  setVal('orc-desconto', '0.00');
  setVal('orc-prazo-entrega', '');
  setVal('orc-observacao', '');
  setVal('orc-boleto-url', '');
  const pixPanel = document.getElementById('orc-pix-panel'); if (pixPanel) pixPanel.classList.add('hidden');
  const boletoPanel = document.getElementById('orc-boleto-panel'); if (boletoPanel) boletoPanel.classList.add('hidden');
  renderCartTable();
  updateTotals();
  if (typeof renderPdvQuickProducts === 'function') renderPdvQuickProducts();
}

const clientPhoneDigits = value => String(value || '').replace(/\D/g, '');

// Cadastra (ou atualiza) um cliente digitado na hora no PDV/orçamentos na
// coleção `clients`, reutilizando o cadastro existente (mesmo nome ou
// telefone/whatsapp) para não criar duplicidades. Retorna o id do cliente.
async function ensureSaleClientSaved() {
  try {
    const newClientSelected = document.getElementById('btn-src-novo')?.classList.contains('active');
    const nameInput = document.getElementById('orc-cliente-nome');
    const nome = (nameInput?.value || '').trim();
    if (!newClientSelected || !nome) return null;

    const whatsapp = (document.getElementById('orc-cliente-whatsapp')?.value || '').trim();
    const telefone = (document.getElementById('orc-cliente-telefone')?.value || '').trim();
    const normWhats = clientPhoneDigits(whatsapp);
    const normTel = clientPhoneDigits(telefone);
    const normNome = normalizeSearchText(nome);

    const existing = (window.clientsCache || []).find(c =>
      normalizeSearchText(c.nome || '') === normNome ||
      (normWhats && clientPhoneDigits(c.whatsapp) === normWhats) ||
      (normTel && clientPhoneDigits(c.telefone) === normTel)
    );

    const payload = {
      nome,
      nomeFantasia: (document.getElementById('orc-cliente-fantasia')?.value || '').trim(),
      email: (document.getElementById('orc-cliente-email')?.value || '').trim(),
      telefone: normTel ? (window.normalizeWhatsAppPhone ? (window.normalizeWhatsAppPhone(telefone) || telefone) : telefone) : '',
      whatsapp: normWhats ? (window.normalizeWhatsAppPhone ? (window.normalizeWhatsAppPhone(whatsapp) || whatsapp) : whatsapp) : '',
      documento: (document.getElementById('orc-cliente-documento')?.value || '').trim(),
      tipoPreco: document.getElementById('orc-select-tabela')?.value || 'varejo',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    let id = existing?.id || null;
    if (id) {
      await db.collection('clients').doc(id).set(payload, { merge: true });
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('clients').add(payload);
      id = ref.id;
      window.clientsCache.push({ id, ...payload });
      if (typeof window.populateOrcamentoClientsSelect === 'function') window.populateOrcamentoClientsSelect();
    }
    selectedClientId = id;
    const sel = document.getElementById('orc-select-cliente'); if (sel) sel.value = id;
    return id;
  } catch (err) {
    console.error('Erro ao salvar cliente da venda:', err);
    return null;
  }
}

function activateDocumentView(mode) {
  const isVenda = mode === 'venda' || mode === 'pdv';
  const target = isVenda ? 'view-pdv' : 'view-orcamento';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.target === target));
  document.querySelectorAll('.view-content').forEach(view => view.classList.toggle('active', view.id === target));
  if (isVenda) window.openPdvView(false); else window.openQuoteView(false);
}

function loadSavedDocument(saved) {
  justFinalizedSaleId = null;
  cart = Array.isArray(saved.itens) ? saved.itens.map(item => ({ ...item })) : [];
  savedQuoteId = saved.id;
  currentQuoteNumber = saved.numero || null;
  selectedClientId = saved.cliente?.id || '';
  selectedVendedorId = saved.vendedor?.id || '';
  const selectClient = document.getElementById('orc-select-cliente');
  const selectVendedor = document.getElementById('orc-select-vendedor');

  const desktopPdvToggle = document.getElementById('btn-toggle-desktop-pdv');
  if (desktopPdvToggle) desktopPdvToggle.onclick = () => {
    const view = document.getElementById('view-pdv');
    const expanded = view?.classList.toggle('desktop-pdv-expanded');
    desktopPdvToggle.innerHTML = `<i class="ph ${expanded ? 'ph-arrows-in-simple' : 'ph-arrows-out-simple'}"></i> ${expanded ? 'Recolher área' : 'Expandir área'}`;
    // Fullscreen real do navegador
    if (expanded) {
      const el = document.documentElement;
      const requestFn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (requestFn) requestFn.call(el);
    } else {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (exitFn && (document.fullscreenElement || document.webkitFullscreenElement)) exitFn.call(document);
    }
  };
  const desktopPdvExit = document.getElementById('btn-exit-desktop-pdv');
  if (desktopPdvExit) desktopPdvExit.onclick = () => window.navigateToView?.('view-dashboard');
  if (selectClient && selectedClientId) selectClient.value = selectedClientId;
  if (selectVendedor && selectedVendedorId) selectVendedor.value = selectedVendedorId;
  if (document.getElementById('orc-cliente-nome')) document.getElementById('orc-cliente-nome').value = saved.cliente?.nome || '';
  if (document.getElementById('orc-cliente-telefone')) document.getElementById('orc-cliente-telefone').value = saved.cliente?.telefone || '';
  if (document.getElementById('orc-cliente-fantasia')) document.getElementById('orc-cliente-fantasia').value = saved.cliente?.nomeFantasia || '';
  if (document.getElementById('orc-cliente-whatsapp')) document.getElementById('orc-cliente-whatsapp').value = saved.cliente?.whatsapp || saved.cliente?.telefone || '';
  if (document.getElementById('orc-cliente-email')) document.getElementById('orc-cliente-email').value = saved.cliente?.email || '';
  if (document.getElementById('orc-cliente-documento')) document.getElementById('orc-cliente-documento').value = saved.cliente?.documento || '';
  if (saved.cliente?.tipoPreco) window.selectTipoVenda(saved.cliente.tipoPreco);
  if (document.getElementById('orc-forma-pagamento')) document.getElementById('orc-forma-pagamento').value = saved.financeiro?.formaPag || 'pix';
  if (document.getElementById('orc-desconto')) document.getElementById('orc-desconto').value = saved.financeiro?.desconto || 0;
  if (document.getElementById('orc-prazo-entrega')) document.getElementById('orc-prazo-entrega').value = saved.entrega?.prazo || '';
  if (document.getElementById('orc-observacao')) document.getElementById('orc-observacao').value = saved.entrega?.observacao || '';
  if (document.getElementById('orc-boleto-url')) document.getElementById('orc-boleto-url').value = saved.boletoUrl || '';
  if (document.getElementById('orc-boleto-panel')) document.getElementById('orc-boleto-panel').classList.toggle('hidden', saved.financeiro?.formaPag !== 'boleto');
  renderCartTable();
  updateTotals();
}

window.openSavedQuoteActions = function(id) {
  const saved = (window.quotesCache || []).find(item => item.id === id);
  if (!saved) return;

  const isVenda = saved.tipo === 'venda';
  if (isVenda) lastFinalizedSale = saved;

  // O modal só existe dentro das views renderizadas de PDV/Orçamento. Se a tela
  // atual não tem o modal (ex.: vier do card de venda do cliente), ativa a view
  // correspondente para que o modal seja criado, sem perder o contexto do histórico.
  let modal = document.getElementById('modal-saved-quote');
  let content = document.getElementById('saved-quote-actions');
  if (!modal || !content) {
    activateDocumentView(isVenda ? 'pdv' : 'orcamento');
    modal = document.getElementById('modal-saved-quote');
    content = document.getElementById('saved-quote-actions');
    if (!modal || !content) return;
  }

  const titleText = isVenda ? 'Venda' : 'Orçamento';

  content.innerHTML = `
    <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:4px;">${titleText} ${escapeProductHtml(saved.numero || saved.id)}</h3>
    <p style="font-size:0.85rem; color:#64748b; margin-bottom:12px;">${escapeProductHtml(saved.cliente?.nome || 'Cliente não informado')} · <strong>${formatCurrency(saved.financeiro?.totalGeral)}</strong></p>
    <div class="saved-document-items" style="background:#f8fafc; border-radius:10px; padding:10px; margin-bottom:14px; max-height:160px; overflow-y:auto;">
      ${(saved.itens || []).map(item => {
        const resumo = resumoVariantes(item);
        const leg = (!resumo && item.fragrancia && item.fragrancia !== 'Padrão') ? `<br><small style="color:#64748b;">Frag: ${escapeProductHtml(item.fragrancia)}</small>` : '';
        return `<div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:4px 0;"><span>${item.quantidade}x ${escapeProductHtml(item.nome || 'Item')} (${escapeProductHtml(item.volume || '')})${resumo ? `<br><small style="color:#64748b;">${escapeProductHtml(resumo)}</small>` : leg}</span><strong>${formatCurrency(item.subtotal)}</strong></div>`;
      }).join('') || '<p class="empty-state">Sem itens.</p>'}
    </div>
    <div class="saved-quote-action-buttons" style="display:flex; flex-direction:column; gap:8px;">
      <button type="button" id="btn-edit-saved" class="btn btn-primary btn-block">Editar ${titleText}</button>
      ${!isVenda ? '<button type="button" id="btn-convert-sale" class="btn btn-outline btn-block" style="border-color:#10b981; color:#10b981;">Concretizar Venda (PDV)</button>' : ''}
      <button type="button" id="btn-print-saved" class="btn btn-outline btn-block">Imprimir Cupom</button>
      <button type="button" id="btn-share-saved" class="btn btn-outline btn-block" style="border-color:#25d366; color:#16a34a;"><i class="ph ph-share-network" style="margin-right:4px;"></i>Compartilhar</button>
      <button type="button" id="btn-whatsapp-saved" class="btn btn-outline btn-block" style="border-color:#25d366; color:#16a34a;">Enviar no WhatsApp</button>
      <button type="button" id="btn-delete-saved" class="btn btn-outline btn-block" style="border-color:#ef4444; color:#ef4444;">Excluir ${titleText}</button>
    </div>
  `;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  document.getElementById('btn-edit-saved').onclick = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    activateDocumentView(isVenda ? 'pdv' : 'orcamento');
    loadSavedDocument(saved);
    window.switchDocumentTab('novo');
    showToast(`${titleText} carregado(a) para edição.`, 'info');
  };
  document.getElementById('btn-print-saved').onclick = () => {
    // Imprime o cupom/recebido do documento salvo sem trocar de tela
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (isVenda) {
      if (typeof printThermalReceipt === 'function') {
        printThermalReceipt(saved);
      } else {
        openThermalReceiptModal(saved);
      }
    } else if (typeof window.printSavedDocument === 'function') {
      window.printSavedDocument(saved);
    } else {
      loadSavedDocument(saved);
      printQuote('80mm');
    }
  };
  document.getElementById('btn-share-saved').onclick = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (typeof window.shareSavedDocument === 'function') window.shareSavedDocument(saved);
  };
  document.getElementById('btn-whatsapp-saved').onclick = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (typeof window.shareSavedDocumentWhatsApp === 'function') {
      window.shareSavedDocumentWhatsApp(saved);
    } else if (typeof sendOrcamentoWhatsApp === 'function') {
      loadSavedDocument(saved);
      sendOrcamentoWhatsApp();
    }
  };
  if (document.getElementById('btn-convert-sale')) document.getElementById('btn-convert-sale').onclick = () => convertQuoteToSale(saved);
  document.getElementById('btn-delete-saved').onclick = () => deleteSavedDocument(saved);
};

// Edita uma venda/orçamento salvo diretamente do histórico (PDV)
window.editSavedSale = function(id) {
  const saved = (window.quotesCache || []).find(item => item.id === id);
  if (!saved) return;
  const isVenda = saved.tipo === 'venda';
  activateDocumentView(isVenda ? 'pdv' : 'orcamento');
  loadSavedDocument(saved);
  window.switchDocumentTab('novo');
  showToast(`${isVenda ? 'Venda' : 'Orçamento'} carregado(a) para edição.`, 'info');
};

// Imprime uma venda salva diretamente (sem abrir modal)
window.printSavedSale = function(id) {
  const saved = (window.quotesCache || []).find(item => item.id === id);
  if (!saved) return;
  if (saved.tipo === 'venda') {
    if (typeof printThermalReceipt === 'function') {
      printThermalReceipt(saved);
    } else {
      openThermalReceiptModal(saved);
    }
  } else {
    if (typeof window.printSavedDocument === 'function') window.printSavedDocument(saved);
    else {
      loadSavedDocument(saved);
      printQuote('80mm');
    }
  }
};

async function convertQuoteToSale(saved) {
  if (!window.confirm(`Concretizar ${saved.numero} como venda?`)) return;
  try {
    const number = await reserveDocumentNumber('VEN');
    await db.collection('quotes').doc(saved.id).set({ tipo: 'venda', numero: number, convertidoEmVendaEm: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    currentQuoteNumber = number; 
    documentMode = 'pdv';
    const modal = document.getElementById('modal-saved-quote');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    showToast('Orçamento concretizado como venda!', 'success');
  } catch (error) { console.error(error); showToast('Não foi possível concretizar a venda.', 'error'); }
}

async function deleteSavedDocument(saved) {
  if (!window.confirm(`Excluir ${saved.tipo === 'venda' ? 'a venda' : 'o orçamento'} ${saved.numero}? Esta ação não pode ser desfeita.`)) return;
  try {
    await db.collection('quotes').doc(saved.id).delete();
    const modal = document.getElementById('modal-saved-quote');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    showToast('Registro excluído com sucesso.', 'success');
  } catch (error) { console.error(error); showToast('Não foi possível excluir o registro.', 'error'); }
}

function openThermalReceiptModal(sale) {
  const modal = document.getElementById('modal-receipt');
  const content = document.getElementById('thermal-receipt-content');
  if (!modal || !content) return;

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const dateStr = sale.createdAt?.toDate ? formatDateTime(sale.createdAt.toDate()) : formatDateTime(new Date());
  const paymentStr = (sale.financeiro?.formaPag || 'PIX').toUpperCase();

  let itemsHtml = (sale.itens || []).map(i => `
    <tr>
      <td style="width:50%;">${escapeProductHtml(i.nome)} (${escapeProductHtml(i.volume || '')})<br><small class="thermal-unit">${escapeProductHtml(linhaUnidadeItem(i))}</small>${fragmentoVarianteImpressao(i, { maxChars: 42, classe: 'thermal-variant' })}</td>
      <td style="width:15%; text-align:center;">${i.quantidade}</td>
      <td style="width:35%; text-align:right;">${formatCurrency(i.subtotal || (i.precoUnitario * i.quantidade))}</td>
    </tr>
  `).join('');

  content.innerHTML = `
    <div class="thermal-center">
      <div class="thermal-title">${escapeProductHtml(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA')}</div>
      <div class="thermal-subtitle">CNPJ: ${escapeProductHtml(settings.cnpj || '12.345.678/0001-90')}<br>${escapeProductHtml(settings.endereco || 'Distribuidora Mobile')}</div>
      <div class="thermal-double-divider"></div>
      <div class="thermal-bold">COMPROVANTE DE VENDA DE CAIXA</div>
      <div>CÓDIGO: ${escapeProductHtml(sale.numero || sale.id)}</div>
      <div>DATA: ${dateStr}</div>
    </div>
    <div class="thermal-divider"></div>
    <div>CLIENTE: ${escapeProductHtml(sale.cliente?.nome || 'Consumidor Final (Balcão)')}</div>
    <div>PAGAMENTO: ${paymentStr}</div>
    <div class="thermal-divider"></div>
    <table class="thermal-table">
      <thead>
        <tr>
          <th>ITEM</th>
          <th style="text-align:center;">QTD</th>
          <th style="text-align:right;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    <div class="thermal-divider"></div>
    <div class="thermal-flex">
      <span>SUBTOTAL:</span>
      <span>${formatCurrency(sale.financeiro?.subtotal)}</span>
    </div>
    ${(sale.financeiro?.desconto > 0) ? `
    <div class="thermal-flex">
      <span>DESCONTO:</span>
      <span>- ${formatCurrency(sale.financeiro?.desconto)}</span>
    </div>` : ''}
    <div class="thermal-flex thermal-bold" style="font-size:12px; margin-top:4px;">
      <span>TOTAL PAGO:</span>
      <span>${formatCurrency(sale.financeiro?.totalGeral)}</span>
    </div>
    <div class="thermal-double-divider"></div>
    <div class="thermal-center thermal-subtitle" style="margin-top:10px;">
      ${escapeProductHtml(settings.mensagemPadrao || 'Obrigado pela preferência! Volte Sempre.')}
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('active');
  modal.style.display = 'flex';
}

function closeThermalReceiptModal() {
  const modal = document.getElementById('modal-receipt');
  if (modal) {
    modal.classList.remove('active');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  // Ao fechar o recibo de uma venda concluída, limpa a tela para uma nova venda.
  if (documentMode === 'pdv' && justFinalizedSaleId) {
    resetPdvDraft();
  }
}

function generateReceiptCanvasImage() {
  if (!lastFinalizedSale) return;
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 460;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DALBRAN DISTRIBUIDORA', 170, 30);
  
  ctx.font = '12px monospace';
  ctx.fillText('COMPROVANTE DE VENDA', 170, 50);
  ctx.fillText(`CÓD: ${lastFinalizedSale.numero || lastFinalizedSale.id}`, 170, 70);
  
  ctx.textAlign = 'left';
  ctx.fillText(`CLIENTE: ${lastFinalizedSale.cliente?.nome || 'Consumidor'}`, 20, 105);
  ctx.fillText(`PAGAMENTO: ${(lastFinalizedSale.financeiro?.formaPag || 'PIX').toUpperCase()}`, 20, 125);
  
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(20, 140);
  ctx.lineTo(320, 140);
  ctx.stroke();

  ctx.font = 'bold 14px monospace';
  ctx.fillText(`TOTAL: ${formatCurrency(lastFinalizedSale.financeiro?.totalGeral)}`, 20, 175);

  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Obrigado pela preferência!', 170, 220);

  const fileName = `Recibo_${lastFinalizedSale.numero || 'Venda'}.png`;
  const dataUrl = canvas.toDataURL('image/png');

  // No APK: grava o PNG no cache e abre o compartilhamento nativo do Android
  const Filesystem = window.Capacitor?.Plugins?.Filesystem;
  const Share = window.Capacitor?.Plugins?.Share;
  if (Filesystem && Share) {
    Filesystem.writeFile({
      path: fileName,
      data: dataUrl.split(',')[1],
      directory: 'CACHE',
      recursive: true
    }).then(result => Share.share({
      title: fileName.replace('.png', ''),
      dialogTitle: 'Compartilhar recibo',
      files: [result.uri]
    })).catch(e => {
      if (e && /cancel/i.test(String(e.message || e))) return;
      console.warn('Falha no compartilhamento nativo, baixando arquivo:', e);
      downloadDataUrl(dataUrl, fileName);
    });
    return;
  }

  downloadDataUrl(dataUrl, fileName);
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

function bindOrcamentoEvents() {
  const clientSectionHeader = document.getElementById('btn-toggle-client-section');
  const clientCollapseButton = document.getElementById('btn-collapse-client');
  if (clientSectionHeader) clientSectionHeader.onclick = event => {
    if (event.target.closest('#btn-collapse-client')) return;
    toggleClientSection();
  };
  if (clientCollapseButton) clientCollapseButton.onclick = event => {
    event.stopPropagation();
    toggleClientSection();
  };

  const productOptionsToggle = document.getElementById('btn-toggle-product-options');
  if (productOptionsToggle) productOptionsToggle.onclick = () => {
    const panel = document.getElementById('pdv-product-options-panel');
    setPdvProductOptionsOpen(panel?.classList.contains('hidden'));
  };

  document.querySelectorAll('[data-mobile-step-target]').forEach(button => {
    button.onclick = () => {
      const target = document.getElementById(button.dataset.mobileStepTarget);
      if (!target) return;
      document.querySelectorAll('[data-mobile-step-target]').forEach(item => item.classList.toggle('active', item === button));
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  const searchProd = document.getElementById('orc-search-produto');
  // Bind all quick-product grids (mobile PDV, mobile orçamento, and desktop) independently
  const allQuickGrids = [
    document.getElementById('pdv-quick-products'),
    document.getElementById('orcamento-quick-products'),
    document.getElementById('desktop-quick-products')
  ].filter(Boolean);
  const quickProductClickHandler = event => {
    const pageButton = event.target.closest('[data-quick-page]');
    if (pageButton && !pageButton.disabled) {
      if (documentMode === 'pdv') pdvQuickPage = Number(pageButton.dataset.quickPage);
      else orcamentoQuickPage = Number(pageButton.dataset.quickPage);
      renderPdvQuickProducts();
      return;
    }
    const button = event.target.closest('[data-pdv-product-id]');
    if (button) window.selectPdvQuickProduct(button.dataset.pdvProductId);
  };
  allQuickGrids.forEach(qp => { qp.onclick = quickProductClickHandler; });
  const quickProducts = allQuickGrids[0] || null;
  if (quickProducts) {
    let touchStartX = null;
    let touchStartY = null;
    quickProducts.addEventListener('touchstart', event => {
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });
    quickProducts.addEventListener('touchend', event => {
      if (touchStartX === null) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      touchStartX = null;
      if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      const products = getPdvQuickProducts();
      const maxPage = Math.max(1, Math.ceil(products.length / 6));
      const page = documentMode === 'pdv' ? pdvQuickPage : orcamentoQuickPage;
      const nextPage = Math.max(1, Math.min(maxPage, page + (deltaX < 0 ? 1 : -1)));
      if (nextPage === page) return;
      if (documentMode === 'pdv') pdvQuickPage = nextPage;
      else orcamentoQuickPage = nextPage;
      quickProducts.classList.remove('swipe-left', 'swipe-right');
      quickProducts.classList.add(deltaX < 0 ? 'swipe-left' : 'swipe-right');
      renderPdvQuickProducts();
    }, { passive: true });
  }
  const priceModeButton = document.getElementById('btn-pdv-price-mode');
  const priceModeMenu = document.getElementById('pdv-price-mode-menu');
  if (priceModeButton && priceModeMenu) priceModeButton.onclick = () => priceModeMenu.classList.toggle('hidden');
  if (priceModeMenu) priceModeMenu.onclick = event => {
    const button = event.target.closest('[data-pdv-price-mode]');
    if (!button || !selectTabela) return;
    selectTabela.value = button.dataset.pdvPriceMode;
    selectTabela.dispatchEvent(new Event('change'));
    priceModeMenu.classList.add('hidden');
  };
  // Desktop price mode toggle (Orçamento and PDV desktop layout)
  const desktopPriceModeBtn = document.getElementById('btn-desktop-price-mode');
  const desktopPriceModeMenu = document.getElementById('desktop-price-mode-menu');
  if (desktopPriceModeBtn && desktopPriceModeMenu) {
    desktopPriceModeBtn.onclick = (e) => { e.stopPropagation(); desktopPriceModeMenu.classList.toggle('hidden'); };
    desktopPriceModeMenu.onclick = event => {
      const btn = event.target.closest('[data-desktop-price-mode]');
      if (!btn) return;
      const mode = btn.dataset.desktopPriceMode;
      const selectTabelaEl = document.getElementById('orc-select-tabela');
      if (selectTabelaEl) { selectTabelaEl.value = mode; selectTabelaEl.dispatchEvent(new Event('change')); }
      const labels = { varejo: 'Varejo', atacado: 'Atacado', notaFiscal: 'Nota Fiscal', especial: 'Especial ⭐' };
      const labelEl = document.getElementById('desktop-price-mode-label');
      if (labelEl) labelEl.textContent = labels[mode] || mode;
      // Also update quick products cards with new price
      renderPdvQuickProducts();
      desktopPriceModeMenu.classList.add('hidden');
    };
    document.addEventListener('click', () => desktopPriceModeMenu.classList.add('hidden'), { passive: true });
  }
  const selectProd = document.getElementById('orc-select-produto');
  const selectVar = document.getElementById('orc-select-variacao');
  const selectFrag = document.getElementById('orc-select-fragrancia');
  const selectTabela = document.getElementById('orc-select-tabela');
  const inputPreco = document.getElementById('orc-input-preco');
  const btnAddItem = document.getElementById('btn-add-item');
  
  const formaPag = document.getElementById('orc-forma-pagamento');
  const pixPanel = document.getElementById('orc-pix-panel');
  const boletoPanel = document.getElementById('orc-boleto-panel');
  const inputDesc = document.getElementById('orc-desconto');
  const inputPrazo = document.getElementById('orc-prazo-entrega');
  const inputObservacao = document.getElementById('orc-observacao');
  const selectClient = document.getElementById('orc-select-cliente');
  const selectVendedor = document.getElementById('orc-select-vendedor');

  if (window.matchMedia('(min-width: 769px)').matches && documentMode === 'pdv') {
    document.onkeydown = event => {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); searchProd?.focus(); }
      if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); document.getElementById('btn-save-orcamento')?.click(); }
      if (event.key === 'Escape') document.getElementById('orc-search-results').innerHTML = '';
    };
  }

  if (selectVendedor) selectVendedor.onchange = () => { selectedVendedorId = selectVendedor.value; markQuoteDirty(); };

  if (selectClient) {
    selectClient.onchange = () => {
      selectedClientId = selectClient.value;
      const client = getSelectedClient();
      const manualFields = document.getElementById('manual-client-fields');
      if (!client) { 
        if (manualFields) manualFields.style.display = 'flex';
        markQuoteDirty(); 
        return; 
      }
      if (manualFields) manualFields.style.display = 'none';
      if (document.getElementById('orc-cliente-nome')) document.getElementById('orc-cliente-nome').value = client.nomeFantasia || client.nome || '';
      if (document.getElementById('orc-cliente-telefone')) document.getElementById('orc-cliente-telefone').value = client.whatsapp || client.telefone || '';
      if (document.getElementById('orc-cliente-fantasia')) document.getElementById('orc-cliente-fantasia').value = client.nomeFantasia || '';
      if (document.getElementById('orc-cliente-whatsapp')) document.getElementById('orc-cliente-whatsapp').value = client.whatsapp || '';
      if (document.getElementById('orc-cliente-email')) document.getElementById('orc-cliente-email').value = client.email || '';
      if (document.getElementById('orc-cliente-documento')) document.getElementById('orc-cliente-documento').value = client.documento || '';
      const priceTable = client.tipoPreco === 'especial' ? 'especial' : client.tipoPreco === 'notaFiscal' ? 'notaFiscal' : client.tipoPreco === 'atacado' ? 'atacado' : 'varejo';
      window.selectTipoVenda(priceTable);
      markQuoteDirty();
    };
  }

  if (searchProd) {
    searchProd.oninput = () => renderProductSearchResults(searchProd.value);
  }

  const searchResults = document.getElementById('orc-search-results');
  if (searchResults) {
    searchResults.onclick = event => {
      const button = event.target.closest('[data-product-id]');
      if (!button) return;
      selectProductFromSearch(button.dataset.productId);
    };
  }

  const adjustQuantity = (delta) => {
    const input = document.getElementById('orc-input-qtd');
    if (!input) return;
    const quantity = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
    input.value = quantity;
  };
  const btnMinus = document.getElementById('btn-qtd-minus');
  const btnPlus = document.getElementById('btn-qtd-plus');
  if (btnMinus) btnMinus.onclick = () => adjustQuantity(-1);
  if (btnPlus) btnPlus.onclick = () => adjustQuantity(1);

  if (selectProd) {
    selectProd.onchange = () => {
      const prodId = selectProd.value;
      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (selectVar) selectVar.innerHTML = '<option value="">-- Selecione o volume --</option>';
      if (selectFrag) {
        selectFrag.innerHTML = '<option value="">-- Nenhuma / Padrão --</option>';
        selectFrag.disabled = true;
      }
      esconderFormFragGrid();

      if (product && Array.isArray(product.variacoes) && product.variacoes.length > 0) {
        if (selectVar) {
          selectVar.disabled = false;
          product.variacoes.forEach((v, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = `${v.volume} - ${formatCurrency(getVariationPrice(v, selectTabela?.value || 'varejo'))}`;
            selectVar.appendChild(opt);
          });
          selectVar.value = '0';
          selectVar.dispatchEvent(new Event('change'));
        }
      } else {
        if (selectVar) selectVar.disabled = true;
      }
    };
  }

  if (selectVar) {
    selectVar.onchange = () => {
      const prodId = selectProd ? selectProd.value : '';
      const vIndex = selectVar.value;
      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (product && Array.isArray(product.variacoes) && product.variacoes[vIndex]) {
        const v = product.variacoes[vIndex];
        const tabela = selectTabela ? selectTabela.value : 'varejo';
        if (inputPreco) inputPreco.value = getVariationPrice(v, tabela).toFixed(2).replace('.', ',');

        if (selectFrag) {
          selectFrag.innerHTML = '<option value="">-- Nenhuma / Padrão --</option>';
          if (v.fragrancias && v.fragrancias.length > 0) {
            selectFrag.disabled = false;
            v.fragrancias.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f;
              opt.textContent = f;
              selectFrag.appendChild(opt);
            });
            selectFrag.value = v.fragrancias[0];
            // Grade multi-fragrâncias no formulário (seleção rápida com quantidades).
            mostrarFormFragGrid(v.fragrancias);
          } else {
            selectFrag.disabled = true;
            esconderFormFragGrid();
          }
        } else {
          esconderFormFragGrid();
        }
      }
    };
  }

  if (selectTabela) {
    selectTabela.onchange = () => {
      const prodId = selectProd ? selectProd.value : '';
      const vIndex = selectVar ? selectVar.value : '';
      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (product && Array.isArray(product.variacoes) && product.variacoes[vIndex] && inputPreco) {
        const v = product.variacoes[vIndex];
        inputPreco.value = getVariationPrice(v, selectTabela.value).toFixed(2).replace('.', ',');
      }
      applyPriceTableToCart(selectTabela.value);
      renderPdvQuickProducts();
    };
  }

  if (btnAddItem) {
    btnAddItem.onclick = () => {
      const prodId = selectProd ? selectProd.value : '';
      const vIndex = selectVar ? selectVar.value : '';
      const fragrancia = selectFrag ? selectFrag.value : 'Padrão';
      const qtd = parseInt(document.getElementById('orc-input-qtd')?.value || 1, 10);
      const precoUnit = parseCurrency(inputPreco?.value || 0);

      const product = (window.productsCache || []).find(p => p.id === prodId);

      if (!product) {
        showToast("Selecione um produto.", "error");
        return;
      }
      if (vIndex === '') {
        showToast("Selecione um volume válido.", "error");
        return;
      }

      const variacao = product.variacoes[vIndex];

      // Grade multi-fragrâncias do formulário: adiciona tudo de uma vez em item único.
      if (formFragVisivel() && totalFormFrag() > 0) {
        const frags = Object.entries(formFragMap)
          .map(([nome, qtd]) => ({ nome, qtd: Number(qtd) || 0 }))
          .filter(v => v.qtd > 0);
        finalizarItemAgrupado({
          produtoId: product.id,
          nome: product.nome || product.name || 'Produto sem nome',
          volume: variacao.volume,
          precoUnitario: precoUnit,
          quantidade: 0,
          subtotal: 0,
          fragrancias: frags
        }, -1);
        esconderFormFragGrid();
        return;
      }

      // Agrupa automaticamente por produto+volume+preço (mesma configuração
      // soma na mesma linha, inclusive somando o detalhamento de variantes).
      mesclarItemNoCarrinho(cart, {
        produtoId: product.id,
        nome: product.nome || product.name || 'Produto sem nome',
        volume: variacao.volume,
        fragrancia: fragrancia || 'Padrão',
        quantidade: qtd,
        precoUnitario: precoUnit,
        subtotal: qtd * precoUnit
      });
      justFinalizedSaleId = null; // inicia nova venda: não compartilha mais a venda anterior

      renderCartTable();
      markQuoteDirty();
      updateTotals();
      showToast("Item adicionado!", "info");
    };
  }

  if (formaPag) {
    formaPag.onchange = () => { 
      if (pixPanel) pixPanel.classList.toggle('hidden', formaPag.value !== 'pix'); 
      if (boletoPanel) boletoPanel.classList.toggle('hidden', formaPag.value !== 'boleto'); 
      markQuoteDirty(); 
      updateTotals(); 
    };
  }

  const btnGenPix = document.getElementById('btn-generate-pix');
  if (btnGenPix) btnGenPix.onclick = () => showPixForCurrentDocument();

  if (inputDesc) inputDesc.oninput = () => { markQuoteDirty(); updateTotals(); };
  if (inputPrazo) inputPrazo.oninput = markQuoteDirty;
  if (inputObservacao) inputObservacao.oninput = markQuoteDirty;

  const btnSave = document.getElementById('btn-save-orcamento');
  if (btnSave) btnSave.onclick = saveOrcamento;

  const btnWhatsapp = document.getElementById('btn-whatsapp-orcamento');
  if (btnWhatsapp) {
    btnWhatsapp.onclick = () => {
      if (justFinalizedSaleId && lastFinalizedSale) {
        if (typeof window.shareSavedDocumentWhatsApp === 'function') return window.shareSavedDocumentWhatsApp(lastFinalizedSale);
      }
      if (typeof sendOrcamentoWhatsApp === 'function') sendOrcamentoWhatsApp();
    };
  }

  const btnPrint = document.getElementById('btn-print-cupom');
  if (btnPrint) btnPrint.onclick = () => {
    if (justFinalizedSaleId && lastFinalizedSale) {
      if (typeof printThermalReceipt === 'function') return printThermalReceipt(lastFinalizedSale);
    }
    openPrintModal();
  };

  const btnClosePrint = document.getElementById('btn-close-print-modal');
  if (btnClosePrint) btnClosePrint.onclick = closePrintModal;

  const btnCloseSaved = document.getElementById('btn-close-saved-quote');
  if (btnCloseSaved) btnCloseSaved.onclick = () => { 
    const modal = document.getElementById('modal-saved-quote'); 
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; } 
  };

  const btnCloseReceipt = document.getElementById('btn-close-receipt');
  if (btnCloseReceipt) btnCloseReceipt.onclick = closeThermalReceiptModal;

  const btnReceiptPrint = document.getElementById('btn-receipt-print');
  if (btnReceiptPrint) btnReceiptPrint.onclick = () => printThermalReceipt(lastFinalizedSale);

  const btnReceiptPdf = document.getElementById('btn-receipt-pdf');
  if (btnReceiptPdf) btnReceiptPdf.onclick = () => printThermalReceipt(lastFinalizedSale);

  const btnReceiptImage = document.getElementById('btn-receipt-image');
  if (btnReceiptImage) btnReceiptImage.onclick = generateReceiptCanvasImage;

  const btnReceiptWhatsapp = document.getElementById('btn-receipt-whatsapp');
  if (btnReceiptWhatsapp) btnReceiptWhatsapp.onclick = () => {
    if (typeof window.shareSavedDocumentWhatsApp === 'function' && lastFinalizedSale) window.shareSavedDocumentWhatsApp(lastFinalizedSale);
    else showToast('Número do cliente indisponível para envio.', 'error');
  };

  const searchSaved = document.getElementById('search-saved-input');
  if (searchSaved) searchSaved.oninput = () => renderMobileSavedTab();

  document.querySelectorAll('[data-print-type]').forEach(button => {
    button.onclick = () => printQuote(button.dataset.printType);
  });
}

function generateCartRows(forceDesktop = null) {
  const container = document.getElementById('cart-table-body');
  const desktop = forceDesktop !== null ? forceDesktop : (container ? (container.tagName === 'TBODY') : window.matchMedia('(min-width: 769px)').matches);
  if (desktop) {
    if (cart.length === 0) return '<tr><td colspan="5" class="desktop-cart-empty">Nenhum item adicionado.</td></tr>';
    return cart.map((item, index) => `
      <tr><td><strong>${escapeProductHtml(item.nome)}</strong> (${escapeProductHtml(item.volume)})<br>${linhaVarianteItem(item)}</td><td><div class="quantity-control quantity-control-small"><button type="button" onclick="changeCartQuantity(${index}, -1)">−</button><input type="number" step="1" min="1" value="${item.quantidade}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" onchange="setCartQuantity(${index}, this.value)"><button type="button" onclick="changeCartQuantity(${index}, 1)">+</button></div></td><td>${formatCurrency(item.precoUnitario)}</td><td>${formatCurrency(item.subtotal)}</td><td style="white-space:nowrap;">${item.produtoId ? `<button type="button" class="desktop-edit-item" onclick="editarItemCarrinho(${index})" title="Editar variantes">✎</button>` : ''}<button type="button" class="desktop-remove-item" onclick="removeCartItem(${index})">✖</button></td></tr>`).join('');
  }
  if (cart.length === 0) {
    return `<div class="cart-empty-msg" style="padding:16px; text-align:center; color:#64748b; font-size:0.85rem; border:1px dashed #e2e8f0; border-radius:10px; background:#fafafa;"><i class="ph ph-shopping-cart" style="font-size:1.4rem;"></i><br>Nenhum item adicionado</div>`;
  }

  return cart.map((item, index) => {
    const temVariantes = variantesDoItem(item).length > 0;
    const resumo = temVariantes ? `<div class="cart-variant-summary">${escapeProductHtml(resumoVariantes(item))}</div>` : (item.fragrancia && item.fragrancia !== 'Padrão' ? `<div class="cart-variant-summary">Frag: ${escapeProductHtml(item.fragrancia)}</div>` : '');
    return `
    <div class="cart-item item-card" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
      <div class="cart-item-info" style="flex:1;">
        <div class="cart-item-title item-name" style="font-size:0.875rem; font-weight:700; color:#0f172a;">${escapeProductHtml(item.nome)} (${escapeProductHtml(item.volume)})</div>
        <div class="cart-item-details item-meta" style="font-size:0.75rem; color:#64748b;">${item.quantidade}x ${formatCurrency(item.precoUnitario)}</div>
        ${resumo}
      </div>
      <div class="cart-item-price item-price" style="font-size:0.95rem; font-weight:800; color:#059669;">
        ${formatCurrency(item.subtotal)}
      </div>
      <div class="cart-qty-controls" style="display:flex; align-items:center; gap:6px;">
        ${temVariantes
          ? `${item.produtoId ? `<button class="btn-qty" type="button" onclick="editarItemCarrinho(${index})" title="Editar variantes" style="width:30px; height:30px; border-radius:8px; border:1px solid #93c5fd; background:#eff6ff; color:#2563eb; cursor:pointer;">✎</button>` : ''}`
          : `<button class="btn-qty" type="button" onclick="changeCartQuantity(${index}, -1)" style="width:30px; height:30px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-weight:700; cursor:pointer;">-</button>
        <span style="font-weight:700; font-size:0.85rem; min-width:18px; text-align:center;">${item.quantidade}</span>
        <button class="btn-qty" type="button" onclick="changeCartQuantity(${index}, 1)" style="width:30px; height:30px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-weight:700; cursor:pointer;">+</button>`}
        <button class="btn-qty btn-qty-danger" type="button" onclick="removeCartItem(${index})" style="width:30px; height:30px; border-radius:8px; border:1px solid #fca5a5; background:#fff5f5; color:#ef4444; cursor:pointer;"><i class="ph ph-trash"></i></button>
      </div>
    </div>
  `;}).join('');
}

function renderCartTable() {
  const container = document.getElementById('cart-table-body');
  if (container) {
    const isDesktop = container.tagName === 'TBODY';
    container.innerHTML = generateCartRows(isDesktop);
  }
}

window.removeCartItem = (index) => {
  cart.splice(index, 1);
  markQuoteDirty();
  renderCartTable();
  updateTotals();
};

window.setCartQuantity = (index, value) => {
  const quantity = parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity <= 0 || !cart[index]) {
    showToast('Informe uma quantidade válida.', 'error');
    renderCartTable();
    return;
  }
  // Item agrupado: quantidade só via edição das variantes (mantém o detalhamento).
  if (variantesDoItem(cart[index]).length) { window.editarItemCarrinho(index); renderCartTable(); return; }
  cart[index].quantidade = quantity;
  cart[index].subtotal = Number((cart[index].precoUnitario * quantity).toFixed(2));
  markQuoteDirty();
  renderCartTable();
  updateTotals();
};

window.changeCartQuantity = (index, delta) => {
  if (!cart[index]) return;
  // Item agrupado: quantidade só via edição das variantes (mantém o detalhamento).
  if (variantesDoItem(cart[index]).length) { window.editarItemCarrinho(index); return; }
  const newQty = cart[index].quantidade + delta;
  if (newQty <= 0) {
    window.removeCartItem(index);
  } else {
    window.setCartQuantity(index, newQty);
  }
};

function applyPriceTableToCart(priceTable) {
  if (!cart.length) return;
  cart = cart.map(item => {
    const product = (window.productsCache || []).find(productItem => productItem.id === item.produtoId);
    const variation = product?.variacoes?.find(variationItem => String(variationItem.volume || '') === String(item.volume || ''));
    if (!variation) return item;
    const precoUnitario = getVariationPrice(variation, priceTable);
    return { ...item, precoUnitario, subtotal: Number((precoUnitario * item.quantidade).toFixed(2)) };
  });
  renderCartTable();
  updateTotals();
}

function calculateTotals() {
  const subtotal = Number(cart.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0).toFixed(2));
  const desconto = Math.min(subtotal, Math.max(0, parseCurrency(document.getElementById('orc-desconto')?.value || 0)));
  const formaPag = document.getElementById('orc-forma-pagamento')?.value || 'pix';

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  let taxaPercent = 0;

  if (formaPag === 'debito') taxaPercent = Number(settings.taxaDebito) || 0;
  if (formaPag === 'credito') taxaPercent = Number(settings.taxaCredito) || 0;

  const baseCalculo = Math.max(0, subtotal - desconto);
  const calcTaxa = typeof calculateCardFee === 'function' 
    ? calculateCardFee(baseCalculo, taxaPercent, settings.metodoCalculoTaxa || 'add')
    : { totalAmount: baseCalculo, feeAmount: 0 };

  const totalGeral = calcTaxa.totalAmount;
  const valorTaxa = calcTaxa.feeAmount;

  return { subtotal, desconto, formaPag, taxaPercent, valorTaxa, totalGeral };
}

function updateTotals() {
  const { subtotal, desconto, valorTaxa, totalGeral } = calculateTotals();
  const itemsCount = cart.reduce((acc, i) => acc + i.quantidade, 0);

  const subtotalElem = document.getElementById('orc-subtotal-val');
  const descElem = document.getElementById('orc-desconto-val');
  const taxaElem = document.getElementById('orc-taxa-val');
  const totalElem = document.getElementById('orc-total-val');
  const countElem = document.getElementById('summary-items-count');

  if (subtotalElem) subtotalElem.textContent = formatCurrency(subtotal);
  if (descElem) descElem.textContent = `- ${formatCurrency(desconto)}`;
  if (taxaElem) taxaElem.textContent = `+ ${formatCurrency(valorTaxa)}`;
  if (totalElem) totalElem.textContent = formatCurrency(totalGeral);
  if (countElem) countElem.textContent = `${itemsCount} unidade${itemsCount !== 1 ? 's' : ''}`;
}

async function saveOrcamento(options = {}) {
  if (cart.length === 0) {
    showToast(documentMode === 'pdv' ? "Adicione pelo menos 1 item ao carrinho para concluir a venda." : "Adicione ao menos um item ao orçamento.", "error");
    return false;
  }

  const isPdv = documentMode === 'pdv';

  // Cliente novo digitado na hora é cadastrado na coleção `clients`.
  if (typeof ensureSaleClientSaved === 'function') {
    await ensureSaleClientSaved();
  }
  const clienteNome = document.getElementById('orc-cliente-nome')?.value.trim() || (selectedClientId ? (getSelectedClient()?.nome || 'Cliente') : 'Consumidor Final (Balcão)');
  const clienteTelefoneRaw = document.getElementById('orc-cliente-whatsapp')?.value.trim() || document.getElementById('orc-cliente-telefone')?.value.trim() || (getSelectedClient()?.whatsapp || getSelectedClient()?.telefone || '');
  const clienteTelefone = window.normalizeWhatsAppPhone ? window.normalizeWhatsAppPhone(clienteTelefoneRaw) : clienteTelefoneRaw;
  const totals = calculateTotals();
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const user = typeof auth !== 'undefined' ? auth.currentUser : null;
  const selectedClient = getSelectedClient();
  const selectedVendedor = getSelectedVendedor();

  let documentNumber;
  try {
    documentNumber = currentQuoteNumber || await reserveDocumentNumber(isPdv ? 'VEN' : 'ORC');
  } catch (err) {
    console.error('Erro ao reservar numeração:', err);
    showToast('Não foi possível gerar a numeração do documento.', 'error');
    return false;
  }

  const payload = {
    numero: documentNumber,
    tipo: isPdv ? 'venda' : 'orcamento',
    cliente: {
      id: selectedClient?.id || null,
      nome: clienteNome,
      nomeFantasia: document.getElementById('orc-cliente-fantasia')?.value.trim() || selectedClient?.nomeFantasia || '',
      telefone: clienteTelefone,
      whatsapp: window.normalizeWhatsAppPhone ? window.normalizeWhatsAppPhone(document.getElementById('orc-cliente-whatsapp')?.value.trim() || selectedClient?.whatsapp || '') : (document.getElementById('orc-cliente-whatsapp')?.value.trim() || selectedClient?.whatsapp || ''),
      email: document.getElementById('orc-cliente-email')?.value.trim() || selectedClient?.email || '',
      documento: document.getElementById('orc-cliente-documento')?.value.trim() || selectedClient?.documento || '',
      tipoPreco: document.getElementById('orc-select-tabela')?.value || selectedClient?.tipoPreco || 'varejo'
    },
    itens: cart,
    financeiro: totals,
    validadeDias: settings.prazoValidadeDias || 1,
    criadoPor: { uid: user?.uid || '', email: user?.email || 'dalbran (master)' },
    vendedor: { id: selectedVendedor?.id || null, nome: selectedVendedor?.nome || 'dalbran (master)', email: selectedVendedor?.email || '' },
    entrega: { prazo: document.getElementById('orc-prazo-entrega')?.value.trim() || '', observacao: document.getElementById('orc-observacao')?.value.trim() || '' },
    boletoUrl: document.getElementById('orc-boleto-url')?.value.trim() || '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    currentQuoteNumber = payload.numero;
    if (savedQuoteId) {
      await db.collection('quotes').doc(savedQuoteId).set(payload, { merge: true });
    } else {
      const savedDocument = await db.collection('quotes').add(payload);
      savedQuoteId = savedDocument.id;
    }
    
    lastFinalizedSale = { ...payload, id: savedQuoteId };

    if (isPdv && typeof window.DriveBackup?.onSaleCompleted === 'function') {
      window.DriveBackup.onSaleCompleted(lastFinalizedSale);
    }

    showToast(isPdv ? 'Venda concluída com sucesso!' : 'Orçamento salvo com sucesso!', "success");
    
    if (isPdv) {
      if (typeof window.pushNotification === 'function') {
        window.pushNotification({
          type: 'sale',
          title: `Venda ${documentNumber} registrada`,
          message: `${clienteNome} • ${formatCurrency(totals.totalGeral)}`
        });
      }
      justFinalizedSaleId = lastFinalizedSale.id;
      if (!options.silent) openThermalReceiptModal(lastFinalizedSale);
    } else {
      if (!options.silent) window.switchDocumentTab('salvos');
    }

    return true;
  } catch (err) {
    console.error("Erro ao salvar documento:", err);
    showToast("Erro ao salvar.", "error");
    return false;
  }
}

function openPrintModal() {
  if (cart.length === 0) {
    showToast(documentMode === 'pdv' ? 'Adicione itens para imprimir o cupom.' : 'Adicione itens para imprimir o orçamento.', 'error');
    return;
  }
  const modal = document.getElementById('modal-print-type');
  if (!modal) return;
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  document.querySelectorAll('[data-print-type]').forEach(button => {
    const isDefault = button.dataset.printType === (settings.formatoPadraoCupom || '80mm');
    button.classList.toggle('btn-primary', isDefault);
    button.classList.toggle('btn-outline', !isDefault);
  });
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closePrintModal() {
  const modal = document.getElementById('modal-print-type');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function printQuote(printType) {
  closePrintModal();
  if (cart.length === 0) return;
  if (!await saveOrcamento()) return;

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const clienteNome = document.getElementById('orc-cliente-nome')?.value.trim() || (getSelectedClient()?.nome || 'Consumidor Balcão');
  const clienteTelefone = document.getElementById('orc-cliente-telefone')?.value.trim() || '-';
  const vendedor = getSelectedVendedor();
  const totals = calculateTotals();
  const isThermal = printType === '80mm' || printType === '58mm';

  const printArea = getDedicatedPrintArea();

  printArea.className = `print-document print-${printType}`;
  printArea.style.fontFamily = isThermal ? "'Courier New', Courier, monospace" : (settings.fonteCupom || "'Inter', Arial, sans-serif");
  printArea.style.fontSize = `${settings.tamanhoFonteCupom || (isThermal ? 11 : 12)}px`;
  printArea.style.display = 'block';

  printArea.innerHTML = `
    <header class="print-header">
      ${(settings.logoCupomUrl || settings.logoUrl) ? `<img class="print-logo" src="${settings.logoCupomUrl || settings.logoUrl}" alt="Logo">` : ''}
      <h1>${escapeProductHtml(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA')}</h1>
      <p>${escapeProductHtml(settings.razaoSocial || '')}</p>
      <p>CNPJ: ${escapeProductHtml(settings.cnpj || '')}</p>
      <p>${escapeProductHtml(settings.whatsapp || settings.telefone || '')}</p>
    </header>
    <div class="print-title">${documentMode === 'pdv' ? 'CUPOM NÃO FISCAL' : 'ORÇAMENTO'} Nº ${getQuoteNumber(documentMode === 'pdv' ? 'VEN' : 'ORC')}</div>
    <div class="print-meta">
      <span>Data: ${formatDateTime(new Date())}</span>
      <span>Cliente: ${escapeProductHtml(clienteNome)}</span>
      <span>Telefone: ${escapeProductHtml(clienteTelefone)}</span>
      <span>Vendedor: ${escapeProductHtml(vendedor?.nome || 'dalbran (master)')}</span>
    </div>
    <table class="print-items">
      <thead>
        <tr>
          <th>Qtd</th>
          <th>Item</th>
          ${isThermal ? '' : '<th>Unitário</th>'}
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${cart.map(item => `
          <tr>
            <td>${item.quantidade}x</td>
            <td>${escapeProductHtml(item.nome)} ${escapeProductHtml(item.volume)}<br><small>${escapeProductHtml(linhaUnidadeItem(item))}</small>${fragmentoVarianteImpressao(item, opcoesVariantePorFormato(printType))}</td>
            ${isThermal ? '' : `<td>${formatCurrency(item.precoUnitario)}</td>`}
            <td style="text-align:right;">${formatCurrency(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <section class="print-totals">
      <p><span>Subtotal</span><span>${formatCurrency(totals.subtotal)}</span></p>
      <p><span>Desconto</span><span>- ${formatCurrency(totals.desconto)}</span></p>
      <p><span>Taxa</span><span>+ ${formatCurrency(totals.valorTaxa)}</span></p>
      <p class="print-total"><span>TOTAL</span><span>${formatCurrency(totals.totalGeral)}</span></p>
      <p><span>Pagamento</span><span>${totals.formaPag.toUpperCase()}</span></p>
    </section>
    <footer class="print-footer">
      ${document.getElementById('orc-prazo-entrega')?.value ? `Prazo de entrega: ${escapeProductHtml(document.getElementById('orc-prazo-entrega').value)}<br>` : ''}
      ${document.getElementById('orc-observacao')?.value ? `${escapeProductHtml(document.getElementById('orc-observacao').value)}<br>` : ''}
      ${settings.exibirAvisoNoCupom !== false && settings.avisoEstoque ? `${escapeProductHtml(settings.avisoEstoque)}<br>` : ''}
      <strong style="display:block; margin-top:4px;">${escapeProductHtml(settings.mensagemPadrao || 'Obrigado pela preferência!')}</strong>
    </footer>
  `;

  runNativePrint(printArea);
}

// A área de impressão precisa ser filha direta do body. Quando ficava dentro
// do app-shell, as regras de impressão escondiam o seu elemento-pai e o PDF
// ou comprovante saía em branco.
function getDedicatedPrintArea() {
  let printArea = document.querySelector('body > #print-area');
  if (printArea) return printArea;
  printArea = document.getElementById('print-area');
  if (!printArea) {
    printArea = document.createElement('div');
    printArea.id = 'print-area';
  }
  document.body.appendChild(printArea);
  return printArea;
}

// Converte URLs relativas/blob/data em data URL para o WebView do plugin
// (sem sessão/baseURL), garantindo que o logo do cabeçalho sempre apareça.
async function inlinePrintImages(html) {
  const srcs = [];
  let re = /<img\b[^>]*\bsrc="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) srcs.push(m[1]);
  if (!srcs.length) return html;

  const map = {};
  for (const src of srcs) {
    if (/^data:/i.test(src)) { map[src] = src; continue; }
    try {
      const abs = new URL(src, window.location.href).href;
      const res = await fetch(abs, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      map[src] = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Falha ao embutir imagem de impressão:', src, e);
      try { map[src] = new URL(src, window.location.href).href; } catch (_) { map[src] = src; }
    }
  }
  return html.replace(/<img\b([^>]*)\bsrc="([^"]+)"/gi, (full, attrs, src) => `<img${attrs}src="${map[src] || src}"`);
}

// Embutir o CSS inline (os <link> relativos não carregam no WebView do plugin,
// que não tem base URL). Assim a cascata é idêntica à da versão web.
async function collectPrintStyles() {
  const parts = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('style, link[rel="stylesheet"]')) {
    if (el.tagName === 'STYLE') {
      parts.push(`<style>${el.textContent}</style>`);
    } else if (el.href) {
      try {
        const href = el.href.split('#')[0];
        if (seen.has(href)) continue;
        seen.add(href);
        const res = await fetch(href, { cache: 'no-store' });
        if (res.ok) parts.push(`<style>${await res.text()}</style>`);
      } catch (e) {
        console.warn('Falha ao embutir CSS de impressão:', el.href, e);
      }
    }
  }
  return parts.join('\n');
}

async function runNativePrint(printArea) {
  if (!printArea?.innerHTML.trim()) {
    showToast('Não foi possível gerar o comprovante para impressão.', 'error');
    return;
  }

  // Capacitor Native Printer integration
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Printer) {
    try {
      const is58 = printArea.classList.contains('print-58mm');
      const is80 = printArea.classList.contains('print-80mm');
      const pageSize = is58 ? '58mm auto' : is80 ? '80mm auto' : 'A4';

      const styleContent = await collectPrintStyles();
      const html = await inlinePrintImages(printArea.innerHTML);

      const htmlToPrint = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${styleContent}
          <style>
            html, body { background: #fff; color: #000; margin: 0; padding: 0; }
            .print-document { display: block !important; }
            @page { size: ${pageSize}; margin: 0; }
            @media print {
              html, body { width: 100%; margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div id="print-area" class="${printArea.className}">${html}</div>
        </body>
      </html>
      `;
      await window.Capacitor.Plugins.Printer.print({ content: htmlToPrint });
      printArea.style.display = 'none';
    } catch (e) {
      console.warn('Capacitor Printer failed, calling window.print fallback:', e);
      printArea.style.display = 'block';
      window.print();
      setTimeout(() => { printArea.style.display = 'none'; }, 10000);
    }
    return;
  }

  printArea.style.display = 'block';
  void printArea.offsetHeight;

  const hidePrintArea = () => { printArea.style.display = 'none'; };
  window.addEventListener('afterprint', hidePrintArea, { once: true });
  window.print();
  window.setTimeout(hidePrintArea, 15000);
}

function printThermalReceipt(sale, format) {
  if (!sale?.itens?.length) {
    showToast('Não há comprovante de venda para imprimir.', 'error');
    return;
  }
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const totals = sale.financeiro || {};
  const printArea = getDedicatedPrintArea();
  const cupom = format || settings.formatoPadraoCupom || '80mm';
  const isThermal = cupom === '80mm' || cupom === '58mm';
  printArea.className = `print-document print-${isThermal ? cupom : '80mm'}`;
  printArea.style.fontFamily = "'Courier New', Courier, monospace";
  printArea.style.fontSize = `${settings.tamanhoFonteCupom || 11}px`;
  printArea.innerHTML = `
    <header class="print-header">
      ${(settings.logoCupomUrl || settings.logoUrl) ? `<img class="print-logo" src="${settings.logoCupomUrl || settings.logoUrl}" alt="Logo">` : ''}
      <h1>${escapeProductHtml(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA')}</h1>
      <p>CNPJ: ${escapeProductHtml(settings.cnpj || '')}</p>
      <p>${escapeProductHtml(settings.endereco || '')}</p>
    </header>
    <div class="print-title">COMPROVANTE DE VENDA Nº ${escapeProductHtml(sale.numero || sale.id || '')}</div>
    <div class="print-meta"><span>Data: ${formatDateTime(sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date())}</span><span>Cliente: ${escapeProductHtml(sale.cliente?.nome || 'Consumidor Final')}</span><span>Pagamento: ${escapeProductHtml(String(totals.formaPag || 'PIX').toUpperCase())}</span></div>
    <table class="print-items"><thead><tr><th>Qtd</th><th>Item</th><th>Total</th></tr></thead><tbody>${sale.itens.map(item => `<tr><td>${item.quantidade}x</td><td>${escapeProductHtml(item.nome)} ${escapeProductHtml(item.volume || '')}<br><small>${escapeProductHtml(linhaUnidadeItem(item))}</small>${fragmentoVarianteImpressao(item, opcoesVariantePorFormato(isThermal ? cupom : '80mm'))}</td><td>${formatCurrency(item.subtotal || (item.precoUnitario * item.quantidade))}</td></tr>`).join('')}</tbody></table>
    <section class="print-totals"><p><span>Subtotal</span><span>${formatCurrency(totals.subtotal || 0)}</span></p><p><span>Desconto</span><span>- ${formatCurrency(totals.desconto || 0)}</span></p><p class="print-total"><span>TOTAL</span><span>${formatCurrency(totals.totalGeral || 0)}</span></p></section>
    <footer class="print-footer"><strong>${escapeProductHtml(settings.mensagemPadrao || 'Obrigado pela preferência!')}</strong></footer>`;
  runNativePrint(printArea);
}

// Imprime um orçamento/venda salvo direto dos dados (sem depender do carrinho),
// preservando a tela de origem (Histórico).
window.printSavedDocument = function(saved) {
  if (!saved || !Array.isArray(saved.itens) || saved.itens.length === 0) {
    showToast('Documento sem itens para imprimir.', 'error');
    return;
  }
  const isVenda = saved.tipo === 'venda';
  if (isVenda) {
    if (typeof printThermalReceipt === 'function') printThermalReceipt(saved, (window.getCompanySettings ? window.getCompanySettings() : {}).formatoPadraoCupom || '80mm');
    else openThermalReceiptModal(saved);
    return;
  }
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const totals = saved.financeiro || {};
  const printArea = getDedicatedPrintArea();
  const format = settings.formatoPadraoCupom || '80mm';
  const isThermal = format === '80mm' || format === '58mm';
  printArea.className = `print-document print-${format}`;
  printArea.style.fontFamily = isThermal ? "'Courier New', Courier, monospace" : (settings.fonteCupom || "'Inter', Arial, sans-serif");
  printArea.style.fontSize = `${settings.tamanhoFonteCupom || (isThermal ? 11 : 12)}px`;
  printArea.style.display = 'block';
  printArea.innerHTML = `
    <header class="print-header">
      ${(settings.logoCupomUrl || settings.logoUrl) ? `<img class="print-logo" src="${settings.logoCupomUrl || settings.logoUrl}" alt="Logo">` : ''}
      <h1>${escapeProductHtml(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA')}</h1>
      <p>${escapeProductHtml(settings.razaoSocial || '')}</p>
      <p>CNPJ: ${escapeProductHtml(settings.cnpj || '')}</p>
      <p>${escapeProductHtml(settings.whatsapp || settings.telefone || '')}</p>
    </header>
    <div class="print-title">ORÇAMENTO Nº ${escapeProductHtml(saved.numero || saved.id || '')}</div>
    <div class="print-meta">
      <span>Data: ${saved.createdAt?.toDate ? formatDateTime(saved.createdAt.toDate()) : formatDateTime(new Date())}</span>
      <span>Cliente: ${escapeProductHtml(saved.cliente?.nome || 'Consumidor Balcão')}</span>
      <span>Vendedor: ${escapeProductHtml(saved.vendedor?.nome || 'dalbran (master)')}</span>
    </div>
    <table class="print-items">
      <thead><tr><th>Qtd</th><th>Item</th>${isThermal ? '' : '<th>Unitário</th>'}<th style="text-align:right;">Total</th></tr></thead>
      <tbody>${saved.itens.map(item => `
        <tr>
          <td>${item.quantidade}x</td>
          <td>${escapeProductHtml(item.nome)} ${escapeProductHtml(item.volume || '')}<br><small>${escapeProductHtml(linhaUnidadeItem(item))}</small>${fragmentoVarianteImpressao(item, opcoesVariantePorFormato(format))}</td>
          ${isThermal ? '' : `<td>${formatCurrency(item.precoUnitario)}</td>`}
          <td style="text-align:right;">${formatCurrency(item.subtotal || (item.precoUnitario * item.quantidade))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <section class="print-totals">
      <p><span>Subtotal</span><span>${formatCurrency(totals.subtotal || 0)}</span></p>
      <p><span>Desconto</span><span>- ${formatCurrency(totals.desconto || 0)}</span></p>
      <p><span>Taxa</span><span>+ ${formatCurrency(totals.valorTaxa || 0)}</span></p>
      <p class="print-total"><span>TOTAL</span><span>${formatCurrency(totals.totalGeral || 0)}</span></p>
      <p><span>Pagamento</span><span>${String(totals.formaPag || 'PIX').toUpperCase()}</span></p>
    </section>
    <footer class="print-footer">
      ${saved.entrega?.prazo ? `Prazo de entrega: ${escapeProductHtml(saved.entrega.prazo)}<br>` : ''}
      ${saved.entrega?.observacao ? `${escapeProductHtml(saved.entrega.observacao)}<br>` : ''}
      ${settings.exibirAvisoNoCupom !== false && settings.avisoEstoque ? `${escapeProductHtml(settings.avisoEstoque)}<br>` : ''}
      <strong style="display:block; margin-top:4px;">${escapeProductHtml(settings.mensagemPadrao || 'Obrigado pela preferência!')}</strong>
    </footer>
  `;
  runNativePrint(printArea);
};

function updateDashboardQuoteMetrics() {
  const recentElem = document.getElementById('dash-recent-quotes');
  const mobRecentElem = document.getElementById('mob-dash-recent-quotes');
  const totalValElem = document.getElementById('dash-total-quotes-value');
  const salesElem = document.getElementById('dash-total-sales');
  const mobSalesElem = document.getElementById('mob-dash-total-sales');
  const salesValueElem = document.getElementById('dash-total-sales-value');

  const quotes = quotesHistory.filter(q => q.tipo !== 'venda');
  const sales = quotesHistory.filter(q => q.tipo === 'venda');

  if (recentElem) recentElem.textContent = quotes.length;
  if (mobRecentElem) mobRecentElem.textContent = quotes.length;
  if (salesElem) salesElem.textContent = sales.length;
  if (mobSalesElem) mobSalesElem.textContent = sales.length;

  if (totalValElem) {
    const totalSuma = quotes.reduce((acc, q) => acc + (q.financeiro?.totalGeral || 0), 0);
    totalValElem.textContent = formatCurrency(totalSuma);
  }
  if (salesValueElem) {
    const totalSales = sales.reduce((acc, sale) => acc + (sale.financeiro?.totalGeral || 0), 0);
    salesValueElem.textContent = formatCurrency(totalSales);
  }

  if (typeof window.updateFinanceiro === 'function') window.updateFinanceiro();
}

function _filterSalesByPeriod(periodValue, startInput, endInput) {
  const getDate = value => value?.toDate ? value.toDate() : value ? new Date(value) : null;
  const now = new Date(); now.setHours(23, 59, 59, 999);
  let start = null; let end = now;
  if (periodValue === 'today') { start = new Date(); start.setHours(0, 0, 0, 0); }
  if (periodValue === 'week') { start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
  if (periodValue === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  if (periodValue === 'year') { start = new Date(now.getFullYear(), 0, 1); }
  if (periodValue === 'custom') {
    start = startInput?.value ? new Date(`${startInput.value}T00:00:00`) : null;
    end = endInput?.value ? new Date(`${endInput.value}T23:59:59`) : null;
  }
  return (window.quotesCache?.length ? window.quotesCache : quotesHistory).filter(doc => {
    if (doc.tipo !== 'venda') return false;
    const date = getDate(doc.createdAt);
    return (!start || (date && date >= start)) && (!end || (date && date <= end));
  });
}

window.updateDashboardFinancial = function() {
  const period = document.getElementById('fin-period');
  const startInput = document.getElementById('fin-date-start');
  const endInput = document.getElementById('fin-date-end');
  const periodValue = period ? period.value : 'month';
  const sales = _filterSalesByPeriod(periodValue, startInput, endInput);
  const revenue = sales.reduce((t, s) => t + Number(s.financeiro?.totalGeral || 0), 0);
  const countEl = document.getElementById('dash-period-sales-count');
  const valueEl = document.getElementById('dash-period-sales-value');
  if (countEl) countEl.textContent = sales.length;
  if (valueEl) valueEl.textContent = formatCurrency(revenue);
};

window.updateFinanceiro = function() {
  const period = document.getElementById('fin-period');
  const startInput = document.getElementById('fin-date-start');
  const endInput = document.getElementById('fin-date-end');
  if (!period) return;

  const sales = _filterSalesByPeriod(period.value, startInput, endInput);
  const revenue = sales.reduce((t, s) => t + Number(s.financeiro?.totalGeral || 0), 0);
  const receivable = sales.filter(s => s.financeiro?.formaPag === 'receber').reduce((t, s) => t + Number(s.financeiro?.totalGeral || 0), 0);
  const income = revenue - receivable;
  const balance = income - receivable;

  const totalItems = sales.reduce((t, s) => t + (Array.isArray(s.itens) ? s.itens.reduce((i, it) => i + Number(it.quantidade || 0), 0) : 0), 0);

  const revEl = document.getElementById('fin-revenue');
  const cntEl = document.getElementById('fin-count');
  const recEl = document.getElementById('fin-receivable');
  const incEl = document.getElementById('fin-income');
  const balEl = document.getElementById('fin-balance');
  if (revEl) revEl.textContent = formatCurrency(revenue);
  if (cntEl) cntEl.textContent = sales.length;
  if (recEl) recEl.textContent = formatCurrency(receivable);
  if (incEl) incEl.textContent = formatCurrency(income);
  if (balEl) balEl.textContent = formatCurrency(balance);

  const dashCount = document.getElementById('dash-period-sales-count');
  const dashValue = document.getElementById('dash-period-sales-value');
  if (dashCount) dashCount.textContent = sales.length;
  if (dashValue) dashValue.textContent = formatCurrency(revenue);

  // Estatísticas: ticket médio, melhor dia, total de itens
  const avgTicket = sales.length ? revenue / sales.length : 0;
  const avgEl = document.getElementById('fin-avg-ticket');
  if (avgEl) avgEl.textContent = formatCurrency(avgTicket);
  const itemsEl = document.getElementById('fin-total-items');
  if (itemsEl) itemsEl.textContent = totalItems;

  const bestDayEl = document.getElementById('fin-best-day');
  if (bestDayEl) {
    const dayTotals = {};
    sales.forEach(s => {
      const d = s.createdAt?.toDate ? s.createdAt.toDate() : s.createdAt ? new Date(s.createdAt) : null;
      if (!d) return;
      const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      dayTotals[key] = (dayTotals[key] || 0) + Number(s.financeiro?.totalGeral || 0);
    });
    const best = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
    bestDayEl.textContent = best ? `${best[0]} (${formatCurrency(best[1])})` : '-';
  }

  // Resumo por forma de pagamento
  const paymentSummaryEl = document.getElementById('fin-payment-summary');
  if (paymentSummaryEl) {
    const labels = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Cartão Débito', credito: 'Cartão Crédito', boleto: 'Boleto', receber: 'A receber' };
    const totals = {};
    sales.forEach(s => {
      const fp = s.financeiro?.formaPag || 'pix';
      totals[fp] = (totals[fp] || 0) + Number(s.financeiro?.totalGeral || 0);
    });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    paymentSummaryEl.innerHTML = entries.length
      ? entries.map(([fp, total]) => `
          <div class="fin-pay-row">
            <span class="fin-pay-label"><i class="ph ph-${fp === 'pix' ? 'qr-code' : fp === 'dinheiro' ? 'banknote' : fp === 'receber' ? 'hourglass' : 'credit-card'}"></i> ${labels[fp] || fp}</span>
            <strong class="fin-pay-value">${formatCurrency(total)}</strong>
          </div>`).join('')
      : '<p class="empty-state">Sem vendas no período.</p>';
  }

  const list = document.getElementById('fin-sales-list');
  if (!list) return;
  list.innerHTML = sales.length
    ? sales.map(sale => `
        <button type="button" class="fin-sale-item" onclick="openSavedQuoteActions('${sale.id}')">
          <div class="fin-sale-info">
            <strong>${escapeProductHtml(sale.numero || sale.id)}</strong>
            <small>${sale.cliente?.nome || 'Cliente não informado'} · ${sale.createdAt?.toDate ? formatDateTime(sale.createdAt.toDate()) : '-'}</small>
          </div>
          <div class="fin-sale-right">
            <span class="fin-sale-value">${formatCurrency(sale.financeiro?.totalGeral)}</span>
            <span class="fin-sale-badge fin-badge-${sale.financeiro?.formaPag === 'receber' ? 'pending' : 'paid'}">${sale.financeiro?.formaPag === 'receber' ? 'A receber' : 'Pago'}</span>
          </div>
        </button>`).join('')
    : '<p class="empty-state">Nenhuma venda no período selecionado.</p>';
};
