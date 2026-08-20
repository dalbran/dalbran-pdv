/**
 * Utilitários Globais: Formatação, Cálculos Monetários e Validações
 */

// Formata número para moeda brasileira (R$ 0,00)
function formatCurrency(value) {
  const num = Number(value);
  const safeNumber = Number.isFinite(num) ? num : 0;
  return safeNumber.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

// Converte texto em formato de moeda ou número para float (ex: "2,90" -> 2.9)
function parseCurrency(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;

  let cleaned = String(value).trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  // Formato brasileiro: 1.234,56. Formato de campos numéricos: 2.90.
  if (hasComma && hasDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }

  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

// Formata Data/Hora local (DD/MM/AAAA HH:MM)
function formatDateTime(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Adiciona dias a uma data
function addDaysToDate(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + parseInt(days || 0, 10));
  return result;
}

// Cálculo da Taxa de Cartão
// Método 1 ('add'): subtotal + (subtotal * taxa%)
// Método 2 ('liquid'): subtotal / (1 - (taxa% / 100))  [Valor líquido exato a receber]
function calculateCardFee(subtotal, feePercentage, calculationMethod = 'add') {
  const amount = Number(subtotal) || 0;
  const rate = Number(feePercentage) || 0;

  if (rate <= 0 || amount <= 0) {
    return { feeAmount: 0, totalAmount: amount };
  }

  if (calculationMethod === 'liquid') {
    const totalAmount = amount / (1 - (rate / 100));
    const feeAmount = totalAmount - amount;
    return {
      feeAmount: Number(feeAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2))
    };
  } else {
    // Método padrão: Acrescentar percentual
    const feeAmount = amount * (rate / 100);
    const totalAmount = amount + feeAmount;
    return {
      feeAmount: Number(feeAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2))
    };
  }
}

// Validação de Estrutura do JSON de Produtos para Importação
function validateProductJSON(data) {
  if (!Array.isArray(data)) {
    return { valid: false, error: 'O arquivo JSON deve conter uma lista (array) de produtos.' };
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item.nome || typeof item.nome !== 'string') {
      return { valid: false, error: `Item na posição ${i + 1} não possui 'nome' válido.` };
    }
    if (!Array.isArray(item.variacoes)) {
      return { valid: false, error: `Produto "${item.nome}" deve conter um array de 'variacoes'.` };
    }
  }

  return { valid: true, error: null };
}
