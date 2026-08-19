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

console.log('Syncing root files to www/...');
copyRecursiveSync(srcDir, destDir);
// O www/ é publicado no GitHub Pages — TODOS os arquivos (inclusive
// versao.json) precisam ser versionados. O .gitignore da raiz não se aplica aqui.
fs.writeFileSync(path.join(destDir, '.gitignore'), '# GitHub Pages — publicar todos os arquivos gerados\n');
console.log('www/ directory updated successfully.');

// ============================================================================
//  GERAÇÃO DO MANIFEST DE VERSÃO (versao.json)
//  Usado pelo sistema de atualização automática (js/update-checker.js).
//  Publique o www/ (ex.: GitHub Pages) junto com este arquivo.
// ============================================================================
const crypto = require('crypto');

// Versão do APK — MANTER em sincronia com android/app/build.gradle
const APK_NAME = '0.0.6';
const APK_CODE = 6;

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
    url: `https://github.com/dalbran/dalbran-pdv/releases/download/v{VERSION}/Dalbran-v{VERSION}.apk`,
    sha256: ''
  };
  const apkPath = path.join(__dirname, 'apk-releases', `Dalbran-v${APK_NAME}.apk`);
  if (fs.existsSync(apkPath)) {
    apk.sha256 = fileSha256(apkPath);
  }

  const manifest = {
    schema: 1,
    version: APK_NAME,
    apk,
    web,
    updatedAt: new Date().toISOString()
  };

  const outPath = path.join(destDir, 'versao.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`versao.json gerado (${web.length} arquivos web, apk ${APK_NAME}).`);
}

generateManifest();
