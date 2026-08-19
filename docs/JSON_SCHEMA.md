# Padrão JSON de Produtos (Dalbran)

Este schema define como os produtos são estruturados no banco de dados e nos processos de importação/exportação.

## Estrutura Principal (`Product`)
| Campo | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Sim | Gerado pelo Firestore ou UUID na importação |
| `name` | `string` | Sim | Ex: "Desinfetante" |
| `category` | `string` | Não | Ex: "Limpeza Pesada" |
| `active` | `boolean` | Sim | Se `false`, oculta das buscas |
| `variations` | `array` | Sim | Lista de volumes/tamanhos disponíveis |

## Variação (`Variation`)
| Campo | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `volume` | `string` | Sim | Ex: "2L" ou "5Kg" |
| `prices.wholesale` | `number` | Sim | Preço atacado (ex: 2.80) |
| `prices.retail` | `number` | Sim | Preço varejo (ex: 4.50) |
| `fragrances` | `string[]` | Não | Array de strings: `["Lavanda", "Floral"]` |

## Exemplo Completo
```json
{
  "name": "Desinfetante",
  "category": "Líquidos",
  "active": true,
  "variations": [
    {
      "volume": "2L",
      "prices": {
        "wholesale": 2.80,
        "retail": 4.50
      },
      "fragrances": ["Lavanda", "Floral", "Talco"]
    },
    {
      "volume": "5L",
      "prices": {
        "wholesale": 11.70,
        "retail": 15.00
      },
      "fragrances": ["Lavanda", "Eucalipto"]
    }
  ]
}