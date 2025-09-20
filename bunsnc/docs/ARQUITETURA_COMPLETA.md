# BunSNC - Arquitetura Completa do Sistema
**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## 📋 Visão Geral

Este documento detalha a arquitetura completa do BunSNC, um sistema de integração ServiceNow construído com Bun + Elysia, otimizado para performance máxima e processamento real-time.

## 🏗️ Arquitetura do Sistema

### Stack Tecnológico Principal
- **Runtime**: Bun (JavaScript/TypeScript ultra-rápido)
- **Framework**: Elysia (HTTP framework para Bun)
- **Database**: PostgreSQL (Bun native connection + pooling)
- **Cache/Streams**: Redis (aioredis para streams real-time)
- **Frontend**: HTMX (máxima performance UI)
- **Logs**: FluentD distribuído
- **Big Data**: Hadoop Cluster

### Infraestrutura de Produção
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ServiceNow    │ ←→ │     BunSNC       │ ←→ │   PostgreSQL    │
│  (Rate Limited) │    │   (Bun+Elysia)   │    │   (Vector DB)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              ↕️
                    ┌──────────────────┐
                    │   Redis Streams  │
                    │  (Real-time)     │
                    └──────────────────┘
                              ↕️
                    ┌──────────────────┐
                    │ Hadoop Cluster   │
                    │ (Big Data)       │ 
                    └──────────────────┘
```

## 🔧 Configurações de Environment

### Infraestrutura Identificada
```env
# Redis/KeyDB Connection (Cache & Session Storage)
REDIS_URL=redis://default:nexcdc2025@10.219.8.210:6380/1
REDIS_HOST=10.219.8.210
REDIS_PORT=6380
REDIS_PASSWORD=nexcdc2025
REDIS_DB=1
REDIS_STREAMS_KEY=servicenow:changes

# PostgreSQL Vector Database (Bun Native)
DATABASE_URL=postgresql://nexcdc:nexcdc_2025@10.219.8.210:5432/vector
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# ServiceNow Authentication Service
AUTH_SERVICE_URL=http://10.219.8.210:8000/auth
SERVICENOW_RATE_LIMIT=95
SERVICENOW_MAX_CONCURRENT=18
SERVICENOW_BATCH_SIZE=100

# Hadoop Cluster (Ports Identified)
HADOOP_NAMENODE_URL=http://10.219.8.210:9870
HADOOP_RESOURCEMANAGER_URL=http://10.219.8.210:8088  
HADOOP_FILESYSTEM_URL=hdfs://10.219.8.210:9000
HADOOP_DATANODE_1=http://10.219.8.210:19864
HADOOP_DATANODE_2=http://10.219.8.210:29864
HADOOP_DATANODE_3=http://10.219.8.210:39864

# OpenSearch Analytics
OPENSEARCH_URL=https://10.219.8.210:9200
OPENSEARCH_USER=admin
OPENSEARCH_PASSWORD=admin

# Fluentd Logging
FLUENTD_HOST=10.219.8.210
FLUENTD_PORT=24224

# Performance Tuning
CACHE_TTL=300
STREAM_BUFFER_SIZE=1000
WS_MAX_CONNECTIONS=1000
SSE_MAX_STREAMS=500
```

## 📊 ServiceNow Status Mapping

### Análise dos Scripts Existentes

#### **Incidents (sn_incidents_collection)**
Estados coletados pelos scripts Python existentes:
- **1**: Novo
- **2**: Em Andamento  
- **3**: Em Espera
- **4**: Aguardando Aprovação
- **5**: Aguardando Fornecedor
- **6**: Resolvido ✅ (removido do sistema atual)
- **7**: Fechado ✅ (removido do sistema atual) 
- **8**: Cancelado ✅ (removido do sistema atual)

**Linha 621-626 incident_jsonb.py**: Estados 6,7,8 são removidos via cleanup
```python
# Estados para remover: 6=Resolved, 7=Closed, 8=Cancelled
result = conn.execute(
    text(f"""
    DELETE FROM {self.collection_name}
    WHERE data->'incident'->>'state' IN ('6', '7', '8')
""")
```

#### **Change Tasks (sn_ctasks_collection)** 
Todos os estados coletados (linha 81 ctask_jsonb.py):
- **1**: Pending
- **2**: Open
- **3**: Work in Progress
- **4**: Closed Complete ✅
- **7**: Closed Skipped ✅
- **8**: Closed Incomplete ✅

#### **Service Catalog Tasks (sn_sctasks_collection)**
Todos os estados coletados:
- **1**: Pending
- **2**: Open  
- **3**: Work in Progress
- **4**: Closed Complete ✅
- **7**: Closed Skipped ✅

## 🚀 Limites e Performance ServiceNow

### Rate Limiting (Documentação Oficial ServiceNow)
- **Request Rate**: 100 requests por segundo por usuário/sessão
- **Concurrent Connections**: Máximo 20 conexões simultâneas por usuário  
- **Implementação**: Rate limiter com margin de segurança (25 req/sec)
- **Best Practice**: Exponential backoff + connection pooling

### Authentication Pattern (Identificado nos Scripts)
```python
# Pattern usado nos 3 scripts
auth_response = requests.get("http://10.219.8.210:8000/auth", verify=False, timeout=240)
auth_data = auth_response.json()

session = requests.Session()
session.proxies = {
    "http": "AMER%5CE966380:Neoenergia%402025@10.219.77.12:8080",
    "https": "AMER%5CE966380:Neoenergia%402025@10.219.77.12:8080",
}

for cookie in auth_data.get("cookies", []):
    session.cookies.set(name=cookie["name"], value=cookie["value"], ...)

session.headers.update(auth_data.get("headers", {}))
return ServiceNowClient(instance="iberdrola", verify=False, auth=session)
```

## 📝 Queries de Chamados por Status

### Consultas Identificadas nos Scripts

#### **Todos os Chamados Resolvidos/Fechados/Cancelados**
```sql
-- Incidents finalizados (estados que foram removidos dos scripts atuais)
SELECT 
    'incident' as tipo_chamado,
    data->'incident'->>'number' as numero,
    data->'incident'->>'state' as estado_numero,
    CASE 
        WHEN data->'incident'->>'state' = '6' THEN 'Resolvido'
        WHEN data->'incident'->>'state' = '7' THEN 'Fechado'
        WHEN data->'incident'->>'state' = '8' THEN 'Cancelado'
    END as status_portugues,
    data->'incident'->>'short_description' as descricao,
    data->'incident'->>'assignment_group' as grupo_atribuicao,
    data->'incident'->>'closed_at' as data_fechamento
FROM sn_incidents_collection 
WHERE data->'incident'->>'state' IN ('6', '7', '8')

UNION ALL

-- Change Tasks finalizadas  
SELECT 
    'change_task' as tipo_chamado,
    data->'ctask'->>'number' as numero,
    data->'ctask'->>'state' as estado_numero,
    CASE 
        WHEN data->'ctask'->>'state' = '4' THEN 'Fechado Completo'
        WHEN data->'ctask'->>'state' = '7' THEN 'Fechado Pulado'
        WHEN data->'ctask'->>'state' = '8' THEN 'Fechado Incompleto'
    END as status_portugues,
    data->'ctask'->>'short_description' as descricao,
    data->'ctask'->>'assignment_group' as grupo_atribuicao,
    data->'ctask'->>'closed_at' as data_fechamento
FROM sn_ctasks_collection 
WHERE data->'ctask'->>'state' IN ('4', '7', '8')

UNION ALL

-- SC Tasks finalizadas
SELECT 
    'sc_task' as tipo_chamado,
    data->'sctask'->>'number' as numero,
    data->'sctask'->>'state' as estado_numero,
    CASE 
        WHEN data->'sctask'->>'state' = '4' THEN 'Fechado Completo'
        WHEN data->'sctask'->>'state' = '7' THEN 'Fechado Pulado'
    END as status_portugues,
    data->'sctask'->>'short_description' as descricao,
    data->'sctask'->>'assignment_group' as grupo_atribuicao,
    data->'sctask'->>'closed_at' as data_fechamento
FROM sn_sctasks_collection 
WHERE data->'sctask'->>'state' IN ('4', '7')

ORDER BY data_fechamento DESC;
```

#### **Estatísticas por Estado**
```sql
-- Distribuição de todos os estados por tipo de chamado
SELECT 
    tipo_chamado,
    estado_numero,
    status_portugues,
    COUNT(*) as total_chamados,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY tipo_chamado), 2) as percentual
FROM (
    SELECT 'incident' as tipo_chamado, 
           data->'incident'->>'state' as estado_numero,
           CASE 
               WHEN data->'incident'->>'state' = '1' THEN 'Novo'
               WHEN data->'incident'->>'state' = '2' THEN 'Em Andamento'
               WHEN data->'incident'->>'state' = '3' THEN 'Em Espera'
               WHEN data->'incident'->>'state' = '6' THEN 'Resolvido'
               WHEN data->'incident'->>'state' = '7' THEN 'Fechado'
               WHEN data->'incident'->>'state' = '8' THEN 'Cancelado'
               ELSE 'Outros'
           END as status_portugues
    FROM sn_incidents_collection
    
    UNION ALL
    
    SELECT 'change_task' as tipo_chamado,
           data->'ctask'->>'state' as estado_numero,
           CASE 
               WHEN data->'ctask'->>'state' = '1' THEN 'Pending'
               WHEN data->'ctask'->>'state' = '2' THEN 'Open'
               WHEN data->'ctask'->>'state' = '3' THEN 'Work in Progress'
               WHEN data->'ctask'->>'state' = '4' THEN 'Fechado Completo'
               WHEN data->'ctask'->>'state' = '7' THEN 'Fechado Pulado'
               WHEN data->'ctask'->>'state' = '8' THEN 'Fechado Incompleto'
               ELSE 'Outros'
           END as status_portugues
    FROM sn_ctasks_collection
    
    UNION ALL
    
    SELECT 'sc_task' as tipo_chamado,
           data->'sctask'->>'state' as estado_numero,
           CASE 
               WHEN data->'sctask'->>'state' = '1' THEN 'Pending'
               WHEN data->'sctask'->>'state' = '2' THEN 'Open'
               WHEN data->'sctask'->>'state' = '3' THEN 'Work in Progress'
               WHEN data->'sctask'->>'state' = '4' THEN 'Fechado Completo'
               WHEN data->'sctask'->>'state' = '7' THEN 'Fechado Pulado'
               ELSE 'Outros'
           END as status_portugues
    FROM sn_sctasks_collection
) chamados
GROUP BY tipo_chamado, estado_numero, status_portugues
ORDER BY tipo_chamado, total_chamados DESC;
```

## 🔄 Redis Streams Architecture

### Stream Design para ServiceNow
```
servicenow:changes
├── incident:created
├── incident:updated  
├── incident:resolved
├── ctask:created
├── ctask:completed
├── sctask:created
└── sctask:completed
```

### Consumer Groups
```
consumers:
├── notification-service (real-time alerts)
├── analytics-service (metrics calculation)
├── audit-service (change tracking)
└── webhook-service (external integrations)
```

## 🎯 HTMX Performance Patterns

### Real-time Dashboard Updates
```html
<!-- Auto-refresh status counters -->
<div hx-get="/htmx/status/counters" 
     hx-trigger="every 30s, wsMessage" 
     hx-target="#status-counters">
</div>

<!-- Infinite scroll resolved tickets -->
<div hx-get="/htmx/resolved/page/1" 
     hx-trigger="revealed" 
     hx-target="this" 
     hx-swap="afterend">
</div>

<!-- Instant filters -->
<select hx-get="/htmx/filter/incidents" 
        hx-trigger="change" 
        hx-target="#results">
    <option value="6">Resolvidos</option>
    <option value="7">Fechados</option>
    <option value="8">Cancelados</option>
</select>
```

## 📈 Performance Benchmarks

### Targets de Performance
- **API Response**: < 100ms para queries simples
- **Database Queries**: < 50ms com índices otimizados  
- **Real-time Updates**: < 500ms via WebSocket/SSE
- **HTMX Page Updates**: < 200ms render time
- **ServiceNow Rate Limit**: 25 req/sec (margem de segurança)

### Otimizações Implementadas
1. **Bun Native PostgreSQL**: Connection pooling otimizado
2. **Redis Streams**: Real-time processing assíncrono
3. **HTMX**: Zero JavaScript, atualizações DOM diretas
4. **Particionamento**: Tabelas particionadas por sys_id prefix
5. **Índices GIN**: Full-text search com pg_trgm
6. **Rate Limiting**: Exponential backoff para ServiceNow

## 🔐 Security & Compliance

### Authentication Flow
1. BunSNC → Auth Service (http://10.219.8.210:8000/auth)
2. Auth Service → ServiceNow session cookies + headers  
3. Proxy routing através do corporate proxy
4. Session management com refresh automático

### Data Privacy
- Logs estruturados via FluentD
- Dados sensíveis não logados
- Auditoria completa de alterações
- Backup automático PostgreSQL

## 🚀 Deployment Architecture

### Production Stack
```yaml
services:
  bunsnc-api:
    image: oven/bun:latest
    ports: ["3008:3008"]
    environment:
      - DATABASE_URL=postgresql://nexcdc:nexcdc_2025@10.219.8.210:5432/vector
      - REDIS_URL=redis://default:nexcdc2025@10.219.8.210:6380/1
    
  redis-streams:
    image: redis:7-alpine
    ports: ["6380:6380"]
    
  postgresql:  
    image: postgres:15
    environment:
      - POSTGRES_DB=vector
      - POSTGRES_USER=nexcdc
```

## 📋 Roadmap de Implementação

### Fase 1: Core Infrastructure ✅ COMPLETA
- [x] **Notification system completo** - Implementado
- [x] **Database architecture planning** - Finalizada
- [x] **MongoDB integration** - TOTALMENTE IMPLEMENTADA (commit 6aa50a9: 3→1 services)
- [x] **Redis streams configuration** - Configurado e funcional
- [x] **Background sync** - Método startAutoSync implementado

### Fase 2: ServiceNow Integration ✅ COMPLETA
- [x] **Rate limiting service (25 req/sec)** - Implementado
- [x] **Authentication service integration** - NORMALIZADA pelo usuário
- [x] **Status queries optimization** - Queries implementadas
- [x] **Real-time change processing** - Pipeline funcional

### Fase 3: Frontend & Performance ✅ 90% COMPLETA
- [x] **HTMX integration** - Dashboard profissional funcionando
- [x] **Real-time dashboard** - Visual e navegação implementados
- [x] **Performance monitoring** - Otimizado para produção
- [⚠️] **Modal HTMX** - PROBLEMA: endpoint não responde adequadamente
- [⚠️] **Dados reais** - Carregamento mock vs dados dinâmicos

### Fase 4: Advanced Features 🔄 EM PROGRESSO
- [x] **Service consolidation** - 20+ → 5 core services (commit fec4d11)
- [x] **Enhanced storage** - EnhancedTicketStorageService.ts
- [⚠️] **Workflow testing** - Dropdowns implementados, necessita validação
- [x] **API documentation generation** - Swagger implementado

---

**Última atualização**: 2025-01-09  
**Versão do documento**: 1.0  
**Status**: Em desenvolvimento ativo