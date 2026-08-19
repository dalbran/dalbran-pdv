/**
 * ============================================================================
 *  DALBRAN — BACKEND GRATUITO DE BACKUP NO GOOGLE DRIVE (Apps Script)
 * ============================================================================
 *  Este script é publicado como "Aplicativo da Web" e roda na SUA conta Google
 *  (a mesma que você usa no script.google.com). Ele cria as pastas e faz o
 *  upload dos backups no Google Drive desta conta.
 *
 *  SEGURANÇA:
 *   - Nenhum token OAuth é necessário (o script usa a autorização da própria
 *     conta que o criou).
 *   - O acesso é protegido por um TOKEN compartilhado (CONFIG_TOKEN). O
 *     aplicativo envia esse token em toda chamada. Quem não souber o token
 *     recebe erro.
 *   - Se quiser trocar o token, mude CONFIG_TOKEN abaixo E no aplicativo
 *     (Configurações → APIs → Drive → Configurar → Token do web app).
 *
 *  COMO PUBLICAR (1 vez):
 *   1. Acesse https://script.google.com → "+ Novo projeto".
 *   2. Apague o conteúdo de "Código.gs" e cole TODO o conteúdo deste arquivo.
 *   3. Clique em "Implantar" (botão azul) → "Nova implantação".
 *   4. Tipo: "Aplicativo da Web".
 *   5. "Executar como": escolha "Eu" (sua conta).  ← IMPORTANTE
 *   6. "Quem tem acesso": "Qualquer pessoa com o link".
 *   7. "Implantar" → autorize (mostra o aviso "Google não verificou este app"
 *      → "Avançado" → "Ir para {seu-app} (não seguro)" → Permitir).
 *   8. Copie a URL que termina em "/exec" — é essa que você cola no app
 *      (Configurações → APIs → Drive → Configurar → URL do web app).
 * ============================================================================
 */

/** Token compartilhado entre o aplicativo e este script. */
var CONFIG_TOKEN = '51b4749956b3441c7661cc4c';

/** Pasta raiz padrão caso o app não envie uma. */
var DEFAULT_FOLDER = 'PDV BACKUP';

/** Quantos backups completos manter (caso o app não envie). */
var DEFAULT_RETENTION = 10;

/**
 * doGet — usado pelo app para verificar se o serviço está no ar.
 * Acesso: https://script.google.com/macros/s/<ID>/exec?token=SEU_TOKEN
 */
function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== CONFIG_TOKEN) {
    return reply_(401, { ok: false, error: 'Token inválido.' });
  }
  return reply_(200, {
    ok: true,
    mode: 'appsscript',
    account: getOwnerEmail_(),
    time: new Date().toISOString()
  });
}

/**
 * doPost — ações do aplicativo.
 * Corpo: JSON { token, action: 'backup'|'incremental'|'status'|'disconnect', ... }
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.tryLock(5000);
  } catch (err) {
    return reply_(503, { ok: false, error: 'Servidor ocupado, tente novamente.' });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reply_(400, { ok: false, error: 'Corpo da requisição vazio.' });
    }
    var data = JSON.parse(e.postData.contents || '{}');
    if (!data.token || data.token !== CONFIG_TOKEN) {
      return reply_(401, { ok: false, error: 'Token inválido.' });
    }
    var action = data.action || 'status';
    if (action === 'status') return reply_(200, status_());
    if (action === 'disconnect') return reply_(200, { ok: true, mode: 'appsscript', message: 'Sem token armazenado (modo Apps Script).' });
    if (action === 'backup') return reply_(200, doBackup_(data));
    if (action === 'incremental') return reply_(200, doIncremental_(data));
    return reply_(400, { ok: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    Logger.log(err);
    return reply_(500, { ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function reply_(status, body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode?.(status);
}

function getOwnerEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

function status_() {
  return {
    ok: true,
    mode: 'appsscript',
    account: getOwnerEmail_(),
    time: new Date().toISOString()
  };
}

// ---------------------------------------------------------------
// Pastas / arquivos
// ---------------------------------------------------------------

function getOrCreateFolder_(name, parent) {
  var parentFolder = parent || DriveApp.getRootFolder();
  var it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

function getOrCreateFile_(folder, name, content) {
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    var f = it.next();
    f.setContent(content);
    return f;
  }
  return folder.createFile(name, content);
}

// ---------------------------------------------------------------
// Backup completo
// ---------------------------------------------------------------

function doBackup_(data) {
  var options = data.options || {};
  var folderName = options.folder || DEFAULT_FOLDER;
  var retention = parseInt(options.retentionCount, 10) || DEFAULT_RETENTION;
  var organized = data.organized || {};

  var root = getOrCreateFolder_(folderName, null);

  // VENDAS e ORCAMENTOS → ano/mês
  var areas = { VENDAS: organized.VENDAS || {}, ORCAMENTOS: organized.ORCAMENTOS || {} };
  for (var areaName in areas) {
    var areaFolder = getOrCreateFolder_(areaName, root);
    var months = areas[areaName];
    for (var key in months) {
      var parts = String(key).split('/');
      if (parts.length !== 2) continue;
      var yearFolder = getOrCreateFolder_(parts[0], areaFolder);
      var monthFolder = getOrCreateFolder_(parts[1], yearFolder);
      var name = areaName.toLowerCase() + '-' + key + '.json';
      getOrCreateFile_(monthFolder, name, JSON.stringify(months[key]));
    }
  }

  var prod = getOrCreateFolder_('PRODUTOS', root);
  getOrCreateFile_(prod, 'produtos.json', JSON.stringify(organized.PRODUTOS || []));

  var cli = getOrCreateFolder_('CLIENTES', root);
  getOrCreateFile_(cli, 'clientes.json', JSON.stringify(organized.CLIENTES || []));

  var cfg = getOrCreateFolder_('CONFIGURACOES', root);
  getOrCreateFile_(cfg, 'configuracoes.json', JSON.stringify(organized.CONFIGURACOES || []));

  // Backup completo com data
  var full = getOrCreateFolder_('BACKUPS_COMPLETOS', root);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fullName = 'backup-completo-' + stamp + '.json';
  var fullFile = getOrCreateFile_(full, fullName, JSON.stringify({
    generatedAt: organized.generatedAt || new Date().toISOString(),
    products: organized.PRODUTOS || [],
    clients: organized.CLIENTES || [],
    quotes: organized.quotes || []
  }));

  // Retenção: mantém apenas os últimos N backups completos
  try {
    var it = full.getFiles();
    var files = [];
    while (it.hasNext()) {
      var f = it.next();
      if (f.getName().indexOf('backup-completo-') === 0) files.push(f);
    }
    files.sort(function (a, b) {
      return a.getDateCreated().getTime() - b.getDateCreated().getTime();
    });
    for (var i = 0; i < files.length - retention; i++) {
      files[i].setTrashed(true);
    }
  } catch (e) {}

  return {
    ok: true,
    message: 'Backup completo enviado para ' + folderName + '/BACKUPS_COMPLETOS/' + fullName,
    account: getOwnerEmail_()
  };
}

// ---------------------------------------------------------------
// Sincronização incremental (venda concluída)
// ---------------------------------------------------------------

function doIncremental_(data) {
  var sale = data.sale || {};
  var options = data.options || {};
  var folderName = options.folder || DEFAULT_FOLDER;

  var root = getOrCreateFolder_(folderName, null);
  var vendas = getOrCreateFolder_('VENDAS', root);

  var d = sale.createdAt ? new Date(sale.createdAt) : new Date();
  var yyyy = String(d.getFullYear());
  var mm = String(d.getMonth() + 1).padStart(2, '0');

  var yearFolder = getOrCreateFolder_(yyyy, vendas);
  var monthFolder = getOrCreateFolder_(mm, yearFolder);
  var name = 'VEN-' + (sale.numero || 'venda') + '.json';
  getOrCreateFile_(monthFolder, name, JSON.stringify({ type: 'venda', ...sale }));

  return {
    ok: true,
    message: 'Venda ' + (sale.numero || '') + ' sincronizada em VENDAS/' + yyyy + '/' + mm + '.',
    account: getOwnerEmail_()
  };
}