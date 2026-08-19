/**
 * Módulo de Integração e Formatação para WhatsApp
 */

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

  if (typeof saveOrcamento === 'function' && !await saveOrcamento()) return;

  const settings = window.getCompanySettings ? window.getCompanySettings() : {};
  if (settings.compartilharWhatsAppAtivo === false) {
    showToast('O compartilhamento por WhatsApp está desativado nas configurações.', 'error');
    return;
  }
  const clienteNome = document.getElementById('orc-cliente-nome').value.trim() || 'Cliente';
  const clienteTelefone = document.getElementById('orc-cliente-telefone').value.replace(/\D/g, '');
  const vendedor = typeof getSelectedVendedor === 'function' ? getSelectedVendedor() : null;
  const totals = calculateTotals();

  const dataHoje = formatDateTime(new Date());
  const dataValidade = formatDateTime(addDaysToDate(new Date(), settings.prazoValidadeDias || 1));

  // Constrói Mensagem Formatada
  let text = `*${settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA'}*\n`;
  const isSale = typeof documentMode !== 'undefined' && documentMode === 'pdv';
  text += `*${isSale ? 'VENDA' : 'ORÇAMENTO'} Nº ${typeof getQuoteNumber === 'function' ? getQuoteNumber(isSale ? 'VEN' : 'ORC') : 'RASCUNHO'}*\n`;
  text += `${dataHoje.replace(' ', ' - ')}\n\n`;
  text += `👤 *Cliente:* ${clienteNome}\n`;
  text += `🧑‍💼 *Vendedor:* ${vendedor?.nome || settings.nomeFantasia || 'Não informado'}\n`;
  text += `📅 *Data:* ${dataHoje}\n`;
  text += `⏳ *Validade:* ${dataValidade}\n`;
  text += `-----------------------------------\n`;
  text += `📦 *ITENS ${isSale ? 'DA VENDA' : 'DO ORÇAMENTO'}:*\n\n`;

  cart.forEach((item, index) => {
    text += `${index + 1}. ${item.quantidade}x *${item.nome}* (${item.volume}) — *${formatCurrency(item.subtotal)}*\n`;
    if (item.fragrancia && item.fragrancia !== 'Padrão') text += `   Fragrância: ${item.fragrancia}\n`;
  });

  text += `-----------------------------------\n`;
  text += `💵 Subtotal: ${formatCurrency(totals.subtotal)}\n`;
  text += `🏷️ Desconto: -${formatCurrency(totals.desconto)}\n`;
  text += `💳 Taxa: +${formatCurrency(totals.valorTaxa)}\n`;
  text += `💰 *TOTAL GERAL: ${formatCurrency(totals.totalGeral)}*\n`;
  text += `💳 Forma de Pagamento: ${totals.formaPag.toUpperCase()}\n\n`;

  if (settings.avisoEstoque) {
    text += `⚠️ _${settings.avisoEstoque}_\n\n`;
  }

  text += `${isSale ? resolveMessageFor('Recibo') : resolveMessageFor('Orcamento')}`;

  const encodedText = encodeURIComponent(text);

  // Se houver número do cliente, envia direto. Senão, abre compartilhamento geral.
  let url = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (clienteTelefone && clienteTelefone.length >= 10) {
    const fullPhone = clienteTelefone.startsWith('55') ? clienteTelefone : `55${clienteTelefone}`;
    url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
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

  let text = `*${settings.nomeFantasia || 'DALBRAN DISTRIBUIDORA'}*\n`;
  text += `*${isSale ? 'VENDA' : 'ORÇAMENTO'} Nº ${saved.numero || saved.id || 'RASCUNHO'}*\n`;
  text += `${saved.createdAt?.toDate ? formatDateTime(saved.createdAt.toDate()).replace(' ', ' - ') : ''}\n\n`;
  text += `👤 *Cliente:* ${saved.cliente?.nome || 'Consumidor Final'}\n`;
  text += `🧑‍💼 *Vendedor:* ${saved.vendedor?.nome || settings.nomeFantasia || 'Não informado'}\n`;
  text += `-----------------------------------\n`;
  text += `📦 *ITENS ${isSale ? 'DA VENDA' : 'DO ORÇAMENTO'}:*\n\n`;

  saved.itens.forEach((item, index) => {
    text += `${index + 1}. ${item.quantidade}x *${item.nome}* (${item.volume}) — *${formatCurrency(item.subtotal || (item.precoUnitario * item.quantidade))}*\n`;
    if (item.fragrancia && item.fragrancia !== 'Padrão') text += `   Fragrância: ${item.fragrancia}\n`;
  });

  text += `-----------------------------------\n`;
  text += `💵 Subtotal: ${formatCurrency(totals.subtotal || 0)}\n`;
  text += `🏷️ Desconto: -${formatCurrency(totals.desconto || 0)}\n`;
  text += `💳 Taxa: +${formatCurrency(totals.valorTaxa || 0)}\n`;
  text += `💰 *TOTAL GERAL: ${formatCurrency(totals.totalGeral || 0)}*\n`;
  text += `💳 Forma de Pagamento: ${String(totals.formaPag || 'PIX').toUpperCase()}\n\n`;

  if (settings.avisoEstoque) text += `⚠️ _${settings.avisoEstoque}_\n\n`;
  text += `${isSale ? resolveMessageFor('Recibo') : resolveMessageFor('Orcamento')}`;
  return text;
}

// Envia um documento salvo (venda/orçamento) via WhatsApp direto do histórico
window.shareSavedDocumentWhatsApp = function(saved) {
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
  const phone = String(saved.cliente?.whatsapp || saved.cliente?.telefone || '').replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);
  let url = `https://api.whatsapp.com/send?text=${encodedText}`;
  if (phone && phone.length >= 10) {
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Texto copiado para a área de transferência!", "info");
    });
  }
  window.open(url, '_blank');
};

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
      <td style="width:50%;">${escapeProductHtml(i.nome)} (${escapeProductHtml(i.volume || '')})</td>
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
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
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
