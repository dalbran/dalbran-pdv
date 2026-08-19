/**
 * Módulo de Vinculação Produtos ↔ Catálogo Offline
 *
 * Sistema de código único (ex.: CL2, CL5, AM2, AM5, AR60) que liga os
 * produtos do banco de dados (Firestore) ao catálogo visual offline
 * (catalogos/catalog-data.js e pastas 2L/5L).
 *
 * Estrutura de vínculo:
 *  - Cada variação de produto ganha um campo `codigo` (ex.: "CL2").
 *  - A tabela de abreviações abaixo define o prefixo por palavra-chave do nome.
 *  - O código é salvo junto ao produto no Firestore e espelhado em cache local.
 *  - `resolveCatalogLink(code)` devolve o item correspondente do catálogo visual.
 *
 * Nesta fase NÃO são gerados preços: apenas a estrutura de código/vínculo.
 */

window.catalogLinkAbbreviations = [
  { keywords: ['cloro', 'hipoclorito'], code: 'CL' },
  { keywords: ['desinfetante concentrado'], code: 'DC' },
  { keywords: ['desinfetante'], code: 'DE' },
  { keywords: ['detergente'], code: 'DT' },
  { keywords: ['amaciante'], code: 'AM' },
  { keywords: ['aromatizante'], code: 'AR' },
  { keywords: ['sabonete'], code: 'SB' },
  { keywords: ['sabao de roupas', 'sabao em barra', 'sabao de coco', 'sabao', 'sabão'], code: 'SR' },
  { keywords: ['multlimp', 'multiuso', 'cif multiuso', 'limpeza multiuso', 'multilimp'], code: 'MU' },
  { keywords: ['desengraxante'], code: 'DX' },
  { keywords: ['shampoo'], code: 'SH' },
  { keywords: ['abrilhantador'], code: 'AB' },
  { keywords: ['cera'], code: 'CE' },
  { keywords: ['papel higienico', 'papel higiênico'], code: 'PH' },
  { keywords: ['pregador'], code: 'PG' },
  { keywords: ['esponja'], code: 'ES' },
  { keywords: ['varal'], code: 'VR' },
  { keywords: ['escova'], code: 'EC' },
  { keywords: ['cola'], code: 'CO' },
  { keywords: ['querosene'], code: 'QK' },
  { keywords: ['sampin'], code: 'SA' },
  { keywords: ['faisca', 'faísca'], code: 'FS' }
];

// Cache local (espelho) dos vínculos produto → código
const CATALOG_LINK_STORAGE_KEY = 'dalbran-catalog-links-v1';

function loadCatalogLinkCache() {
  try {
    const raw = localStorage.getItem(CATALOG_LINK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Falha ao ler cache de vínculos de catálogo:', e);
    return {};
  }
}

let catalogLinkCache = loadCatalogLinkCache();

function persistCatalogLinkCache() {
  try {
    localStorage.setItem(CATALOG_LINK_STORAGE_KEY, JSON.stringify(catalogLinkCache));
  } catch (e) {
    console.warn('Falha ao salvar cache de vínculos de catálogo:', e);
  }
}

// Normaliza texto para comparação de palavras-chave
function normalizeLinkText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Extrai o valor numérico de um volume (ex.: "2 Litros" → 2, "60ml" → 60)
function extractVolumeNumber(volume) {
  const match = String(volume || '').match(/(\d+(?:[.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
}

// Determina o sufixo do código: litros → "2"/"5", mililitros → "60" + "ML",
// unidades sem volume → "ML"
function resolveCodeSuffix(volume) {
  const volStr = String(volume || '').toLowerCase();
  const number = extractVolumeNumber(volume);
  const isLiter = /litro|l\b|gal/.test(volStr);
  if (isLiter) return number !== null ? String(Math.round(number)) : 'ML';
  if (number !== null) {
    // 60ml, 100ml, etc. → "60ML"
    const rounded = String(Math.round(number));
    return `${rounded}ML`;
  }
  return 'ML';
}

// Gera o código sugerido para um produto + variação
function suggestCatalogCode(productName, volume) {
  const name = normalizeLinkText(productName);
  const entry = window.catalogLinkAbbreviations.find(ab => ab.keywords.some(kw => name.includes(normalizeLinkText(kw))));
  const prefix = entry ? entry.code : name.slice(0, 2).toUpperCase();
  return `${prefix}${resolveCodeSuffix(volume)}`;
}

// Devolve o código atual de uma variação (campo salvo ou sugestão)
window.getVariationCatalogCode = function(product, variation) {
  if (!product) return '';
  const cached = catalogLinkCache[product.id];
  const variationIndex = Array.isArray(product.variacoes) ? product.variacoes.indexOf(variation) : -1;
  if (cached && variationIndex >= 0 && cached[variationIndex]) {
    return cached[variationIndex];
  }
  if (variation && variation.codigo) return variation.codigo;
  return suggestCatalogCode(product.nome || product.name, variation ? variation.volume : '');
};

// Registra/salva o código de uma variação (cache local + campo na variação)
window.setVariationCatalogCode = function(product, variation, code) {
  const variationIndex = Array.isArray(product.variacoes) ? product.variacoes.indexOf(variation) : -1;
  if (variationIndex < 0) return;
  if (!catalogLinkCache[product.id]) catalogLinkCache[product.id] = {};
  catalogLinkCache[product.id][variationIndex] = String(code || '').toUpperCase();
  persistCatalogLinkCache();
};

// Localiza o item correspondente no catálogo visual offline pelo código
window.resolveCatalogLink = function(code) {
  const normalized = String(code || '').toUpperCase().trim();
  if (!normalized) return null;
  const sourceProducts = window.catalogSourceProducts || {};
  const items = Object.values(sourceProducts).flat();
  return items.find(item => {
    const title = normalizeLinkText(item.title || '');
    const volume = normalizeLinkText(item.volume || '');
    const numeric = String(extractVolumeNumber(item.volume) || '');
    return title.includes(normalized) || volume.includes(normalized) || numeric === normalized;
  }) || null;
};

// Sincroniza os códigos de todos os produtos do cache com o Firestore
// (chamado ao abrir o app / a view de produtos)
window.syncCatalogLinksToDatabase = async function() {
  if (typeof db === 'undefined' || !db || typeof firebase === 'undefined') return;
  const entries = Object.entries(catalogLinkCache);
  for (const [productId, codesByIndex] of entries) {
    const product = (window.productsCache || []).find(p => p.id === productId);
    if (!product || !Array.isArray(product.variacoes)) continue;
    let changed = false;
    const variacoes = product.variacoes.map((v, index) => {
      const code = codesByIndex && codesByIndex[index];
      if (code && v.codigo !== code) {
        changed = true;
        return { ...v, codigo: code };
      }
      return v;
    });
    if (changed) {
      try {
        await db.collection('products').doc(productId).update({ variacoes });
      } catch (e) {
        console.warn(`Falha ao salvar código de ${productId}:`, e);
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.syncCatalogLinksToDatabase === 'function') {
      window.syncCatalogLinksToDatabase();
    }
  }, 3000);
});