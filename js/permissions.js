/**
 * PermissionManager — Gerenciador central de permissões/autorizações do
 * sistema operacional (Android/iOS) e do navegador.
 *
 * Princípios:
 *  - Nunca pedir permissões desnecessárias.
 *  - Solicitar somente no momento em que a ação realmente precisar.
 *  - Verificar → Explicar → Solicitar → Confirmar → Executar.
 *  - Ao voltar de uma tela de configurações, SEMPRE re-verificar o estado
 *    real da autorização antes de continuar (nunca presumir concedida).
 *
 * Detecção de plataforma/dispositivo via plugin nativo (ApkInstaller) com
 * fallback para user-agent. Abertura de configurações via intents nativos
 * por fabricante (Samsung, Xiaomi, Motorola, Google, etc.) com fallback.
 */
(function () {
  'use strict';

  const P = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ApkInstaller) || null;

  let deviceCache = null;

  // ---------------------------------------------------------------
  // Detecção de dispositivo (fallback por user-agent)
  // ---------------------------------------------------------------
  function parseUserAgent() {
    const ua = navigator.userAgent || '';
    const lower = ua.toLowerCase();
    let manufacturer = 'outro';
    if (lower.includes('samsung') || /sm-[a-z]/.test(lower)) manufacturer = 'samsung';
    else if (lower.includes('xiaomi') || lower.includes('redmi') || lower.includes('poco') || lower.includes('miui')) manufacturer = 'xiaomi';
    else if (lower.includes('motorola') || lower.includes('moto ')) manufacturer = 'motorola';
    else if (lower.includes('pixel')) manufacturer = 'google';
    else if (lower.includes('oneplus')) manufacturer = 'oneplus';
    else if (lower.includes('huawei')) manufacturer = 'huawei';
    else if (lower.includes('realme') || lower.includes('oppo')) manufacturer = 'oppo';
    else if (lower.includes('vivo')) manufacturer = 'vivo';

    const platform = lower.includes('android')
      ? 'android'
      : (/ipad|iphone|ipod/.test(lower) ? 'ios' : 'web');

    const osMatch = ua.match(/Android\s+([\d.]+)/) || ua.match(/OS\s+(\d+)[_.]\d+/);
    const modelMatch = ua.match(/;\s*([^;)]+)\s+Build\//);

    return {
      platform,
      osVersion: osMatch ? osMatch[1] : '',
      manufacturer,
      model: modelMatch ? modelMatch[1].trim() : '',
      api: 0
    };
  }

  function appVersionName() {
    try {
      if (window.AppUpdater && window.AppUpdater.APP_VERSION) return window.AppUpdater.APP_VERSION.name || '';
    } catch (e) {}
    return window.__APP_VERSION__ || '';
  }

  function appVersionCode() {
    try {
      if (window.AppUpdater && window.AppUpdater.APP_VERSION) return window.AppUpdater.APP_VERSION.code || 0;
    } catch (e) {}
    return window.__APP_CODE__ || 0;
  }

  // ---------------------------------------------------------------
  // API principal
  // ---------------------------------------------------------------
  async function getDeviceInfo(force) {
    if (deviceCache && !force) return deviceCache;
    const plugin = P();
    if (plugin && plugin.getDeviceInfo) {
      try {
        const info = await plugin.getDeviceInfo();
        deviceCache = {
          platform: info.platform || 'android',
          osVersion: info.osVersion || '',
          manufacturer: (info.manufacturer || '').toLowerCase(),
          model: info.model || '',
          api: info.api || 0,
          appVersion: info.appVersion || appVersionName(),
          appCode: info.appCode || appVersionCode()
        };
        return deviceCache;
      } catch (e) { /* cai para o user-agent */ }
    }
    deviceCache = Object.assign(parseUserAgent(), {
      appVersion: appVersionName(),
      appCode: appVersionCode()
    });
    return deviceCache;
  }

  // O app tem autorização para instalar pacotes (fontes desconhecidas)?
  async function canInstallApks() {
    const plugin = P();
    if (plugin && plugin.canInstallApks) {
      try {
        const r = await plugin.canInstallApks();
        return !!(r && r.canRequestPackageInstalls);
      } catch (e) {}
    }
    // Web/desconhecido: sem restrição equivalente
    return true;
  }

  // Abre a tela de configurações mais relevante. `target`:
  //  - 'install'  : instalação de apps (fontes desconhecidas)
  //  - 'app'      : detalhes do aplicativo
  //  - 'security' : segurança
  //  - 'system'   : configurações gerais
  // Retorna { opened, action, manufacturer, unsupported }.
  async function openSettings(target) {
    const plugin = P();
    if (plugin && plugin.openInstallationSettings) {
      try {
        const r = await plugin.openInstallationSettings({ target: target || 'install' });
        return r || { opened: true };
      } catch (e) {
        return { opened: false, error: e && e.message };
      }
    }
    return { opened: false, unsupported: true };
  }

  async function openInstallationSettings() {
    return openSettings('install');
  }

  // --- Notificações (Web Notification API; no Capacitor o app usa toasts internos) ---
  async function notificationStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // granted | denied | default
  }

  async function requestNotification() {
    if (!('Notification' in window)) return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return 'denied';
    }
  }

  // --- Texto explicativo por fabricante (bloqueio de instalação) ---
  function description(device) {
    const m = (device && device.manufacturer) || 'outro';
    if (m === 'samsung') {
      return 'A instalação da atualização foi bloqueada pelas configurações de segurança do seu dispositivo Galaxy. Para continuar, verifique a opção relacionada à instalação de aplicativos permitidos ou à proteção de segurança.';
    }
    if (m === 'xiaomi') {
      return 'O MIUI pode bloquear a instalação de aplicativos de fontes desconhecidas. Para continuar, permita a instalação do Dalbran PRO nas configurações de segurança do seu dispositivo.';
    }
    if (m === 'motorola') {
      return 'A instalação de aplicativos de fontes desconhecidas está desabilitada. Para continuar, permita a instalação do Dalbran PRO nas configurações do seu dispositivo.';
    }
    if (m === 'google') {
      return 'A instalação de aplicativos de fontes desconhecidas está desabilitada. Para continuar, toque em "Permitir deste aplicativo" na tela de segurança.';
    }
    if (m === 'oppo' || m === 'vivo' || m === 'huawei') {
      return 'A instalação de aplicativos de fontes desconhecidas está desabilitada. Para continuar, permita a instalação do Dalbran PRO nas configurações de segurança do seu dispositivo.';
    }
    return 'A instalação da atualização foi bloqueada pelas configurações de segurança do dispositivo. Para continuar, permita a instalação de aplicativos de fontes desconhecidas para o Dalbran PRO.';
  }

  function capitalize(s) {
    const str = String(s || '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function deviceLabel(device) {
    const d = device || {};
    const parts = [];
    if (d.manufacturer && d.manufacturer !== 'outro') parts.push(capitalize(d.manufacturer));
    if (d.model) parts.push(d.model);
    if (d.osVersion) parts.push('Android ' + d.osVersion);
    return parts.join(' · ') || 'Dispositivo';
  }

  window.PermissionManager = {
    getDeviceInfo,
    canInstallApks,
    openSettings,
    openInstallationSettings,
    notificationStatus,
    requestNotification,
    description,
    deviceLabel
  };
})();