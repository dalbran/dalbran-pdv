/**
 * Módulo de Integração e Formatação para WhatsApp
 */

// Normaliza qualquer número para o padrão brasileiro do WhatsApp:
// apenas dígitos, com código do país 55, DDD de 2 dígitos e o 9º dígito
// inserido automaticamente quando um celular foi cadastrado sem ele.
// Ex.: (11) 99999-8888 -> 5511999998888  |  11 3333-4444 -> 551133334444
window.normalizeWhatsAppPhone = function (raw) {
  if (!raw) return '';
  let d = String(raw).replace(/[^\d]/g, '');      // mantém só dígitos
  if (d.length === 0) return '';
  if (!d.startsWith('55')) d = '55' + d;          // garante código do Brasil
  else d = d.replace(/^55(0+)/, '55');            // remove zeros após o 55 (ex.: 55 0 11...)
  const national = d.slice(2);
  // Celular cadastrado com 10 dígitos (sem o 9º): insere o 9 após o DDD
  if (national.length === 10) {
    const ddd = national.slice(0, 2);
    const sub = national.slice(2);
    // faixas móveis começam em 6-9; 2-5 são fixos (não inserir 9)
    if (/^[6-9]/.test(sub)) d = '55' + ddd + '9' + sub;
  }
  return d;
};

// Resumo de variantes do item (usa os helpers de orcamento.js quando disponíveis,
// com fallback para a fragrância única legada).
function resumoVarianteWhatsApp(item) {
  try {
    if (typeof resumoVariantes === 'function') {
      const r = resumoVariantes(item);
      if (r) return `   ${r}\n`;
    }
  } catch (e) {}
  if (item && item.fragrancia && item.fragrancia !== 'Padrão') return `   Fragrância: ${item.fragrancia}\n`;
  return '';
}

function resumoVarianteHtml(item) {
  try {
    if (typeof fragmentoVarianteImpressao === 'function') {
      return fragmentoVarianteImpressao(item, { maxChars: 42, estilo: 'font-size:10px;' });
    }
  } catch (e) {}
  if (item && item.fragrancia && item.fragrancia !== 'Padrão') return `<br><small style="font-size:10px;">${escapeProductHtml(item.fragrancia)}</small>`;
  return '';
}

// ---------------------------------------------------------------------------
// PADRÃO FIXO DALBRAN (cupom fiscal p/ WhatsApp): monoespaçado integral com
// crases simples, sem emojis, separador ━━, itens numerados, fragrâncias
// discretas em maiúsculas. Nomes/valores nunca são alterados, só o layout.
// ---------------------------------------------------------------------------
const WA_SEP = '━━━━━━━━━━━━━━━━';

function maiusculas(texto) {
  return String(texto == null ? '' : texto).toUpperCase();
}

// ["7 NEUTRO", ...] com quebra em ~32 col sem cortar palavras.
function linhasFragranciasPadrao(item, largura) {
  let vars = [];
  try { if (typeof variantesDoItem === 'function') vars = variantesDoItem(item) || []; } catch (e) {}
  if (!vars.length && item && item.fragrancia && item.fragrancia !== 'Padrão')
    vars = [{ nome: item.fragrancia, qtd: item.quantidade || 0 }];
  const parts = vars
    .filter(v => (Number(v.qtd) || 0) > 0)
    .map(v => `${v.qtd} ${maiusculas(v.nome)}`);
  if (!parts.length) return [];
  const W = largura || 32;
  const linhas = [];
  let cur = '';
  parts.forEach(p => {
    const cand = cur ? cur + ' · ' + p : p;
    if (cur && cand.length > W) { linhas.push(cur); cur = p; }
    else cur = cand;
  });
  if (cur) linhas.push(cur);
  return linhas;
}

function blocoItemPadrao(numero, item) {
  const qtd = Number(item.quantidade) || 0;
  const L = [];
  L.push(`${String(numero).padStart(2, '0')}. ${maiusculas(`${item.nome || 'Item'} ${item.volume || ''}`.trim())}`);
  L.push(`${qtd} un × ${formatCurrency(item.precoUnitario || 0)} = ${formatCurrency(item.subtotal || ((item.precoUnitario || 0) * qtd))}`);
  linhasFragranciasPadrao(item).forEach(l => L.push(l));
  return L;
}

function mensagemPadraoWhatsApp({ tipo, numero, cliente, vendedor, data, validade, itens, totals, empresa }) {
  const L = [];
  L.push(maiusculas(empresa || 'DALBRAN DISTRIBUIDORA'));
  L.push(`${tipo} Nº ${numero}`);
  L.push(WA_SEP);
  L.push(`CLIENTE: ${cliente}`);
  L.push(`VENDEDOR: ${vendedor}`);
  L.push(`DATA: ${data}`);
  L.push(`VALIDADE: ${validade}`);
  L.push(WA_SEP);
  (itens || []).forEach((item, i) => blocoItemPadrao(i + 1, item).forEach(l => L.push(l)));
  L.push(WA_SEP);
  L.push('RESUMO');
  L.push(`Subtotal: ${formatCurrency(totals.subtotal || 0)}`);
  L.push(`Desconto: ${formatCurrency(totals.desconto || 0)}`);
  L.push(`TOTAL: ${formatCurrency(totals.totalGeral || 0)}`);
  L.push(`Pagamento: ${String(totals.formaPag || 'PIX').toUpperCase()}`);
  L.push(WA_SEP);
  L.push('Validade: 24 horas');
  L.push('Sujeito à disponibilidade de estoque.');
  L.push('Agradecemos a preferência!');
  return L.map(l => '`' + l + '`').join('\n');
}

// Resolve a mensagem a usar para um tipo específico (recibo/orçamento/pedido),
// com fallback para a mensagem padrão configurada.
function resolveMessageFor(kind) {
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const specific = settings[`mensagem${kind}`];
  return (specific && specific.trim()) || settings.mensagemPadrao || 'Agradecemos a preferência!';
}

async function sendOrcamentoWhatsApp() {
  if (!cart || cart.length === 0) {
    showToast("Adicione itens para enviar por WhatsApp.", "error");
    return;
  }

  if (typeof saveOrcamento === 'function' && !await saveOrcamento({ silent: true })) return;

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  if (settings.compartilharWhatsAppAtivo === false) {
    showToast('O compartilhamento por WhatsApp está desativado nas configurações.', 'error');
    return;
  }
  const clienteNome = document.getElementById('orc-cliente-nome').value.trim() || 'Cliente';
  const clienteTelefoneRaw = document.getElementById('orc-cliente-whatsapp')?.value.trim()
    || document.getElementById('orc-cliente-telefone')?.value.trim()
    || (getSelectedClient()?.whatsapp || getSelectedClient()?.telefone || '');
  let clienteTelefone = window.normalizeWhatsAppPhone(clienteTelefoneRaw) || clienteTelefoneRaw;
  if (!clienteTelefone || clienteTelefone.length < 10) {
    const typed = await requestWhatsAppNumber(clienteNome);
    if (!typed) return;
    clienteTelefone = typed;
  }
  const vendedor = typeof getSelectedVendedor === 'function' ? getSelectedVendedor() : null;
  const totals = calculateTotals();

  const dataHoje = formatDateTime(new Date());
  const dataValidade = formatDateTime(addDaysToDate(new Date(), settings.prazoValidadeDias || 1)).replace(' ', ' - ');

  // PADRÃO FIXO DALBRAN (cupom fiscal p/ WhatsApp).
  const isSale = typeof documentMode !== 'undefined' && documentMode === 'pdv';
  let text = mensagemPadraoWhatsApp({
    tipo: isSale ? 'VENDA' : 'ORÇAMENTO',
    numero: typeof getQuoteNumber === 'function' ? getQuoteNumber(isSale ? 'VEN' : 'ORC') : 'RASCUNHO',
    cliente: clienteNome,
    vendedor: vendedor?.nome || settings.nomeFantasia || 'Não informado',
    data: dataHoje,
    validade: dataValidade,
    itens: cart,
    totals,
    empresa: settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA'
  });

  const encodedText = encodeURIComponent(text);

  // Se houver número do cliente, envia direto. Senão, abre compartilhamento geral.
  let url = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (clienteTelefone && clienteTelefone.length >= 10) {
    url = `https://api.whatsapp.com/send?phone=${clienteTelefone}&text=${encodedText}`;
  }

  // Copia texto para a área de transferência como backup
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Texto copiado para a área de transferência!", "info");
    });
  }

  window.open(url, '_blank');
}

// Monta o texto formatado de um documento salvo (venda/orçamento) para WhatsApp
function buildSavedDocumentWhatsAppText(saved) {
  if (!saved || !Array.isArray(saved.itens) || saved.itens.length === 0) return '';
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const isSale = saved.tipo === 'venda';
  const totals = saved.financeiro || {};

  // PADRÃO FIXO DALBRAN (cupom fiscal p/ WhatsApp).
  const dataDoc = saved.createdAt?.toDate ? formatDateTime(saved.createdAt.toDate()) : formatDateTime(new Date());
  let validadeDoc = saved.validade || '';
  if (!validadeDoc && saved.createdAt?.toDate && typeof addDaysToDate === 'function') {
    try { validadeDoc = formatDateTime(addDaysToDate(saved.createdAt.toDate(), saved.validadeDias || settings.prazoValidadeDias || 1)).replace(' ', ' - '); } catch (e) {}
  }
  const nomeFantasia = settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA';
  const text = mensagemPadraoWhatsApp({
    tipo: isSale ? 'VENDA' : 'ORÇAMENTO',
    numero: saved.numero || saved.id || 'RASCUNHO',
    cliente: saved.cliente?.nome || 'Consumidor Final',
    vendedor: saved.vendedor?.nome || nomeFantasia,
    data: dataDoc,
    validade: validadeDoc,
    itens: saved.itens,
    totals,
    empresa: nomeFantasia
  });
  return text;
}

// Envia um documento salvo (venda/orçamento) via WhatsApp direto do histórico
window.shareSavedDocumentWhatsApp = async function(saved) {
  const text = buildSavedDocumentWhatsAppText(saved);
  if (!text) {
    showToast('Registro sem itens para compartilhar.', 'error');
    return;
  }
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  if (settings.compartilharWhatsAppAtivo === false) {
    showToast('O compartilhamento por WhatsApp está desativado nas configurações.', 'error');
    return;
  }
  let phone = window.normalizeWhatsAppPhone(saved.cliente?.whatsapp || saved.cliente?.telefone || '');
  if (!phone || phone.length < 10) {
    phone = await requestWhatsAppNumber(saved.cliente?.nome || 'Cliente') || '';
    if (!phone) return;
  }
  const encodedText = encodeURIComponent(text);
  let url = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (phone && phone.length >= 10) {
    url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Texto copiado para a área de transferência!", "info");
    });
  }
  window.open(url, '_blank');
};

// Modal para informar o número do WhatsApp na hora quando o cliente ainda
// não possui telefone cadastrado. Resolve com o número normalizado ou null
// caso o usuário cancele.
function requestWhatsAppNumber(clientName) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'wa-number-overlay';
    overlay.innerHTML = `
      <div class="wa-number-sheet" role="dialog" aria-modal="true" aria-labelledby="wa-number-title">
        <div class="wa-number-header">
          <h3 id="wa-number-title"><i class="ph-fill ph-whatsapp-logo"></i> Enviar no WhatsApp</h3>
          <button type="button" class="wa-number-close" aria-label="Fechar"><i class="ph ph-x"></i></button>
        </div>
        <p class="wa-number-desc">O cliente <strong>${escapeProductHtml(clientName || 'Cliente')}</strong> não possui número cadastrado. Informe o número para enviar agora.</p>
        <div class="wa-number-field">
          <label for="wa-number-input">Número do WhatsApp</label>
          <input type="tel" id="wa-number-input" inputmode="numeric" autocomplete="off" placeholder="(00) 00000-0000">
        </div>
        <div class="wa-number-actions">
          <button type="button" class="btn btn-outline" id="wa-number-cancel">Agora não</button>
          <button type="button" class="btn btn-primary" id="wa-number-confirm"><i class="ph ph-paper-plane-tilt"></i> Enviar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#wa-number-input');
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('.wa-number-close').onclick = () => finish(null);
    overlay.querySelector('#wa-number-cancel').onclick = () => finish(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
    overlay.querySelector('#wa-number-confirm').onclick = () => {
      const digits = String(input.value).replace(/[^\d]/g, '');
      const normalized = window.normalizeWhatsAppPhone ? window.normalizeWhatsAppPhone(digits) : digits;
      if (normalized.length < 10) {
        showToast('Informe um número válido com DDD.', 'error');
        input.focus();
        return;
      }
      finish(normalized);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#wa-number-confirm').click(); });
    input.addEventListener('input', () => {
      const digits = String(input.value).replace(/[^\d]/g, '').slice(0, 11);
      let formatted = '';
      if (digits.length > 0) formatted = '(' + digits.slice(0, 2);
      if (digits.length > 2) formatted += ') ';
      if (digits.length > 6) formatted += digits.slice(2, 7) + '-' + digits.slice(7);
      else if (digits.length > 2) formatted += digits.slice(2);
      input.value = formatted;
    });
    setTimeout(() => { input.focus(); }, 60);
  });
}

// Compartilhamento nativo (Android/iOS) do documento salvo
window.shareSavedDocument = function(saved) {
  if (!saved || !Array.isArray(saved.itens) || saved.itens.length === 0) {
    showToast('Registro sem itens para compartilhar.', 'error');
    return;
  }
  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  const totals = saved.financeiro || {};
  const isSale = saved.tipo === 'venda';
  const dateStr = saved.createdAt?.toDate ? formatDateTime(saved.createdAt.toDate()) : formatDateTime(new Date());
  const paymentStr = String(totals.formaPag || 'PIX').toUpperCase();

  const itemsHtml = (saved.itens || []).map(i => `
    <tr>
      <td style="width:50%;">${escapeProductHtml(i.nome)} (${escapeProductHtml(i.volume || '')})${resumoVarianteHtml(i)}</td>
      <td style="width:15%; text-align:center;">${i.quantidade}</td>
      <td style="width:35%; text-align:right;">${formatCurrency(i.subtotal || (i.precoUnitario * i.quantidade))}</td>
    </tr>
  `).join('');

  const receiptHtml = `
    <div style="font-family:'Courier New',monospace; max-width:340px; background:#fff; padding:16px; color:#000;">
      <div style="text-align:center;">
        <div style="font-weight:700; font-size:15px;">${escapeProductHtml(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA')}</div>
        <div style="font-size:11px;">CNPJ: ${escapeProductHtml(settings.cnpj || '')}</div>
        <div style="border-bottom:2px solid #000; margin:8px 0;"></div>
        <div style="font-weight:700;">COMPROVANTE DE ${isSale ? 'VENDA' : 'ORÇAMENTO'}</div>
        <div>CÓDIGO: ${escapeProductHtml(saved.numero || saved.id || '')}</div>
        <div>DATA: ${dateStr}</div>
      </div>
      <div style="border-bottom:1px dashed #000; margin:8px 0;"></div>
      <div>CLIENTE: ${escapeProductHtml(saved.cliente?.nome || 'Consumidor Final (Balcão)')}</div>
      <div>PAGAMENTO: ${paymentStr}</div>
      <div style="border-bottom:1px dashed #000; margin:8px 0;"></div>
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead><tr><th style="text-align:left;">ITEM</th><th style="text-align:center;">QTD</th><th style="text-align:right;">TOTAL</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="border-bottom:1px dashed #000; margin:8px 0;"></div>
      <div style="display:flex; justify-content:space-between;"><span>SUBTOTAL:</span><span>${formatCurrency(totals.subtotal)}</span></div>
      ${(totals.desconto > 0) ? `<div style="display:flex; justify-content:space-between;"><span>DESCONTO:</span><span>- ${formatCurrency(totals.desconto)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; font-weight:700;"><span>TOTAL:</span><span>${formatCurrency(totals.totalGeral)}</span></div>
      <div style="border-bottom:2px solid #000; margin:8px 0;"></div>
      <div style="text-align:center; font-size:11px;">${escapeProductHtml(settings.mensagemPadrao || 'Obrigado pela preferência! Volte Sempre.')}</div>
    </div>
  `;

  // Converte HTML em PNG via canvas para o compartilhamento nativo
  const linhasCupom = (typeof gerarCupomTermicoTexto === 'function' && typeof docCupomTermico === 'function')
    ? gerarCupomTermicoTexto(docCupomTermico({
        tipo: isSale ? 'venda' : 'orcamento',
        numero: saved.numero || saved.id || '',
        cliente: saved.cliente?.nome || 'Consumidor Final (Balcão)',
        vendedor: saved.vendedor?.nome || '',
        data: dateStr,
        validade: '',
        itens: saved.itens,
        financeiro: totals,
        mensagem: settings.mensagemPadrao || '',
        settings
      }), '80mm').split('\n')
    : null;
  const canvas = document.createElement('canvas');
  const LH = 15;
  const topPad = 24;
  const botPad = 20;
  if (linhasCupom) {
    canvas.width = 360;
    canvas.height = topPad + linhasCupom.length * LH + botPad;
  } else {
    canvas.width = 340;
    canvas.height = 480;
  }
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  if (linhasCupom) {
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    linhasCupom.forEach((linha, i) => ctx.fillText(linha, 12, topPad + i * LH));
  } else {
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA', 170, 30);
  ctx.font = '11px monospace';
  ctx.fillText(`COMPROVANTE DE ${isSale ? 'VENDA' : 'ORÇAMENTO'}`, 170, 48);
  ctx.fillText(`CÓD: ${saved.numero || saved.id || ''}`, 170, 64);
  ctx.textAlign = 'left';
  ctx.fillText(`CLIENTE: ${saved.cliente?.nome || 'Consumidor'}`, 20, 95);
  ctx.fillText(`DATA: ${dateStr}`, 20, 112);
  ctx.fillText(`PAGAMENTO: ${paymentStr}`, 20, 129);
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(20, 144);
  ctx.lineTo(320, 144);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`TOTAL: ${formatCurrency(totals.totalGeral)}`, 20, 172);
  }

  const fileName = `${isSale ? 'Recibo' : 'Orcamento'}_${saved.numero || 'Documento'}.png`;
  const dataUrl = canvas.toDataURL('image/png');

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
      dialogTitle: `Compartilhar ${isSale ? 'recibo' : 'orçamento'}`,
      files: [result.uri]
    })).catch(e => {
      if (e && /cancel/i.test(String(e.message || e))) return;
      console.warn('Falha no compartilhamento nativo, baixando arquivo:', e);
      if (typeof downloadDataUrl === 'function') downloadDataUrl(dataUrl, fileName);
      else {
        const text = buildSavedDocumentWhatsAppText(saved);
        if (text) window.shareSavedDocumentWhatsApp(saved);
      }
    });
    return;
  }
  if (typeof downloadDataUrl === 'function') {
    downloadDataUrl(dataUrl, fileName);
  } else {
    window.shareSavedDocumentWhatsApp(saved);
  }
};
