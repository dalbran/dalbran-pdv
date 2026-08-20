/**
 * Módulo de Backup e Restauração Completa de Dados (JSON)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupBackupUI();
});

function setupBackupUI() {
  document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'btn-export-json') {
      await exportDatabaseJSON();
    }
    
    if (e.target && e.target.id === 'btn-import-json') {
      triggerImportJSON();
    }
  });
}

// Exporta Banco de Dados Inteiro para arquivo .json
async function exportDatabaseJSON() {
  try {
    showToast("Gerando arquivo de backup...", "info");

    const productsSnap = await db.collection('products').get();
    const settingsSnap = await db.collection('settings').get();
    const quotesSnap = await db.collection('quotes').get();

    const backupData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      products: productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      settings: settingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      quotes: quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `dalbran-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("Backup exportado com sucesso!", "success");
  } catch (err) {
    console.error("Erro ao exportar backup:", err);
    showToast("Erro ao exportar backup.", "error");
  }
}

// Abre Seletor de Arquivos para Importação
function triggerImportJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // Suporta importação direta da lista de produtos ou backup completo
        let productsToImport = [];
        if (Array.isArray(data)) {
          productsToImport = data;
        } else if (data.products && Array.isArray(data.products)) {
          productsToImport = data.products;
        } else {
          showToast("Formato de arquivo JSON inválido.", "error");
          return;
        }

        const validation = validateProductJSON(productsToImport);
        if (!validation.valid) {
          showToast(`Erro no JSON: ${validation.error}`, "error");
          return;
        }

        if (confirm(`Deseja importar ${productsToImport.length} produtos para o catálogo?`)) {
          showToast("Importando produtos...", "info");
          
          const batch = db.batch();
          productsToImport.forEach(prod => {
            const docRef = db.collection('products').doc();
            const { id, ...prodData } = prod; // Remove ID pré-existente
            prodData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            prodData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            batch.set(docRef, prodData);
          });

          await batch.commit();
          showToast("Produtos importados com sucesso!", "success");
        }
      } catch (err) {
        console.error("Erro ao ler JSON:", err);
        showToast("Arquivo JSON malformado ou corrompido.", "error");
      }
    };

    reader.readAsText(file);
  };

  input.click();
}