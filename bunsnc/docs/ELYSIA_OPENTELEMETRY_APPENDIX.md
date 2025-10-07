# Apêndice B: OpenTelemetry - Observabilidade e Distributed Tracing
**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]
**Date:** 2025-10-06
**Version:** v1.0.0

---

## Índice

1. [Introdução](#introdução)
2. [OpenTelemetry em Bun vs Node.js](#opentelemetry-em-bun-vs-nodejs)
3. [Arquitetura de Tracing](#arquitetura-de-tracing)
4. [Instalação e Dependências](#instalação-e-dependências)
5. [Configuração Básica](#configuração-básica)
6. [Preload Configuration (CRÍTICO)](#preload-configuration-crítico)
7. [Resource Attributes](#resource-attributes)
8. [Span Processors e Exporters](#span-processors-e-exporters)
9. [Jaeger Integration](#jaeger-integration)
10. [Trace Utilities](#trace-utilities)
11. [Named Functions para Observabilidade](#named-functions-para-observabilidade)
12. [Custom Spans](#custom-spans)
13. [Lifecycle Tracing](#lifecycle-tracing)
14. [Production Configuration](#production-configuration)
15. [Troubleshooting](#troubleshooting)
16. [Implementação BunSNC](#implementação-bunsnc)

---

## Introdução

OpenTelemetry é o padrão de facto para **observabilidade** em aplicações distribuídas. O plugin `@elysiajs/opentelemetry` fornece instrumentação automática para ElysiaJS, capturando:

- **HTTP requests/responses**: Automaticamente instrumentado
- **Lifecycle hooks**: Transform, derive, beforeHandle, afterHandle
- **Erros e exceções**: Stack traces completos
- **Custom spans**: Usando utilities `record()`, `getCurrentSpan()`, `setAttributes()`

### Benefícios

✅ **Distributed Tracing**: Rastrear requisições através de múltiplos serviços
✅ **Performance Monitoring**: Identificar bottlenecks e otimizar
✅ **Debugging**: Visualizar fluxo de requisições e identificar erros
✅ **SLA Compliance**: Monitorar tempos de resposta e disponibilidade

### Backends Suportados

- **Jaeger** (usado no BunSNC)
- Zipkin
- New Relic
- Axiom
- Datadog
- Honeycomb
- Qualquer backend compatível com OpenTelemetry

---

## OpenTelemetry em Bun vs Node.js

### ⚠️ CRÍTICO: Diferenças Bun

ElysiaJS roda em **Bun**, não Node.js. Há diferenças importantes na configuração do OpenTelemetry:

#### Node.js (NÃO aplicável)

```typescript
// ❌ NÃO FUNCIONA EM BUN
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

opentelemetry({
  instrumentations: [
    getNodeAutoInstrumentations()  // ❌ Bloqueia startup no Bun
  ]
})
```

**Problema:** `getNodeAutoInstrumentations()` tenta fazer monkey-patching de módulos Node.js que não existem ou funcionam diferente em Bun.

#### Bun (CORRETO)

```typescript
// ✅ CORRETO PARA BUN
import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export const instrumentation = opentelemetry({
  serviceName: 'BunSNC',
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter())
  ]
  // ✅ SEM instrumentations array
  // Elysia plugin fornece HTTP tracing nativo
})
```

### Comparação

| Aspecto | Node.js | Bun |
|---------|---------|-----|
| **Auto Instrumentations** | ✅ `getNodeAutoInstrumentations()` | ❌ Não suportado |
| **HTTP Tracing** | Via instrumentations | ✅ Plugin Elysia nativo |
| **Database Tracing** | Via instrumentations (Prisma, pg, etc.) | ⚠️ Manual via `record()` |
| **Preload** | Não necessário | ✅ **OBRIGATÓRIO** via bunfig.toml |
| **Exporter** | OTLP Proto ou HTTP | ✅ OTLP HTTP (recomendado) |

---

## Arquitetura de Tracing

### Fluxo de Trace

```
Request → Elysia Plugin → HTTP Span (root)
                            ├─ onRequest span
                            ├─ Parse span
                            ├─ Transform span
                            ├─ Derive span (named function)
                            ├─ Before Handle span
                            ├─ Handler span
                            ├─ Custom spans (record)
                            ├─ After Handle span
                            └─ Map Response span
                                ↓
                         BatchSpanProcessor
                                ↓
                          OTLPTraceExporter
                                ↓
                         Jaeger Backend
```

### Hierarquia de Spans

```
HTTP GET /user/123
├── onRequest (rate limit check)
├── derive: getUserId (token validation)
│   └── record: database.query.user
│       └── record: cache.get
├── handler: getUser
│   └── record: database.query.preferences
└── afterHandle: addCorsHeaders
```

---

## Instalação e Dependências

### Instalar Plugin

```bash
bun add @elysiajs/opentelemetry
```

### Instalar OpenTelemetry Core

```bash
bun add @opentelemetry/sdk-trace-node \
        @opentelemetry/exporter-trace-otlp-http \
        @opentelemetry/resources \
        @opentelemetry/semantic-conventions
```

**Nota:** Usar `@opentelemetry/sdk-trace-node` mesmo em Bun (é a implementação base).

### Dependências Opcionais

```bash
# Para instrumentações específicas (se aplicável)
bun add @opentelemetry/instrumentation-http
bun add @opentelemetry/instrumentation-fetch

# Para exporters alternativos
bun add @opentelemetry/exporter-trace-otlp-proto  # Proto format
bun add @opentelemetry/exporter-zipkin            # Zipkin
bun add @opentelemetry/exporter-jaeger            # Jaeger direto
```

---

## Configuração Básica

### 1. Criar Arquivo de Instrumentação

```typescript
// src/instrumentation.ts
import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions'

const serviceName = 'MyService'
const serviceVersion = '1.0.0'

// Resource Attributes (metadata do serviço)
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion
})

// OTLP Exporter (HTTP)
const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Batch Span Processor
const spanProcessor = new BatchSpanProcessor(otlpExporter)

// Export Plugin
export const instrumentation = opentelemetry({
  serviceName,
  resource,
  spanProcessors: [spanProcessor]
})
```

### 2. Usar no App

```typescript
// src/index.ts
import { Elysia } from 'elysia'
import { instrumentation } from './instrumentation'

const app = new Elysia()
  .use(instrumentation)  // ✅ Aplica OpenTelemetry
  .get('/health', () => ({ status: 'ok' }))
  .listen(3000)
```

### 3. ⚠️ CRÍTICO: Configurar Preload

Ver seção [Preload Configuration](#preload-configuration-crítico).

---

## Preload Configuration (CRÍTICO)

### Por que Preload é Necessário?

OpenTelemetry precisa ser **configurado ANTES** de qualquer outro módulo ser importado. Em Bun, isso é feito via **preload** no `bunfig.toml`.

**Problema sem preload:**
- Módulos são carregados antes do OpenTelemetry estar pronto
- Spans não são capturados corretamente
- HTTP requests não são instrumentados

### bunfig.toml

```toml
# bunfig.toml
[run]
preload = ["./src/instrumentation.ts"]  # ✅ CRÍTICO
```

**Com múltiplos preloads:**

```toml
[run]
preload = [
  "./src/env-preload.ts",        # 1º: Carregar .env
  "./src/instrumentation.ts"      # 2º: Configurar OpenTelemetry
]
```

**Ordem importa:** Preloads são executados na ordem do array.

### Verificar Preload Funcionando

```typescript
// src/instrumentation.ts
console.log('[OpenTelemetry] Instrumentation loaded via preload')

export const instrumentation = opentelemetry({ ... })

console.log('[OpenTelemetry] Plugin initialized')
```

**Ao rodar `bun src/index.ts`, deve aparecer:**
```
[OpenTelemetry] Instrumentation loaded via preload
[OpenTelemetry] Plugin initialized
🦊 Elysia is running at :3000
```

Se logs de OpenTelemetry aparecem **antes** do log do Elysia = ✅ Preload funcionando.

---

## Resource Attributes

### Semantic Conventions

OpenTelemetry define **convenções semânticas** para attributes padronizados.

```typescript
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
  ATTR_HOST_NAME,
  ATTR_PROCESS_PID,
  ATTR_PROCESS_RUNTIME_NAME,
  ATTR_PROCESS_RUNTIME_VERSION
} from '@opentelemetry/semantic-conventions'

const resource = resourceFromAttributes({
  // Service
  [ATTR_SERVICE_NAME]: 'BunSNC',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  'service.instance.id': `bunsnc-${Date.now()}`,
  'service.namespace': 'bunsnc',

  // Deployment
  [ATTR_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',

  // Host
  [ATTR_HOST_NAME]: process.env.HOSTNAME || 'localhost',
  'host.type': 'server',

  // Process
  [ATTR_PROCESS_PID]: process.pid,
  [ATTR_PROCESS_RUNTIME_NAME]: 'bun',
  [ATTR_PROCESS_RUNTIME_VERSION]: process.versions.bun || 'unknown',

  // Telemetry SDK
  'telemetry.sdk.name': 'opentelemetry',
  'telemetry.sdk.language': 'typescript',
  'telemetry.sdk.version': '1.x.x'
})
```

### Custom Attributes

```typescript
const resource = resourceFromAttributes({
  // Standard
  [ATTR_SERVICE_NAME]: 'BunSNC',

  // Custom (seu domínio)
  'app.component': 'backend-api',
  'app.team': 'platform',
  'app.region': 'us-east-1',
  'app.datacenter': 'aws',
  'app.tier': 'production'
})
```

**Benefícios:**
- Filtrar traces por team, region, datacenter no Jaeger
- Agrupar métricas por componente
- Identificar instâncias específicas

---

## Span Processors e Exporters

### Span Processors

#### 1. BatchSpanProcessor (Recomendado Produção)

```typescript
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'

const processor = new BatchSpanProcessor(exporter, {
  maxQueueSize: 2048,           // Máximo de spans na fila
  maxExportBatchSize: 512,      // Spans por batch
  scheduledDelayMillis: 1000,   // Intervalo de export (1s)
  exportTimeoutMillis: 10000    // Timeout de export (10s)
})
```

**Características:**
- ✅ Agrupa spans em batches (performance)
- ✅ Export assíncrono (não bloqueia requisições)
- ✅ Retry automático em caso de falha

#### 2. SimpleSpanProcessor (Apenas Dev/Debug)

```typescript
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'

const processor = new SimpleSpanProcessor(exporter)
```

**Características:**
- ✅ Export imediato (cada span)
- ❌ Bloqueia requisição até export
- ❌ Sem retry
- ⚠️ **NUNCA usar em produção**

### Exporters

#### 1. OTLP HTTP (Recomendado Bun)

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const exporter = new OTLPTraceExporter({
  url: 'http://10.219.8.210:4318/v1/traces',  // Jaeger OTLP endpoint
  headers: {
    'Content-Type': 'application/json'
  },
  timeoutMillis: 10000
})
```

**Portas Jaeger:**
- `4318`: OTLP HTTP (✅ usar este)
- `4317`: OTLP gRPC
- `14250`: Jaeger gRPC (deprecated)

#### 2. OTLP Proto (Alternativa)

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

const exporter = new OTLPTraceExporter({
  url: 'http://10.219.8.210:4317',  // Porta gRPC
})
```

**Quando usar:**
- ✅ Performance crítica (Proto é mais eficiente)
- ❌ Mais complexo (precisa gRPC funcionando)

#### 3. Jaeger Exporter (Deprecated)

```typescript
// ❌ DEPRECATED: Não usar
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'
```

**Recomendação:** Usar OTLP (é o padrão OpenTelemetry).

#### 4. Console Exporter (Debug)

```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'

const exporter = new ConsoleSpanExporter()
```

**Uso:** Debug apenas. Imprime spans no console.

---

## Jaeger Integration

### Setup Jaeger (Docker)

```yaml
# docker-compose.yml
version: '3.8'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP HTTP
      - "4317:4317"    # OTLP gRPC
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

```bash
docker-compose up -d
```

**Acessar UI:** http://localhost:16686

### Configurar BunSNC para Jaeger

```typescript
// src/instrumentation.ts
const jaegerUrl = process.env.JAEGER_OTLP_URL || 'http://10.219.8.210:4318/v1/traces'

const exporter = new OTLPTraceExporter({
  url: jaegerUrl,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const instrumentation = opentelemetry({
  serviceName: 'BunSNC',
  spanProcessors: [new BatchSpanProcessor(exporter)]
})
```

### Verificar Traces no Jaeger

1. Abrir http://10.219.8.210:16686
2. Selecionar service "BunSNC"
3. Click "Find Traces"
4. Ver traces com hierarquia de spans

---

## Trace Utilities

### 1. record() - Custom Spans

`record()` é um wrapper para criar spans customizados com auto-close.

#### Sintaxe

```typescript
import { record } from '@elysiajs/opentelemetry'

const result = await record('span.name', async () => {
  // Código a ser rastreado
  return await operation()
})
```

#### Exemplos

**Database Query:**

```typescript
app.get('/users', async () => {
  const users = await record('database.query.users', async () => {
    return await db.users.findAll()
  })

  return users
})
```

**External API Call:**

```typescript
app.get('/external', async () => {
  const data = await record('http.client.get.servicenow', async () => {
    return await fetch('https://servicenow.com/api/data')
      .then(r => r.json())
  })

  return data
})
```

**Cache Operation:**

```typescript
app.get('/cached', async () => {
  let data = await record('cache.get', async () => {
    return await redis.get('key')
  })

  if (!data) {
    data = await record('database.query', async () => {
      return await db.query('SELECT ...')
    })

    await record('cache.set', async () => {
      await redis.set('key', data)
    })
  }

  return data
})
```

**Nested Spans:**

```typescript
app.get('/complex', async () => {
  return await record('operation.complex', async () => {
    const user = await record('database.query.user', async () => {
      return await db.users.findById(123)
    })

    const permissions = await record('database.query.permissions', async () => {
      return await db.permissions.findByUserId(user.id)
    })

    return { user, permissions }
  })
})
```

**Trace no Jaeger:**
```
operation.complex (10ms)
├── database.query.user (3ms)
└── database.query.permissions (5ms)
```

### 2. getCurrentSpan() - Span Atual

```typescript
import { getCurrentSpan } from '@elysiajs/opentelemetry'

app.get('/user', async () => {
  const span = getCurrentSpan()

  if (span) {
    // Adicionar attributes ao span atual
    span.setAttributes({
      'user.id': 123,
      'user.role': 'admin'
    })

    // Adicionar event
    span.addEvent('user.loaded', {
      'user.name': 'John Doe'
    })
  }

  return user
})
```

**Uso fora de handler:**

```typescript
function utilityFunction() {
  const span = getCurrentSpan()

  if (span) {
    span.setAttributes({
      'custom.attribute': 'value'
    })
  }
}
```

### 3. setAttributes() - Syntax Sugar

```typescript
import { setAttributes } from '@elysiajs/opentelemetry'

app.get('/user', async ({ headers }) => {
  // Equivalente a getCurrentSpan().setAttributes()
  setAttributes({
    'http.user_agent': headers['user-agent'],
    'custom.header': headers['x-custom']
  })

  return user
})
```

---

## Named Functions para Observabilidade

### Problema: Anonymous Functions

```typescript
// ❌ Span aparece como "anonymous" no Jaeger
app.derive(async ({ headers }) => {
  return { userId: parseToken(headers.authorization) }
})
```

**Jaeger:**
```
HTTP GET /user
├── anonymous (derive)  ⚠️ Difícil identificar
└── handler
```

### Solução: Named Functions

```typescript
// ✅ Span aparece como "extractUserId"
app.derive(async function extractUserId({ headers }) {
  return { userId: parseToken(headers.authorization) }
})
```

**Jaeger:**
```
HTTP GET /user
├── extractUserId (derive)  ✅ Claro e identificável
└── handler
```

### Aplicar em Todos os Hooks

```typescript
app
  .onRequest(function rateLimit({ ip }) {
    checkRateLimit(ip)
  })

  .derive(async function extractAuth({ headers }) {
    return { userId: validateToken(headers.authorization) }
  })

  .beforeHandle(async function requireAuth({ userId, set }) {
    if (!userId) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
  })

  .get('/user', async function getUser({ userId }) {
    return await db.users.findById(userId)
  })

  .afterHandle(function addCorsHeaders({ set }) {
    set.headers['access-control-allow-origin'] = '*'
  })
```

**Jaeger:**
```
HTTP GET /user
├── rateLimit (onRequest)
├── extractAuth (derive)
├── requireAuth (beforeHandle)
├── getUser (handler)
└── addCorsHeaders (afterHandle)
```

---

## Custom Spans

### Span Attributes

```typescript
app.get('/user/:id', async ({ params }) => {
  return await record('database.query.user', async () => {
    const span = getCurrentSpan()

    span?.setAttributes({
      // Database
      'db.system': 'mongodb',
      'db.name': 'bunsnc',
      'db.operation': 'find',
      'db.collection': 'users',
      'db.query': `{ _id: ${params.id} }`,

      // Custom
      'user.id': params.id,
      'cache.hit': false
    })

    return await db.users.findById(params.id)
  })
})
```

### Span Events

```typescript
app.post('/user', async ({ body }) => {
  return await record('user.create', async () => {
    const span = getCurrentSpan()

    span?.addEvent('validation.started')

    const isValid = validateUser(body)

    span?.addEvent('validation.completed', {
      'validation.result': isValid
    })

    if (!isValid) {
      span?.addEvent('validation.failed')
      throw new Error('Invalid user')
    }

    span?.addEvent('database.insert.started')
    const user = await db.users.create(body)
    span?.addEvent('database.insert.completed', {
      'user.id': user.id
    })

    return user
  })
})
```

### Span Status

```typescript
import { SpanStatusCode } from '@opentelemetry/api'

app.get('/data', async () => {
  return await record('fetch.data', async () => {
    const span = getCurrentSpan()

    try {
      const data = await fetchData()

      span?.setStatus({
        code: SpanStatusCode.OK,
        message: 'Success'
      })

      return data
    } catch (error: any) {
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      })

      span?.recordException(error)

      throw error
    }
  })
})
```

---

## Lifecycle Tracing

ElysiaJS automaticamente cria spans para lifecycle hooks. Usar **named functions** para identificá-los.

### Complete Lifecycle Example

```typescript
import { Elysia } from 'elysia'
import { instrumentation } from './instrumentation'
import { record } from '@elysiajs/opentelemetry'

const app = new Elysia()
  .use(instrumentation)

  // 1. onRequest
  .onRequest(function checkRateLimit({ ip }) {
    console.log(`Rate limit check for ${ip}`)
  })

  // 2. Parse (automático)

  // 3. Transform
  .onTransform(function transformParams({ params }) {
    if (params.id) {
      params.id = parseInt(params.id)
    }
  })

  // 4. Derive
  .derive(async function extractUserId({ headers }) {
    return {
      userId: await record('auth.validate', async () => {
        return validateToken(headers.authorization)
      })
    }
  })

  // 5. Before Handle
  .beforeHandle(async function requireAuth({ userId, set }) {
    if (!userId) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
  })

  // 6. Handler
  .get('/user/:id', async function getUser({ params, userId }) {
    return await record('user.get', async () => {
      const user = await record('database.query.user', async () => {
        return await db.users.findById(params.id)
      })

      const permissions = await record('database.query.permissions', async () => {
        return await db.permissions.findByUserId(userId)
      })

      return { user, permissions }
    })
  })

  // 7. After Handle
  .afterHandle(function wrapResponse({ response }) {
    return {
      success: true,
      data: response,
      timestamp: Date.now()
    }
  })

  // 8. Map Response (se necessário)

  // 9. Error
  .onError(function handleError({ error, code }) {
    const span = getCurrentSpan()
    span?.recordException(error)

    return {
      error: error.message,
      code
    }
  })

  .listen(3000)
```

**Trace no Jaeger:**
```
HTTP GET /user/123
├── checkRateLimit (onRequest)
├── parse (automático)
├── transformParams (transform)
├── extractUserId (derive)
│   └── auth.validate (record)
├── requireAuth (beforeHandle)
├── getUser (handler)
│   └── user.get (record)
│       ├── database.query.user (record)
│       └── database.query.permissions (record)
└── wrapResponse (afterHandle)
```

---

## Production Configuration

### Environment-Specific Config

```typescript
// src/instrumentation.ts
const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV === 'development'

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'BunSNC',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
  [ATTR_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  'service.instance.id': `bunsnc-${process.pid}-${Date.now()}`
})

const exporter = new OTLPTraceExporter({
  url: process.env.JAEGER_OTLP_URL || (
    isProduction
      ? 'http://jaeger-prod:4318/v1/traces'
      : 'http://localhost:4318/v1/traces'
  ),
  headers: {
    'Content-Type': 'application/json',
    ...(process.env.JAEGER_AUTH_TOKEN && {
      'Authorization': `Bearer ${process.env.JAEGER_AUTH_TOKEN}`
    })
  }
})

const spanProcessor = new BatchSpanProcessor(exporter, {
  // Produção: batches maiores, delay menor
  maxQueueSize: isProduction ? 4096 : 2048,
  maxExportBatchSize: isProduction ? 1024 : 512,
  scheduledDelayMillis: isProduction ? 5000 : 1000,
  exportTimeoutMillis: 30000
})
```

### Sampling

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'

// Sample 10% em produção, 100% em dev
const sampler = new TraceIdRatioBasedSampler(
  isProduction ? 0.1 : 1.0
)

export const instrumentation = opentelemetry({
  serviceName: 'BunSNC',
  resource,
  spanProcessors: [spanProcessor],
  sampler  // ✅ Adicionar sampler
})
```

### Conditional Instrumentation

```typescript
// Desabilitar tracing em testes
const shouldTrace = process.env.NODE_ENV !== 'test'

export const instrumentation = shouldTrace
  ? opentelemetry({ ... })
  : new Elysia()  // Plugin vazio
```

---

## Troubleshooting

### 1. Traces Não Aparecem no Jaeger

**Checklist:**
- ✅ bunfig.toml tem preload?
- ✅ Jaeger rodando e acessível?
- ✅ URL correta (`http://10.219.8.210:4318/v1/traces`)?
- ✅ Plugin aplicado no app (`.use(instrumentation)`)?

**Debug:**

```typescript
// Adicionar Console Exporter para debug
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'

const consoleExporter = new ConsoleSpanExporter()

export const instrumentation = opentelemetry({
  serviceName: 'BunSNC',
  spanProcessors: [
    new SimpleSpanProcessor(consoleExporter),  // Debug: imprime no console
    new BatchSpanProcessor(otlpExporter)        // Produção
  ]
})
```

### 2. "getNodeAutoInstrumentations is not a function"

**Causa:** Tentando usar auto-instrumentations do Node.js em Bun.

**Solução:** Remover `instrumentations` do config:

```typescript
// ❌ INCORRETO
opentelemetry({
  instrumentations: [getNodeAutoInstrumentations()]
})

// ✅ CORRETO
opentelemetry({
  serviceName: 'BunSNC',
  spanProcessors: [...]
  // Sem instrumentations
})
```

### 3. Spans "anonymous"

**Causa:** Arrow functions sem nome.

**Solução:** Usar named functions:

```typescript
// ❌ Anonymous
.derive(async ({ userId }) => { ... })

// ✅ Named
.derive(async function loadUser({ userId }) { ... })
```

### 4. Preload Não Funciona

**Sintomas:**
- Logs do instrumentation aparecem DEPOIS do app
- Traces incompletos

**Solução:**

```toml
# bunfig.toml
[run]
preload = ["./src/instrumentation.ts"]  # Path correto
```

**Verificar:**

```bash
bun src/index.ts
# Deve aparecer PRIMEIRO:
# [OpenTelemetry] Instrumentation loaded via preload
```

### 5. Export Timeout

**Sintomas:**
```
[OpenTelemetry] Export failed: timeout
```

**Soluções:**

```typescript
// 1. Aumentar timeout
const exporter = new OTLPTraceExporter({
  url: '...',
  timeoutMillis: 30000  // 30s
})

// 2. Aumentar batch delay
const processor = new BatchSpanProcessor(exporter, {
  scheduledDelayMillis: 5000  // 5s
})
```

### 6. Muitos Spans (Performance)

**Problema:** Tracing overhead significativo.

**Soluções:**

```typescript
// 1. Sampling (sample 10%)
const sampler = new TraceIdRatioBasedSampler(0.1)

// 2. Filtrar rotas específicas
app
  .get('/health', handler, {
    detail: { trace: false }  // ⚠️ Não existe, exemplo conceitual
  })

// 3. Conditional recording
const shouldRecord = !path.includes('/health')

if (shouldRecord) {
  await record('operation', async () => { ... })
} else {
  await operation()
}
```

---

## Implementação BunSNC

### Configuração Atual

A aplicação BunSNC já tem OpenTelemetry configurado corretamente:

#### src/instrumentation.ts

```typescript
import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

const serviceName = "BunSNC";
const serviceVersion = "1.0.0";
const jaegerOtlpURL = process.env.JAEGER_OTLP_URL || "http://10.219.8.210:4318/v1/traces";

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  "service.instance.id": `${serviceName}-${Date.now()}`,
  "deployment.environment": process.env.NODE_ENV === "production" ? "production" : "development",
  "service.namespace": "bunsnc",
  "service.component": "backend-api",
  "telemetry.sdk.name": "opentelemetry",
  "telemetry.sdk.language": "typescript",
  "host.name": process.env.HOSTNAME || "localhost",
  "process.pid": process.pid,
  "process.runtime.name": "bun",
  "process.runtime.version": process.versions.bun || "unknown",
});

const otlpTraceExporter = new OTLPTraceExporter({
  url: jaegerOtlpURL,
  headers: {
    "Content-Type": "application/json",
  },
});

const batchSpanProcessor = new BatchSpanProcessor(otlpTraceExporter, {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 1000,
  exportTimeoutMillis: 10000,
});

export const instrumentation = opentelemetry({
  serviceName,
  resource,
  spanProcessors: [batchSpanProcessor],
});
```

### ⚠️ PROBLEMA IDENTIFICADO: Falta Preload

**bunfig.toml atual:**

```toml
[run]
preload = ["./src/env-preload.ts"]  # ❌ Falta instrumentation.ts
```

**CORRETO:**

```toml
[run]
preload = [
  "./src/env-preload.ts",
  "./src/instrumentation.ts"  # ✅ ADICIONAR
]
```

### Melhorias Sugeridas

#### 1. Named Functions em Plugins

```typescript
// src/plugins/auth.ts (ANTES)
.derive(async () => {  // ❌ Anonymous
  return await getAuthService()
})

// DEPOIS
.derive(async function getAuthService() {  // ✅ Named
  return await getAuthService()
})
```

#### 2. Custom Spans em Services

```typescript
// src/services/ServiceNowService.ts
import { record } from '@elysiajs/opentelemetry'

class ServiceNowService {
  async getIncident(sysId: string) {
    return await record('servicenow.api.get.incident', async () => {
      const response = await fetch(`${this.baseUrl}/incident/${sysId}`)
      return response.json()
    })
  }

  async createIncident(data: any) {
    return await record('servicenow.api.create.incident', async () => {
      const response = await fetch(`${this.baseUrl}/incident`, {
        method: 'POST',
        body: JSON.stringify(data)
      })
      return response.json()
    })
  }
}
```

#### 3. Database Tracing

```typescript
// src/services/ConsolidatedDataService.ts
import { record, setAttributes } from '@elysiajs/opentelemetry'

async syncIncidents() {
  return await record('sync.incidents', async () => {
    setAttributes({
      'sync.table': 'incidents',
      'sync.type': 'full'
    })

    const incidents = await record('servicenow.query.incidents', async () => {
      return await this.serviceNowClient.getIncidents()
    })

    await record('mongodb.bulk.insert.incidents', async () => {
      setAttributes({
        'db.collection': 'incidents',
        'db.operation': 'insertMany',
        'db.count': incidents.length
      })

      return await this.db.collection('incidents').insertMany(incidents)
    })

    return { synced: incidents.length }
  })
}
```

#### 4. Cache Tracing

```typescript
// src/services/RedisCacheService.ts
import { record } from '@elysiajs/opentelemetry'

async get(key: string) {
  return await record('cache.get', async () => {
    setAttributes({
      'cache.key': key,
      'cache.system': 'redis'
    })

    const value = await this.redis.get(key)

    setAttributes({
      'cache.hit': !!value
    })

    return value
  })
}
```

---

## Conclusão

OpenTelemetry no ElysiaJS/Bun requer configuração específica:

### Checklist de Implementação

✅ **Instalar dependências**
- `@elysiajs/opentelemetry`
- `@opentelemetry/sdk-trace-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/resources`
- `@opentelemetry/semantic-conventions`

✅ **Criar src/instrumentation.ts**
- Resource attributes com semantic conventions
- OTLPTraceExporter com URL do Jaeger
- BatchSpanProcessor com configuração adequada
- Export `instrumentation` plugin

✅ **Configurar bunfig.toml**
- Adicionar `preload = ["./src/instrumentation.ts"]`

✅ **Aplicar no app**
- `.use(instrumentation)` no app principal

✅ **Named functions**
- Todas as funções de lifecycle devem ter nome
- Facilita identificação no Jaeger

✅ **Custom spans**
- Usar `record()` para operações importantes
- Database queries, external APIs, cache
- Adicionar attributes com `setAttributes()`

✅ **Verificar no Jaeger**
- Acessar http://10.219.8.210:16686
- Selecionar service "BunSNC"
- Verificar traces com hierarquia completa

### O que NÃO fazer

❌ `getNodeAutoInstrumentations()` - Não funciona em Bun
❌ Arrow functions anônimas - Aparecem como "anonymous"
❌ SimpleSpanProcessor em produção - Bloqueia requests
❌ Esquecer preload - Traces incompletos
❌ OTLP Proto sem testar - HTTP é mais simples

---

**END OF APPENDIX**

Author: Juliano Stefano <jsdealencar@ayesa.com>
Date: 2025-10-06
Version: v1.0.0
