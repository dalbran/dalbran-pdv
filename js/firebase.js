/**
 * Configuração e Inicialização do Firebase Web SDK via CDN (Modo Compatibilidade)
 * Não utiliza Node.js, npm, bundlers ou .env.
 */

// Configuração do projeto Firebase
// ATENÇÃO: Substitua os valores abaixo pelos obtidos no Firebase Console.
const firebaseConfig = {
    apiKey: "AIzaSyABGdH59NdsvCyi1Tv9w7P7O5xJz6U5k0g",
    authDomain: "dalbran.firebaseapp.com",
    projectId: "dalbran",
    storageBucket: "dalbran.firebasestorage.app",
    messagingSenderId: "786758446607",
    appId: "1:786758446607:web:d39a90bc958f6d2e6efd7a",
    measurementId: "G-HN07CEVVS2"
  };
// Inicializa o aplicativo Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Instâncias globais dos serviços
const auth = firebase.auth();
const db = firebase.firestore();

// Configura Persistência de Autenticação para Sessão Local (Permanece logado)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch((error) => {
    console.error("Erro ao configurar persistência de login:", error);
  });

// Habilita Persistência Offline do Firestore
db.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Múltiplas abas abertas simultaneamente
      console.warn('Persistência offline falhou: Múltiplas abas abertas.');
    } else if (err.code === 'unimplemented') {
      // Navegador não suporta o recurso
      console.warn('Persistência offline não é suportada por este navegador.');
    }
  });

// Monitoramento do Estado da Conexão em Tempo Real
function setupConnectionMonitor(onStatusChange) {
  function updateStatus() {
    if (navigator.onLine) {
      onStatusChange('ONLINE', 'Online');
    } else {
      onStatusChange('OFFLINE', '🔵 Offline');
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  
  // Executa checagem inicial
  updateStatus();
}
