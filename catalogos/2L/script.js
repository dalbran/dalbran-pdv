// BANCO DE DADOS DOS PRODUTOS
const products = [
    {
        id: 1,
        title: "Desinfetante Perfumado 2L",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "Elimina 99.9% dos germes e bactérias deixando um aroma agradável e duradouro no ambiente.",
        volume: "Frasco de 2 Litros",
        image: "images/DESINFENTANTES 2L - EUCALIPTO - FLORAL - JASMIN - LAVANDA - PINHO VERT - PINHO VERT - TALCO - VIOLECE - VIOLETA - ZIX.png",
        fragrances: ["Eucalipto", "Floral", "Jasmin", "Lavanda", "Pinho Vert", "Talco", "Violece", "Violeta", "Zix"]
    },
    {
        id: 2,
        title: "Desinfetante Concentrado 100ml",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "Alta rentabilidade em embalagem compacta. Diluído em água, 100ml rende até 5 litros de desinfetante.",
        volume: "Rende 5 Litros",
        image: "images/DESINFETANTE CONCENTRADO 100 ML FAZ 5 L - LAVANDA - LAVANDA GLEYDE -MARINHO -MIRRA -KAIAK -VIOLETA - PALMOLIVE -PRIMAVERA -DAMA DA NOITE - GEOVANA BABY -FLORES DO CAMPO - CITRUS - LAVANDA ORIENTE.png",
        fragrances: ["Lavanda", "Gleyde", "Marinho", "Mirra", "Kaiak", "Violeta", "Palmolive", "Primavera", "Dama da Noite", "Geovana Baby", "Flores do Campo", "Citrus", "Lavanda Oriente"]
    },
    {
        id: 3,
        title: "Desinfetante Gelatinoso Sampin",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "Fórmula em gel especial com maior poder de fixação nas superfícies e perfume prolongado.",
        volume: "Embalagem de 1 Litro",
        image: "images/DESINFETANTE GELATINOSO 1L SAMPIN.jpg",
        fragrances: ["Original Gel"]
    },
    {
        id: 4,
        title: "Amaciante de Roupas Amacipex",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Deixa as tecidos com toque aveludado, macios ao toque e perfumados por muito mais tempo.",
        volume: "Frasco de 2 Litros",
        image: "images/AMACIANTE DE ROUPAS 2L - LAVANDA - AMACIPEX - FLORAL.png",
        fragrances: ["Lavanda", "Floral"]
    },
    {
        id: 5,
        title: "Aromatizante de Ambiente 60ml",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Essência ultra concentrada para perfumar ambientes residenciais, comerciais ou automóveis.",
        volume: "Frasco Spray de 60 ml",
        image: "images/AROMATIZANTE AMBIENTE 60 ML - TUTTY FRUTY - VIOLETA - CARRO NOVO.jpg",
        fragrances: ["Tutty Fruty", "Violeta", "Carro Novo"]
    },
    {
        id: 6,
        title: "Detergente Líquido Lava-Louças",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Alta eficiência na remoção de gorduras pesadas mantendo a proteção e suavidade nas mãos.",
        volume: "500 ml / 2 Litros",
        image: "images/DETERGENTE - COCO - MAÇA - LIMÃO - NEUTRO.png",
        fragrances: ["Coco", "Maçã", "Limão", "Neutro"]
    },
    {
        id: 7,
        title: "Cloro Ativo Multiuso",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Ação alvejante e desinfetante potente para pisos, banheiros, azulejos e branqueamento de tecidos.",
        volume: "Frasco de 2 Litros",
        image: "images/CLORO 2L.png",
        fragrances: ["Tradicional Cloro"]
    },
    {
        id: 8,
        title: "Hipoclorito de Sódio Concentrado",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Desinfecção profunda e higienização pesada. Rende até 5 litros de solução pronta para uso.",
        volume: "500 ml (Rende 5L)",
        image: "images/HIPOCLORITO DE SÓDIO - 500 ML - FAZ 5 LITROS.png",
        fragrances: ["Sem perfume (Ação Química)"]
    },
    {
        id: 9,
        title: "Multiuso Multilimp Green",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Limpador prático para superfícies laváveis, fogões, pias, superfícies plásticas e fórmicas.",
        volume: "Galão de 2 Litros",
        image: "images/MULTIUSO - MULTILIMP GREEN 2L.jfif",
        fragrances: ["Limpeza Fresca"]
    },
    {
        id: 10,
        title: "SJ Mult Desengraxante e Desengordurante",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Fórmula de alta performance para remoção de graxas, óleos e sujeiras pesadas impregnadas.",
        volume: "Frasco de 1 Litro",
        image: "images/SJ MULT 1 L DESENGRAXANTE - DESENGORDURANTE.png",
        fragrances: ["Sem perfume (Uso Técnico)"]
    },
    {
        id: 11,
        title: "Abrilhantador de Pneus RB100",
        category: "automotivo",
        categoryName: "Linha Automotiva",
        desc: "Protege e restaura o brilho original dos pneus do seu veículo com efeito duradouro e resistente à água.",
        volume: "Frasco de 1 Litro",
        image: "images/ABRILHANTADOR DE PNEUS - RB100 1 LITRO.png",
        fragrances: ["Neutro"]
    },
    {
        id: 12,
        title: "Sabonete Líquido Perolado",
        category: "higiene",
        categoryName: "Higiene Pessoal",
        desc: "Limpeza suave com hidratação e fragrância aveludada. Ideal para lavabos e uso diário.",
        volume: "Frasco de 2 Litros",
        image: "images/Sabonete liquido PEROLADO 2L - Florence - Violeta - Erva doce.png",
        fragrances: ["Florence", "Violeta", "Erva Doce"]
    }
];

let currentCategory = 'todos';

// INICIALIZAÇÃO SEGURA DO CATÁLOGO
function initCatalog() {
    renderProducts(products);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalog);
} else {
    initCatalog();
}

function renderProducts(items) {
    const grid = document.getElementById('productGrid');
    const noResults = document.getElementById('noResults');
    if (!grid) return;
    grid.innerHTML = '';

    if (!items || items.length === 0) {
        if (noResults) noResults.classList.remove('hidden');
        return;
    } else {
        if (noResults) noResults.classList.add('hidden');
    }

    items.forEach(product => {
        // Pega até 3 fragrâncias para exibir no card
        const fragrancePills = (product.fragrances || []).slice(0, 3)
            .map(f => `<span class="fragrance-badge">${f}</span>`).join('');
        const extraFragranceCount = (product.fragrances && product.fragrances.length > 3) ? `<span class="fragrance-badge">+${product.fragrances.length - 3}</span>` : '';

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="card-image-box">
                <img src="${product.image}" alt="${product.title}" loading="lazy">
                <span class="sector-tag">${product.categoryName || 'Geral'}</span>
            </div>
            <div class="card-content">
                <h3 class="product-title">${product.title}</h3>
                <p class="product-desc">${product.desc}</p>
                <div class="fragrance-pills">
                    ${fragrancePills} ${extraFragranceCount}
                </div>
                <button class="btn-card-details" onclick="openModal(${product.id})">
                    Ver Fragrâncias & Detalhes
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// FILTRAR POR CATEGORIA (SETOR)
function filterCategory(category, evt) {
    currentCategory = category;
    
    // Atualiza botões
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const target = (evt && evt.currentTarget) || (window.event && window.event.currentTarget);
    if (target) {
        target.classList.add('active');
    }
    applyFilters();
}

// FILTRAR POR BUSCA
function filterProducts() {
    applyFilters();
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();

    const filtered = products.filter(product => {
        const matchesCategory = currentCategory === 'todos' || product.category === currentCategory;
        
        const matchesSearch = product.title.toLowerCase().includes(searchTerm) ||
                              product.desc.toLowerCase().includes(searchTerm) ||
                              (product.fragrances || []).some(f => f.toLowerCase().includes(searchTerm));

        return matchesCategory && matchesSearch;
    });

    renderProducts(filtered);
}

// ABRIR E FECHAR MODAL
function openModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const modalImg = document.getElementById('modalImage');
    if (modalImg) modalImg.src = product.image;
    const modalCat = document.getElementById('modalCategory');
    if (modalCat) modalCat.textContent = product.categoryName || 'Geral';
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = product.title;
    const modalDesc = document.getElementById('modalDesc');
    if (modalDesc) modalDesc.textContent = product.desc;
    const modalVol = document.getElementById('modalVolume');
    if (modalVol) modalVol.textContent = product.volume || '-';

    // Renderizar lista completa de fragrâncias
    const fragranceList = document.getElementById('fragranceList');
    if (fragranceList) {
        fragranceList.innerHTML = (product.fragrances || []).map(f => `<span class="fragrance-item"><i class="fa-solid fa-check"></i> ${f}</span>`).join('');
    }

    // Link do WhatsApp com número atualizado
    const modalWa = document.getElementById('modalWhatsappBtn');
    if (modalWa) {
        const message = encodeURIComponent(`Olá! Gostaria de fazer um pedido do produto: ${product.title}`);
        modalWa.href = `https://wa.me/5521998852318?text=${message}`;
    }

    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.add('hidden');
}

// Fechar modal clicando fora do card
const prodModal2 = document.getElementById('productModal');
if (prodModal2) {
    prodModal2.addEventListener('click', (e) => {
        if (e.target.id === 'productModal') {
            closeModal();
        }
    });
}

const CATALOG_2L_URL = 'https://dalbran.github.io/web/catalogos/2L/index.html';
const CATALOG_2L_TITLE = 'Catálogo Dalbran 2 Litros';

// FUNÇÕES DE COMPARTILHAMENTO
function shareOnWhatsApp() {
    const text = encodeURIComponent(`Olá! Confira o Catálogo Oficial Dalbran (Linha 2 Litros):\n${CATALOG_2L_URL}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function copyCatalogLink() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(CATALOG_2L_URL).then(() => {
            alert('Link do Catálogo 2L copiado com sucesso:\n' + CATALOG_2L_URL);
        }).catch(() => {
            fallbackPromptCopy(CATALOG_2L_URL);
        });
    } else {
        fallbackPromptCopy(CATALOG_2L_URL);
    }
}

function shareNative() {
    const text = 'Confira o Catálogo Oficial Dalbran (Linha 2 Litros): ' + CATALOG_2L_URL;
    if (navigator.share) {
        navigator.share({
            title: CATALOG_2L_TITLE,
            text: text,
            url: CATALOG_2L_URL
        }).catch(() => {});
    } else {
        copyCatalogLink();
    }
}

function shareCatalog() {
    shareNative();
}

function fallbackPromptCopy(url) {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        alert('Link do Catálogo copiado com sucesso:\n' + url);
    } catch(e) {
        prompt('Copie o link do catálogo abaixo:', url);
    }
    document.body.removeChild(ta);
}

// FUNÇÃO PARA IMPRIMIR OU SALVAR EM PDF
function printCatalog() {
    window.print();
}

// COMPARTILHAR OU BAIXAR IMAGEM (PNG)
// No APK (app), envia a imagem para o app abrir o compartilhamento nativo
// do Android via postMessage. Em qualquer outro ambiente faz o download.
function shareOrDownloadImage(dataUrl, fileName) {
    let done = false;
    const finish = (ok) => {
        if (done) return;
        done = true;
        window.removeEventListener('message', onAck);
        if (!ok) {
            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
        }
    };
    const onAck = (e) => {
        if (e.source === window.parent && e.data && e.data.type === 'catalog-share-ack') {
            finish(true);
        }
    };
    if (window.parent && window.parent !== window) {
        window.addEventListener('message', onAck);
        try { window.parent.postMessage({ type: 'catalog-share-image', dataUrl: dataUrl, fileName: fileName }, '*'); } catch (err) { /* ignore */ }
        setTimeout(() => finish(false), 500);
    } else {
        finish(false);
    }
}

// FUNÇÃO PARA EXPORTAR COMO IMAGEM (PNG)
function exportAsImage(evt) {
    const element = document.getElementById('catalogContent') || document.body;
    const btn = (evt && evt.currentTarget) || (window.event && window.event.currentTarget) || document.querySelector('.btn-export-img');
    const originalBtnText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando imagem...';

    if (typeof html2canvas !== 'function') {
        alert('Recurso indisponível no momento.');
        if (btn) btn.innerHTML = originalBtnText;
        return;
    }

    html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
    }).then(canvas => {
        shareOrDownloadImage(canvas.toDataURL('image/png'), 'catalogo-dalbran-2L.png');
        if (btn) btn.innerHTML = originalBtnText;
    }).catch(err => {
        console.error('Erro ao gerar imagem:', err);
        alert('Ocorreu um erro ao gerar a imagem do catálogo.');
        if (btn) btn.innerHTML = originalBtnText;
    });
}