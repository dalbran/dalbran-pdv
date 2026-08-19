/**
 * Controlador Principal da Aplicação (SPA Router e Utilitários Globais)
 */

let appNavHistory = ['view-dashboard'];

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupConnectionMonitor(handleStatusChange);
  setupPersonalPreferences();
  setupMobileMoreMenu();
  setupAndroidBackButton();
  setupNumericInputsEnforcement();
  window.updateAppStatusBar('view-dashboard');
  
  // Timeout de garantia para dispensar o Splash Screen caso o Firebase demore
  setTimeout(() => {
    window.dismissSplashScreen();
  }, 1800);
});

// Dispensar Splash / Loading Screen
window.dismissSplashScreen = function() {
  const splash = document.getElementById('app-splash-screen');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 450);
  }
  try {
    const SplashScreen = window.Capacitor?.Plugins?.SplashScreen;
    if (SplashScreen) {
      SplashScreen.hide({ fadeOutDuration: 300 });
    }
  } catch (e) {
    console.debug('SplashScreen plugin not available:', e);
  }
};

// Gerenciador Dinâmico da Barra de Status do Android
window.updateAppStatusBar = async function(viewId) {
  const isPdv = viewId === 'view-pdv';
  const isDarkTheme = document.body.classList.contains('theme-dark');

  try {
    const StatusBar = window.Capacitor?.Plugins?.StatusBar;
    if (StatusBar) {
      await StatusBar.setStyle({
        style: isPdv ? 'LIGHT' : (isDarkTheme ? 'DARK' : 'LIGHT')
      });
      await StatusBar.setBackgroundColor({
        color: isPdv ? '#0f172a' : (isDarkTheme ? '#0f172a' : '#ffffff')
      });
    }
  } catch (e) {
    console.debug('StatusBar plugin update:', e);
  }
};

const BASE_FONT_SIZE = 21.5;

function setupPersonalPreferences() {
  const localKey = () => `gemino-preferences-${auth?.currentUser?.uid || 'local'}`;
  
  const apply = preferences => {
    const size = Number(preferences.fontSize) || BASE_FONT_SIZE;
    document.documentElement.style.fontSize = `${size}px`;
    document.documentElement.style.setProperty('--app-font-scale', (size / BASE_FONT_SIZE).toFixed(3));
    document.documentElement.style.setProperty('--ui-font-size', `${size}px`);
    document.body.classList.toggle('theme-dark', preferences.theme === 'dark');
    window.updateAppStatusBar(document.querySelector('.view-content.active')?.id || 'view-dashboard');
    
    // Atualiza label na tela de configurações se estiver aberta
    const sizeLabel = document.getElementById('mobile-settings-font-size');
    if (sizeLabel) {
      sizeLabel.textContent = `${Math.round((size / BASE_FONT_SIZE) * 100)}%`;
    }
  };

  const readLocal = () => {
    try {
      const raw = localStorage.getItem(localKey()) || localStorage.getItem('gemino-preferences-current') || localStorage.getItem('gemino-preferences-local');
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && typeof stored.fontSize === 'number') {
          if (stored.fontSize < BASE_FONT_SIZE) {
            stored.fontSize = BASE_FONT_SIZE;
            localStorage.setItem(localKey(), JSON.stringify(stored));
            localStorage.setItem('gemino-preferences-current', JSON.stringify(stored));
          }
          return stored;
        }
      }
      return { fontSize: BASE_FONT_SIZE, theme: 'light' };
    } catch {
      return { fontSize: BASE_FONT_SIZE, theme: 'light' };
    }
  };

  const save = async (preferences, notify = false) => {
    localStorage.setItem(localKey(), JSON.stringify(preferences));
    localStorage.setItem('gemino-preferences-current', JSON.stringify(preferences));
    apply(preferences);
    if (notify) showToast(`Tamanho do texto: ${Math.round((preferences.fontSize / BASE_FONT_SIZE) * 100)}%`, 'info');

    // Salva na nuvem (Firestore)
    const user = auth?.currentUser;
    if (user && window.db) {
      try {
        await db.collection('user_preferences').doc(user.uid).set({
          fontSize: preferences.fontSize,
          theme: preferences.theme,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.warn('Erro ao salvar preferências na nuvem:', e);
      }
    }
  };

  // Aplica imediatamente de forma síncrona
  apply(readLocal());

  // Escuta autenticação para carregar preferências da nuvem
  if (window.auth) {
    auth.onAuthStateChanged(async user => {
      let preferences = readLocal();
      apply(preferences); // Aplica local de imediato

      if (user && window.db) {
        try {
          const doc = await db.collection('user_preferences').doc(user.uid).get();
          if (doc.exists) {
            const cloudPrefs = doc.data();
            if (cloudPrefs.fontSize || cloudPrefs.theme) {
              let cloudSize = Number(cloudPrefs.fontSize) || preferences.fontSize;
              if (cloudSize < BASE_FONT_SIZE) {
                cloudSize = BASE_FONT_SIZE;
              }
              preferences = {
                fontSize: cloudSize,
                theme: cloudPrefs.theme || preferences.theme
              };
              localStorage.setItem(localKey(), JSON.stringify(preferences));
              localStorage.setItem('gemino-preferences-current', JSON.stringify(preferences));
              apply(preferences);
            }
          } else {
            // Primeiro sync: envia as locais para a nuvem
            await db.collection('user_preferences').doc(user.uid).set({
              fontSize: preferences.fontSize,
              theme: preferences.theme,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        } catch (e) {
          console.warn('Erro ao carregar preferências da nuvem:', e);
        }
      }
    });
  }

  // Vincula botões do DOM (tanto do desktop quanto do mobile settings e do "Mais" menu)
  const bindElements = () => {
    const btnDec = document.getElementById('btn-font-decrease') || document.getElementById('mobile-btn-font-decrease') || document.getElementById('mobile-settings-font-decrease');
    if (btnDec) {
      btnDec.onclick = (e) => {
        e.preventDefault();
        const preferences = readLocal();
        const current = Number(preferences.fontSize) || BASE_FONT_SIZE;
        preferences.fontSize = Math.max(15, Math.round((current - 1.5) * 10) / 10);
        save(preferences, true);
      };
    }

    const btnInc = document.getElementById('btn-font-increase') || document.getElementById('mobile-btn-font-increase') || document.getElementById('mobile-settings-font-increase');
    if (btnInc) {
      btnInc.onclick = (e) => {
        e.preventDefault();
        const preferences = readLocal();
        const current = Number(preferences.fontSize) || BASE_FONT_SIZE;
        preferences.fontSize = Math.min(28, Math.round((current + 1.5) * 10) / 10);
        save(preferences, true);
      };
    }

    const btnTheme = document.getElementById('btn-theme-toggle') || document.getElementById('mobile-settings-theme');
    if (btnTheme) {
      btnTheme.onclick = (e) => {
        e.preventDefault();
        const preferences = readLocal();
        preferences.theme = preferences.theme === 'dark' ? 'light' : 'dark';
        save(preferences);
      };
    }
  };

  bindElements();
  window.addEventListener('viewChanged', bindElements);
}



// Navegação entre Views da SPA
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');

  navButtons.forEach(button => {
    button.addEventListener('click', () => navigateToView(button.getAttribute('data-target'), true));
  });
}

window.navigateToView = function(targetViewId, addToHistory = true) {
  if (targetViewId === 'view-more') {
    openMobileMoreMenu();
    return;
  }

  if (addToHistory) {
    if (appNavHistory[appNavHistory.length - 1] !== targetViewId) {
      appNavHistory.push(targetViewId);
    }
  }

  // Dashboard, menu "Mais" e navegação inferior usam esta mesma rota. Assim,
  // as telas dinâmicas são montadas antes de serem exibidas, independente da origem do clique.
  if (targetViewId === 'view-orcamento' && typeof window.openQuoteView === 'function') {
    window.openQuoteView(documentMode !== 'orcamento');
  }
  if (targetViewId === 'view-pdv' && typeof window.openPdvView === 'function') {
    window.openPdvView(documentMode !== 'pdv');
  }

  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.getAttribute('data-target') === targetViewId));
  document.querySelectorAll('.view-content').forEach(view => view.classList.toggle('active', view.id === targetViewId));

  // Custom mobile nav highlight logic for hidden views
  const moreBtn = document.getElementById('nav-item-more');
  if (moreBtn) {
    const hiddenViews = ['view-pdv', 'view-catalogos', 'view-configuracoes'];
    if (hiddenViews.includes(targetViewId)) {
      moreBtn.classList.add('active');
    } else {
      moreBtn.classList.remove('active');
    }
  }

  // Atualiza dados da view de Balanço Financeiro ao navegar para ela
  if (targetViewId === 'view-financeiro') {
    if (typeof window.updateFinanceiro === 'function') window.updateFinanceiro();
  }

  // Atualiza a Barra de Status do Android
  window.updateAppStatusBar(targetViewId);
};

// Tratamento do Botão Voltar Físico / Gestual do Android
function setupAndroidBackButton() {
  try {
    const App = window.Capacitor?.Plugins?.App;
    if (!App) return;

    App.addListener('backButton', ({ canGoBack }) => {
      // 1. Modal de quantidade rápida do PDV
      const qtySheet = document.getElementById('pdv-quick-quantity-modal');
      if (qtySheet && !qtySheet.classList.contains('hidden')) {
        if (typeof window.closePdvQuickQuantityModal === 'function') {
          window.closePdvQuickQuantityModal();
          return;
        }
        qtySheet.classList.add('hidden');
        qtySheet.classList.remove('open');
        return;
      }

      // 2. Menu "Mais" aberto
      const moreMenu = document.getElementById('mobile-more-menu');
      if (moreMenu && moreMenu.classList.contains('open')) {
        closeMobileMoreMenu();
        return;
      }

      // 3. Modal de produto aberto — fecha e fica em view-produtos
      const modalProduct = document.getElementById('modal-product');
      if (modalProduct && !modalProduct.classList.contains('hidden')) {
        modalProduct.classList.add('hidden');
        modalProduct.style.display = 'none';
        return;
      }

      // 4. Modal de import/export aberto — fecha e fica em view-produtos
      const importExportModal = document.getElementById('import-export-modal');
      if (importExportModal && !importExportModal.classList.contains('hidden')) {
        importExportModal.classList.add('hidden');
        return;
      }

      // 5. Modal de cliente aberto — fecha e fica em view-clientes
      const modalClient = document.getElementById('modal-client');
      if (modalClient && !modalClient.classList.contains('hidden')) {
        modalClient.classList.add('hidden');
        modalClient.style.display = 'none';
        return;
      }

      // 6. Aba "salvos" de orçamentos aberta (mobile) — volta para aba "novo"
      const tabSalvos = document.getElementById('tab-content-salvos');
      if (tabSalvos && tabSalvos.style.display !== 'none' && tabSalvos.style.display !== '') {
        if (typeof window.switchDocumentTab === 'function') {
          window.switchDocumentTab('novo');
          return;
        }
      }

      // 7. Seção de histórico desktop aberta — volta para aba "novo"
      const deskSaved = document.getElementById('desktop-section-saved');
      if (deskSaved && deskSaved.style.display === 'grid') {
        if (typeof window.switchDocumentTab === 'function') {
          window.switchDocumentTab('novo');
          return;
        }
      }

      // 8. Modal de orçamento salvo aberto — fecha o modal
      const modalSaved = document.getElementById('modal-saved-quote');
      if (modalSaved && !modalSaved.classList.contains('hidden')) {
        modalSaved.classList.add('hidden');
        modalSaved.style.display = 'none';
        return;
      }

      // 8.1. Modal de notificações aberto — fecha o modal
      const notificationsModal = document.getElementById('notifications-modal');
      if (notificationsModal && !notificationsModal.classList.contains('hidden')) {
        if (typeof window.closeNotificationsModal === 'function') {
          window.closeNotificationsModal();
        } else {
          notificationsModal.classList.add('hidden');
          notificationsModal.classList.remove('open');
          notificationsModal.style.display = 'none';
        }
        return;
      }

      // 9. Se o visualizador de catálogos estiver aberto — fecha o visualizador
      const catalogViewer = document.getElementById('catalog-modal-viewer');
      if (catalogViewer) {
        if (typeof window.closeCatalogModalViewer === 'function') {
          window.closeCatalogModalViewer();
        } else {
          catalogViewer.remove();
        }
        return;
      }

      // 10. Qualquer outro modal genérico aberto
      const openModals = document.querySelectorAll('.modal:not(.hidden), .modal.open, .print-modal:not(.hidden)');
      if (openModals.length > 0) {
        let closedAny = false;
        openModals.forEach(m => {
          if (!m.classList.contains('hidden') || m.classList.contains('open')) {
            m.classList.add('hidden');
            m.classList.remove('open');
            m.style.display = 'none';
            closedAny = true;
          }
        });
        if (closedAny) return;
      }

      // 11. Tela secundária → volta para a tela anterior ou Dashboard
      const currentActiveView = document.querySelector('.view-content.active')?.id || 'view-dashboard';
      if (currentActiveView !== 'view-dashboard') {
        if (appNavHistory.length > 1) {
          appNavHistory.pop();
          const prevView = appNavHistory[appNavHistory.length - 1] || 'view-dashboard';
          window.navigateToView(prevView, false);
        } else {
          window.navigateToView('view-dashboard', false);
        }
        return;
      }

      // 12. No Dashboard → confirmação de saída
      const now = Date.now();
      if (window._lastBackPressTime && (now - window._lastBackPressTime < 2000)) {
        App.exitApp();
      } else {
        window._lastBackPressTime = now;
        showToast('Pressione voltar novamente para sair', 'info');
      }
    });
  } catch (e) {
    console.debug('Android BackButton listener setup:', e);
  }
}

// Bloqueio rigoroso de letras e teclado estritamente numérico
function setupNumericInputsEnforcement() {
  const isTargetIntegerNumeric = (target) => {
    if (!target || target.tagName !== 'INPUT') return false;
    const mode = target.getAttribute('inputmode');
    const type = target.type;
    const isExplicit = target.hasAttribute('data-numeric-only') && target.getAttribute('data-numeric-only') === 'int';
    const isKnownIntId = target.id === 'pdv-quick-quantity-input' || target.id === 'orc-input-qtd' || target.id === 'set-prazoValidadeDias' || target.id === 'set-tamanhoFonteCupom';
    const isCartQty = target.classList.contains('cart-qty-input') || (type === 'number' && !target.step && !target.classList.contains('v-atacado'));
    return isExplicit || isKnownIntId || isCartQty || (mode === 'numeric' && type !== 'tel');
  };

  const isTargetDecimalNumeric = (target) => {
    if (!target || target.tagName !== 'INPUT') return false;
    const mode = target.getAttribute('inputmode');
    const isExplicit = target.hasAttribute('data-numeric-only') && target.getAttribute('data-numeric-only') === 'decimal';
    const isPrice = target.classList.contains('v-atacado') || target.classList.contains('v-varejo') || target.classList.contains('v-nota-fiscal') || target.classList.contains('v-especial');
    const isDiscount = target.id === 'orc-desconto';
    return isExplicit || isPrice || isDiscount || mode === 'decimal';
  };

  // 0. Aplica teclado numérico nativo do Android (plugin NativeKeyboard)
  const applyNativeKeyboard = (target) => {
    if (!window.Capacitor?.Plugins?.NativeKeyboard) return;
    if (!target || target.tagName !== 'INPUT') {
      window.Capacitor.Plugins.NativeKeyboard.setInputType({ mode: 'text' });
      return;
    }
    const numericOnly = target.getAttribute('data-numeric-only');
    let mode = 'text';
    if (numericOnly === 'int') {
      mode = 'int';
    } else if (numericOnly === 'decimal') {
      mode = 'decimal';
    } else if (isTargetIntegerNumeric(target)) {
      mode = 'int';
    } else if (isTargetDecimalNumeric(target)) {
      mode = 'decimal';
    }
    window.Capacitor.Plugins.NativeKeyboard.setInputType({ mode });
  };

  document.addEventListener('focusin', (e) => applyNativeKeyboard(e.target), true);
  document.addEventListener('focusout', () => {
    if (window.Capacitor?.Plugins?.NativeKeyboard) {
      window.Capacitor.Plugins.NativeKeyboard.setInputType({ mode: 'text' });
    }
  }, true);

  // 1. Bloqueia pressionamento de teclas não numéricas
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT') return;

    const isInt = isTargetIntegerNumeric(target);
    const isDec = isTargetDecimalNumeric(target);
    if (!isInt && !isDec) return;

    // Permite teclas de controle e atalhos (Backspace, Tab, Enter, Escape, Delete, Setas, Selecionar/Copiar/Colar)
    if (['Backspace', 'Tab', 'Enter', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
        e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    if (isInt) {
      // Bloqueia qualquer caractere que não seja dígito 0-9 (inclui 'e', 'E', '+', '-', '.', ',')
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    } else if (isDec) {
      // Permite dígitos e um único ponto ou vírgula decimal
      if (e.key === '.' || e.key === ',') {
        if (target.value.includes('.') || target.value.includes(',')) {
          e.preventDefault();
        }
      } else if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    }
  }, true);

  // 2. Sanitiza o valor instantaneamente no evento input (para digitação rápida ou sugestões de teclado)
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT') return;

    const isInt = isTargetIntegerNumeric(target);
    const isDec = isTargetDecimalNumeric(target);
    if (!isInt && !isDec) return;

    if (isInt) {
      const sanitized = target.value.replace(/\D/g, '');
      if (target.value !== sanitized) {
        target.value = sanitized;
      }
    } else if (isDec) {
      const sanitized = target.value.replace(/[^0-9.,]/g, '');
      if (target.value !== sanitized) {
        target.value = sanitized;
      }
    }
  }, true);

  // 3. Sanitiza dados colados via clipboard
  document.addEventListener('paste', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT') return;

    const isInt = isTargetIntegerNumeric(target);
    const isDec = isTargetDecimalNumeric(target);
    if (!isInt && !isDec) return;

    e.preventDefault();
    const pasteText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const cleanText = isInt ? pasteText.replace(/\D/g, '') : pasteText.replace(/[^0-9.,]/g, '');
    
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, cleanText);
    } else {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const val = target.value;
      target.value = val.substring(0, start) + cleanText + val.substring(end);
      target.selectionStart = target.selectionEnd = start + cleanText.length;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, true);
}



function openMobileMoreMenu() {
  const modal = document.getElementById('mobile-more-menu');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('open');
  }
}

function closeMobileMoreMenu() {
  const modal = document.getElementById('mobile-more-menu');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.classList.add('hidden');
      }
    }, 300); // tempo correspondente à animação de transição do slide-up
  }
}

function setupMobileMoreMenu() {
  const closeBtn = document.getElementById('btn-close-more-menu');
  const overlay = document.getElementById('more-modal-overlay');

  if (closeBtn) closeBtn.addEventListener('click', closeMobileMoreMenu);
  if (overlay) overlay.addEventListener('click', closeMobileMoreMenu);

  // Fecha menu clicando fora ou no overlay
  document.querySelectorAll('.more-menu-btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      window.navigateToView(target);
      closeMobileMoreMenu();
    });
  });

  // Vincula as preferências do menu mobile com as do desktop
  const mobTheme = document.getElementById('mobile-btn-theme');
  const mobFontDec = document.getElementById('mobile-btn-font-decrease');
  const mobFontInc = document.getElementById('mobile-btn-font-increase');
  const mobLogout = document.getElementById('mobile-btn-logout');

  if (mobTheme) {
    mobTheme.addEventListener('click', () => {
      document.getElementById('btn-theme-toggle')?.click();
    });
  }
  if (mobFontDec) {
    mobFontDec.addEventListener('click', () => {
      document.getElementById('btn-font-decrease')?.click();
    });
  }
  if (mobFontInc) {
    mobFontInc.addEventListener('click', () => {
      document.getElementById('btn-font-increase')?.click();
    });
  }
  if (mobLogout) {
    mobLogout.addEventListener('click', () => {
      closeMobileMoreMenu();
      document.getElementById('btn-logout')?.click();
    });
  }
}

function setupDashboardActions() {
  document.querySelectorAll('[data-dashboard-target]').forEach(card => card.addEventListener('click', () => window.navigateToView(card.dataset.dashboardTarget)));
}

function setupFinanceiroActions() {
  const period = document.getElementById('fin-period');
  const start = document.getElementById('fin-date-start');
  const end = document.getElementById('fin-date-end');
  if (!period) return;
  const refresh = () => typeof window.updateFinanceiro === 'function' && window.updateFinanceiro();
  period.onchange = () => {
    const custom = period.value === 'custom';
    start.disabled = !custom;
    end.disabled = !custom;
    refresh();
  };
  start.onchange = refresh;
  end.onchange = refresh;
  period.dispatchEvent(new Event('change'));
}

document.addEventListener('DOMContentLoaded', () => {
  setupDashboardActions();
  setupFinanceiroActions();
});


// Atualização Visual de Status da Conexão
function handleStatusChange(statusState, statusText) {
  const statusBadge = document.getElementById('connection-status');
  const statusTextElem = document.getElementById('status-text');

  if (!statusBadge || !statusTextElem) return;

  statusTextElem.textContent = statusText;

  // Atualiza classes de estilo do badge
  statusBadge.className = 'status-badge';
  if (statusState === 'ONLINE') {
    statusBadge.classList.add('status-online');
  } else if (statusState === 'OFFLINE') {
    statusBadge.classList.add('status-offline');
  } else if (statusState === 'SYNCING') {
    statusBadge.classList.add('status-syncing');
  }

  // Registra notificação de sincronização/conexão quando fica offline
  if (statusState === 'OFFLINE' && typeof window.pushNotification === 'function') {
    window.pushNotification({
      type: 'sync',
      title: 'Sem conexão com o banco',
      message: 'O aplicativo está operando offline. As vendas serão sincronizadas quando a conexão voltar.'
    });
  }
}

// Sistema de Notificações Pop-up (Toast)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Remove o toast após 3.5 segundos
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

window.updateDashboardCategories = function() {
  const container = document.getElementById('dashboard-categories-list');
  if (!container) return;

  const products = window.productsCache || [];
  const categories = [...new Set(products.map(p => p.categoria || p.category).filter(Boolean))];

  if (categories.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhuma categoria encontrada.</p>';
    return;
  }

  const categoryIcons = {
    'Limpeza Geral': '🧼',
    'Cozinha': '🍽️',
    'Banheiro': '🚽',
    'Lavanderia': '🧺',
    'Automotivo': '🚗',
    'Desinfetantes': '✨',
    'Detergentes': '💧',
    'Sabões': '🧼',
    'Líquidos': '🧪',
    'Default': '📦'
  };

  container.innerHTML = categories.map(cat => {
    const icon = categoryIcons[cat] || categoryIcons['Default'];
    return `
      <button class="category-launcher-card" type="button" onclick="window.selectCategoryForBudget('${cat}')">
        <span class="category-launcher-icon">${icon}</span>
        <span class="category-launcher-label">${cat}</span>
      </button>
    `;
  }).join('');
};

window.selectCategoryForBudget = function(categoryName) {
  // Navigate to budget view
  window.navigateToView('view-orcamento');

  // Set filter in Search Input
  const searchInput = document.getElementById('orc-search-produto');
  if (searchInput) {
    searchInput.value = categoryName;
    // Trigger input event to render search results
    searchInput.dispatchEvent(new Event('input'));
    // Focus search input
    searchInput.focus();
  }
};
