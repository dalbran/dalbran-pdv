# Dalbran Distribuidora - Arquitetura e Descrição do Projeto

Este documento apresenta a estrutura completa de diretórios e arquivos do sistema comercial da **Dalbran Distribuidora**, seguido por uma explicação detalhada de cada módulo, regras de negócio implementadas e fluxos de funcionamento.

---

## 1. Visão Geral do Sistema

O sistema da Dalbran Distribuidora é uma aplicação web **Single Page Application (SPA)** e **Progressive Web App (PWA)** voltada para controle de produtos, clientes e geração rápida de orçamentos (com formatação de cupom térmico) e compartilhamento via WhatsApp.

### Características Principais:
* **Offline-First:** Utiliza o cache local do Firestore (`enableIndexedDbPersistence`) e um Service Worker para garantir o funcionamento completo mesmo sem conexão de rede.
* **Stack Simples e Eficiente:** Desenvolvido puramente em HTML5, CSS3 vanilla (altamente responsivo) e JavaScript (Vanilla JS), consumindo diretamente os SDKs de compatibilidade do Firebase (Auth e Firestore v10.8.0).
* **Precificação Inteligente:** O preço dos produtos varia automaticamente dependendo do volume (ex: 2L vs 5L) e do tipo de venda (Atacado vs Varejo).

---

## 2. Estrutura de Arquivos em Árvore

Abaixo está o layout físico dos diretórios e arquivos do repositório:

```
dalbran-distribuidora/
├── .vscode/
│   └── launch.json                             # Configurações de depuração do VS Code
├── catalogos/                                  # Catálogos digitais de produtos
│   ├── 2L/                                     # Catálogo específico para produtos de 2 Litros
│   │   ├── images/                             # Imagens dos produtos de 2 Litros
│   │   ├── index.html                          # Estrutura visual do catálogo 2L
│   │   ├── script.js                           # Lógica de renderização e busca do catálogo 2L
│   │   └── styles.css                          # Estilos específicos do catálogo 2L
│   ├── 5L/                                     # Catálogo específico para produtos de 5 Litros
│   │   ├── ... (imagens de produtos de 5L)
│   │   ├── index.html                          # Estrutura visual do catálogo 5L
│   │   ├── script.js                           # Lógica de renderização e busca do catálogo 5L
│   │   └── styles.css                          # Estilos específicos do catálogo 5L
│   ├── catalog-data.js                         # Dados estáticos ou sementes para os catálogos
│   ├── personalizado.css                       # Estilos para o gerador de catálogo customizado
│   ├── personalizado.html                      # Página para geração de catálogo dinâmico
│   └── personalizado.js                        # Regras e filtros para geração do catálogo customizado
├── css/
│   └── style.css                               # Folha de estilo principal da aplicação (temas, responsividade, impressão)
├── data/                                       # Backups de dados e documentações de suporte
│   ├── dalbran-backup-2026-08-12.json          # Cópia de segurança de produtos/clientes em JSON
│   ├── firebase-setup.md                       # Passos manuais para configuração inicial do banco
│   ├── import1.json                            # Arquivo auxiliar para importação de carga de dados
│   ├── produtos-iniciais.json                  # Lista padrão de produtos para semente (seed)
│   ├── produtos_dalbran.json                   # Listagem estática de produtos importados
│   └── README.md                               # Contexto do diretório de dados
├── docs/
│   ├── AI_CONTEXT.md                           # Contexto do sistema e regras de arquitetura para IAs
│   ├── FIREBASE_SETUP.md                       # Manual passo a passo do console do Firebase
│   └── JSON_SCHEMA.md                          # Definição e padrão do JSON de Produtos
├── firebase/
│   └── firestore.rules.js                      # Arquivo local com regras de segurança do Firestore
├── js/                                         # Lógica de script segmentada em módulos
│   ├── app.js                                  # Controlador central: navegação (SPA), temas, conexão
│   ├── auth.js                                 # Autenticação de usuários via Firebase Auth
│   ├── backup.js                               # Importação/exportação de dados em JSON
│   ├── catalogos.js                            # Lógica de gerenciamento de catálogos na SPA
│   ├── clientes.js                             # Operações CRUD para o cadastro de Clientes
│   ├── configuracoes.js                        # Personalização do app (logos, taxas, impressões)
│   ├── firebase.js                             # Inicialização, persistência offline e status do Firebase
│   ├── orcamento.js                            # Lógica do carrinho, cálculo de taxas e impressão de orçamentos
│   ├── produtos.js                             # Operações CRUD e precificação do catálogo de Produtos
│   ├── utils.js                                # Funções utilitárias (formatação monetária, máscaras de input)
│   └── whatsapp.js                             # Formatador de mensagens para exportação para o WhatsApp
├── index.html                                  # Página única (SPA) contendo todas as views estruturais
├── manifest.json                               # Configurações do manifesto PWA para instalação no dispositivo
├── sw.js                                       # Service Worker responsável pelo cache offline de recursos
├── logoweb.png                                 # Arquivos de imagem de logo
├── logoweb2.png
├── logodash.png
├── logodash (1).png
└── README.md                                   # Instruções gerais de instalação e execução
```

---

## 3. Esquema de Texto (Descrição dos Módulos)

Abaixo estão detalhados os papéis desempenhados por cada arquivo na execução e manutenção do sistema.

### 3.1. Núcleo da Aplicação (Raiz)
* **`index.html`**
  Contém todo o esqueleto HTML da aplicação. Sendo uma SPA, possui múltiplas seções marcadas com classes `.view-content` que são exibidas/ocultadas dinamicamente. Abriga o formulário de login e as seções de Dashboard, Produtos, Clientes, Orçamento, Vendas, Catálogos e Configurações. Carrega os scripts do Firebase e as folhas de estilo.
* **`manifest.json`**
  Torna a aplicação instalável como PWA em smartphones e computadores. Configura nome, cores do tema, modo de exibição standalone e caminhos dos ícones.
* **`sw.js`**
  O Service Worker intercepta requisições de rede. Ele faz o cache das páginas HTML, CSS, JavaScript e imagens locais para assegurar que a interface carregue instantaneamente mesmo se o dispositivo estiver desconectado da internet.

### 3.2. Módulos JavaScript (`js/`)
* **`app.js`**
  Gerencia a navegação entre as abas da SPA (ocultando e exibindo containers), lida com preferências visuais do usuário (modo escuro/claro e tamanho de fonte) e monitora a alteração no estado de conexão de rede, exibindo toasts de alerta.
* **`firebase.js`**
  Configura e inicia a instância do Firebase Client. Ativa a persistência local do Firestore no navegador (`enableIndexedDbPersistence`) para permitir leitura e escrita em modo offline com sincronização automática subsequente ao restabelecer internet.
* **`auth.js`**
  Gerencia a sessão do usuário administrativo. Controla eventos de login via formulário e logout, atualizando a interface gráfica com base na mudança de estado de autenticação (`onAuthStateChanged`).
* **`produtos.js`**
  Encapsula toda a lógica de gerenciamento de produtos no banco. Inclui criação, edição, arquivamento (ativo/inativo) e listagem. Controla a estrutura complexa das variações de volume (2L, 5L, etc.), fragrâncias associadas e valores diferenciados de atacado e varejo.
* **`clientes.js`**
  Realiza o CRUD de clientes (Nome, telefone, endereço, CPF/CNPJ). Estes dados são integrados diretamente ao gerador de orçamentos para preenchimento de cabeçalho.
* **`orcamento.js`**
  O "coração" operacional do sistema. Gerencia o carrinho de compras do orçamento em andamento. Permite:
  1. Adicionar produtos especificando variação (volume) e fragrância.
  2. Escolher a tabela de preços aplicável (Atacado ou Varejo).
  3. Modificar manualmente o valor unitário no carrinho para aquela venda específica (sem alterar o cadastro original).
  4. Adicionar opcionalmente taxas de cartão de crédito/débito configuráveis.
  5. Imprimir ou gerar PDF simulando um cupom não-fiscal de impressora térmica.
* **`configuracoes.js`**
  Permite customizar variáveis globais como o nome da distribuidora nos cabeçalhos, upload de logotipo customizado (convertido em Base64 ou URL), rodapés de impressão e porcentagens pré-configuradas para taxas de cartões.
* **`backup.js`**
  Fornece uma camada de segurança extra local, permitindo exportar todos os produtos e clientes cadastrados no Firestore em um arquivo `.json` baixável, bem como realizar a restauração completa a partir desse arquivo.
* **`whatsapp.js`**
  Monta uma string de texto estruturada e amigável contendo o resumo dos produtos do orçamento, valores unitários, totais, taxas de pagamento e link de contato, abrindo uma aba do WhatsApp com a mensagem pronta.
* **`utils.js`**
  Centraliza utilitários como máscaras de CNPJ/CPF, validação de telefone brasileiro e formatação monetária (ex: `number` para `R$ X,XX`).

### 3.3. Catálogos Digitais (`catalogos/`)
* **`2L/` e `5L/`**
  Páginas independentes criadas com foco em velocidade de acesso para os clientes finais. Apresentam um design de grade limpo contendo as fotos dos produtos, fragrâncias disponíveis e preços.
* **`personalizado.html`**
  Permite gerar folhas ou catálogos digitais customizados para clientes, filtrando categorias ou aplicando regras específicas de preços para impressão ou compartilhamento de links.

---

## 4. Regras de Negócio Críticas Aplicadas no Código

Para manutenção ou expansões futuras, estas regras essenciais devem ser respeitadas:

1. **Dinheiro e Moeda:**
   * Todos os valores monetários são gravados estritamente como `number` com casas decimais (ex: `15.90`) no Firestore.
   * Formatações como `"R$ 15,90"` ocorrem somente na renderização final da UI.
2. **Edição do Orçamento:**
   * Quando um produto é inserido no orçamento, o preço inicial é sugerido com base na tabela ativa (Atacado/Varejo). No entanto, o vendedor pode digitar um novo preço unitário. Essa alteração é mantida **apenas localmente no array do orçamento ativo** e não atinge o preço cadastrado no banco Firestore.
3. **Fragrâncias:**
   * São atributos puramente cosméticos (ex: Lavanda, Floral, Neutro). **Nenhuma** fragrância pode ter preço diferenciado dentro da mesma variação de volume.
4. **Resiliência Offline:**
   * O sistema foi arquitetado para não bloquear o fluxo de trabalho do vendedor em zonas sem sinal. Gravações são guardadas no cache IndexedDB do navegador e enviadas silenciosamente ao Firestore quando o sinal é recuperado.
