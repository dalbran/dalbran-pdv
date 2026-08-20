# AI Context - Dalbran Distribuidora

## Objetivo do Sistema
Aplicação web client-side (PWA) offline-first para geração rápida de orçamentos (tipo cupom térmico) de produtos de limpeza, utilizando precificação variável entre Atacado e Varejo.

## Stack
React, TypeScript, Vite, Firebase (Auth + Firestore), TailwindCSS (UI). Hospedagem no GitHub Pages.

## Regras de Negócio Críticas
1. **Precificação:** O preço baseia-se unicamente na `variação de volume` e no tipo de venda (`Atacado` vs `Varejo`). Fragrâncias são apenas atributos visuais de escolha e **nunca** alteram preço.
2. **Edição no Orçamento:** O preço unitário puxado do banco pode ser sobrescrito manualmente pelo usuário *apenas dentro do escopo do orçamento em andamento*. Não altera o cadastro raiz.
3. **Dinheiro:** Valores financeiros são armazenados estritamente como `number` (ex: 2.90) no Firestore. A formatação `"R$ 2,90"` ocorre APENAS na camada de UI.
4. **Taxas de Cartão:** Aplicadas opcionalmente no fechamento do orçamento sobre o subtotal, gerando um novo `Total`.

## Sincronização e Offline
* O Firestore Web SDK está configurado com `enableIndexedDbPersistence`.
* Todas as chamadas de gravação (`setDoc`, `addDoc`) usam cache local primeiro.
* Nunca sobrescrever dados às cegas; usar timestamps (`updatedAt`).

## Pontos Críticos para IAs no Futuro
* Não adicione backend Node.js. Qualquer feature que exija backend (ex: NF-e, automação de emails em massa) deve ser orientada via Firebase Functions (serverless).
* Cuidado ao modificar o hook de carrinho: ele gerencia a mutabilidade do preço manual versus preço base.