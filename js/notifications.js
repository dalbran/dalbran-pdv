/**
 * Módulo de Notificações
 * Estrutura preparada para avisos administrativos, atualizações, alertas de
 * vendas, estoque e sincronização. As notificações são persistidas localmente
 * e podem ser ampliadas para sincronização em nuvem (Firestore) no futuro.
 */

window.notificationsCache = [];

const NOTIFICATIONS_STORAGE_KEY = 'dalbran-notifications-v1';
const NOTIFICATIONS_READ_KEY = 'dalbran-notifications-read-v1';

// Tipos suportados pela estrutura (expansível)
const NOTIFICATION_TYPES = {
  info: { icon: 'ph-info', color: '#0284c7', label: 'Informativo' },
  sale: { icon: 'ph-shopping-cart-simple', color: '#10b981', label: 'Venda' },
  stock: { icon: 'ph-package', color: '#d97706', label: 'Estoque' },
  system: { icon: 'ph-wrench', color: '#7c3aed', label: 'Sistema' },
  sync: { icon: 'ph-arrows-clockwise', color: '#0ea5e9', label: 'Sincronização' },
  warning: { icon: 'ph-warning-circle', color: '#ef4444', label: 'Alerta' }
};

function loadNotificationsStorage() {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    window.notificationsCache = Array.isArray(stored) ? stored : [];
  } catch (e) {
    console.warn('Falha ao carregar notificações locais:', e);
    window.notificationsCache = [];
  }
}

function persistNotificationsStorage() {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(window.notificationsCache));
  } catch (e) {
    console.warn('Falha ao salvar notificações locais:', e);
  }
}

function loadReadNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_READ_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

let readNotifications = loadReadNotifications();

function persistReadNotifications() {
  try {
    localStorage.setItem(NOTIFICATIONS_READ_KEY, JSON.stringify([...readNotifications]));
  } catch (e) {
    console.warn('Falha ao salvar leitura de notificações:', e);
  }
}

// Registra uma nova notificação na estrutura local
window.pushNotification = function(notification) {
  const type = NOTIFICATION_TYPES[notification.type] ? notification.type : 'info';
  const item = {
    id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: notification.title || 'Notificação',
    message: notification.message || '',
    date: notification.date ? new Date(notification.date) : new Date(),
    read: notification.read === true,
    action: notification.action || null
  };
  window.notificationsCache.unshift(item);
  // Mantém no máximo 50 notificações para não poluir o armazenamento
  if (window.notificationsCache.length > 50) {
    window.notificationsCache = window.notificationsCache.slice(0, 50);
  }
  persistNotificationsStorage();
  renderNotificationsBadge();
  renderNotificationsList();
  return item;
};

window.getUnreadNotificationsCount = function() {
  return window.notificationsCache.filter(n => !n.read && !readNotifications.has(n.id)).length;
};

function renderNotificationsBadge() {
  const badge = document.getElementById('notification-badge');
  const count = window.getUnreadNotificationsCount();
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
  const bell = document.getElementById('btn-notifications');
  if (bell) bell.classList.toggle('has-unread', count > 0);
}

function renderNotificationsList() {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  if (!window.notificationsCache.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma notificação por enquanto.</p>';
    return;
  }

  list.innerHTML = window.notificationsCache.map(notification => {
    const typeInfo = NOTIFICATION_TYPES[notification.type] || NOTIFICATION_TYPES.info;
    const isRead = notification.read || readNotifications.has(notification.id);
    const dateStr = formatNotificationDate(notification.date);
    return `
      <div class="notification-item ${isRead ? 'is-read' : ''}" data-id="${notification.id}">
        <div class="notification-item-icon" style="background:${typeInfo.color}1a; color:${typeInfo.color};">
          <i class="ph ${typeInfo.icon}"></i>
        </div>
        <div class="notification-item-body">
          <div class="notification-item-title">${escapeNotificationHtml(notification.title)}</div>
          <div class="notification-item-message">${escapeNotificationHtml(notification.message)}</div>
          <div class="notification-item-meta">
            <span class="notification-item-type" style="color:${typeInfo.color};">${typeInfo.label}</span>
            <span>${dateStr}</span>
          </div>
        </div>
        ${!isRead ? '<span class="notification-dot" aria-hidden="true"></span>' : ''}
      </div>
    `;
  }).join('');

  // Marca todas como lidas ao abrir a lista
  window.notificationsCache.forEach(notification => readNotifications.add(notification.id));
  persistReadNotifications();
  renderNotificationsBadge();
}

function formatNotificationDate(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    const isSameDay = date.toDateString() === today.toDateString();
    if (isSameDay) return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function escapeNotificationHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.openNotificationsModal = function() {
  const modal = document.getElementById('notifications-modal');
  if (!modal) return;
  renderNotificationsList();
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.classList.add('open');
};

window.closeNotificationsModal = function() {
  const modal = document.getElementById('notifications-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('open');
  modal.style.display = 'none';
};

function setupNotificationsModule() {
  loadNotificationsStorage();
  renderNotificationsBadge();

  const bell = document.getElementById('btn-notifications');
  if (bell) bell.addEventListener('click', openNotificationsModal);

  const closeBtn = document.getElementById('btn-close-notifications');
  if (closeBtn) closeBtn.addEventListener('click', closeNotificationsModal);

  const modal = document.getElementById('notifications-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeNotificationsModal();
    });
  }
}

document.addEventListener('DOMContentLoaded', setupNotificationsModule);
