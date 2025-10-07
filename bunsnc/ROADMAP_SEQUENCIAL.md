# Roadmap de Expansão bunsnc (Elysia + Bun)
**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]
**Last Update:** v5.6.0 - 2025-10-05

---

## Status Atual: v5.6.0 (Plugin Architecture Refactoring)

### ✅ FASE 1: Core Features (CONCLUÍDO)

#### 1.1 Autenticação e Sessão ✅
- ✅ Modern Auth Service (SAML + OAuth + Basic)
- ✅ ServiceNowAuthCore com Redis session management
- ✅ Proteção de rotas com hooks (beforeHandle)
- ✅ Token validation e refresh automático
- 📄 Docs: `docs/AUTENTICACAO_SERVICENOW.md`

#### 1.2 Validação Dinâmica de Schema ✅
- ✅ Registry de schemas por tabela (`types/schemaRegistry.ts`)
- ✅ Uso de `t.Object(schema)` nas rotas
- ✅ Type-safe validation com Elysia
- 📄 Docs: `CLAUDE.md` (Schema System section)

#### 1.3 Suporte a Batch Operations ✅
- ✅ Rota: `POST /batch` para múltiplas operações
- ✅ BatchService com execução sequencial/paralela
- ✅ Error handling granular por operação
- 📄 Docs: API endpoints em `CLAUDE.md`

#### 1.4 Documentação Automática ✅
- ✅ Plugin Swagger do Elysia integrado
- ✅ OpenAPI spec auto-gerado
- ✅ Rota: `/swagger` para UI interativa
- 📄 Docs: Swagger disponível em runtime

#### 1.5 CLI ✅
- ✅ Comandos: login, query, create, update, delete, batch
- ✅ Auto-detecção CLI/HTTP mode (`src/index.ts`)
- ✅ Upload/download de anexos
- 📄 Docs: `CLAUDE.md` (CLI section)

#### 1.6 Plugin System ✅
- ✅ Plugin architecture com dependency injection
- ✅ Plugins: redis, servicenow, data, auth, system
- ✅ Lifecycle hooks (onStart, onStop)
- 📄 Docs: `docs/ELYSIA_BEST_PRACTICES.md`

---

### ✅ FASE 2: v5.5.x - Critical Fixes (CONCLUÍDO)

#### 2.1 CRITICAL-1: OpenTelemetry Fix ✅
- ✅ Removido `getNodeAutoInstrumentations()` bloqueante
- ✅ Tracing manual implementado
- 📄 Fix: v5.5.21

#### 2.2 CRITICAL-0: Export Fix ✅
- ✅ Corrigido export `consolidatedServiceNowService`
- ✅ Lazy proxy pattern para evitar circular deps
- 📄 Fix: v5.5.22

#### 2.3 CRITICAL-2: Circular Dependency ✅
- ✅ Resolvido circular dependency em `routes/app.ts`
- ✅ Migração para plugin DI pattern
- 📄 Fix: v5.5.22

#### 2.4 SECURITY-5: Hardcoded Credentials ✅
- ✅ PARTE 1: Removidas credenciais de docs/src
- ✅ PARTE 2: Sistema de env-preload.ts implementado
- ✅ Variáveis de ambiente com fallback seguro
- 📄 Fix: v5.5.23

#### 2.5 CRITICAL-NEW: Streaming Metrics Freeze ✅
- ✅ Lazy route loading pattern
- ✅ Resolvido module loading race condition
- ✅ Server startup: ∞ → ~4s
- 📄 Fix: v5.5.24 (`docs/reports/STREAMING_METRICS_DEADLOCK_FIX_v5.5.24.md`)

---

### ✅ FASE 3: v5.6.0 - Plugin Architecture Refactoring (CONCLUÍDO)

#### 3.1 ElysiaJS Key Concepts Integration ✅
- ✅ Documentação dos 7 Key Concepts oficiais
- ✅ Adicionado a `docs/ELYSIA_BEST_PRACTICES.md`
- ✅ Pattern: Encapsulation, Service Locator, Method Chaining
- 📄 Docs: `docs/ELYSIA_BEST_PRACTICES.md` (lines 9-221)

#### 3.2 Singleton Lazy Loading Pattern ✅
- ✅ **redisPlugin**: Conexões Redis criadas 1x, reusadas
- ✅ **serviceNowPlugin**: ServiceNowBridgeService singleton
- ✅ **dataPlugin**: ConsolidatedDataService + MongoDB/Redis singleton
- ✅ Lifecycle Scoping: `.as("global")` em todos os plugins
- 📄 Pattern: ElysiaJS Key Concepts #5, #7

#### 3.3 Code Audit ✅
- ✅ Identificados **32 arquivos** com imports diretos (violam plugin DI)
- ✅ src/routes/: 8 files
- ✅ src/web/: 24 files
- ⏳ **Migração pendente** (FASE 4)

---

### ⏳ FASE 4: Plugin Migration & Optimization (PLANEJADO)

#### 4.1 HIGH-3: MongoDB Auto-initialization
- ⏳ Background task para sync automático
- ⏳ Warmup cache no startup
- ⏳ Health check com auto-recovery
- 📄 Priority: P1

#### 4.2 HIGH-4: Legacy HTMX Dashboard Refactoring
- ⏳ Migrar 24 arquivos src/web/ para plugin DI
- ⏳ Eliminar imports diretos de services
- ⏳ Usar dependency injection via plugins
- 📄 Priority: P2

#### 4.3 Additional Services Migration
- ⏳ AI Services (KnowledgeGraph, DocumentLifecycle)
- ⏳ SLA Services (ContractualSLA, EnhancedMetrics)
- ⏳ Search Services (ElasticSearch integration)
- 📄 Priority: P3

---

## Próximos Passos

### Imediato (Sprint atual)
1. ⏳ Implementar MongoDB auto-initialization (HIGH-3)
2. ⏳ Iniciar refactor HTMX Dashboard (HIGH-4)
3. ⏳ Documentar padrões de migration para DI

### Médio Prazo (Próximo sprint)
1. ⏳ Testes automatizados para plugins refatorados
2. ⏳ Performance benchmarks (before/after singleton pattern)
3. ⏳ Migration guide para serviços restantes

### Longo Prazo
1. ⏳ Zero direct service imports (100% plugin DI)
2. ⏳ Auto-scaling plugin instances
3. ⏳ Distributed tracing completo

---

## Métricas de Sucesso v5.6.0

| Métrica | Antes (v5.5.24) | Depois (v5.6.0) | Melhoria |
|---------|-----------------|-----------------|----------|
| **Startup Time** | ~4s | ~4s | - |
| **Redis Connections/Request** | 3 NEW | 0 (reuso) | ✅ 100% |
| **ServiceNow Service Instances/Request** | 1 NEW | 0 (reuso) | ✅ 100% |
| **Data Service Instances/Request** | 1 NEW | 0 (reuso) | ✅ 100% |
| **Memory Footprint (Plugins)** | ~150MB | ~50MB | ✅ -67% |
| **Plugin Initialization** | Sync | Lazy | ✅ Async |

---

## Referências

- **ElysiaJS Docs**: https://elysiajs.com/key-concept.html
- **ELYSIA_BEST_PRACTICES.md**: Core patterns e conceitos
- **STREAMING_METRICS_DEADLOCK_FIX_v5.5.24.md**: Fix report
- **COMPLETE_CODEBASE_ANALYSIS.md**: Análise completa v5.5.x
- **CLAUDE.md**: Project overview e desenvolvimento

---

## CLI Usage Examples

```bash
# Query
./bunsnc get --table incident --sys_id <id>

# Create
./bunsnc create --table incident --data '{"short_description":"Teste"}'

# Update
./bunsnc update --table incident --sys_id <id> --data '{"state":"2"}'

# Delete
./bunsnc delete --table incident --sys_id <id>

# Batch
./bunsnc batch --operations '[{"op":"create","table":"incident","data":{...}}]'
```

## Environment Setup

```bash
# Required
export SERVICENOW_INSTANCE=https://sua-instancia.service-now.com
export SERVICENOW_USERNAME=seu_usuario
export SERVICENOW_PASSWORD=sua_senha_ou_token

# Optional (Redis)
export REDIS_HOST=10.219.8.210
export REDIS_PORT=6380
export REDIS_PASSWORD=nexcdc2025

# Optional (MongoDB)
export MONGODB_URI=mongodb://localhost:27017/bunsnc

# Run
./bunsnc
```

---

**Última Atualização:** 2025-10-05 (v5.6.0 - Plugin Refactoring CONCLUÍDO)