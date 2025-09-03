# Sistema Unificado de Mapeamento de Status

**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## Visão Geral

O Sistema Unificado de Mapeamento de Status foi implementado para resolver inconsistências entre os estados nomeados do frontend e os códigos numéricos da API do ServiceNow, garantindo sincronização perfeita entre interface e backend.

## Problema Resolvido

**Antes da implementação:**
- Múltiplas funções duplicadas para mapeamento de status (`getStateLabel`, `getStateColor`)
- Inconsistências entre frontend (estados nomeados) e backend (códigos numéricos)
- Tickets "designated" não apareciam corretamente (mapeamento incorreto para código 18)
- Código repetitivo e difícil manutenção

**Após a implementação:**
- Sistema centralizado e unificado
- Mapeamento bidirecional consistente
- Sincronização perfeita frontend-backend
- Código DRY (Don't Repeat Yourself)

## Arquitetura do Sistema

### Interface StatusConfig
```typescript
interface StatusConfig {
  label: string;        // Rótulo em português
  color: string;        // Classe CSS de cor do texto
  bgColor: string;      // Classes CSS do background e borda
  numericCode: string;  // Código numérico da API ServiceNow
}
```

### Mapa Unificado (UNIFIED_STATUS_MAP)
```typescript
const UNIFIED_STATUS_MAP: Record<string, StatusConfig> = {
  // Estados nomeados (frontend)
  'new': {
    label: 'Novo',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    numericCode: '1'
  },
  'in_progress': {
    label: 'Em Andamento',
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    numericCode: '2'
  },
  'designated': {
    label: 'Designado',
    color: 'text-indigo-300',
    bgColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    numericCode: '18'
  },
  'waiting': {
    label: 'Em Espera',
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    numericCode: '3'
  },
  'resolved': {
    label: 'Resolvido',
    color: 'text-green-300',
    bgColor: 'bg-green-500/20 text-green-300 border-green-500/30',
    numericCode: '6'
  },
  'closed': {
    label: 'Fechado',
    color: 'text-gray-300',
    bgColor: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    numericCode: '7'
  },
  'cancelled': {
    label: 'Cancelado',
    color: 'text-red-300',
    bgColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    numericCode: '8'
  },
  
  // Códigos numéricos (ServiceNow API)
  '1': { /* mesmo config que 'new' */ },
  '2': { /* mesmo config que 'in_progress' */ },
  '18': { /* mesmo config que 'designated' */ },
  '3': { /* mesmo config que 'waiting' */ },
  '6': { /* mesmo config que 'resolved' */ },
  '7': { /* mesmo config que 'closed' */ },
  '8': { /* mesmo config que 'cancelled' */ }
};
```

## Funções do Sistema

### getUnifiedStatusConfig(state: string): StatusConfig
Obtém configuração completa de um estado.

**Parâmetros:**
- `state`: Estado nomeado ou código numérico

**Retorno:** 
- Objeto `StatusConfig` com label, cores e código numérico

**Exemplo:**
```typescript
const config = getUnifiedStatusConfig('designated');
// Retorna: { label: 'Designado', color: 'text-indigo-300', ... }
```

### stateToNumeric(namedState: string): string
Converte estado nomeado para código numérico da API ServiceNow.

**Parâmetros:**
- `namedState`: Nome do estado (ex: 'waiting', 'designated')

**Retorno:**
- Código numérico correspondente (ex: '3', '18')

**Logging:**
- Registra conversões: `🔄 State mapping: waiting → 3 (Em Espera)`

**Exemplo:**
```typescript
const numericCode = stateToNumeric('designated');
// Retorna: '18'
// Log: 🔄 State mapping: designated → 18 (Designado)
```

## Mapeamento Estado ↔ Código

| Estado Nomeado | Código ServiceNow | Label PT-BR | Cor Principal |
|----------------|-------------------|-------------|---------------|
| `new`          | `1`               | Novo        | Azul          |
| `in_progress`  | `2`               | Em Andamento | Amarelo      |
| `designated`   | `18`              | Designado   | Índigo        |
| `waiting`      | `3`               | Em Espera   | Laranja       |
| `resolved`     | `6`               | Resolvido   | Verde         |
| `closed`       | `7`               | Fechado     | Cinza         |
| `cancelled`    | `8`               | Cancelado   | Vermelho      |

## Integração com HTMX

### Lazy Loading de Tickets
```typescript
// Frontend envia estado nomeado
hx-get="/dashboard/tickets/lazy?state=waiting&group=all"

// Backend converte para API ServiceNow
const stateValue = stateToNumeric('waiting'); // '3'
```

### Renderização de Cards
```typescript
const config = getUnifiedStatusConfig(ticket.state);
// Usa config.bgColor para styling, config.label para display
```

## Logging e Debug

O sistema inclui logging detalhado para debug:

```
🔄 State mapping: waiting → 3 (Em Espera)
🔄 State mapping: designated → 18 (Designado)
🔄 State mapping: in_progress → 2 (Em Andamento)
```

**Formato:** `🔄 State mapping: ${namedState} → ${numericCode} (${label})`

## Benefícios da Implementação

### ✅ Consistência
- Mapeamento único e centralizado
- Eliminação de duplicação de código
- Sincronização garantida frontend-backend

### ✅ Manutenibilidade
- Alterações em um local único
- Código mais limpo e organizado
- Fácil adição de novos estados

### ✅ Debug
- Logging completo de conversões
- Rastreabilidade de mapeamentos
- Identificação rápida de problemas

### ✅ Performance
- Acesso O(1) ao mapeamento
- Eliminação de código duplicado
- Redução do bundle size

## Migração Realizada

### Funções Removidas
- `getStateLabel()` (múltiplas instâncias)
- `getStateColor()` (múltiplas instâncias)
- `getPriorityColor()` (duplicatas removidas)
- Mapas de estado inline espalhados pelo código

### Funções Adicionadas
- `getUnifiedStatusConfig()`
- `stateToNumeric()`
- `UNIFIED_STATUS_MAP` centralizado

## Arquivo Principal

**Localização:** `/src/web/htmx-dashboard-clean.ts`

**Linhas:** 65-140 (sistema unificado implementado após imports)

## Teste e Validação

### ✅ Teste Manual Realizado
- Servidor reiniciado com sucesso
- Logs confirmam mapeamento correto: `🔄 State mapping: waiting → 3`
- Interface renderizando corretamente
- Filtros funcionando com sincronização

### ✅ Casos de Teste Validados
- Estado 'waiting' → código '3' ✓
- Estado 'designated' → código '18' ✓ 
- Estados bidirecionais funcionando ✓
- Fallbacks para estados desconhecidos ✓

## Próximos Passos

1. **Implementar melhorias avançadas na modal** (próxima tarefa)
2. Considerar extensão para outros tipos de tickets (CTasks, SCTasks)
3. Adicionar testes automatizados para o sistema de mapeamento

---

**Data de Implementação:** 2025-09-03  
**Status:** ✅ Implementado e Testado  
**Impacto:** Resolução completa dos problemas de sincronização status frontend-backend