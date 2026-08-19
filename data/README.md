# 📦 Dalbran Distribuidora - Sistema de Catálogo e Orçamentos PWA

Sistema web leve, responsivo e instalável (PWA) desenvolvido em **Vanilla JS** e **Firebase** para gestão de catálogo de produtos, orçamentos rápidos (atacado/varejo), impressão de cupons térmicos e integração direta com WhatsApp.

---

## 🚀 Principais Funcionalidades

* 🔐 **Autenticação:** Login seguro via Firebase Auth.
* 📦 **Gestão de Produtos (CRUD):**
  * Cadastro de produtos com múltiplas variações de volume/unidade.
  * Múltiplas fragrâncias associadas por variação.
  * Tabela dupla de preços (Atacado e Varejo).
  * Edição rápida de preços diretamente na tabela.
  * Importação e exportação em formato JSON.
* 📝 **Motor de Orçamentos:**
  * Seleção rápida de produto, volume, fragrância e tabela de preço.
  * Cálculo dinâmico de descontos e taxas de cartão (débito/crédito).
  * Formatação automática e envio via WhatsApp em 1 clique.
  * Impressão otimizada de cupom não fiscal para impressoras térmicas (80mm).
* ⚙️ **Configurações Centralizadas:**
  * Dados cadastrais da empresa (Razão Social, CNPJ, Endereço, Telefones).
  * Ajuste de taxas de cartão e prazos de validade.
  * Mensagens personalizadas para cupons e WhatsApp.
* 💾 **Backup & Restore:**
  * Exportação de backup completo do banco de dados em arquivo JSON.
* 📱 **Suporte PWA:**
  * Funciona offline e pode ser instalado no celular ou desktop.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3, JavaScript puro (ES6+ Vanilla).
* **Backend como Serviço:** Firebase (Authentication + Firestore Database).
* **PWA:** Service Worker + Web App Manifest.
* **Ícones & Estilos:** CSS nativo e responsivo (sem frameworks pesados).

---

## 📂 Estrutura de Pastas do Projeto

```text
dalbran-app/
│
├── css/
│   └── style.css            # Estilos globais e responsivos
├── js/
│   ├── firebase.js         # Configuração e inicialização do Firebase
│   ├── auth.js             # Gerenciamento de login e sessão
│   ├── utils.js            # Formatadores monetários e de data
│   ├── produtos.js         # CRUD de produtos e sync Firestore
│   ├── configuracoes.js    # Dados da empresa e regras comerciais
│   ├── orcamento.js        # Carrinho, calculador e gerador de cupom
│   ├── whatsapp.js         # Formatação de texto e link do WhatsApp
│   ├── backup.js           # Exportação e importação de backup
│   └── app.js              # Controlador SPA e roteamento
├── data/
│   └── produtos-iniciais.json # Carga inicial de exemplo
├── index.html              # Estrutura principal SPA
├── manifest.json           # Configuração do PWA
└── sw.js                   # Service Worker para cache offline