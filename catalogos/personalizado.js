let allProducts = [];
let filteredProducts = [];
let currentCategory = 'todos';

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

document.addEventListener('DOMContentLoaded', () => {
    initCustomCatalog();
});

function initCustomCatalog() {
    allProducts = parseCatalogUrl();
    if (!allProducts.length) {
        showEmptyState('Nenhum produto selecionado ou link de catálogo inválido.');
        return;
    }

    renderCategoryFilters();
    filterProducts();
}

function parseCatalogUrl() {
    try {
        const rawHash = decodeURIComponent(location.hash.slice(1)).trim();
        if (!rawHash) return [];

        // Formato compacto: p=2L:1,2,3;5L:4,5 ou 2L:1,2;5L:4
        const compactMatch = rawHash.startsWith('p=') ? rawHash.slice(2) : (rawHash.includes(':') ? rawHash : null);

        if (compactMatch && window.DalbranCatalogData) {
            const items = [];
            const parts = compactMatch.split(';');

            parts.forEach(part => {
                const [source, idsStr] = part.split(':');
                if (source && idsStr && window.DalbranCatalogData[source]) {
                    const ids = idsStr.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                    const sourceProducts = window.DalbranCatalogData[source];

                    ids.forEach(id => {
                        const product = sourceProducts.find(p => p.id === id);
                        if (product) {
                            // Ajusta o caminho da imagem relativo à pasta catalogos/
                            const imagePath = product.image.startsWith('http') || product.image.startsWith('data:')
                                ? product.image
                                : (source === '2L' && !product.image.startsWith('2L/') ? `2L/${product.image}` : (source === '5L' && !product.image.startsWith('5L/') ? `5L/${product.image}` : product.image));

                            items.push({
                                ...product,
                                uid: `${source}_${product.id}`,
                                source,
                                displayImage: imagePath
                            });
                        }
                    });
                }
            });

            if (items.length) return items;
        }

        // Suporte legado: Base64 do JSON original
        const decodedJson = JSON.parse(decodeURIComponent(escape(atob(rawHash))));
        if (Array.isArray(decodedJson) && decodedJson.length) {
            return decodedJson.map((item, idx) => ({
                id: idx + 1,
                uid: `legacy_${idx + 1}`,
                title: item.t || 'Produto',
                category: catalogCategorySlug(item.c || 'geral'),
                categoryName: item.c || 'Geral',
                desc: item.d || '',
                volume: item.v || '',
                displayImage: item.i || '',
                fragrances: item.f || []
            }));
        }

    } catch (error) {
        console.error('Erro ao decodificar catálogo personalizado:', error);
    }
    return [];
}

function catalogCategorySlug(name) {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function renderCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;

    // Identifica as categorias presentes na seleção
    const categoriesMap = new Map();
    allProducts.forEach(p => {
        const slug = p.category || catalogCategorySlug(p.categoryName);
        if (!categoriesMap.has(slug)) {
            categoriesMap.set(slug, p.categoryName || 'Outros');
        }
    });

    let html = `
        <button class="filter-btn active" onclick="filterCategory('todos')">
            <i class="fa-solid fa-border-all"></i> Todos (${allProducts.length})
        </button>
    `;

    categoriesMap.forEach((name, slug) => {
        html += `
            <button class="filter-btn" data-category="${slug}" onclick="filterCategory('${slug}')">
                <i class="fa-solid fa-tag"></i> ${escapeHtml(name)}
            </button>
        `;
    });

    container.innerHTML = html;
}

function filterCategory(categorySlug) {
    currentCategory = categorySlug;

    // Atualiza botões ativos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (categorySlug === 'todos' && btn.textContent.includes('Todos')) {
            btn.classList.add('active');
        } else if (btn.getAttribute('data-category') === categorySlug) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    filterProducts();
}

function filterProducts() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';

    filteredProducts = allProducts.filter(product => {
        const prodCategorySlug = product.category || catalogCategorySlug(product.categoryName);
        const matchesCategory = (currentCategory === 'todos' || prodCategorySlug === currentCategory);

        const searchTarget = `${product.title} ${product.categoryName} ${product.desc} ${product.volume} ${(product.fragrances || []).join(' ')}`.toLowerCase();
        const matchesSearch = !searchTerm || searchTarget.includes(searchTerm);

        return matchesCategory && matchesSearch;
    });

    renderGrid(filteredProducts);
}

function renderGrid(productsList) {
    const grid = document.getElementById('productGrid');
    const noResults = document.getElementById('noResults');
    if (!grid) return;

    if (!productsList.length) {
        grid.innerHTML = '';
        noResults?.classList.remove('hidden');
        return;
    }

    noResults?.classList.add('hidden');
    grid.innerHTML = productsList.map(product => `
        <article class="product-card">
            <div class="card-image-box">
                <span class="sector-tag">${escapeHtml(product.categoryName || 'Dalbran')}</span>
                <img src="${encodeURI(product.displayImage)}" alt="${escapeHtml(product.title)}" loading="lazy">
            </div>
            <div class="card-content">
                <h3 class="product-title">${escapeHtml(product.title)}</h3>
                <p class="product-desc">${escapeHtml(product.desc)}</p>
                <div class="fragrance-pills">
                    ${(product.fragrances || []).map(f => `<span class="fragrance-badge">${escapeHtml(f)}</span>`).join('')}
                </div>
                <button type="button" class="btn-card-details" onclick="openModal('${product.uid}')">Ver detalhes</button>
            </div>
        </article>
    `).join('');
}

function showEmptyState(msg) {
    const grid = document.getElementById('productGrid');
    const categorySection = document.getElementById('categorySection');
    if (categorySection) categorySection.style.display = 'none';
    if (grid) {
        grid.innerHTML = `<div class="no-results"><i class="fa-solid fa-circle-exclamation"></i><h3>Catálogo Indisponível</h3><p>${escapeHtml(msg)}</p></div>`;
    }
}

// MODAL DE DETALHES
function openModal(uid) {
    const product = allProducts.find(p => p.uid === uid);
    if (!product) return;

    document.getElementById('modalImage').src = product.displayImage;
    document.getElementById('modalCategory').textContent = product.categoryName;
    document.getElementById('modalTitle').textContent = product.title;
    document.getElementById('modalDesc').textContent = product.desc;
    document.getElementById('modalVolume').textContent = product.volume || 'Consulte';

    const fragranceList = document.getElementById('fragranceList');
    fragranceList.innerHTML = (product.fragrances || []).map(f => `<span class="fragrance-item"><i class="fa-solid fa-check"></i> ${escapeHtml(f)}</span>`).join('');

    const message = encodeURIComponent(`Olá! Vi no catálogo personalizado e gostaria de solicitar um orçamento para: ${product.title}`);
    document.getElementById('modalWhatsappBtn').href = `https://wa.me/5521998852318?text=${message}`;

    document.getElementById('productModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('productModal').classList.add('hidden');
}

document.getElementById('productModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'productModal') {
        closeModal();
    }
});

// FUNÇÕES DE IMPRESSÃO E EXPORTAÇÃO
function printCatalog() {
    window.print();
}

function exportAsImage() {
    const element = document.getElementById('catalogContent');
    const btn = event.currentTarget;
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando imagem...';

    if (window.html2canvas) {
        html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'catalogo-personalizado-dalbran.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            btn.innerHTML = originalBtnText;
        }).catch(err => {
            console.error('Erro ao gerar imagem:', err);
            alert('Ocorreu um erro ao gerar a imagem do catálogo.');
            btn.innerHTML = originalBtnText;
        });
    } else {
        alert('Biblioteca de geração de imagem carregando. Tente novamente.');
        btn.innerHTML = originalBtnText;
    }
}

// =========================================================
// COMPARTILHAMENTO
// =========================================================

const PUBLIC_CATALOG_BASE = 'https://dalbran.github.io/web/';

function getPublicPageUrl() {
    if (window.location.origin.includes('localhost') || window.location.protocol === 'file:' || window.location.protocol === 'capacitor:') {
        const hash = window.location.hash || '';
        return new URL('catalogos/personalizado.html' + hash, PUBLIC_CATALOG_BASE).href;
    }
    return window.location.href;
}

function openSharePanel() {
    const modal = document.getElementById('shareModal');
    const input = document.getElementById('shareLinkInput');
    const shortText = document.getElementById('shortLinkText');

    // Preenche com o link público atual e reseta estado
    input.value = getPublicPageUrl();
    if (shortText) shortText.textContent = 'Gerar Link Curto';
    resetCopyButton();

    // Exibe botão nativo se o navegador suportar (mobile)
    const nativeBtn = document.getElementById('btnNativeShare');
    if (nativeBtn) {
        nativeBtn.style.display = navigator.share ? 'flex' : 'none';
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeSharePanel(event) {
    if (event && event.target && event.target.id !== 'shareModal') return;
    const modal = document.getElementById('shareModal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function resetCopyButton() {
    const icon = document.getElementById('copyIcon');
    const text = document.getElementById('copyText');
    if (icon) { icon.className = 'fa-solid fa-copy'; }
    if (text) text.textContent = 'Copiar';
    const btn = document.getElementById('btnCopyLink');
    if (btn) btn.style.background = '';
}

function copyShareLink() {
    const input = document.getElementById('shareLinkInput');
    const link = input?.value || window.location.href;

    const onSuccess = () => {
        const icon = document.getElementById('copyIcon');
        const text = document.getElementById('copyText');
        const btn = document.getElementById('btnCopyLink');
        if (icon) icon.className = 'fa-solid fa-check';
        if (text) text.textContent = 'Copiado!';
        if (btn) btn.style.background = '#10b981';
        setTimeout(resetCopyButton, 2500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(onSuccess).catch(() => {
            fallbackCopy(link, onSuccess);
        });
    } else {
        fallbackCopy(link, onSuccess);
    }
}

function fallbackCopy(text, onSuccess) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        if (onSuccess) onSuccess();
    } catch(e) {
        prompt('Copie o link abaixo:', text);
    }
    document.body.removeChild(ta);
}

function shareOnWhatsApp() {
    const link = document.getElementById('shareLinkInput')?.value || window.location.href;
    const text = encodeURIComponent(`Olá! Veja o catálogo personalizado da Dalbran que separei para você: ${link}`);
    window.open(`https://wa.me/5521998852318?text=${text}`, '_blank', 'noopener');
}

async function generateShortLink() {
    const btn = document.getElementById('btnShortLink');
    const textEl = document.getElementById('shortLinkText');
    const input = document.getElementById('shareLinkInput');
    const longUrl = input?.value || getPublicPageUrl();

    if (!textEl || !input) return;

    // Se já gerou, só copia
    if (btn.dataset.shortUrl) {
        input.value = btn.dataset.shortUrl;
        copyShareLink();
        return;
    }

    textEl.textContent = 'Gerando...';
    btn.disabled = true;

    let shortUrl = null;

    try {
        // Tenta TinyURL primeiro
        const tinyRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
        if (tinyRes.ok) {
            const txt = await tinyRes.text();
            if (txt.startsWith('http')) shortUrl = txt.trim();
        }
    } catch (_) { /* ignora, tenta próximo */ }

    if (!shortUrl) {
        try {
            // Fallback: is.gd
            const isgdRes = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`);
            if (isgdRes.ok) {
                const txt = await isgdRes.text();
                if (txt.startsWith('http')) shortUrl = txt.trim();
            }
        } catch (_) { /* ignora */ }
    }

    btn.disabled = false;

    if (shortUrl) {
        input.value = shortUrl;
        btn.dataset.shortUrl = shortUrl;
        textEl.textContent = 'Copiar Curto';
        // Copia automaticamente
        copyShareLink();
    } else {
        textEl.textContent = 'Indisponível';
        setTimeout(() => { textEl.textContent = 'Link Curto'; }, 3000);
    }
}

async function shareNative() {
    const link = document.getElementById('shareLinkInput')?.value || window.location.href;
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Catálogo Personalizado — Dalbran Distribuidora',
                text: 'Veja o catálogo personalizado que separei para você!',
                url: link
            });
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Erro ao compartilhar:', err);
        }
    }
}

// Fechar modal com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const shareModal = document.getElementById('shareModal');
        if (shareModal && !shareModal.classList.contains('hidden')) {
            shareModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }
});
