# Backend das Integrações — Google Drive / Backup Automático

Esta pasta contém as **Cloud Functions do Firebase** responsáveis por:

- **OAuth 2.0 com o Google Drive** (autenticação e armazenamento seguro de tokens);
- **Backup automático organizado por pastas** (`PDV BACKUP/...`);
- **Sincronização a cada venda concluída** e backups completos periódicos.

> **Segurança:** os tokens e credenciais ficam APENAS aqui (coleção `_secrets`
> no Firestore, bloqueada para o aplicativo). O `API.html` e o `js/drive-backup.js`
> apenas gerenciam configurações e chamam estas funções — nunca guardam segredos.

---

## 1. Requisitos

- Projeto Firebase no plano **Blaze (pay-as-you-go)** — necessário para Cloud Functions;
- Google Cloud Project com a **Google Drive API** habilitada;
- CLI do Firebase instalada:
  ```bash
  npm install -g firebase-tools
  ```
- Acessar o Firebase:
  ```bash
  firebase login
  ```

## 2. Criar o Cliente OAuth no Google Cloud

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. **Habilite a API**: "Google Drive API".
3. Crie **Credenciais → IDs do cliente OAuth → Aplicativo da Web**.
4. Em "URIs de redirecionamento autorizados" adicione a URL do callback **depois de implantar** (passo 4):
   ```
   https://us-central1-dalbran.cloudfunctions.net/driveOauthCallback
   ```
   (troque `us-central1`/`dalbran` pela região/projeto reais.)
5. Anote o **Client ID** e o **Client Secret**.

## 3. Armazenar as credenciais no backend

As credenciais do OAuth (Client ID/Secret/Redirect URI) são lidas do documento
`_secrets/drive` no Firestore. O aplicativo **não pode** ler nem gravar essa
coleção (as regras de segurança negam), mas você pode criá-la manualmente no
console ou com o script abaixo (roda fora do app, com as credenciais de serviço):

```bash
cd functions
npm install
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
admin.firestore().collection('_secrets').doc('drive').set({
  clientId: 'SEU_CLIENT_ID',
  clientSecret: 'SEU_CLIENT_SECRET',
  redirectUri: 'https://us-central1-dalbran.cloudfunctions.net/driveOauthCallback'
}).then(() => console.log('OK'));
"
```

**Alternativa mais simples (console):** no Firebase Console → Firestore → crie a
coleção `_secrets` e o documento `drive` com os três campos acima.

## 4. Implantar as funções

```bash
cd functions
npm install
firebase deploy --only functions
```

Após implantar, volte ao **passo 2** e cadastre a URL real do callback
(`https://<regiao>-<projeto>.cloudfunctions.net/driveOauthCallback`) nas URIs
autorizadas do cliente OAuth.

## 5. Usar no aplicativo

1. Abra **Configurações → APIs → Google Drive / Backup Automático**.
2. **Conectar conta Google** → autorize no navegador. O app detecta a conexão e
   o status muda para "Conectada".
3. Configure a **frequência** e a **pasta principal** (padrão `PDV BACKUP`) no
   botão **Configurar**.
4. **Fazer backup agora** envia o backup completo na hora.

## Estrutura criada no Google Drive

```
PDV BACKUP/
├── VENDAS/          (ano/mês)  → vendas-AAAA-MM.json
├── ORCAMENTOS/      (ano/mês)  → orcamentos-AAAA-MM.json
├── PRODUTOS/                    → produtos.json
├── CLIENTES/                    → clientes.json
├── CONFIGURACOES/               → configuracoes.json
└── BACKUPS_COMPLETOS/           → backup-completo-AAAA-MM-DD.json (mantém últimos N)
```

## Comportamento

| Frequência      | Comportamento                                                |
|-----------------|--------------------------------------------------------------|
| A cada venda    | Venda sincronizada na hora em `VENDAS/AAAA/MM`               |
| Por hora        | Backup completo a cada 1 h (enquanto o app estiver aberto)   |
| Diário          | Backup completo a cada 24 h                                  |
| Semanal         | Backup completo a cada 7 dias                                |
| Somente manual  | Apenas quando você tocar em "Fazer backup agora"             |

> **Obs.:** sem o backend implantado, o botão "Backup agora" exporta o mesmo
> pacote organizado **localmente** (arquivo JSON) — sem nenhuma credencial.

## Regras do Firestore (importante)

Aplique as regras de `firebase/firestore.rules.js` para bloquear `_secrets`
para o aplicativo. Exemplo do trecho que precisa existir:

```
match /_secrets/{secretId} {
  allow read, write: if false;
}
```