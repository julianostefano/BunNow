# Inventário de Componentes para Migração - BunSNC

**Autor: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## Visão Geral do Sistema

O BunSNC é um sistema complexo de integração ServiceNow com **325 arquivos TypeScript** distribuídos em uma arquitetura modular. Este documento apresenta o inventário completo dos componentes que precisam ser migrados para os padrões Elysia Plugin System.

## Status Atual da Migração

### ✅ MIGRAÇÃO COMPLETA
- **Configuration Manager** → Plugin Elysia implementado
- **Testes Auto-Sync** → 100% de cobertura com 53/53 testes passando
- **Testes de Integração** → Sistema validado com infraestrutura real
- **Pipeline CI/CD** → GitHub Actions completo implementado

### 🔄 EM PROGRESSO
- **Inventário de Componentes** → Este documento

### ⏳ PENDENTE
- **Migração dos Controllers para Plugins**
- **Migração dos Services para DI Pattern**
- **AI Services Integration**
- **UI Components Migration**

## Estrutura de Diretórios (98 diretórios)

```
src/
├── api/                          # APIs externas
├── background/                   # Processamento background
├── benchmarks/                   # Testes de performance
├── bigdata/                      # Componentes Big Data
│   ├── hadoop/                   # Integração Hadoop
│   ├── opensearch/               # Integração OpenSearch
│   ├── parquet/                  # Processamento Parquet
│   ├── pipeline/                 # Pipeline de dados
│   ├── redis/                    # Redis Streams
│   └── streaming/                # Streaming de dados
├── cli/                          # Interface CLI
├── client/                       # Clientes HTTP
├── config/                       # Configurações
├── controllers/                  # 🔥 ALTA PRIORIDADE
│   ├── ai/                       # Controllers AI
│   └── web/                      # Controllers Web
├── models/                       # Modelos de dados
├── modules/                      # Módulos específicos
├── notifications/                # Sistema de notificações
├── plugins/                      # 🔥 ALTA PRIORIDADE
├── realtime/                     # Funcionalidades real-time
├── repositories/                 # Camada de dados
├── routes/                       # 🔥 ALTA PRIORIDADE
├── schemas/                      # Validações e esquemas
├── services/                     # 🔥 ALTA PRIORIDADE
│   ├── ai/                       # Serviços AI
│   ├── auth/                     # Autenticação
│   ├── storage/                  # Armazenamento
│   ├── streaming/                # Streaming
│   ├── sync/                     # Sincronização
│   ├── system/                   # Sistema
│   └── ticket/                   # Gestão de tickets
├── tests/                        # 🔥 ALTA PRIORIDADE
├── types/                        # Definições TypeScript
├── utils/                        # Utilitários
├── views/                        # Templates
└── web/                          # 🔥 ALTA PRIORIDADE
    ├── components/               # Componentes UI
    ├── hooks/                    # React Hooks
    ├── layouts/                  # Layouts
    ├── middleware/               # Middleware Web
    ├── routes/                   # Rotas Web
    │   ├── admin/
    │   ├── api/
    │   ├── auth/
    │   ├── components/
    │   ├── dashboard/
    │   ├── events/
    │   ├── pages/
    │   └── real-time/
    ├── services/                 # Serviços Web
    ├── templates/                # Templates HTML
    └── utils/                    # Utilitários Web
```

## 🔥 COMPONENTES CRÍTICOS PARA MIGRAÇÃO

### 1. CONTROLLERS (11 arquivos) - ALTA PRIORIDADE

#### Controllers Principais
- **APIController.ts** (19.3KB) - Controller principal da API
- **TicketController.ts** (14.0KB) - Gestão de tickets
- **DashboardController.ts** (22.8KB) - Dashboard principal
- **WebServerController.ts** (12.2KB) - Servidor web
- **attachmentController.ts** (14.7KB) - Anexos
- **StreamingController.ts** (4.2KB) - Streaming em tempo real
- **EnhancedTicketController.ts** (3.4KB) - Tickets avançados
- **recordController.ts** (1.5KB) - Registros
- **syncController.ts** (0.3KB) - Sincronização

#### Controllers AI
- **ai/TicketAnalysisController.ts** - Análise de tickets com IA
- **ai/DocumentIntelligenceController.ts** - Inteligência documental

#### Controllers Web
- **web/MetricsController.ts** - Métricas web
- **web/SearchController.ts** - Busca avançada

### 2. SERVICES (35+ arquivos) - ALTA PRIORIDADE

#### Services Core
- **ConsolidatedDataService.ts** (30.2KB) - Serviço de dados principal
- **ConsolidatedServiceNowService.ts** (30.8KB) - ServiceNow integração
- **ServiceNowFetchClient.ts** (18.5KB) - Cliente HTTP ServiceNow
- **ConsolidatedBusinessLogicService.ts** (23.6KB) - Lógica de negócio
- **TicketSearchService.ts** (12.2KB) - Busca de tickets
- **ServiceNowBridgeService.ts** (12.2KB) - Bridge ServiceNow
- **SystemService.ts** (13.9KB) - Serviços de sistema
- **NeuralSearchService.ts** (17.2KB) - Busca neural
- **SynonymService.ts** (13.7KB) - Sinônimos
- **EnhancedMetricsService.ts** (20.3KB) - Métricas avançadas
- **CircuitBreaker.ts** (6.7KB) - Circuit breaker
- **ServiceNowRateLimit.ts** (11.9KB) - Rate limiting
- **ServiceNowAuthClient.ts** (7.4KB) - Cliente autenticação

#### Services Especializados
- **ContractualSLAService.ts** (12.4KB) - SLA contratual
- **ContractualViolationService.ts** (19.2KB) - Violações contratuais
- **SecurityService.ts** (5.6KB) - Segurança
- **UnifiedStreamingService.ts** (4.7KB) - Streaming unificado

#### Services por Categoria
- **auth/** (4 arquivos) - Autenticação e autorização
- **ai/** (arquivos) - Serviços de IA
- **storage/** (arquivos) - Armazenamento
- **streaming/** (4 arquivos) - Streaming de dados
- **sync/** (2 arquivos) - Sincronização
- **system/** (4 arquivos) - Sistema
- **ticket/** (3 arquivos) - Gestão de tickets

### 3. WEB COMPONENTS - ALTA PRIORIDADE

#### Frontend Infrastructure
- **web/server.ts** - Servidor web principal
- **web/components/** - Componentes React/UI
- **web/hooks/** - React Hooks customizados
- **web/layouts/** - Layouts da aplicação
- **web/middleware/** - Middleware web
- **web/routes/** (7 subdiretórios) - Sistema de rotas
- **web/services/** - Serviços frontend
- **web/templates/** - Templates HTML

### 4. AI SERVICES - MÉDIA PRIORIDADE

#### Serviços de IA
- **services/ai/** - Serviços de inteligência artificial
- **controllers/ai/** - Controllers para IA
- Integração com processamento neural
- Análise de documentos e tickets

### 5. BIG DATA COMPONENTS - MÉDIA PRIORIDADE

#### Componentes Big Data
- **bigdata/hadoop/** - Integração Hadoop
- **bigdata/opensearch/** - OpenSearch integration
- **bigdata/parquet/** - Processamento Parquet
- **bigdata/pipeline/** - Pipeline de dados
- **bigdata/redis/** - Redis Streams
- **bigdata/streaming/** - Streaming massivo

## ESTRATÉGIA DE MIGRAÇÃO

### FASE 1: Controllers → Elysia Plugins ✅ COMPLETA
- [x] Configuration Manager migrado
- [x] Testes implementados
- [x] CI/CD configurado

### FASE 2: Core Services Migration
**Prioridade:** CRÍTICA
**Estimativa:** 2-3 semanas
- [ ] ConsolidatedDataService → Plugin
- [ ] ConsolidatedServiceNowService → Plugin
- [ ] ServiceNowFetchClient → Plugin
- [ ] AuthServices → Plugin
- [ ] SystemService → Plugin

### FASE 3: Controllers Migration
**Prioridade:** ALTA
**Estimativa:** 2 semanas
- [ ] APIController → Plugin
- [ ] TicketController → Plugin
- [ ] DashboardController → Plugin
- [ ] WebServerController → Plugin
- [ ] AI Controllers → Plugins

### FASE 4: Web Components
**Prioridade:** ALTA
**Estimativa:** 3-4 semanas
- [ ] Web Routes → Elysia Routes
- [ ] Web Services → Plugins
- [ ] Components → Elysia Compatible
- [ ] Middleware → Elysia Middleware

### FASE 5: Specialized Services
**Prioridade:** MÉDIA
**Estimativa:** 2-3 semanas
- [ ] AI Services → Plugins
- [ ] BigData Components → Plugins
- [ ] Streaming Services → Plugins
- [ ] Storage Services → Plugins

### FASE 6: Testing & Optimization
**Prioridade:** CRÍTICA
**Estimativa:** 1-2 semanas
- [ ] Migration Testing
- [ ] Performance Optimization
- [ ] Security Validation
- [ ] Documentation Update

## DEPENDÊNCIAS CRÍTICAS

### Infraestrutura
- **Redis** (10.219.8.210:6380) - Streams e Cache
- **MongoDB** (10.219.8.210:27018) - Persistência
- **ServiceNow** (iberdrola.service-now.com) - API externa
- **OpenSearch** (10.219.8.210:9200) - Busca avançada

### Tecnologias
- **Bun Runtime** - JavaScript runtime
- **Elysia Framework** - Web framework
- **TypeScript** - Linguagem principal
- **Redis Streams** - Event streaming
- **MongoDB** - Base de dados

## ANTI-PATTERNS IDENTIFICADOS

### Problemas a Corrigir
1. **Singleton Overuse** - Múltiplos singletons devem virar plugins
2. **Tight Coupling** - Services acoplados devem usar DI
3. **Global State** - Estado global deve ser gerenciado via plugins
4. **Mixed Responsibilities** - Separar concerns em plugins específicos

### Padrões Elysia a Implementar
1. **Separate Instance Method** - Um controller = uma instância
2. **Plugin Composition** - Composição via plugins
3. **Dependency Injection** - Via `.derive()` e `.decorate()`
4. **Hot Reload Support** - Plugins devem suportar hot reload

## MÉTRICAS DO PROJETO

- **Total Arquivos TypeScript:** 325
- **Controllers:** 11 (+2 AI)
- **Services:** 35+
- **Web Components:** 50+
- **Test Files:** 50+
- **Estimated Migration Time:** 10-14 semanas
- **Critical Path:** Services → Controllers → Web → AI

## PRÓXIMOS PASSOS

1. **IMEDIATO:** Commit do pipeline CI/CD
2. **SEMANA 1:** Iniciar migração ConsolidatedDataService
3. **SEMANA 2:** Migrar ServiceNowFetchClient e AuthServices
4. **SEMANA 3-4:** Controllers principais
5. **SEMANA 5-8:** Web components
6. **SEMANA 9-12:** AI e BigData services
7. **SEMANA 13-14:** Testing e otimização final

---

**Status:** 📊 Inventário Completo
**Última Atualização:** 28/09/2025
**Próxima Revisão:** Início da FASE 2