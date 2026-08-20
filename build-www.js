const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

const ignoreList = [
  'node_modules',
  'android',
  'apk-releases',
  'www',
  '.git',
  '.gemini',
  '.vscode',
  'package.json',
  'package-lock.json',
  'build-www.js',
  'releases',
  'extracted_icons',
  'functions',
  'firebase.json',
  'data',
  'web-main.tar',
  'c9abbc35-29de-439d-800b-34e62aeb484d.png',
  'defd3f1d-5261-4712-b66f-915baccdd1f0.png'
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      if (ignoreList.includes(childItemName) || childItemName.endsWith('.apk') || childItemName.endsWith('.zip')) return;
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

// Versão NATIVA/APK — MANTER em sincronia com android/app/build.gradle.
// Só deve aumentar quando houver mudança real no container nativo
// (plugin, permissão, Manifest, código Java/Kotlin, assinatura, libs).
const APK_NAME = '0.0.14';
const APK_CODE = 14;

// Versão WEB/MODULAR — controla tudo que pode ser atualizado sem novo APK
// (HTML, CSS, JS, telas, módulos, imagens, traduções, configurações remotas).
// Aumenta em TODA publicação web, mesmo quando o APK não muda.
const WEB_VERSION = '1.0.3';
const WEB_CODE = 103;

// Quando true, a atualização nativa (APK) é OBRIGATÓRIA para esta versão —
// usado apenas quando a mudança não pode ser entregue pela camada web.
// Neste build o container ganhou suporte a abrir configurações de instalação,
// mas a entrega é 100% modular, então o APK é opcional (contingência).
const APK_REQUIRED = false;
const APK_REASON = ''; // preenchido quando APK_REQUIRED = true

// Publica o APK também em www/apk/ (GitHub Pages) apenas quando solicitado
// explicitamente, para que o APK nunca seja empacotado dentro dele mesmo.
const WITH_APK = process.argv.includes('--with-apk');

console.log('Syncing root files to www/...');
copyRecursiveSync(srcDir, destDir);
// O www/ é publicado no GitHub Pages — TODOS os arquivos (inclusive
// versao.json) precisam ser versionados. O .gitignore da raiz não se aplica aqui.
fs.writeFileSync(path.join(destDir, '.gitignore'), '# GitHub Pages — publicar todos os arquivos gerados\n');

// Injeta o marcador de versão web no index.html publicado. O app lê
// window.__WEB_CODE__ para CONFIRMAR que a camada web em execução é mesmo a
// versão instalada (base para a ativação/rollback da atualização modular).
const indexHtmlPath = path.join(destDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  const marker = `<script>window.__WEB_VERSION__=${JSON.stringify(WEB_VERSION)};window.__WEB_CODE__=${WEB_CODE};</script>`;
  if (!html.includes('window.__WEB_VERSION__')) {
    html = html.replace('</head>', '  ' + marker + '\n</head>');
  } else {
    html = html.replace(/<script>window\.__WEB_VERSION__[^<]*<\/script>/, marker);
  }
  fs.writeFileSync(indexHtmlPath, html);
  console.log('Marcador de versão web injetado no index.html (' + WEB_VERSION + ' / code ' + WEB_CODE + ').');
}
console.log('www/ directory updated successfully.');

// Normaliza finais de linha para LF nos arquivos de texto do www/.
// Necessário porque o git com core.autocrlf=true armazena/serve os blobs
// com LF no GitHub Pages, mas o working tree pode estar CRLF. Os hashes do
// versao.json são calculados sobre ESTES arquivos normalizados, então a
// validação de checksum na atualização modular bate com o que é servido.
function normalizeTextFiles(dir) {
  const exts = ['.html', '.css', '.js', '.json', '.conf', '.md', '.txt', '.svg'];
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) normalizeTextFiles(full);
      else if (entry.isFile() && exts.some((e) => entry.name.toLowerCase().endsWith(e))) {
        const buf = fs.readFileSync(full);
        if (buf.indexOf(13) !== -1) {
          const text = buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          fs.writeFileSync(full, text, 'utf8');
        }
      }
    });
  } catch (e) {}
}
normalizeTextFiles(destDir);
console.log('www/ text files normalized to LF.');

// ============================================================================
//  GERAÇÃO DO MANIFEST DE VERSÃO (versao.json)
//  Usado pelo sistema de atualização automática (js/update-checker.js).
//  Publique o www/ (ex.: GitHub Pages) junto com este arquivo.
// ============================================================================
const crypto = require('crypto');

// Arquivos da camada web (atualização modular)
const WEB_FILES = [
  'index.html',
  'API.html',
  'API.conf',
  'css/style.css',
  'css/api-admin.css',
  'js/firebase.js',
  'js/auth.js',
  'js/utils.js',
  'js/produtos.js',
  'js/clientes.js',
  'js/configuracoes.js',
  'js/orcamento.js',
  'js/whatsapp.js',
  'js/backup.js',
  'js/drive-backup.js',
  'js/bug-report.js',
  'js/permissions.js',
  'js/update-checker.js',
  'js/api-admin.js',
  'js/catalogos.js',
  'js/catalog-links.js',
  'js/notifications.js',
  'js/app.js',
  'catalogos/catalog-data.js',
  'sw.js',
  'manifest.json'
];

function fileSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function generateManifest() {
  const web = WEB_FILES
    .filter(f => fs.existsSync(path.join(destDir, f)))
    .map(f => ({ path: f, sha256: fileSha256(path.join(destDir, f)) }));

  let apk = {
    name: APK_NAME,
    code: APK_CODE,
    url: `https://dalbran.github.io/dalbran-pdv/apk/Dalbran-v{VERSION}.apk`,
    fallbackUrl: `https://github.com/dalbran/dalbran-pdv/releases/download/v{VERSION}/Dalbran-v{VERSION}.apk`,
    sha256: '',
    // required=true => atualização nativa OBRIGATÓRIA (mudança que não pode
    // ser entregue pela camada web). required=false => APK opcional/contingência.
    required: APK_REQUIRED,
    reason: APK_REASON
  };
  const apkPath = path.join(__dirname, 'apk-releases', `Dalbran-v${APK_NAME}.apk`);
  if (fs.existsSync(apkPath)) {
    apk.sha256 = fileSha256(apkPath);
  }
  if (WITH_APK && fs.existsSync(apkPath)) {
    // Publica o APK também no GitHub Pages (mesmo domínio do versao.json),
    // pois algumas redes bloqueiam downloads diretos de github.com/releases.
    const apkDestDir = path.join(destDir, 'apk');
    fs.mkdirSync(apkDestDir, { recursive: true });
    // Mantém apenas o APK da versão atual (evita acumular APKs antigos no app).
    const currentApkName = `Dalbran-v${APK_NAME}.apk`;
    try {
      fs.readdirSync(apkDestDir).forEach(f => {
        if (f !== currentApkName) {
          const old = path.join(apkDestDir, f);
          try { fs.unlinkSync(old); } catch (e) {}
        }
      });
    } catch (e) {}
    fs.copyFileSync(apkPath, path.join(apkDestDir, currentApkName));
    console.log(`APK copiado para www/apk/${currentApkName}`);
  } else {
    // Sem a flag --with-apk, o APK não entra no bundle do app. Remove qualquer
    // APK deixado em www/apk/ para que nunca seja empacotado dentro dele mesmo.
    const apkDestDir = path.join(destDir, 'apk');
    try {
      fs.readdirSync(apkDestDir).forEach(f => {
        const old = path.join(apkDestDir, f);
        try { fs.unlinkSync(old); } catch (e) {}
      });
    } catch (e) {}
  }

  const manifest = {
    schema: 2,
    // Alias de compatibilidade: versões antigas do app liam `version`/`code`
    // como a versão do app. Continuam apontando para a versão web mais nova.
    version: WEB_VERSION,
    code: WEB_CODE,
    // Versão web/modular — controla a atualização modular (sem APK)
    webVersion: WEB_VERSION,
    webCode: WEB_CODE,
    // Versão nativa/APK — só muda quando o container Android muda
    nativeVersion: APK_NAME,
    nativeCode: APK_CODE,
    force: false, // true = atualização obrigatória (sem "Agora não" e com barra de progresso)
    apk,
    web,
    updatedAt: new Date().toISOString()
  };

  const outPath = path.join(destDir, 'versao.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`versao.json gerado (${web.length} arquivos web, apk ${APK_NAME}).`);
}

generateManifest();
