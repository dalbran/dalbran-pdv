/**
 * ============================================================================
 *  DALBRAN — BACKEND DAS INTEGRAÇÕES (Firebase Cloud Functions)
 * ============================================================================
 *  Este é o ÚNICO lugar onde os tokens e credenciais do Google Drive existem.
 *  - O aplicativo (js/drive-backup.js) apenas chama estas funções via SDK.
 *  - Os tokens são armazenados em Firestore na coleção `_secrets` (protegida:
 *    as regras de segurança negam leitura/escrita para os clientes).
 *  - Nenhuma chave é enviada para o navegador/WebView.
 *
 *  Funções:
 *    driveAuthUrl       → gera a URL de consentimento OAuth do Google.
 *    driveOauthCallback → troca o código pelo token e guarda de forma segura.
 *    driveStatus        → informa se há uma conta conectada (sem expor tokens).
 *    driveDisconnect    → remove os tokens armazenados.
 *    driveBackup        → cria a estrutura de pastas e faz o upload organizado.
 * ============================================================================
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();
const db = admin.firestore();

const SECRETS_DOC = 'drive'; // _secrets/drive

// ---------------------------------------------------------------
// Leitura dos segredos (somente via Admin SDK — ignora regras do cliente)
// ---------------------------------------------------------------
async function readSecrets() {
  const snap = await db.collection('_secrets').doc(SECRETS_DOC).get();
  return snap.exists ? snap.data() : {};
}

function buildOAuthClient(creds) {
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
}

function buildDriveAuth(creds) {
  const auth = buildOAuthClient(creds);
  auth.setCredentials({
    refresh_token: creds.refreshToken,
    access_token: creds.accessToken,
    expiry_date: creds.tokenExpiry || 0
  });
  return auth;
}

function requireAuth(context) {
  if (!context || !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Faça login para acessar esta função.');
  }
  return context.auth.uid;
}

// ---------------------------------------------------------------
// 1. URL de autorização (consentimento do Google)
// ---------------------------------------------------------------
exports.driveAuthUrl = functions.https.onCall(async (_data, context) => {
  requireAuth(context);
  const creds = await readSecrets();
  if (!creds.clientId || !creds.clientSecret || !creds.redirectUri) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Credenciais OAuth do Google ainda não configuradas no backend.'
    );
  }
  const client = buildOAuthClient(creds);
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });
  return { url };
});

// ---------------------------------------------------------------
// 2. Callback do OAuth — recebe o code e guarda o token no backend
// ---------------------------------------------------------------
exports.driveOauthCallback = functions.https.onRequest(async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.status(400).send('Código de autorização ausente.');
    return;
  }
  try {
    const creds = await readSecrets();
    const client = buildOAuthClient(creds);
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    let email = '';
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const info = await oauth2.userinfo.get();
      email = info.data.email || '';
    } catch (e) { /* e-mail opcional */ }

    await db.collection('_secrets').doc(SECRETS_DOC).set({
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || creds.refreshToken || '',
      tokenExpiry: tokens.expiry_date || 0,
      connectedEmail: email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const origin = req.get('origin') || req.get('referer') || 'https://dalbran.firebaseapp.com';
    res.redirect(origin.replace(/\/$/, '') + '/API.html?drive=connected');
  } catch (err) {
    console.error('driveOauthCallback error:', err);
    res.status(500).send('Falha ao autenticar com o Google.');
  }
});

// ---------------------------------------------------------------
// 3. Status da conexão (nunca retorna tokens)
// ---------------------------------------------------------------
exports.driveStatus = functions.https.onCall(async (_data, context) => {
  requireAuth(context);
  const creds = await readSecrets();
  let connected = false;
  let email = '';
  if (creds.refreshToken || creds.accessToken) {
    try {
      const auth = buildDriveAuth(creds);
      await auth.getAccessToken();
      connected = true;
      email = creds.connectedEmail || '';
    } catch (e) {
      connected = false;
    }
  }
  return { connected, email };
});

// ---------------------------------------------------------------
// 4. Desconexão — apaga os tokens
// ---------------------------------------------------------------
exports.driveDisconnect = functions.https.onCall(async (_data, context) => {
  requireAuth(context);
  await db.collection('_secrets').doc(SECRETS_DOC).update({
    accessToken: admin.firestore.FieldValue.delete(),
    refreshToken: admin.firestore.FieldValue.delete(),
    tokenExpiry: admin.firestore.FieldValue.delete(),
    connectedEmail: admin.firestore.FieldValue.delete()
  });
  return { ok: true };
});

// ---------------------------------------------------------------
// 5. Backup no Google Drive (estrutura organizada por pastas)
// ---------------------------------------------------------------
exports.driveBackup = functions.https.onCall(async (payload, context) => {
  requireAuth(context);
  const creds = await readSecrets();
  if (!creds.refreshToken) {
    throw new functions.https.HttpsError('unauthenticated', 'Nenhuma conta Google conectada no backend.');
  }

  const auth = buildDriveAuth(creds);
  await auth.getAccessToken();
  const drive = google.drive({ version: 'v3', auth });

  const options = (payload && payload.options) || {};
  const folderName = options.folder || 'PDV BACKUP';
  const retention = parseInt(options.retentionCount, 10) || 10;

  // --- helpers do Drive ---
  async function findFile(name, parent, mimeType) {
    const q = [
      `name='${String(name).replace(/'/g, "\\'")}'`,
      'trashed=false',
      parent ? `'${parent}' in parents` : "'root' in parents"
    ];
    if (mimeType) q.push(`mimeType='${mimeType}'`);
    const res = await drive.files.list({ q: q.join(' and '), fields: 'files(id,name)', spaces: 'drive', pageSize: 1 });
    return res.data.files && res.data.files[0] ? res.data.files[0].id : null;
  }

  async function ensureFolder(name, parent) {
    const existing = await findFile(name, parent, 'application/vnd.google-apps.folder');
    if (existing) return existing;
    const res = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : [] },
      fields: 'id'
    });
    return res.data.id;
  }

  async function uploadJson(name, parent, content) {
    const existing = await findFile(name, parent, 'application/json');
    const media = { mimeType: 'application/json', body: JSON.stringify(content) };
    const fileMeta = { name, parents: [parent], mimeType: 'application/json' };
    if (existing) {
      await drive.files.update({ fileId: existing, media, requestBody: fileMeta });
      return { id: existing, updated: true };
    }
    const res = await drive.files.create({ requestBody: fileMeta, media, fields: 'id' });
    return { id: res.data.id, created: true };
  }

  const rootId = await ensureFolder(folderName, null);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const stamp = `${yyyy}-${mm}-${String(now.getDate()).padStart(2, '0')}`;

  // --- Venda concluída → sincronização incremental ---
  if (payload && payload.kind === 'incremental' && payload.sale) {
    const sale = payload.sale;
    const vendasId = await ensureFolder('VENDAS', rootId);
    const yearId = await ensureFolder(yyyy, vendasId);
    const monthId = await ensureFolder(mm, yearId);
    const name = `VEN-${sale.numero || 'venda'}.json`;
    await uploadJson(name, monthId, { type: 'venda', ...sale });
    return { ok: true, message: `Venda ${sale.numero || ''} sincronizada em VENDAS/${yyyy}/${mm}.` };
  }

  // --- Backup completo ---
  const organized = (payload && payload.organized) || {};

  for (const [area, months] of [['VENDAS', organized.VENDAS || {}], ['ORCAMENTOS', organized.ORCAMENTOS || {}]]) {
    const areaId = await ensureFolder(area, rootId);
    for (const key of Object.keys(months)) {
      const [y, m] = key.split('/');
      if (!y || !m) continue;
      const yearId = await ensureFolder(y, areaId);
      const monthId = await ensureFolder(m, yearId);
      await uploadJson(`${area.toLowerCase()}-${key}.json`, monthId, months[key]);
    }
  }

  const prodId = await ensureFolder('PRODUTOS', rootId);
  await uploadJson('produtos.json', prodId, organized.PRODUTOS || []);

  const cliId = await ensureFolder('CLIENTES', rootId);
  await uploadJson('clientes.json', cliId, organized.CLIENTES || []);

  const cfgId = await ensureFolder('CONFIGURACOES', rootId);
  await uploadJson('configuracoes.json', cfgId, organized.CONFIGURACOES || []);

  const fullId = await ensureFolder('BACKUPS_COMPLETOS', rootId);
  const fullName = `backup-completo-${stamp}.json`;
  await uploadJson(fullName, fullId, {
    generatedAt: organized.generatedAt || new Date().toISOString(),
    products: organized.PRODUTOS || [],
    clients: organized.CLIENTES || [],
    quotes: organized.quotes || []
  });

  // Retenção: mantém apenas os últimos N backups completos
  try {
    const res = await drive.files.list({
      q: `'${fullId}' in parents and trashed=false`,
      fields: 'files(id,name,createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 200,
      spaces: 'drive'
    });
    const files = res.data.files || [];
    if (files.length > retention) {
      for (const file of files.slice(retention)) {
        try { await drive.files.delete({ fileId: file.id }); } catch (e) {}
      }
    }
  } catch (e) { console.warn('Retenção não executada:', e.message); }

  return {
    ok: true,
    message: `Backup completo enviado para ${folderName}/BACKUPS_COMPLETOS/${fullName}.`
  };
});