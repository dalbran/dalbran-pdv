// BANCO DE DADOS DOS PRODUTOS DA DALBRAN DISTRIBUIDORA LTDA
// Observação: Imagens apontadas diretamente na raiz do projeto
const products = [
    {
        id: 1,
        title: "Desinfetantes Galão 5L",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "Desinfetante de alta performance para uso institucional e comercial. Proporciona higienização e excelente fixação de fragrância.",
        volume: "Galão de 5 Litros",
        image: "Desinfetantes5L.jpg",
        fragrances: ["Pinho Vert", "Floral", "Talco", "Violeta", "Jasmin", "Eucalipto", "Violece", "Zix", "Lavanda"]
    },
    {
        id: 2,
        title: "Desinfetante Concentrado Dezix 5L",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "Fórmula concentrada para limpezas pesadas e desinfecção profunda de superfícies em geral.",
        volume: "Galão de 5 Litros",
        image: "Desinfetante Concentrado 5L - Dezix.png",
        fragrances: ["Dezix Concentrado"]
    },
    {
        id: 3,
        title: "Amaciante de Roupas 5L",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Deixa as fibras dos tecidos macias, alinhadas e perfumadas por muito mais tempo. Ideal para lavanderias e uso institucional.",
        volume: "Galão de 5 Litros",
        image: "Amaciante de Roupas 5L - Floral- Lavanda - Amacipex.png",
        fragrances: ["Floral", "Lavanda","Amacipex"]
    },
    {
        id: 4,
        title: "Sabão de Roupas Roupex Progress 5L",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Detergente líquido lava-roupas com alto poder de remoção de manchas e sujeiras impregnadas.",
        volume: "Galão de 5 Litros",
        image: "Sabão de Roupas Roupex Progress 5L.png",
        fragrances: ["Aroma Limpeza Profunda"]
    },
    {
        id: 5,
        title: "Detergente Lava-Louças 5L",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Detergente líquido de alto rendimento para lavagem eficiente de louças, talheres e utensílios, removendo gorduras com facilidade.",
        volume: "Galão de 5 Litros",
        image: "detergentes-5L-neutro-coco--maca-limao.jpg",
        fragrances: ["Neutro", "Coco", "Maçã", "Limão"]
    },
    {
        id: 6,
        title: "Cera Sintética & Selador Wax Ex",
        category: "tratamento",
        categoryName: "Tratamento de Pisos",
        desc: "Linha profissional para conservação e brilho de pisos. Protege contra o desgaste e facilita a manutenção diária.",
        volume: "Embalagem Profissional",
        image: "Cera Sintética Wax Ex 50- WAX ex 400 - Selador PS36.png",
        fragrances: ["Wax Ex 50", "Wax Ex 400", "Selador PS36"]
    },
    {
        id: 7,
        title: "Sabonete Líquido Perolado 5L",
        category: "higiene",
        categoryName: "Higiene Pessoal",
        desc: "Sabonete líquido cremoso com fórmula hidratante, de textura aveludada, perfeito para saboneteiras institucionais.",
        volume: "Galão de 5 Litros",
        image: "sabonete líquido Perolado 5L- Erva doce- Flrorence- Violeta.png",
        fragrances: ["Erva Doce", "Florence", "Violeta"]
    },
    {
        id: 8,
        title: "Cloro Ativo 5L",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Potente ação alvejante e desinfetante para pisos, sanitários e remoção de limo em superfícies duras.",
        volume: "Galão de 5 Litros",
        image: "cloro5L.jpg",
        fragrances: ["Cloro Concentrado"]
    },
    {
        id: 9,
        title: "Hipoclorito de Sódio 5L",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Solução desinfetante de uso profissional recomendada para sanitização pesada e controle microbiológico.",
        volume: "Galão de 5 Litros",
        image: "Hipoclorito de Sódio 5L.jpg",
        fragrances: ["Uso Técnico / Sem fragrância"]
    },
    {
        id: 10,
        title: "Limpador Multiuso Multlimp Green 5L",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Limpador versátil para remoção rápida de gorduras e sujeiras em bancadas, plásticos, vidros e azulejos.",
        volume: "Galão de 5 Litros",
        image: "multiuso - multlimp Green 5L.jpg",
        fragrances: ["Fresco / Neutro"]
    },
    {
        id: 11,
        title: "Removedor Faça / Faísca",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Removedor concentrado para ceras velhas, gorduras impregnadas e sujeiras pesadas do dia a dia.",
        volume: "Embalagem Padrão",
        image: "removedor faisca.png",
        fragrances: ["Tradicional", "Perfumado"]
    },
    {
        id: 12,
        title: "Cif Cremoso 250ml",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Sua fórmula exclusiva possui micropartículas que limpam sem riscar, removendo a sujeira mais difícil.",
        volume: "Frasco de 250 ml",
        image: "cif -250ml.jpeg",
        fragrances: ["Original Cremoso"]
    },
    {
        id: 13,
        title: "Sacos de Lixo Reforçados (Pacote c/ 100un)",
        category: "descartaveis",
        categoryName: "Descartáveis & Acessórios",
        desc: "Sacos de lixo de alta resistência e espessura para descarte seguro residencial e comercial.",
        volume: "Pacote com 100 Unidades",
        image: "saco de lixo c100 un- 40L - 60L - 100L.png",
        fragrances: ["Capacidade 40 Litros", "Capacidade 60 Litros", "Capacidade 100 Litros"]
    },
    {
        id: 14,
        title: "Pano de Saco para Limpeza (Pacote c/ 10un)",
        category: "descartaveis",
        categoryName: "Descartáveis & Acessórios",
        desc: "Panos 100% algodão de alta absorção para limpeza geral de pisos, vidros e secagem de superfícies.",
        volume: "Pacote com 10 Unidades",
        image: "pano- de saco 10un.webp",
        fragrances: ["Algodão Alvejado"]
    },
    {
        id: 15,
        title: "Linha Especial Dalbran",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Produtos selecionados de alta qualidade para suprir as demandas diárias de higienização da sua empresa.",
        volume: "Diversos Tamanhos",
        image: "IMG-20260729-WA0009.jpg",
        fragrances: ["Consultar disponibilidade"],
        slideshow: [
            "Desinfetantes5L.jpg", "Desinfetante Concentrado 5L - Dezix.png", "Amaciante de Roupas 5L - Floral- Lavanda - Amacipex.png", "Sabão de Roupas Roupex Progress 5L.png", "detergentes-5L-neutro-coco--maca-limao.jpg", "Cera Sintética Wax Ex 50- WAX ex 400 - Selador PS36.png", "sabonete líquido Perolado 5L- Erva doce- Flrorence- Violeta.png", "cloro5L.jpg", "Hipoclorito de Sódio 5L.jpg", "multiuso - multlimp Green 5L.jpg", "removedor faisca.png", "cif -250ml.jpeg", "saco de lixo c100 un- 40L - 60L - 100L.png", "pano- de saco 10un.webp", "Vassoura.jpg", "rodo.jpg", "escova sanitária.jpg", "IMG-20260729-WA0011.jpg", "ABRILHANTADOR DE PNEUS - RB100 1 LITRO.jpg", "Shampoo AutomotivohS200.jpg", "AROMATIZANTE AMBIENTE - TUTTY FRUTY - VIOLETA - CARRO NOVO.jpg", "DESINFETANTE CONCENTRADO FAZ 5 L - LAVANDA - LAVANDA GLEYDE -MARINHO -MIRRA -KAIAK -VIOLETA - PALMOLIVE -PRIMAVERA -DAMA DA NOITE - GEOVANA BABY -FLORES DO CAMPO - CITRUS - LAVANDA ORIENTE.png", "DESINFETANTE GELATINOSO 1L SAMPIN.jpg", "HIPOCLORITO DE SÓDIO - 500 ML - FAZ 5 LITROS.png", "SjMult - Desengordurante - Desengraxant.jpg"
        ]
    },
    {
        id: 16,
        title: "Vassoura para Piso",
        category: "descartaveis",
        categoryName: "Descart\u00e1veis & Acess\u00f3rios",
        desc: "Vassoura resistente para varri\u00e7\u00e3o de pisos em resid\u00eancias, com\u00e9rcios e \u00e1reas de servi\u00e7o.",
        volume: "Unidade",
        image: "Vassoura.jpg",
        fragrances: ["Uso geral"]
    },
    {
        id: 17,
        title: "Rodo para Limpeza",
        category: "descartaveis",
        categoryName: "Descart\u00e1veis & Acess\u00f3rios",
        desc: "Rodo para remo\u00e7\u00e3o de \u00e1gua e acabamento da limpeza de pisos.",
        volume: "Unidade",
        image: "rodo.jpg",
        fragrances: ["Uso geral"]
    },
    {
        id: 18,
        title: "Escova Sanit\u00e1ria",
        category: "descartaveis",
        categoryName: "Descart\u00e1veis & Acess\u00f3rios",
        desc: "Escova pr\u00e1tica para higieniza\u00e7\u00e3o de vasos sanit\u00e1rios e \u00e1reas de dif\u00edcil alcance.",
        volume: "Unidade",
        image: "escova sanit\u00e1ria.jpg",
        fragrances: ["Cores variadas"]
    },
    {
        id: 19,
        title: "Vassourinha Sanit\u00e1ria",
        category: "descartaveis",
        categoryName: "Descart\u00e1veis & Acess\u00f3rios",
        desc: "Vassourinha sanit\u00e1ria compacta para uma limpeza pr\u00e1tica e detalhada.",
        volume: "Unidade",
        image: "IMG-20260729-WA0011.jpg",
        fragrances: ["Uso sanit\u00e1rio"]
    },
    {
        id: 20,
        title: "Abrilhantador de Pneus RB100",
        category: "automotivo",
        categoryName: "Linha Automotiva",
        desc: "Real\u00e7a o brilho dos pneus e ajuda a manter um acabamento renovado no ve\u00edculo.",
        volume: "Frasco de 1 Litro",
        image: "ABRILHANTADOR DE PNEUS - RB100 1 LITRO.jpg",
        fragrances: ["Neutro"]
    },
    {
        id: 21,
        title: "Shampoo Automotivo HS 200",
        category: "automotivo",
        categoryName: "Linha Automotiva",
        desc: "Shampoo automotivo de alta espuma, com pH balanceado e brilho renovado.",
        volume: "Conte\u00fado de 1 Litro",
        image: "Shampoo AutomotivohS200.jpg",
        fragrances: ["HS 200"]
    },
    {
        id: 22,
        title: "Aromatizante de Ambiente",
        category: "higiene",
        categoryName: "Higiene Pessoal",
        desc: "Aromatizante para ambientes residenciais, comerciais e automotivos.",
        volume: "Frasco spray de 60 ml",
        image: "AROMATIZANTE AMBIENTE - TUTTY FRUTY - VIOLETA - CARRO NOVO.jpg",
        fragrances: ["Tutty Fruty", "Violeta", "Carro Novo"]
    },
    {
        id: 23,
        title: "Desinfetante Concentrado 100 ml",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "F\u00f3rmula concentrada em embalagem compacta que rende at\u00e9 5 litros de produto pronto.",
        volume: "100 ml (rende 5 Litros)",
        image: "DESINFETANTE CONCENTRADO FAZ 5 L - LAVANDA - LAVANDA GLEYDE -MARINHO -MIRRA -KAIAK -VIOLETA - PALMOLIVE -PRIMAVERA -DAMA DA NOITE - GEOVANA BABY -FLORES DO CAMPO - CITRUS - LAVANDA ORIENTE.png",
        fragrances: ["Lavanda", "Gleyde", "Marinho", "Mirra", "Kaiak", "Violeta", "Palmolive", "Primavera", "Dama da Noite", "Geovana Baby", "Flores do Campo", "Citrus", "Lavanda Oriente"]
    },
    {
        id: 24,
        title: "Desinfetante Gelatinoso Sampin",
        category: "desinfetantes",
        categoryName: "Desinfetantes",
        desc: "Desinfetante gelatinoso com maior fixa\u00e7\u00e3o e perfume prolongado nas superf\u00edcies.",
        volume: "Embalagem de 1 Litro",
        image: "DESINFETANTE GELATINOSO 1L SAMPIN.jpg",
        fragrances: ["Original Gel"]
    },
    {
        id: 25,
        title: "Hipoclorito de S\u00f3dio Concentrado",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Solu\u00e7\u00e3o concentrada para higieniza\u00e7\u00e3o e desinfec\u00e7\u00e3o de superf\u00edcies.",
        volume: "500 ml (rende 5 Litros)",
        image: "HIPOCLORITO DE S\u00d3DIO - 500 ML - FAZ 5 LITROS.png",
        fragrances: ["Sem fragr\u00e2ncia"]
    },
    {
        id: 26,
        title: "SJ Mult Desengraxante e Desengordurante",
        category: "limpeza",
        categoryName: "Limpeza Geral",
        desc: "Desengraxante para remo\u00e7\u00e3o de \u00f3leo, graxa e sujeiras pesadas em diversas superf\u00edcies.",
        volume: "500 ml, 2 Litros ou 5 Litros",
        image: "SjMult - Desengordurante - Desengraxant.jpg",
        fragrances: ["Uso t\u00e9cnico"]
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
                    Ver Opções & Detalhes
                </button>
            </div>
        `;
        grid.appendChild(card);

        if (product.slideshow && Array.isArray(product.slideshow) && product.slideshow.length > 1) {
            const image = card.querySelector('.card-image-box img');
            if (image) {
                let slideIndex = 0;
                setInterval(() => {
                    slideIndex = (slideIndex + 1) % product.slideshow.length;
                    image.src = product.slideshow[slideIndex];
                }, 3500);
            }
        }
    });
}

// FILTRAR POR CATEGORIA
function filterCategory(category, evt) {
    currentCategory = category;
    
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

    const fragranceList = document.getElementById('fragranceList');
    if (fragranceList) {
        fragranceList.innerHTML = (product.fragrances || []).map(f => `<span class="fragrance-item"><i class="fa-solid fa-check"></i> ${f}</span>`).join('');
    }

    const modalWa = document.getElementById('modalWhatsappBtn');
    if (modalWa) {
        const message = encodeURIComponent(`Olá! Gostaria de fazer um orçamento para o produto: ${product.title}`);
        modalWa.href = `https://wa.me/5521998852318?text=${message}`;
    }

    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.add('hidden');
}

const prodModal = document.getElementById('productModal');
if (prodModal) {
    prodModal.addEventListener('click', (e) => {
        if (e.target.id === 'productModal') {
            closeModal();
        }
    });
}

const CATALOG_5L_URL = 'https://dalbran.github.io/web/catalogos/5L/index.html';
const CATALOG_5L_TITLE = 'Catálogo Dalbran 5 Litros & Institucional';

// FUNÇÕES DE COMPARTILHAMENTO
function shareOnWhatsApp() {
    const text = encodeURIComponent(`Olá! Confira o Catálogo Oficial Dalbran (Linha 5 Litros & Institucional):\n${CATALOG_5L_URL}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function copyCatalogLink() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(CATALOG_5L_URL).then(() => {
            alert('Link do Catálogo 5L copiado com sucesso:\n' + CATALOG_5L_URL);
        }).catch(() => {
            fallbackPromptCopy(CATALOG_5L_URL);
        });
    } else {
        fallbackPromptCopy(CATALOG_5L_URL);
    }
}

function shareNative() {
    const text = 'Confira o Catálogo Oficial Dalbran (Linha 5 Litros & Institucional): ' + CATALOG_5L_URL;
    if (navigator.share) {
        navigator.share({
            title: CATALOG_5L_TITLE,
            text: text,
            url: CATALOG_5L_URL
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
        shareOrDownloadImage(canvas.toDataURL('image/png'), 'catalogo-dalbran-5L.png');
        if (btn) btn.innerHTML = originalBtnText;
    }).catch(err => {
        console.error('Erro ao gerar imagem:', err);
        alert('Ocorreu um erro ao gerar a imagem do catálogo.');
        if (btn) btn.innerHTML = originalBtnText;
    });
}




