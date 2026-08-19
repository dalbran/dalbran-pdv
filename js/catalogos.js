/** Catálogos locais e gerador de seleções compartilháveis. v0.0.3-beta */
window.catalogSourceProducts = {};
window.customCatalogSelection = [];

document.addEventListener('DOMContentLoaded', () => {
  loadCatalogSources().finally(renderCatalogosView);
});

async function loadCatalogSources() {
  if (window.DalbranCatalogData) {
    Object.entries(window.DalbranCatalogData).forEach(([key, products]) => {
      window.catalogSourceProducts[key] = (products || []).map(product => ({ ...product, source: key }));
    });
    return;
  }
  const sources = [{ key: '2L', script: 'catalogos/2L/script.js' }, { key: '5L', script: 'catalogos/5L/script.js' }];
  await Promise.all(sources.map(async source => {
    try {
      const response = await fetch(source.script);
      const text = await response.text();
      const match = text.match(/const\s+products\s*=\s*(\[[\s\S]*?\n\]);\s*\n\s*let\s+currentCategory/);
      if (!match) throw new Error('Lista de produtos não encontrada');
      const products = Function(`return (${match[1]});`)();
      window.catalogSourceProducts[source.key] = products.map(product => ({ ...product, source: source.key }));
    } catch (error) { console.error(`Erro ao carregar catálogo ${source.key}:`, error); window.catalogSourceProducts[source.key] = []; }
  }));
}

/**
 * Abre o catálogo em um visualizador modal tela cheia com barra superior
 * e botões de voltar, WhatsApp, copiar, compartilhar e abrir no navegador externo.
 */
function openCatalogModalViewer(size, title) {
  closeCatalogModalViewer();

  const publicUrl = `https://dalbran.github.io/web/catalogos/${size}/index.html`;
  const catalogTitle = title || (`Catálogo ${size}`);

  const viewer = document.createElement('div');
  viewer.id = 'catalog-modal-viewer';
  viewer.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:99999;background:#ffffff;display:flex;flex-direction:column;';

  viewer.innerHTML = `
    <style>
      @keyframes catalogSpinAnim {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
    <header style="height:54px;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:space-between;padding:0 10px;box-shadow:0 2px 8px rgba(0,0,0,0.3);flex-shrink:0;z-index:20;gap:8px;">
      <button type="button" id="btn-close-catalog-viewer" style="background:rgba(255,255,255,0.15);border:none;color:#ffffff;padding:7px 12px;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <i class="ph ph-arrow-left"></i> <span>Voltar</span>
      </button>
      <span style="font-weight:700;font-size:0.9rem;letter-spacing:0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;text-align:center;">${escapeCatalogHtml(catalogTitle)}</span>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <button type="button" id="btn-viewer-whatsapp" title="Enviar no WhatsApp" style="background:#22c55e;border:none;color:#ffffff;width:34px;height:34px;border-radius:50%;font-size:1.1rem;cursor:pointer;display:grid;place-items:center;box-shadow:0 2px 6px rgba(34,197,94,0.35);">
          <i class="ph-fill ph-whatsapp-logo"></i>
        </button>
        <button type="button" id="btn-viewer-copy" title="Copiar link" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:#ffffff;width:34px;height:34px;border-radius:50%;font-size:1rem;cursor:pointer;display:grid;place-items:center;">
          <i class="ph ph-copy"></i>
        </button>
        <button type="button" id="btn-viewer-share" title="Compartilhar nativo" style="background:#0284c7;border:none;color:#ffffff;width:34px;height:34px;border-radius:50%;font-size:1rem;cursor:pointer;display:grid;place-items:center;box-shadow:0 2px 6px rgba(2,132,199,0.35);">
          <i class="ph ph-share-network"></i>
        </button>
        <button type="button" id="btn-viewer-external" title="Abrir no navegador" style="background:rgba(255,255,255,0.15);border:none;color:#ffffff;width:34px;height:34px;border-radius:50%;font-size:1rem;cursor:pointer;display:grid;place-items:center;">
          <i class="ph ph-arrow-square-out"></i>
        </button>
      </div>
    </header>
    <div style="position:relative;flex:1;width:100%;height:calc(100vh - 54px);overflow:hidden;background:#f8fafc;">
      <div id="catalog-viewer-loader" style="position:absolute;top:0;left:0;right:0;bottom:0;background:#ffffff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:10;transition:opacity 0.3s ease;">
        <div style="width:42px;height:42px;border:3px solid #e2e8f0;border-top-color:#0284c7;border-radius:50%;animation:catalogSpinAnim 0.8s linear infinite;"></div>
        <span style="font-weight:600;font-size:0.92rem;color:#334155;">Carregando catálogo...</span>
      </div>
      <iframe id="catalog-viewer-iframe" src="${publicUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#ffffff;" allow="clipboard-write"></iframe>
    </div>
  `;

  document.body.appendChild(viewer);

  const iframe = document.getElementById('catalog-viewer-iframe');
  const loader = document.getElementById('catalog-viewer-loader');
  if (iframe) {
    iframe.onload = () => {
      if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 300);
      }
    };
    // Fallback caso onload demore
    setTimeout(() => { if (loader) loader.remove(); }, 3500);
  }

  document.getElementById('btn-close-catalog-viewer').onclick = () => closeCatalogModalViewer();
  document.getElementById('btn-viewer-whatsapp').onclick = () => shareCatalogOnWhatsApp(`catalogos/${size}/index.html`, catalogTitle);
  document.getElementById('btn-viewer-copy').onclick = () => copyCatalogLink(`catalogos/${size}/index.html`);
  document.getElementById('btn-viewer-share').onclick = () => shareCatalogNative(`catalogos/${size}/index.html`, catalogTitle);
  document.getElementById('btn-viewer-external').onclick = () => window.open(publicUrl, '_blank');
}

function closeCatalogModalViewer() {
  const viewer = document.getElementById('catalog-modal-viewer');
  if (viewer) viewer.remove();
}
window.closeCatalogModalViewer = closeCatalogModalViewer;

function renderCatalogosView() {
  const container = document.getElementById('view-catalogos');
  if (!container) return;

  container.innerHTML = `
    <div class="view-header catalog-header"><div><h2>Catálogos visuais</h2><p>Abra os catálogos completos ou monte uma seleção para compartilhar.</p></div></div>
    <div class="catalog-shortcuts">
      ${catalogShortcut('2L', 'Catálogo 2 litros', 'Linha de produtos 2 L e embalagens menores.')}
      ${catalogShortcut('5L', 'Catálogo 5 litros', 'Linha institucional e galões de 5 L.')}
    </div>
    <section class="custom-catalog-builder">
      <div class="dashboard-section-header">
        <div><h3>Catálogo personalizado</h3><span>Escolha os itens abaixo e gere o link visual para o cliente.</span></div>
        <span id="custom-catalog-count">0 selecionados</span>
      </div>
      <div class="catalog-builder-toolbar">
        <select id="custom-catalog-source"><option value="all">2 L e 5 L</option><option value="2L">Somente 2 L</option><option value="5L">Somente 5 L</option></select>
        <input id="custom-catalog-search" type="search" placeholder="Buscar produto">
      </div>
      <div id="custom-catalog-products" class="custom-catalog-products"></div>
      <div class="custom-catalog-actions">
        <button type="button" class="btn btn-outline" id="clear-custom-catalog">Limpar seleção</button>
        <button type="button" class="btn btn-primary" id="generate-custom-catalog">Gerar link do catálogo</button>
      </div>
      <div id="custom-catalog-link" class="custom-catalog-link hidden"></div>
      <p class="catalog-share-note">O link funciona para qualquer pessoa quando o sistema estiver hospedado em uma URL pública.</p>
    </section>`;

  const catalogTitles = { '2L': 'Catálogo 2 Litros', '5L': 'Catálogo 5 Litros' };
  ['2L', '5L'].forEach(size => {
    const btnOpen = document.getElementById(`open-catalog-${size}`);
    if (btnOpen) btnOpen.onclick = (e) => { e.preventDefault(); openCatalogModalViewer(size, catalogTitles[size]); };
    
    const btnWa = document.getElementById(`wa-catalog-${size}`);
    if (btnWa) btnWa.onclick = () => shareCatalogOnWhatsApp(`catalogos/${size}/index.html`, catalogTitles[size]);

    const btnCopy = document.getElementById(`copy-catalog-${size}`);
    if (btnCopy) btnCopy.onclick = () => copyCatalogLink(`catalogos/${size}/index.html`);

    const btnShare = document.getElementById(`share-catalog-${size}`);
    if (btnShare) btnShare.onclick = () => shareCatalogNative(`catalogos/${size}/index.html`, catalogTitles[size]);
  });
  document.getElementById('custom-catalog-search').oninput = renderCustomCatalogProducts;
  document.getElementById('custom-catalog-source').onchange = renderCustomCatalogProducts;
  document.getElementById('clear-custom-catalog').onclick = () => {
    window.customCatalogSelection = [];
    renderCustomCatalogProducts();
    document.getElementById('custom-catalog-link').classList.add('hidden');
  };
  document.getElementById('generate-custom-catalog').onclick = generateCustomCatalogLink;
  renderCustomCatalogProducts();
}

function catalogShortcut(size, title, description) {
  return `<article class="catalog-card">
    <div class="catalog-card-icon">${size}</div>
    <div><h3>${title}</h3><p>${description}</p></div>
    <div class="catalog-card-actions">
      <button type="button" class="btn btn-primary" id="open-catalog-${size}" style="font-weight:700;border-radius:10px;">
        <i class="ph ph-book-open"></i> Abrir catálogo
      </button>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:2px;">
        <button type="button" id="wa-catalog-${size}" title="Enviar no WhatsApp" style="width:38px;height:38px;border-radius:50%;background:#22c55e;color:#ffffff;border:none;cursor:pointer;display:grid;place-items:center;font-size:1.2rem;box-shadow:0 2px 6px rgba(34,197,94,0.35);">
          <i class="ph-fill ph-whatsapp-logo"></i>
        </button>
        <button type="button" id="copy-catalog-${size}" title="Copiar link" style="width:38px;height:38px;border-radius:50%;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;cursor:pointer;display:grid;place-items:center;font-size:1.1rem;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
          <i class="ph ph-copy"></i>
        </button>
        <button type="button" id="share-catalog-${size}" title="Compartilhar" style="width:38px;height:38px;border-radius:50%;background:#0284c7;color:#ffffff;border:none;cursor:pointer;display:grid;place-items:center;font-size:1.1rem;box-shadow:0 2px 6px rgba(2,132,199,0.35);">
          <i class="ph ph-share-network"></i>
        </button>
      </div>
    </div>
  </article>`;
}

function getCatalogItems() { return Object.values(window.catalogSourceProducts).flat(); }

function renderCustomCatalogProducts() {
  const container = document.getElementById('custom-catalog-products');
  if (!container) return;
  const source = document.getElementById('custom-catalog-source')?.value || 'all';
  const search = catalogSearchText(document.getElementById('custom-catalog-search')?.value || '');
  const products = getCatalogItems().filter(product =>
    (source === 'all' || product.source === source) &&
    (!search || catalogSearchText(`${product.title} ${product.categoryName} ${product.volume} ${(product.fragrances || []).join(' ')}`).includes(search))
  );
  container.innerHTML = products.length
    ? products.map(product => {
        const key = `${product.source}:${product.id}`;
        const selected = window.customCatalogSelection.includes(key);
        return `<button type="button" class="custom-catalog-product ${selected ? 'selected' : ''}" onclick="toggleCustomCatalogProduct('${product.source}:${product.id}')"><img src="catalogos/${product.source}/${product.image}" alt=""><span><strong>${escapeCatalogHtml(product.title)}</strong><small>${product.source} · ${escapeCatalogHtml(product.volume)}</small></span><b>${selected ? '✓' : '+'}</b></button>`;
      }).join('')
    : '<p class="empty-state">Nenhum produto encontrado.</p>';
  const countEl = document.getElementById('custom-catalog-count');
  if (countEl) countEl.textContent = `${window.customCatalogSelection.length} selecionado(s)`;
}

function catalogSearchText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

window.toggleCustomCatalogProduct = key => {
  const selected = window.customCatalogSelection;
  const index = selected.indexOf(key);
  if (index >= 0) selected.splice(index, 1); else selected.push(key);
  renderCustomCatalogProducts();
};

const PUBLIC_CATALOG_BASE = 'https://dalbran.github.io/web/';

function getPublicCatalogUrl(relativeUrl) {
  const clean = String(relativeUrl || '').replace(/^\.?\/?/, '');
  return new URL(clean, PUBLIC_CATALOG_BASE).href;
}

async function triggerNativeShare({ title, text, url, dialogTitle }) {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
      await window.Capacitor.Plugins.Share.share({
        title: title || 'Catálogo Dalbran',
        text: text || '',
        url: url || '',
        dialogTitle: dialogTitle || 'Compartilhar'
      });
      return true;
    }
  } catch (e) {
    console.warn('Capacitor Share error:', e);
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: title || 'Catálogo Dalbran',
        text: text || '',
        url: url || ''
      });
      return true;
    } catch (e) {
      console.warn('navigator.share error/cancelled:', e);
    }
  }

  if (url) {
    copyCatalogLinkToClipboard(url);
  }
  return false;
}
window.triggerNativeShare = triggerNativeShare;

// Recebe imagens geradas dentro do iframe de catálogos e abre o
// compartilhamento nativo do Android (APK).
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'catalog-share-image') return;
  handleCatalogShareImage(msg.dataUrl, msg.fileName).finally(() => {
    try { e.source.postMessage({ type: 'catalog-share-ack' }, '*'); } catch (err) { /* ignore */ }
  });
});

async function handleCatalogShareImage(dataUrl, fileName) {
  const Filesystem = window.Capacitor?.Plugins?.Filesystem;
  const Share = window.Capacitor?.Plugins?.Share;
  if (!Filesystem || !Share) return;
  try {
    const base64 = String(dataUrl || '').split(',')[1] || '';
    if (!base64) return;
    const res = await Filesystem.writeFile({
      path: fileName || 'catalogo-dalbran.png',
      data: base64,
      directory: 'CACHE',
      recursive: true
    });
    await Share.share({
      title: String(fileName || 'catalogo').replace('.png', ''),
      dialogTitle: 'Compartilhar imagem',
      files: [res.uri]
    });
  } catch (err) {
    if (!/cancel/i.test(String(err.message || err))) {
      console.warn('Falha ao compartilhar imagem do catálogo:', err);
    }
  }
}

function generateCustomCatalogLink() {
  const selectedKeys = window.customCatalogSelection;
  if (!selectedKeys.length) { showToast('Selecione ao menos um produto.', 'error'); return; }

  const grouped = {};
  selectedKeys.forEach(key => {
    const [source, id] = key.split(':');
    if (!grouped[source]) grouped[source] = [];
    grouped[source].push(id);
  });

  const compactHash = 'p=' + Object.entries(grouped).map(([src, ids]) => `${src}:${ids.join(',')}`).join(';');
  const url = getPublicCatalogUrl(`catalogos/personalizado.html#${compactHash}`);

  const output = document.getElementById('custom-catalog-link');
  output.classList.remove('hidden');
  output.innerHTML = `
    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;margin-top:10px;">
      <label style="font-size:0.82rem;font-weight:700;color:#334155;">Link do catálogo gerado:</label>
      <input readonly value="${url}" id="custom-catalog-url-input" style="width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.85rem;background:#ffffff;color:#0f172a;box-sizing:border-box;">
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:4px 0;">
        <button type="button" id="wa-custom-link" title="Enviar no WhatsApp" style="width:42px;height:42px;border-radius:50%;background:#22c55e;color:#ffffff;border:none;cursor:pointer;display:grid;place-items:center;font-size:1.3rem;box-shadow:0 2px 8px rgba(34,197,94,0.4);">
          <i class="ph-fill ph-whatsapp-logo"></i>
        </button>
        <button type="button" id="copy-custom-link" title="Copiar link" style="width:42px;height:42px;border-radius:50%;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;cursor:pointer;display:grid;place-items:center;font-size:1.15rem;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <i class="ph ph-copy"></i>
        </button>
        <button type="button" id="share-custom-link" title="Compartilhar nativo (Android)" style="width:42px;height:42px;border-radius:50%;background:#0284c7;color:#ffffff;border:none;cursor:pointer;display:grid;place-items:center;font-size:1.15rem;box-shadow:0 2px 8px rgba(2,132,199,0.4);">
          <i class="ph ph-share-network"></i>
        </button>
        <button type="button" id="copy-short-custom-link" title="Encurtar link" style="height:38px;padding:0 12px;border-radius:20px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:700;">
          <span>⚡ Encurtar</span>
        </button>
      </div>
    </div>`;

  document.getElementById('wa-custom-link').onclick = () => {
    const val = document.getElementById('custom-catalog-url-input').value;
    const msg = encodeURIComponent(`Olá! Veja o catálogo personalizado que selecionei para você:\n${val}`);
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  document.getElementById('copy-custom-link').onclick = () => {
    const val = document.getElementById('custom-catalog-url-input').value;
    copyCatalogLinkToClipboard(val);
  };

  document.getElementById('copy-short-custom-link').onclick = async () => {
    const btn = document.getElementById('copy-short-custom-link');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>⏳...</span>';
    btn.disabled = true;
    try {
      const shortUrl = await getShortenedUrl(url);
      await navigator.clipboard.writeText(shortUrl);
      document.getElementById('custom-catalog-url-input').value = shortUrl;
      showToast('Link curto copiado!', 'success');
    } catch (err) {
      copyCatalogLinkToClipboard(url);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  };

  document.getElementById('share-custom-link').onclick = () => {
    const val = document.getElementById('custom-catalog-url-input').value;
    triggerNativeShare({
      title: 'Catálogo Personalizado Dalbran',
      text: `Confira o catálogo personalizado da Dalbran Distribuidora: ${val}`,
      url: val,
      dialogTitle: 'Compartilhar catálogo personalizado'
    });
  };
}

async function getShortenedUrl(longUrl) {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
    if (res.ok) {
      const shortUrl = await res.text();
      if (shortUrl && shortUrl.startsWith('http')) return shortUrl.trim();
    }
  } catch (e) { console.warn('TinyURL error:', e); }
  try {
    const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.shorturl) return data.shorturl;
    }
  } catch (e) { console.warn('is.gd error:', e); }
  return longUrl;
}

function shareCatalogOnWhatsApp(relativeUrl, title) {
  const url = getPublicCatalogUrl(relativeUrl);
  const message = encodeURIComponent(`Olá! Confira o ${title} da Dalbran Distribuidora:\n${url}`);
  window.open(`https://api.whatsapp.com/send?text=${message}`, '_blank');
}

function copyCatalogLink(relativeUrl) {
  const url = getPublicCatalogUrl(relativeUrl);
  copyCatalogLinkToClipboard(url);
}

function shareCatalogNative(relativeUrl, title) {
  const url = getPublicCatalogUrl(relativeUrl);
  const shareText = `Confira o ${title} da Dalbran Distribuidora: ${url}`;
  triggerNativeShare({
    title: title,
    text: shareText,
    url: url,
    dialogTitle: `Compartilhar ${title}`
  });
}

function shareCatalogUrl(relativeUrl, title) {
  const url = getPublicCatalogUrl(relativeUrl);
  const shareText = `Confira o ${title} da Dalbran Distribuidora: ${url}`;
  
  if (navigator.share) {
    navigator.share({
      title: title,
      text: shareText,
      url: url
    }).catch(() => {
      // Se não completar ou cancelar, não gera erro
    });
  } else {
    copyCatalogLinkToClipboard(url);
  }
}

function copyCatalogLinkToClipboard(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (typeof showToast === 'function') {
        showToast('Link do catálogo copiado com sucesso!', 'success');
      } else {
        alert('Link do catálogo copiado:\n' + url);
      }
    }).catch(() => {
      fallbackCopyPrompt(url);
    });
  } else {
    fallbackCopyPrompt(url);
  }
}

function fallbackCopyPrompt(url) {
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (typeof showToast === 'function') {
      showToast('Link do catálogo copiado com sucesso!', 'success');
    }
  } catch(e) {
    prompt('Copie o link do catálogo abaixo:', url);
  }
  document.body.removeChild(ta);
}

function escapeCatalogHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[char]);
}
