# BunSNC - Guia de Instalação e Configuração Completa
**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## 🚀 Pré-requisitos

### Software Necessário
- **Bun**: >= 1.0.0 (JavaScript/TypeScript runtime)
- **Node.js**: >= 18.0 (para compatibilidade com ferramentas)
- **PostgreSQL**: >= 13 (banco de dados principal)
- **Redis/KeyDB**: >= 6.0 (cache e streams)
- **Git**: Para controle de versão

### Infraestrutura de Produção
- **PostgreSQL Vector Database**: 10.219.8.210:5432
- **Redis/KeyDB**: 10.219.8.210:6380
- **Hadoop Cluster**: 10.219.8.210 (múltiplas portas)
- **OpenSearch**: 10.219.8.210:9200
- **FluentD**: 10.219.8.210:24224

## 📦 Instalação

### 1. Clonar o Repositório
```bash
git clone <repository-url>
cd BunNow/bunsnc
```

### 2. Instalar Dependências
```bash
# Usando Bun (recomendado)
bun install

# Ou usando npm/yarn se necessário
npm install
```

### 3. Configurar Environment
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar configurações (já incluídas no projeto)
vim .env
```

## ⚙️ Configuração

### Variables de Ambiente Principais

#### Redis/KeyDB (Cache & Streams)
```env
REDIS_URL=redis://default:nexcdc2025@10.219.8.210:6380/1
REDIS_HOST=10.219.8.210
REDIS_PORT=6380
REDIS_PASSWORD=nexcdc2025
REDIS_DB=1
REDIS_STREAMS_KEY=servicenow:changes
```

#### PostgreSQL Vector Database
```env
DATABASE_URL=postgresql://nexcdc:nexcdc_2025@10.219.8.210:5432/vector
DATABASE_HOST=10.219.8.210
DATABASE_PORT=5432
DATABASE_NAME=vector
DATABASE_USER=nexcdc
DATABASE_PASSWORD=nexcdc_2025
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
```

#### ServiceNow Integration
```env
AUTH_SERVICE_URL=http://10.219.8.210:8000/auth
SERVICENOW_INSTANCE_URL=https://iberdrola.service-now.com
SERVICENOW_RATE_LIMIT=95
SERVICENOW_MAX_CONCURRENT=18
SERVICENOW_BATCH_SIZE=100
```

#### Big Data Stack
```env
# Hadoop Cluster
HADOOP_NAMENODE_URL=http://10.219.8.210:9870
HADOOP_FILESYSTEM_URL=hdfs://10.219.8.210:9000

# OpenSearch Analytics
OPENSEARCH_URL=https://10.219.8.210:9200
OPENSEARCH_USER=admin
OPENSEARCH_PASSWORD=admin

# FluentD Logging
FLUENTD_HOST=10.219.8.210
FLUENTD_PORT=24224
```

## 🗄️ Configuração do Banco de Dados

### PostgreSQL Setup
```sql
-- Criar database
CREATE DATABASE vector;

-- Conectar ao database
\c vector;

-- Criar tabelas para ServiceNow collections
CREATE TABLE IF NOT EXISTS sn_incidents_collection (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    sys_id VARCHAR(32) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sn_ctasks_collection (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    sys_id VARCHAR(32) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sn_sctasks_collection (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    sys_id VARCHAR(32) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX idx_incidents_sys_id ON sn_incidents_collection USING btree(sys_id);
CREATE INDEX idx_incidents_state ON sn_incidents_collection USING btree((data->'incident'->>'state'));
CREATE INDEX idx_incidents_number ON sn_incidents_collection USING btree((data->'incident'->>'number'));
CREATE INDEX idx_incidents_group ON sn_incidents_collection USING btree((data->'incident'->>'assignment_group'));

CREATE INDEX idx_ctasks_sys_id ON sn_ctasks_collection USING btree(sys_id);
CREATE INDEX idx_ctasks_state ON sn_ctasks_collection USING btree((data->'ctask'->>'state'));
CREATE INDEX idx_ctasks_number ON sn_ctasks_collection USING btree((data->'ctask'->>'number'));

CREATE INDEX idx_sctasks_sys_id ON sn_sctasks_collection USING btree(sys_id);
CREATE INDEX idx_sctasks_state ON sn_sctasks_collection USING btree((data->'sctask'->>'state'));
CREATE INDEX idx_sctasks_number ON sn_sctasks_collection USING btree((data->'sctask'->>'number'));

-- Índices GIN para full-text search
CREATE INDEX idx_incidents_gin ON sn_incidents_collection USING gin(data);
CREATE INDEX idx_ctasks_gin ON sn_ctasks_collection USING gin(data);
CREATE INDEX idx_sctasks_gin ON sn_sctasks_collection USING gin(data);
```

### Redis/KeyDB Setup
```bash
# Conectar ao Redis
redis-cli -h 10.219.8.210 -p 6380 -a nexcdc2025

# Selecionar database 1
SELECT 1

# Verificar conexão
PING

# Configurar streams (feito automaticamente pela aplicação)
XGROUP CREATE servicenow:changes bunsnc-processors $ MKSTREAM
```

## 🏃‍♂️ Executando a Aplicação

### Modo Desenvolvimento
```bash
# Web Interface (porta 3000)
bun run web:dev

# CLI Mode
bun run start

# Testes
bun run test

# Type checking
bun run typecheck
```

### Modo Produção
```bash
# Build da aplicação
bun run build

# Compilar CLI
bun run compile

# Executar
./dist/bunsnc
```

## 🌐 Acessando a Interface Web

### Dashboard HTMX
- **URL**: http://localhost:3000/htmx
- **Funcionalidades**:
  - Dashboard em tempo real
  - Filtros avançados de chamados
  - Métricas de performance
  - WebSocket para atualizações instantâneas

### API REST
- **Swagger**: http://localhost:3000/swagger
- **Health Check**: http://localhost:3000/health
- **Métricas**: http://localhost:3000/htmx/metrics

## 📊 Monitoramento

### Health Checks
```bash
# Verificar saúde da aplicação
curl http://localhost:3000/health

# Verificar métricas do banco
curl http://localhost:3000/htmx/health

# Status dos streams
curl http://localhost:3000/ws/stats
```

### Logs e Debugging
```bash
# Logs da aplicação
tail -f logs/bunsnc.log

# Monitorar streams Redis
redis-cli -h 10.219.8.210 -p 6380 -a nexcdc2025
> XINFO STREAM servicenow:changes

# Verificar conexões PostgreSQL
SELECT * FROM pg_stat_activity WHERE datname = 'vector';
```

## 🔧 Scripts Disponíveis

### Package.json Scripts
```json
{
  "start": "bun src/index.ts",
  "web": "bun src/web/app.ts",
  "web:dev": "bun --watch src/web/app.ts",
  "build": "bun build",
  "compile": "bun compile src/cli/index.ts --out dist/bunsnc",
  "test": "bun test",
  "test:coverage": "bun test --coverage",
  "test:watch": "bun test --watch",
  "lint": "bunx @biomejs/biome check src/",
  "lint:fix": "bunx @biomejs/biome check --apply src/",
  "typecheck": "bun --bun tsc --noEmit",
  "stream:consumer": "bun src/scripts/stream-consumer.ts",
  "hadoop:sync": "bun src/scripts/hadoop-sync.ts",
  "db:migrate": "bun src/scripts/db-migrate.ts"
}
```

### Scripts Personalizados
```bash
# Consumir streams ServiceNow
bun run stream:consumer

# Sincronizar com Hadoop
bun run hadoop:sync

# Migração de banco
bun run db:migrate
```

## 🚨 Troubleshooting

### Problemas Comuns

#### 1. Erro de Conexão PostgreSQL
```bash
# Verificar conexão
pg_isready -h 10.219.8.210 -p 5432 -U nexcdc

# Testar conectividade
psql -h 10.219.8.210 -p 5432 -U nexcdc -d vector
```

#### 2. Erro de Conexão Redis
```bash
# Verificar Redis
redis-cli -h 10.219.8.210 -p 6380 -a nexcdc2025 ping

# Verificar streams
redis-cli -h 10.219.8.210 -p 6380 -a nexcdc2025 XINFO GROUPS servicenow:changes
```

#### 3. Rate Limiting ServiceNow
```bash
# Verificar configuração
echo $SERVICENOW_RATE_LIMIT
echo $SERVICENOW_MAX_CONCURRENT

# Monitorar rate limiter
curl http://localhost:3000/htmx/health | jq '.details.rateLimitStats'
```

#### 4. Dependências TypeScript
```bash
# Reinstalar dependências
rm -rf node_modules bun.lockb
bun install

# Verificar tipos
bun run typecheck
```

## 🔒 Segurança

### Configurações de Produção
- Alterar `JWT_SECRET` para valor seguro
- Configurar HTTPS com certificados SSL
- Implementar rate limiting adicional
- Configurar firewall para portas específicas
- Usar conexões SSL para PostgreSQL em produção

### Auditoria
- Logs estruturados via FluentD
- Tracking de todas as operações
- Monitoramento de performance
- Alertas automáticos para falhas

## 📚 Próximos Passos

1. **Teste da Instalação**: Executar todos os health checks
2. **Configuração ServiceNow**: Validar integração com ambiente
3. **Monitoramento**: Configurar alertas e dashboards
4. **Performance**: Tuning de queries e conexões
5. **Backup**: Configurar backup automático do PostgreSQL

---

**Suporte**: Para problemas técnicos, consulte os logs da aplicação e a documentação da arquitetura em `ARQUITETURA_COMPLETA.md`.

**Versão**: 1.0.0  
**Última atualização**: Janeiro 2025