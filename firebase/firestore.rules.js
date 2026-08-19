rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Regra Global: Apenas usuários autenticados via Firebase Auth
    // têm acesso de leitura e escrita.
    match /{document=**} {
      allow read, write: if request.auth != null;
    }

    // Regras específicas por coleção
    match /products/{productId} {
      allow read, write: if request.auth != null;
    }

    match /quotes/{quoteId} {
      allow read, write: if request.auth != null;
    }

    match /settings/{settingId} {
      allow read, write: if request.auth != null;
    }

    match /users/{userId} {
      allow read, write: if request.auth != null;
    }

    // Segredos do backend (tokens OAuth etc.): o aplicativo NUNCA acessa.
    // Somente as Cloud Functions (Admin SDK, que ignora regras) leem/escrevem.
    match /_secrets/{secretId} {
      allow read, write: if false;
    }
  }
}