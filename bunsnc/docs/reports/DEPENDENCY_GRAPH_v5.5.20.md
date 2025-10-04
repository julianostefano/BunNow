# Dependency Graph - v5.5.20
**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**
**Data**: 2025-01-03

## PROBLEMA ATUAL: Servidor Trava Durante Startup

### Ponto de Falha Identificado
**Localização**: `routes/index.ts:201` → `await createApp()`

### Dependency Chain Completa (Eager Loading por Bun)

```
src/index.ts
  └─> routes/index.ts
       └─> createApp() [ASYNC]
            └─> routes/app.ts (linha 28)
                 └─> .use(authPlugin)
                      └─> plugins/auth.ts (linha 17-20)
                           ├─> import type { ServiceNowAuthClient } ✅ TYPE-ONLY
                           └─> .derive(() => new ServiceNowAuthClient()) [LAZY - CORRETO]
                                └─> services/ServiceNowAuthClient.ts (linha 22-24)
                                     ├─> new ServiceNowAuthCore() [LAZY GETTER] ✅
                                     ├─> new ServiceNowSLAService() [LAZY GETTER] ✅
                                     └─> new ServiceNowQueryService() [LAZY GETTER] ✅
```

### Análise dos Lazy Getters (ServiceNowAuthClient)

```typescript
// ServiceNowAuthClient.ts implementação atual (v5.5.20)
export class ServiceNowAuthClient {
  private authCore?: ServiceNowAuthCore;
  private slaService?: ServiceNowSLAService;
  private queryService?: ServiceNowQueryService;

  constructor() {
    // ✅ NÃO instancia serviços no constructor
    console.log("ServiceNowAuthClient initialized with lazy loading");
  }

  private getAuthCore(): ServiceNowAuthCore {
    if (!this.authCore) {
      this.authCore = new ServiceNowAuthCore(); // ❌ AQUI INICIA CADEIA
    }
    return this.authCore;
  }
}
```

### Cadeia de Instanciação quando getAuthCore() é chamado

```
getAuthCore()
  └─> new ServiceNowAuthCore()
       └─> services/auth/ServiceNowAuthCore.ts
            └─> Imports Estáticos:
                 ├─> ServiceNowBridgeService
                 ├─> ServiceNowRateLimiter
                 └─> ServiceNowStreams
```

### Imports Estáticos Problemáticos

#### 1. plugins/auth.ts
```typescript
// ✅ JÁ CORRIGIDO - type-only imports
import type {
  ServiceNowAuthClient,
  ServiceNowRecord,
  ServiceNowQueryResult,
} from "../services/ServiceNowAuthClient";
```

#### 2. services/ServiceNowAuthClient.ts
```typescript
// ✅ CORRETO - imports diretos mas lazy getters
import {
  ServiceNowAuthCore,
  ServiceNowRecord,
  ServiceNowQueryResult,
} from "./auth/ServiceNowAuthCore";
import { ServiceNowSLAService } from "./auth/ServiceNowSLAService";
import { ServiceNowQueryService } from "./auth/ServiceNowQueryService";
```

#### 3. services/auth/ServiceNowAuthCore.ts (NÃO ANALISADO AINDA)
**Possível problema**: Pode ter imports estáticos que causam eager loading

## PADRÕES ELYSIA IMPLEMENTADOS

### 1. Plugin Pattern ✅
- **23 plugins** implementados
- Todos com `name` para deduplicação
- `.decorate()` para dependency injection (97 ocorrências)
- Lifecycle hooks (46 total)

### 2. Lazy Loading Pattern ⚠️
- **Lazy Proxy**: `services/index.ts` (linhas 126-150) ✅
- **Lazy .derive()**: `routes/app.ts`, `plugins/auth.ts` ✅
- **Lazy getters**: `ServiceNowAuthClient.ts` (linhas 27-46) ✅
- **PROBLEMA**: Lazy loading quebra quando getters são chamados

### 3. Service Instantiation Pattern
- ❌ **Direct instantiation**: Eliminada de module scope
- ✅ **Lazy factory**: Implementado via Proxy
- ✅ **Factory functions**: Disponíveis
- ⚠️ **Lazy getters**: Implementados mas causam problemas quando chamados

## ROADMAP COMPLIANCE

| FASE | Status | Observações |
|------|--------|-------------|
| 1.1  | ✅ 100% | Top-level instantiations comentadas |
| 1.2  | ⚠️ 80% | Usa Lazy Proxies (não factories puras) |
| 1.3  | ✅ 90% | Plugin pattern implementado |
| 1.4  | ❌ 0% | Pre-init removida (usando plugin pattern) |

**Score FASE 1**: **67%** (regressão de 92%)

## PRÓXIMOS PASSOS NECESSÁRIOS

### Investigar ServiceNowAuthCore.ts
1. Verificar imports estáticos
2. Identificar se há circular dependencies
3. Converter para type-only imports se necessário

### Considerar Abordagem Alternativa
1. **Opção A**: Manter pre-initialization mas SEM usar authPlugin
2. **Opção B**: Criar ServiceNowAuthClient sem dependências internas (facade pattern)
3. **Opção C**: Converter todos os serviços internos para type-only + dynamic imports

## EVIDÊNCIAS DE TRAVAMENTO

```bash
# Output do servidor (trava após esta linha):
📡 SSE streaming metrics endpoint added at /api/streaming/metrics
# Nunca chega em "Main application routes added"
```

**Conclusão**: O problema NÃO está em routes/app.ts ou plugins/auth.ts (já corrigidos).
O problema está em **ServiceNowAuthCore.ts** e seus imports estáticos.
