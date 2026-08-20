# Configuração do Firebase

## 1. Criação do Projeto
1. Acesse [Firebase Console](https://console.firebase.google.com/).
2. Clique em "Adicionar projeto". Nomeie como `dalbran-distribuidora`.
3. Desative o Google Analytics (não é necessário para MVP).

## 2. Authentication
1. No menu lateral, acesse **Build > Authentication**.
2. Clique em **Get Started**.
3. Na aba **Sign-in method**, ative **Email/Password**.
4. Acesse a aba **Users** e adicione o usuário inicial administrativo:
   * **Email:** admin@dalbran.com.br
   * **Senha:** Defina uma senha forte provisória (A senha `admin` exigida no prompt deve ser alterada logo após o primeiro login).

## 3. Cloud Firestore
1. Acesse **Build > Firestore Database**.
2. Clique em **Create database**. Inicie em **Production mode**.
3. Escolha a região mais próxima (ex: `southamerica-east1` - São Paulo).

## 4. Regras de Segurança Rigorosas (firestore.rules)
Vá até a aba **Rules** e cole exatamente o código abaixo. Isso impede qualquer acesso anônimo:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Função auxiliar: Checa se usuário está logado
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Bloqueia tudo por padrão, libera apenas autenticados
    match /{document=**} {
      allow read, write: if isAuthenticated();
    }
  }
}