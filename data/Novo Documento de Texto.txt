Como Executar Localmente
Clone ou baixe este repositório em sua máquina.

Configure suas credenciais no arquivo js/firebase.js (veja o guia FIREBASE_SETUP.md).

Abra a pasta do projeto em um servidor local HTTP:

VS Code: Clique com botão direito em index.html e selecione Open with Live Server.

Node.js: Execute npx serve no terminal.

Python: Execute python -m http.server 8000.

Acesse http://localhost:8000 no seu navegador.


---

## 3. `FIREBASE_SETUP.md`

```markdown
# 🔥 Guia de Configuração do Firebase

Siga o passo a passo abaixo para conectar a aplicação ao seu próprio banco de dados Firebase.

---

### Step 1: Criar o Projeto no Firebase

1. Acesse o [Console do Firebase](https://console.firebase.google.com/).
2. Clique em **Adicionar projeto** e informe o nome (ex: `Dalbran Distribuidora`).
3. Desative o Google Analytics (opcional) e clique em **Criar projeto**.

---

### Step 2: Ativar a Autenticação (Email/Senha)

1. No menu lateral, acesse **Criação > Authentication**.
2. Clique em **Começar**.
3. Na aba **Método de login**, selecione **E-mail/senha**.
4. Ative a opção **E-mail/senha** e clique em **Salvar**.
5. Na aba **Users**, clique em **Adicionar usuário** para criar o login do administrador (ex: `admin@dalbran.com` e sua senha).

---

### Step 3: Ativar o Cloud Firestore

1. No menu lateral, acesse **Criação > Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Selecione a localização (ex: `southamerica-east1` em São Paulo).
4. Escolha **Iniciar no modo de produção** ou **modo de teste**.
5. Na aba **Regras** do Firestore, configure as permissões para permitir leitura/escrita apenas para usuários autenticados:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
Step 4: Obter as Chaves de Conexão Web
Na página inicial do projeto no Console, clique no ícone da Web </> para adicionar um app.

Registre o app com o nome Dalbran Web App.

Copie o objeto firebaseConfig fornecido.

Abra o arquivo js/firebase.js do projeto e cole suas chaves:

JavaScript
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();