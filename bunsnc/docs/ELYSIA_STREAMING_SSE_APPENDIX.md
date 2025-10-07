# Apêndice C: Streaming e Server-Sent Events (SSE)
**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]
**Date:** 2025-10-06
**Version:** v1.0.0

---

## Índice

1. [Introdução](#introdução)
2. [Conceitos de Streaming](#conceitos-de-streaming)
3. [Generator Functions](#generator-functions)
4. [Async Generator Functions](#async-generator-functions)
5. [Server-Sent Events (SSE)](#server-sent-events-sse)
6. [SSE Utility Function](#sse-utility-function)
7. [Streaming Patterns](#streaming-patterns)
8. [AI SDK Integration](#ai-sdk-integration)
9. [Connection Management](#connection-management)
10. [Headers e Content-Type](#headers-e-content-type)
11. [Error Handling](#error-handling)
12. [Client-Side Consumption](#client-side-consumption)
13. [Performance e Best Practices](#performance-e-best-practices)
14. [Implementação BunSNC](#implementação-bunsnc)
15. [Exemplos Completos](#exemplos-completos)

---

## Introdução

ElysiaJS suporta nativamente **response streaming** através de **generator functions**. Streaming permite enviar dados gradualmente ao cliente sem esperar a resposta completa, ideal para:

### Use Cases

- **Real-time updates**: Dashboard metrics, notifications
- **Progressive data loading**: Large datasets, paginated results
- **Long-running operations**: Sync status, batch processing progress
- **AI Streaming**: LLM responses chunk-by-chunk (ChatGPT-style)
- **Log tailing**: Real-time logs
- **File processing**: Progress updates durante upload/processamento

### Vantagens

✅ **Lower TTFB** (Time To First Byte): Cliente recebe primeiro chunk rapidamente
✅ **Reduced memory**: Não precisa carregar tudo na memória
✅ **Better UX**: Feedback progressivo ao usuário
✅ **Auto-cleanup**: Conexão fechada automaticamente quando cliente desconecta

---

## Conceitos de Streaming

### Streaming vs Request-Response Tradicional

**Request-Response (tradicional):**
```
Client → Request → Server
                      ↓
                  [Processing]
                      ↓
                  Complete data
                      ↓
Client ← Response ← Server
```

**Streaming:**
```
Client → Request → Server
                      ↓
Client ← Chunk 1 ← [Processing]
Client ← Chunk 2 ← [Processing]
Client ← Chunk 3 ← [Processing]
Client ← Done    ← Server
```

### Tipos de Streaming

#### 1. Simple Stream (Generator)

```typescript
app.get('/stream', function* () {
  yield 'chunk 1'
  yield 'chunk 2'
  yield 'chunk 3'
})
```

**Headers:**
```
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked
```

#### 2. Server-Sent Events (SSE)

```typescript
app.get('/sse', function* () {
  yield sse({ data: 'event 1' })
  yield sse({ data: 'event 2' })
})
```

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

---

## Generator Functions

### Sintaxe Básica

```typescript
function* generatorFunction() {
  yield value1
  yield value2
  yield value3
}
```

**Características:**
- `function*` com asterisco
- `yield` retorna valores iterativamente
- Execução pausada entre `yield`s

### Generator em Elysia

```typescript
app.get('/numbers', function* () {
  yield 1
  yield 2
  yield 3
  yield 4
  yield 5
})
```

**Cliente recebe:**
```
12345
```

### Generator com Strings

```typescript
app.get('/text', function* () {
  yield 'Hello '
  yield 'from '
  yield 'Elysia!'
})
```

**Cliente recebe:**
```
Hello from Elysia!
```

### Generator com JSON

```typescript
app.get('/json-stream', function* () {
  yield JSON.stringify({ id: 1, name: 'User 1' }) + '\n'
  yield JSON.stringify({ id: 2, name: 'User 2' }) + '\n'
  yield JSON.stringify({ id: 3, name: 'User 3' }) + '\n'
})
```

**Cliente recebe:**
```json
{"id":1,"name":"User 1"}
{"id":2,"name":"User 2"}
{"id":3,"name":"User 3"}
```

### Generator com Delay

```typescript
app.get('/slow-stream', function* () {
  for (let i = 1; i <= 5; i++) {
    yield `Chunk ${i}\n`
    // Simular delay
    Bun.sleepSync(1000)  // 1 segundo
  }
})
```

**Cliente recebe um chunk por segundo.**

---

## Async Generator Functions

### Sintaxe

```typescript
async function* asyncGenerator() {
  yield await fetchData1()
  yield await fetchData2()
  yield await fetchData3()
}
```

**Características:**
- `async function*` com asterisco
- Pode usar `await` dentro
- `yield` pode retornar Promises resolvidas

### Async Generator em Elysia

```typescript
app.get('/async-stream', async function* () {
  const users = await db.users.findAll()

  for (const user of users) {
    yield JSON.stringify(user) + '\n'
  }
})
```

### Database Streaming

```typescript
app.get('/users/stream', async function* () {
  // Cursor-based streaming (evita carregar tudo na memória)
  const cursor = db.collection('users').find().batchSize(100)

  while (await cursor.hasNext()) {
    const user = await cursor.next()
    yield JSON.stringify(user) + '\n'
  }
})
```

### External API Streaming

```typescript
app.get('/external/stream', async function* () {
  const response = await fetch('https://api.example.com/data')

  // Stream response body
  const reader = response.body?.getReader()

  if (!reader) {
    yield JSON.stringify({ error: 'No response body' })
    return
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    // value é Uint8Array
    yield new TextDecoder().decode(value)
  }
})
```

### Paginated Data Streaming

```typescript
app.get('/paginated-stream', async function* () {
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(`https://api.example.com/users?page=${page}`)
    const data = await response.json()

    for (const item of data.items) {
      yield JSON.stringify(item) + '\n'
    }

    hasMore = data.hasNextPage
    page++
  }
})
```

---

## Server-Sent Events (SSE)

### O que é SSE?

**Server-Sent Events (SSE)** é um padrão W3C para streaming unidirecional (servidor → cliente) sobre HTTP.

**Características:**
- ✅ Protocolo simples (text/event-stream)
- ✅ Auto-reconnect no cliente
- ✅ Event IDs para resumir conexão
- ✅ Named events
- ✅ Suporte nativo em browsers (`EventSource`)

### SSE Format

```
event: message
data: {"text":"Hello"}
id: 1

event: notification
data: {"type":"info","message":"Update available"}
id: 2

event: done
data: complete
```

**Estrutura:**
- `event:` nome do evento (opcional, default: "message")
- `data:` dados do evento (pode ser múltiplas linhas)
- `id:` ID único (opcional, para resume)
- Linha em branco separa eventos

---

## SSE Utility Function

### Importar sse()

```typescript
import { Elysia, sse } from 'elysia'
```

**Nota:** `sse()` é um helper que formata dados no padrão SSE.

### Sintaxe Básica

```typescript
// String simples
sse('hello world')

// Objeto
sse({ data: 'hello world' })

// Objeto com event name
sse({
  event: 'message',
  data: 'hello world'
})

// Objeto com ID
sse({
  event: 'update',
  data: { user: 'John' },
  id: '123'
})
```

### SSE em Elysia

```typescript
app.get('/sse', function* () {
  yield sse('Connected')

  yield sse({
    event: 'message',
    data: 'First message'
  })

  yield sse({
    event: 'message',
    data: { timestamp: Date.now() },
    id: '1'
  })

  yield sse({
    event: 'done',
    data: 'Stream completed'
  })
})
```

**Headers automáticos:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### SSE com Loop

```typescript
app.get('/sse/time', async function* () {
  // Enviar timestamp a cada segundo
  for (let i = 0; i < 10; i++) {
    yield sse({
      event: 'time',
      data: {
        timestamp: new Date().toISOString(),
        count: i
      },
      id: String(i)
    })

    await Bun.sleep(1000)  // Aguardar 1 segundo
  }

  yield sse({
    event: 'done',
    data: 'Stream finished'
  })
})
```

### SSE com Data Fetching

```typescript
app.get('/sse/metrics', async function* () {
  yield sse({
    event: 'connected',
    data: { message: 'Metrics stream started' }
  })

  while (true) {
    const metrics = await getSystemMetrics()

    yield sse({
      event: 'metrics',
      data: metrics,
      id: `${Date.now()}`
    })

    await Bun.sleep(5000)  // Update a cada 5 segundos
  }
})
```

**Nota:** Loop infinito é comum em SSE. Conexão é fechada quando cliente desconecta.

---

## Streaming Patterns

### 1. Progress Streaming

```typescript
app.post('/process', async function* ({ body }) {
  const totalSteps = 100

  for (let step = 1; step <= totalSteps; step++) {
    // Processar
    await processStep(step)

    // Enviar progress
    yield sse({
      event: 'progress',
      data: {
        step,
        total: totalSteps,
        percentage: (step / totalSteps) * 100,
        message: `Processing step ${step}/${totalSteps}`
      },
      id: String(step)
    })
  }

  yield sse({
    event: 'complete',
    data: { message: 'Processing completed' }
  })
})
```

### 2. Log Tailing

```typescript
app.get('/logs/tail', async function* ({ query }) {
  const logFile = query.file || 'app.log'

  // Enviar logs existentes
  const existingLogs = await readLastNLines(logFile, 50)

  for (const line of existingLogs) {
    yield sse({
      event: 'log',
      data: { line, timestamp: Date.now() }
    })
  }

  // Watch file para novos logs
  const watcher = watchFile(logFile)

  for await (const newLine of watcher) {
    yield sse({
      event: 'log',
      data: { line: newLine, timestamp: Date.now() }
    })
  }
})
```

### 3. Real-time Dashboard

```typescript
app.get('/dashboard/stream', async function* () {
  yield sse({
    event: 'connected',
    data: { message: 'Dashboard stream started' }
  })

  while (true) {
    const stats = {
      cpu: await getCPUUsage(),
      memory: await getMemoryUsage(),
      requests: await getRequestCount(),
      errors: await getErrorCount()
    }

    yield sse({
      event: 'stats',
      data: stats,
      id: `${Date.now()}`
    })

    await Bun.sleep(2000)  // Update a cada 2 segundos
  }
})
```

### 4. Notification Stream

```typescript
// Global notification queue
const notificationQueue = new EventEmitter()

app.get('/notifications/stream', async function* ({ userId }) {
  yield sse({
    event: 'connected',
    data: { userId }
  })

  // Listener para novos eventos
  const listener = (notification: any) => {
    if (notification.userId === userId) {
      return notification
    }
  }

  notificationQueue.on('notification', listener)

  try {
    // Loop aguardando eventos
    while (true) {
      // Aguardar próximo evento (implementação depende do EventEmitter)
      const notification = await waitForEvent(notificationQueue, 'notification')

      if (notification.userId === userId) {
        yield sse({
          event: 'notification',
          data: notification,
          id: notification.id
        })
      }
    }
  } finally {
    notificationQueue.off('notification', listener)
  }
})
```

### 5. Database Change Stream (MongoDB)

```typescript
app.get('/changes/users', async function* () {
  const changeStream = db.collection('users').watch()

  yield sse({
    event: 'connected',
    data: { message: 'Watching users collection' }
  })

  try {
    for await (const change of changeStream) {
      yield sse({
        event: 'change',
        data: {
          operation: change.operationType,
          documentKey: change.documentKey,
          fullDocument: change.fullDocument
        },
        id: change._id.toString()
      })
    }
  } finally {
    await changeStream.close()
  }
})
```

---

## AI SDK Integration

### Contexto

O **Vercel AI SDK** fornece streaming para LLMs (Large Language Models) como OpenAI GPT, Anthropic Claude, etc.

ElysiaJS suporta nativamente os streams do AI SDK.

### Instalação

```bash
bun add ai @ai-sdk/openai
```

### Basic Chat Completion

```typescript
import { Elysia } from 'elysia'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

app.post('/ai/chat', async ({ body }) => {
  const stream = await streamText({
    model: openai('gpt-4'),
    messages: body.messages
  })

  // Retornar stream diretamente
  return stream.textStream
})
```

**Cliente recebe:**
```
Hello! I'm here to help. What would you like to know?
```
(Chunk por chunk, como ChatGPT)

### SSE with AI SDK

```typescript
app.post('/ai/chat/sse', async function* ({ body }) {
  const stream = await streamText({
    model: openai('gpt-4'),
    messages: body.messages
  })

  // Converter para SSE
  for await (const chunk of stream.textStream) {
    yield sse({
      event: 'message',
      data: chunk
    })
  }

  yield sse({
    event: 'done',
    data: 'Stream completed'
  })
})
```

### UI Message Stream

```typescript
app.post('/ai/chat/ui', async ({ body }) => {
  const stream = await streamText({
    model: openai('gpt-4'),
    messages: body.messages
  })

  // UI Message Stream (para React/UI)
  return stream.toUIMessageStream()
})
```

### Structured Output Streaming

```typescript
import { streamObject } from 'ai'
import { z } from 'zod'

app.post('/ai/extract', async function* ({ body }) {
  const stream = await streamObject({
    model: openai('gpt-4'),
    schema: z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email()
    }),
    prompt: `Extract user information: ${body.text}`
  })

  for await (const partial of stream.partialObjectStream) {
    yield sse({
      event: 'partial',
      data: partial
    })
  }

  yield sse({
    event: 'final',
    data: await stream.finalObject
  })
})
```

### Manual Generator Pattern

```typescript
app.post('/ai/chat/manual', async function* ({ body }) {
  const stream = await streamText({
    model: openai('gpt-4'),
    messages: body.messages
  })

  yield sse({
    event: 'start',
    data: { message: 'AI response starting' }
  })

  let fullText = ''

  for await (const chunk of stream.textStream) {
    fullText += chunk

    yield sse({
      event: 'chunk',
      data: {
        chunk,
        fullText,
        timestamp: Date.now()
      }
    })
  }

  yield sse({
    event: 'complete',
    data: {
      fullText,
      tokenCount: fullText.split(' ').length
    }
  })
})
```

---

## Connection Management

### Client Disconnect Detection

ElysiaJS **automaticamente** fecha o stream quando cliente desconecta.

```typescript
app.get('/sse/long', async function* () {
  try {
    for (let i = 0; i < 1000; i++) {
      yield sse({ data: `Event ${i}` })
      await Bun.sleep(1000)
    }
  } finally {
    // Executado quando stream é fechado (cliente desconectou ou erro)
    console.log('Stream closed')
    cleanup()
  }
})
```

### Connection Tracking

```typescript
const activeConnections = new Set<string>()

app.get('/sse/tracked', async function* ({ headers }) {
  const connectionId = `${headers['user-agent']}-${Date.now()}`

  activeConnections.add(connectionId)
  console.log(`Connection opened: ${connectionId}`)

  yield sse({
    event: 'connected',
    data: { connectionId }
  })

  try {
    while (true) {
      yield sse({
        event: 'ping',
        data: { timestamp: Date.now() }
      })

      await Bun.sleep(30000)  // Ping a cada 30s
    }
  } finally {
    activeConnections.delete(connectionId)
    console.log(`Connection closed: ${connectionId}`)
  }
})

// Endpoint para ver conexões ativas
app.get('/connections', () => ({
  active: activeConnections.size,
  connections: Array.from(activeConnections)
}))
```

### Broadcast Pattern

```typescript
const subscribers = new Map<string, (data: any) => void>()

// Broadcast para todos os clientes conectados
function broadcast(event: string, data: any) {
  for (const [id, send] of subscribers.entries()) {
    send({ event, data })
  }
}

app.get('/sse/broadcast', async function* () {
  const clientId = `client-${Date.now()}`
  const queue: any[] = []

  const send = (message: any) => {
    queue.push(message)
  }

  subscribers.set(clientId, send)

  yield sse({
    event: 'connected',
    data: { clientId }
  })

  try {
    while (true) {
      // Aguardar mensagens na queue
      if (queue.length > 0) {
        const message = queue.shift()
        yield sse(message)
      } else {
        await Bun.sleep(100)
      }
    }
  } finally {
    subscribers.delete(clientId)
  }
})

// Endpoint para enviar broadcast
app.post('/broadcast', ({ body }) => {
  broadcast(body.event, body.data)
  return { sent: subscribers.size }
})
```

---

## Headers e Content-Type

### Automatic Headers (SSE)

Quando usa `sse()`, ElysiaJS automaticamente define:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Automatic Headers (Stream)

Quando usa generator sem `sse()`:

```
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked
```

### Custom Headers

```typescript
app.get('/stream', function* ({ set }) {
  // Definir headers ANTES do primeiro yield
  set.headers['x-custom-header'] = 'value'
  set.headers['cache-control'] = 'max-age=3600'

  yield 'chunk 1'
  yield 'chunk 2'
})
```

**⚠️ Importante:** Headers devem ser definidos **antes** do primeiro `yield`.

### CORS with SSE

```typescript
app.get('/sse/cors', function* ({ set }) {
  set.headers['access-control-allow-origin'] = '*'
  set.headers['access-control-allow-credentials'] = 'true'

  yield sse({ data: 'CORS enabled' })
})
```

---

## Error Handling

### Try-Catch in Generator

```typescript
app.get('/sse/safe', async function* () {
  try {
    yield sse({ event: 'start', data: 'Starting' })

    const data = await fetchData()

    yield sse({ event: 'data', data })

  } catch (error: any) {
    yield sse({
      event: 'error',
      data: {
        error: error.message,
        timestamp: Date.now()
      }
    })
  } finally {
    yield sse({ event: 'done', data: 'Finished' })
  }
})
```

### Error Events

```typescript
app.get('/sse/monitored', async function* () {
  yield sse({ event: 'connected', data: {} })

  while (true) {
    try {
      const metrics = await getMetrics()

      yield sse({
        event: 'metrics',
        data: metrics
      })

    } catch (error: any) {
      yield sse({
        event: 'error',
        data: {
          type: 'fetch_error',
          message: error.message
        }
      })
    }

    await Bun.sleep(5000)
  }
})
```

### Graceful Shutdown

```typescript
let shouldStop = false

process.on('SIGTERM', () => {
  shouldStop = true
})

app.get('/sse/graceful', async function* () {
  yield sse({ event: 'connected', data: {} })

  while (!shouldStop) {
    yield sse({
      event: 'data',
      data: { timestamp: Date.now() }
    })

    await Bun.sleep(1000)
  }

  yield sse({
    event: 'shutdown',
    data: { message: 'Server shutting down' }
  })
})
```

---

## Client-Side Consumption

### JavaScript EventSource

```javascript
// Cliente browser
const eventSource = new EventSource('/sse/metrics')

eventSource.addEventListener('connected', (e) => {
  console.log('Connected:', JSON.parse(e.data))
})

eventSource.addEventListener('metrics', (e) => {
  const metrics = JSON.parse(e.data)
  console.log('Metrics:', metrics)
})

eventSource.addEventListener('error', (e) => {
  console.error('Error:', e)
})

// Fechar conexão
eventSource.close()
```

### Fetch API (ReadableStream)

```javascript
const response = await fetch('/stream')
const reader = response.body.getReader()

while (true) {
  const { done, value } = await reader.read()

  if (done) break

  const chunk = new TextDecoder().decode(value)
  console.log('Chunk:', chunk)
}
```

### Eden Client

```typescript
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const client = treaty<App>('http://localhost:3000')

// Consumir stream
const stream = await client.sse.metrics.get()

for await (const event of stream) {
  console.log('Event:', event)
}
```

---

## Performance e Best Practices

### 1. Batch Updates

```typescript
// ❌ Ruim: Muitos eventos pequenos
app.get('/sse/bad', async function* () {
  const users = await db.users.find().toArray()

  for (const user of users) {
    yield sse({ data: user })  // 1 evento por user
  }
})

// ✅ Bom: Batch events
app.get('/sse/good', async function* () {
  const users = await db.users.find().toArray()
  const batchSize = 10

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize)

    yield sse({
      event: 'batch',
      data: batch
    })
  }
})
```

### 2. Keep-Alive Pings

```typescript
app.get('/sse/keepalive', async function* () {
  let lastActivity = Date.now()

  while (true) {
    const now = Date.now()

    // Se passou 30s sem enviar dados, enviar ping
    if (now - lastActivity > 30000) {
      yield sse({ event: 'ping', data: {} })
      lastActivity = now
    }

    // Lógica normal
    const data = await fetchData()

    if (data) {
      yield sse({ event: 'data', data })
      lastActivity = now
    }

    await Bun.sleep(1000)
  }
})
```

### 3. Memory Management

```typescript
// ❌ Ruim: Acumular dados na memória
app.get('/sse/bad-memory', async function* () {
  const allData = []

  while (true) {
    const newData = await fetchData()
    allData.push(newData)  // Memory leak!

    yield sse({ data: allData })  // Enviar tudo sempre
    await Bun.sleep(1000)
  }
})

// ✅ Bom: Enviar apenas novos dados
app.get('/sse/good-memory', async function* () {
  while (true) {
    const newData = await fetchData()

    yield sse({ data: newData })  // Apenas novo
    await Bun.sleep(1000)
  }
})
```

### 4. Resource Cleanup

```typescript
app.get('/sse/cleanup', async function* () {
  const interval = setInterval(() => {
    console.log('Background task running')
  }, 1000)

  const dbConnection = await connectDB()

  try {
    while (true) {
      const data = await dbConnection.query('SELECT ...')

      yield sse({ event: 'data', data })
      await Bun.sleep(5000)
    }
  } finally {
    // ✅ SEMPRE cleanup em finally
    clearInterval(interval)
    await dbConnection.close()
    console.log('Resources cleaned up')
  }
})
```

### 5. Rate Limiting

```typescript
const rateLimiter = new Map<string, number>()

app.get('/sse/ratelimited', async function* ({ headers, set }) {
  const ip = headers['x-forwarded-for'] || 'unknown'
  const now = Date.now()
  const lastRequest = rateLimiter.get(ip) || 0

  // Max 1 connection per IP a cada 10 segundos
  if (now - lastRequest < 10000) {
    set.status = 429
    yield sse({
      event: 'error',
      data: { message: 'Rate limit exceeded' }
    })
    return
  }

  rateLimiter.set(ip, now)

  // Stream normal
  yield sse({ event: 'connected', data: {} })

  while (true) {
    yield sse({ event: 'data', data: { timestamp: Date.now() } })
    await Bun.sleep(1000)
  }
})
```

---

## Implementação BunSNC

### Análise do Código Atual

A aplicação BunSNC já implementa SSE corretamente em `src/routes/SSERoutes.ts`:

#### Padrões Corretos Usados

✅ **Generator Functions com yield*:**
```typescript
.get("/stream/tickets/:sysId", function* ({ params: { sysId } }) {
  const clientId = `ticket-${sysId}-${Date.now()}`
  yield* unifiedStreamingService.createStream(
    clientId,
    "ticket-updates",
    { ticketSysId: sysId, maxHistory: 10 }
  )
})
```

✅ **Multiple Streaming Endpoints:**
- `/sse/stream/tickets/:sysId` - Ticket updates
- `/sse/stream/dashboard` - Dashboard stats
- `/sse/stream/sync/:operation` - Sync progress
- `/sse/stream/sla` - SLA monitoring
- `/sse/stream/test/:testType` - Test progress

✅ **Connection Stats Endpoint:**
```typescript
.get("/stats", () => {
  const stats = unifiedStreamingService.getConnectionStats()
  return {
    success: true,
    data: {
      totalConnections: stats.totalConnections,
      connectionsByType: stats.connectionsByType,
      ticketConnections: Object.fromEntries(stats.ticketConnections),
      activeConnections: stats.connectionDetails,
      timestamp: new Date().toISOString(),
    },
  }
})
```

#### Dynamic Import Pattern (Anti-Race Condition)

✅ **Lazy-loaded SSE metrics** (`src/routes/index.ts:322`):
```typescript
mainApp.get("/api/streaming/metrics", async function* (context) {
  try {
    // Dynamic import apenas quando endpoint é acessado
    const { streamingMetricsRoutes } = await import(
      "../web/ui/routes/streaming-metrics.routes"
    )

    const metricsRoute = streamingMetricsRoutes.find(
      route => route.path === '/api/streaming/metrics'
    )

    // Delegate to SSE handler
    yield* metricsRoute.handler.call(this, context)
  } catch (error: unknown) {
    yield {
      event: "error",
      data: JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }
})
```

**Padrão correto para evitar race conditions em module loading.**

### Melhorias Sugeridas

#### 1. Use sse() Utility

```typescript
// ANTES (atual)
yield {
  event: "error",
  data: JSON.stringify({ error: "..." })
}

// DEPOIS (recomendado)
import { sse } from 'elysia'

yield sse({
  event: "error",
  data: { error: "..." }  // sse() faz JSON.stringify automaticamente
})
```

#### 2. Keep-Alive Pings

```typescript
// unifiedStreamingService.createStream()
async function* createStream(clientId: string, type: string, options: any) {
  let lastActivity = Date.now()

  try {
    while (true) {
      const now = Date.now()

      // Keep-alive ping a cada 30s
      if (now - lastActivity > 30000) {
        yield sse({ event: 'ping', data: {} })
        lastActivity = now
      }

      const data = await fetchData()

      if (data) {
        yield sse({ event: type, data })
        lastActivity = now
      }

      await Bun.sleep(options.intervalSeconds * 1000 || 5000)
    }
  } finally {
    cleanup()
  }
}
```

#### 3. Connection Limits

```typescript
const MAX_CONNECTIONS_PER_USER = 5

app.get("/sse/stream/:type", async function* ({ params, userId, set }) {
  const userConnections = connectionTracker.get(userId) || 0

  if (userConnections >= MAX_CONNECTIONS_PER_USER) {
    set.status = 429
    yield sse({
      event: 'error',
      data: { message: 'Too many concurrent connections' }
    })
    return
  }

  connectionTracker.set(userId, userConnections + 1)

  try {
    yield* streamData()
  } finally {
    connectionTracker.set(userId, userConnections - 1)
  }
})
```

---

## Exemplos Completos

### Exemplo 1: Real-time Metrics Dashboard

```typescript
import { Elysia, sse } from 'elysia'

const app = new Elysia()
  .get('/metrics/stream', async function* () {
    yield sse({
      event: 'connected',
      data: {
        message: 'Metrics stream started',
        interval: 5000
      }
    })

    while (true) {
      try {
        const metrics = {
          cpu: await getCPUUsage(),
          memory: await getMemoryUsage(),
          disk: await getDiskUsage(),
          network: await getNetworkStats(),
          requests: {
            total: await getRequestCount(),
            success: await getSuccessCount(),
            errors: await getErrorCount()
          },
          timestamp: new Date().toISOString()
        }

        yield sse({
          event: 'metrics',
          data: metrics,
          id: `${Date.now()}`
        })

      } catch (error: any) {
        yield sse({
          event: 'error',
          data: {
            error: error.message,
            timestamp: new Date().toISOString()
          }
        })
      }

      await Bun.sleep(5000)
    }
  })
```

### Exemplo 2: Sync Progress Tracker

```typescript
app.post('/sync/start', async function* ({ body }) {
  const { tables } = body  // ['incidents', 'users', 'groups']

  yield sse({
    event: 'start',
    data: {
      totalTables: tables.length,
      tables
    }
  })

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i]

    yield sse({
      event: 'table-start',
      data: {
        table,
        index: i + 1,
        total: tables.length
      }
    })

    const records = await fetchRecordsFromServiceNow(table)

    for (let j = 0; j < records.length; j++) {
      await saveToMongoDB(records[j])

      // Progress a cada 10 records
      if (j % 10 === 0) {
        yield sse({
          event: 'progress',
          data: {
            table,
            processed: j + 1,
            total: records.length,
            percentage: ((j + 1) / records.length) * 100
          }
        })
      }
    }

    yield sse({
      event: 'table-complete',
      data: {
        table,
        recordsSynced: records.length
      }
    })
  }

  yield sse({
    event: 'complete',
    data: {
      message: 'Sync completed',
      totalRecords: tables.reduce((sum, t) => sum + getRecordCount(t), 0)
    }
  })
})
```

### Exemplo 3: Chat with AI Streaming

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

app.post('/chat', async function* ({ body }) {
  const { messages } = body

  yield sse({
    event: 'start',
    data: { message: 'AI response starting' }
  })

  const stream = await streamText({
    model: openai('gpt-4'),
    messages
  })

  let fullResponse = ''

  for await (const chunk of stream.textStream) {
    fullResponse += chunk

    yield sse({
      event: 'chunk',
      data: {
        chunk,
        fullResponse
      }
    })
  }

  yield sse({
    event: 'complete',
    data: {
      fullResponse,
      tokenCount: fullResponse.split(' ').length,
      timestamp: new Date().toISOString()
    }
  })
})
```

---

## Conclusão

ElysiaJS fornece suporte nativo e ergonômico para **streaming** e **Server-Sent Events**:

### Key Takeaways

✅ **Generator Functions** - `function*` com `yield` para streaming
✅ **Async Generators** - `async function*` para operações assíncronas
✅ **SSE Utility** - `sse()` formata dados automaticamente
✅ **Auto-cleanup** - Conexão fechada quando cliente desconecta
✅ **Headers automáticos** - Content-Type configurado automaticamente
✅ **AI SDK ready** - Suporte nativo para AI streaming

### Best Practices

1. **Sempre usar `finally`** para cleanup de recursos
2. **Keep-alive pings** para conexões longas (30s)
3. **Batch updates** em vez de muitos eventos pequenos
4. **Rate limiting** para prevenir abuse
5. **Error handling** com try-catch e eventos de erro
6. **Memory management** - não acumular dados indefinidamente
7. **Connection tracking** para monitorar e limitar conexões

### Quando Usar

- ✅ **Real-time updates**: Dashboard, notifications
- ✅ **Progress tracking**: Sync, batch operations, file processing
- ✅ **AI Streaming**: LLM responses
- ✅ **Log tailing**: Real-time logs
- ❌ **Bidirectional**: Use WebSocket (não SSE)
- ❌ **Binary data**: Use WebSocket ou download direto

---

**END OF APPENDIX**

Author: Juliano Stefano <jsdealencar@ayesa.com>
Date: 2025-10-06
Version: v1.0.0
