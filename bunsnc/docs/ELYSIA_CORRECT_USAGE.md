# ElysiaJS - Uso Correto e Best Practices
**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]
**Date:** 2025-10-06
**Version:** v1.0.0

---

## Índice

1. [Filosofia e Princípios do ElysiaJS](#filosofia-e-princípios-do-elysiajs)
2. [Arquitetura Correta](#arquitetura-correta)
3. [TypeBox - Validação Nativa](#typebox---validação-nativa)
4. [Lifecycle Hooks](#lifecycle-hooks)
5. [Guard Pattern](#guard-pattern)
6. [Plugins e Escopo](#plugins-e-escopo)
7. [Macros](#macros)
8. [Mount Pattern](#mount-pattern)
9. [OpenAPI/Swagger](#openapiswagger)
10. [OpenTelemetry](#opentelemetry)
11. [Context Object](#context-object)
12. [Padrões de Resposta](#padrões-de-resposta)
13. [Comparação: Implementação Incorreta vs Correta](#comparação-implementação-incorreta-vs-correta)

---

## Filosofia e Princípios do ElysiaJS

### Design Philosophy
ElysiaJS é projetado com foco em:
- **Ergonomia**: Framework intuitivo que "sente como JavaScript"
- **Type Safety**: Type safety end-to-end em tempo de compilação e runtime
- **Performance**: 21x mais rápido que Express, 6x mais rápido que Fastify (2,454,631 req/s)
- **Developer Experience**: Minimizar complexidade desnecessária

### Princípios Fundamentais

1. **Single Context Object**
   - ❌ INCORRETO: Express/Fastify usam `req` e `res` separados
   - ✅ CORRETO: Elysia usa único objeto de contexto

2. **Direct Response Return**
   - ❌ INCORRETO: `res.send()`, `res.json()`, `reply.send()`
   - ✅ CORRETO: Retornar valor diretamente do handler

3. **Built-in Validation**
   - ❌ INCORRETO: Middleware externo para validação
   - ✅ CORRETO: TypeBox integrado nativamente

4. **Static Code Analysis**
   - ElysiaJS analisa código em tempo de compilação para otimização
   - Não usar parsing dinâmico de propriedades do contexto

---

## Arquitetura Correta

### 1. Estrutura Básica

```typescript
import { Elysia, t } from 'elysia'

// ✅ CORRETO: Instância única com type safety
const app = new Elysia()
  .get('/', 'Hello World')
  .post('/user', ({ body }) => body, {
    body: t.Object({
      name: t.String(),
      age: t.Number()
    })
  })
  .listen(3000)
```

**Por que está correto:**
- Response direto (string literal ou retorno de função)
- Validação inline com TypeBox
- Type inference automático

### 2. Handler Pattern

```typescript
// ❌ INCORRETO: Separar req/res
app.post('/user', (req, res) => {
  const { name } = req.body
  res.json({ name })
})

// ✅ CORRETO: Context destructuring
app.post('/user', ({ body }) => ({ name: body.name }), {
  body: t.Object({
    name: t.String()
  })
})

// ✅ CORRETO: Context completo quando necessário
app.post('/user', (ctx) => {
  const { body, query, params, headers } = ctx
  return { ...body, query, params }
})
```

### 3. Named Functions para Tracing

```typescript
// ❌ INCORRETO: Arrow function anônima
.derive(async ({ cookie: { session } }) => {
  return { user: await getProfile(session) }
})

// ✅ CORRETO: Named function para OpenTelemetry
.derive(async function getUserProfile({ cookie: { session } }) {
  return { user: await getProfile(session) }
})
```

**Benefício:** OpenTelemetry mostra nome da função nos traces em vez de "anonymous"

---

## TypeBox - Validação Nativa

### Conceito
TypeBox é o sistema de validação nativo do Elysia, não deve ser substituído por bibliotecas externas em casos simples.

### Schema Types Principais

```typescript
import { t } from 'elysia'

// Tipos Primitivos
t.String()          // string
t.Number()          // number
t.Boolean()         // boolean
t.Null()            // null
t.Undefined()       // undefined

// Tipos Compostos
t.Object({          // Objetos
  name: t.String(),
  age: t.Number()
})

t.Array(            // Arrays
  t.String()
)

t.Union([           // União de tipos
  t.String(),
  t.Number()
])

t.Enum(['admin', 'user', 'guest'])  // Enumeração

// Tipos Especiais
t.File({            // Upload de arquivo
  type: 'image',    // Validação de tipo
  maxSize: '5m'     // Tamanho máximo
})

t.Files({           // Múltiplos arquivos
  type: ['image/jpeg', 'image/png']
})

// Opcionais e Valores Padrão
t.Optional(t.String())              // Opcional
t.String({ default: 'guest' })      // Valor padrão

// Validações Customizadas
t.String({
  minLength: 3,
  maxLength: 50,
  pattern: '^[a-zA-Z]+$'
})

t.Number({
  minimum: 0,
  maximum: 100,
  multipleOf: 5
})
```

### Validação por Schema Section

```typescript
app.post('/user/:id', ({ params, query, body, headers }) => ({
  userId: params.id,
  filter: query.filter,
  userData: body,
  auth: headers.authorization
}), {
  // Validação de path parameters
  params: t.Object({
    id: t.Number()
  }),

  // Validação de query string
  query: t.Object({
    filter: t.Optional(t.String()),
    limit: t.Number({ default: 10 })
  }),

  // Validação de body
  body: t.Object({
    name: t.String({ minLength: 3 }),
    email: t.String({ format: 'email' }),
    age: t.Number({ minimum: 18 })
  }),

  // Validação de headers
  headers: t.Object({
    authorization: t.String()
  }),

  // Validação de response
  response: {
    200: t.Object({
      success: t.Boolean(),
      data: t.Any()
    }),
    400: t.Object({
      error: t.String()
    })
  }
})
```

### Model Registry

```typescript
// ✅ CORRETO: Definir schemas reutilizáveis
app.model({
  user: t.Object({
    id: t.Number(),
    name: t.String(),
    email: t.String({ format: 'email' })
  }),

  createUser: t.Object({
    name: t.String({ minLength: 3 }),
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 8 })
  }),

  auth: t.Object({
    authorization: t.String()
  })
})

// Usar schemas registrados
app.post('/user', ({ body }) => body, {
  body: 'createUser',        // Referência por nome
  response: {
    200: 'user'
  }
})

app.guard({
  headers: 'auth'             // Aplicar em múltiplas rotas
}, (app) =>
  app.get('/profile', handler)
     .get('/settings', handler)
)
```

### Transform e Parse

```typescript
app.post('/user', ({ body }) => body, {
  body: t.Object({
    id: t.Number(),
    name: t.String()
  }),

  // Transform ANTES da validação
  transform({ body }) {
    // Converter string para number
    if (typeof body.id === 'string') {
      body.id = parseInt(body.id)
    }
  }
})

// Custom Parser
app.onParse(async ({ request, contentType }) => {
  if (contentType === 'application/custom') {
    return customParser(await request.text())
  }
})
```

---

## Lifecycle Hooks

### Request Lifecycle Flow

```
Request → Parse → Transform → Derive → Before Handle → Handler
                                                           ↓
  Error ← Map Response ← After Handle ← Resolve ←──────────┘
```

### 1. onRequest
**Primeiro evento de cada requisição**

```typescript
// ✅ Use cases: Rate limiting, logging, analytics
app.onRequest(({ ip, method, path }) => {
  console.log(`${method} ${path} from ${ip}`)

  if (rateLimiter.isBlocked(ip)) {
    return new Response('Too Many Requests', { status: 429 })
  }
})
```

### 2. onParse
**Body parsing customizado**

```typescript
// ✅ Use cases: Custom content types
app.onParse(async ({ request, contentType }) => {
  switch (contentType) {
    case 'application/msgpack':
      return decodeMsgPack(await request.arrayBuffer())

    case 'application/xml':
      return parseXML(await request.text())
  }
})
```

### 3. onTransform
**Transformar contexto ANTES da validação**

```typescript
// ✅ Use cases: Normalização de dados
app.onTransform(({ params }) => {
  // Converter string para number
  if (params.id) {
    const id = parseInt(params.id)
    if (!isNaN(id)) params.id = id
  }
})
```

### 4. derive
**Adicionar valores ao contexto ANTES da validação**

```typescript
// ✅ Use cases: Extrair informações de headers, cookies
app.derive(async function extractAuth({ headers }) {
  const bearer = headers.authorization?.replace('Bearer ', '')

  return {
    token: bearer,
    userId: bearer ? await validateToken(bearer) : null
  }
})

// Usar valores derivados
app.get('/profile', ({ userId }) => {
  if (!userId) return { error: 'Unauthorized' }
  return getProfile(userId)
})
```

### 5. beforeHandle
**Validação customizada e guards**

```typescript
// ✅ Use cases: Autenticação, autorização
app.beforeHandle(async function requireAuth({ userId, set }) => {
  if (!userId) {
    set.status = 401
    return { error: 'Authentication required' }
  }
})

app.beforeHandle(async function requireAdmin({ userId, set }) => {
  const user = await getUser(userId)

  if (user.role !== 'admin') {
    set.status = 403
    return { error: 'Admin access required' }
  }
})
```

### 6. resolve
**Adicionar valores DEPOIS da validação**

```typescript
// ✅ Use cases: Carregar dados baseados em parâmetros validados
app.resolve(async function loadUser({ params }) => {
  // params.id já foi validado
  return {
    user: await db.users.findById(params.id)
  }
})

app.get('/user/:id', ({ user }) => user, {
  params: t.Object({
    id: t.Number()
  })
})
```

### 7. afterHandle
**Transformar resposta do handler**

```typescript
// ✅ Use cases: Adicionar headers, wrapper de resposta
app.afterHandle(({ response, set }) => {
  // Adicionar CORS
  set.headers['access-control-allow-origin'] = '*'

  // Wrapper padrão
  return {
    success: true,
    data: response,
    timestamp: Date.now()
  }
})
```

### 8. mapResponse
**Transformação de resposta de baixo nível**

```typescript
// ✅ Use cases: Compressão, encoding
app.mapResponse(({ response, set }) => {
  if (typeof response === 'string' && response.startsWith('<')) {
    set.headers['content-type'] = 'text/html'
  }

  return response
})
```

### 9. onError
**Error handling global**

```typescript
class ValidationError extends Error {
  status = 422

  toResponse() {
    return {
      error: 'Validation failed',
      message: this.message
    }
  }
}

app.onError(({ error, code, set }) => {
  console.error(`[${code}] ${error.message}`)

  if (error instanceof ValidationError) {
    set.status = error.status
    return error.toResponse()
  }

  set.status = 500
  return { error: 'Internal Server Error' }
})
```

### Lifecycle Scope (Local vs Global)

```typescript
// ❌ INCORRETO: Hooks locais afetam apenas a rota
app.onRequest(() => console.log('A'))
   .get('/', () => 'B')
   .onRequest(() => console.log('C'))  // Só afeta rotas DEPOIS

// ✅ CORRETO: Hook global
const globalLogger = new Elysia()
  .onRequest(({ method, path }) => {
    console.log(`${method} ${path}`)
  })

app.use(globalLogger)  // Aplica em TODAS as rotas
```

---

## Guard Pattern

### Conceito
Guard permite aplicar hooks e schemas a múltiplas rotas simultaneamente, evitando repetição.

### Sintaxe Básica

```typescript
// ❌ INCORRETO: Repetir validação em cada rota
app.get('/profile', handler, { headers: authSchema })
   .get('/settings', handler, { headers: authSchema })
   .post('/update', handler, { headers: authSchema })

// ✅ CORRETO: Guard aplica schema a todas as rotas internas
app.guard({
  headers: t.Object({
    authorization: t.String()
  })
}, (app) =>
  app.get('/profile', ({ headers }) => getProfile(headers.authorization))
     .get('/settings', ({ headers }) => getSettings(headers.authorization))
     .post('/update', ({ headers, body }) => updateProfile(headers.authorization, body))
)
```

### Guard com Derive

```typescript
app.guard({
  headers: t.Object({
    authorization: t.String()
  })
}, (app) =>
  app
    // Derive é executado para todas as rotas no guard
    .derive(async function extractUserId({ headers }) {
      const token = headers.authorization.replace('Bearer ', '')
      return {
        userId: await validateToken(token)
      }
    })

    // userId disponível em todas as rotas
    .get('/profile', ({ userId }) => getProfile(userId))
    .get('/orders', ({ userId }) => getOrders(userId))
    .post('/logout', ({ userId }) => logout(userId))
)
```

### Guard com Before Handle

```typescript
app.guard({
  headers: t.Object({
    authorization: t.String()
  })
}, (app) =>
  app
    .derive(extractUserId)

    // Validação aplicada a todas as rotas
    .beforeHandle(async function requireAuth({ userId, set }) {
      if (!userId) {
        set.status = 401
        return { error: 'Invalid token' }
      }
    })

    .get('/admin/users', handler)
    .delete('/admin/user/:id', handler)
)
```

### Nested Guards

```typescript
app
  // Guard nível 1: Todas as rotas /api
  .guard({
    headers: t.Object({
      'api-key': t.String()
    })
  }, (app) =>
    app.derive(validateApiKey)

       // Guard nível 2: Apenas /api/admin
       .guard({
         headers: t.Object({
           authorization: t.String()
         })
       }, (app) =>
         app.derive(extractUserId)
            .beforeHandle(requireAdmin)
            .get('/admin/stats', handler)
            .post('/admin/config', handler)
       )

       // Rotas /api sem guard de admin
       .get('/public/data', handler)
  )
```

### Guard com Transform

```typescript
app.guard({
  params: t.Object({
    id: t.String()  // Aceita string
  })
}, (app) =>
  app
    // Transform aplica a todas as rotas
    .onTransform(({ params }) => {
      params.id = parseInt(params.id)
    })

    // Agora params.id é number
    .get('/user/:id', ({ params }) => getUser(params.id))
    .delete('/user/:id', ({ params }) => deleteUser(params.id))
)
```

### Guard com Response Schema

```typescript
const apiResponse = t.Object({
  success: t.Boolean(),
  data: t.Any(),
  timestamp: t.Number()
})

app.guard({
  response: {
    200: apiResponse
  }
}, (app) =>
  app
    .afterHandle(({ response }) => ({
      success: true,
      data: response,
      timestamp: Date.now()
    }))

    .get('/users', () => getAllUsers())
    .get('/posts', () => getAllPosts())
)
```

---

## Plugins e Escopo

### Plugin Fundamentals

```typescript
// ✅ Plugin é uma instância de Elysia reutilizável
const myPlugin = new Elysia({ name: 'my-plugin' })
  .decorate('pluginValue', 'Hello from plugin')
  .derive(({ pluginValue }) => ({
    enhanced: `${pluginValue}!`
  }))
  .get('/plugin-route', ({ enhanced }) => enhanced)

// Usar plugin
const app = new Elysia()
  .use(myPlugin)
  .get('/', ({ pluginValue }) => pluginValue)  // Acesso ao decorator
```

### Plugin Scope Levels

#### 1. Local Scope (default)

```typescript
// Local: Aplica apenas à instância atual e descendentes
const localPlugin = new Elysia({ name: 'local' })
  .decorate('local', 'value')
  // Sem .as() = local scope

const app = new Elysia()
  .use(localPlugin)
  .get('/', ({ local }) => local)  // ✅ Funciona

const another = new Elysia()
  .get('/', ({ local }) => local)  // ❌ Erro: local não existe
```

#### 2. Scoped

```typescript
// Scoped: Aplica à instância pai, atual e descendentes
const scopedPlugin = new Elysia({ name: 'scoped' })
  .decorate('scoped', 'value')
  .as('scoped')

const parent = new Elysia()
  .use(scopedPlugin)
  .get('/', ({ scoped }) => scoped)  // ✅ Funciona

const child = new Elysia()
  .use(parent)
  .get('/child', ({ scoped }) => scoped)  // ✅ Funciona
```

#### 3. Global Scope

```typescript
// Global: Aplica a TODAS as instâncias que usam o plugin
const globalPlugin = new Elysia({ name: 'global' })
  .decorate('global', 'value')
  .as('global')  // ⚠️ CRITICAL

const app = new Elysia()
  .use(globalPlugin)
  .get('/', ({ global }) => global)  // ✅ Funciona

const another = new Elysia()
  .use(globalPlugin)  // Usa mesma instância (deduplication)
  .get('/', ({ global }) => global)  // ✅ Funciona
```

### Plugin Deduplication

```typescript
// Plugin com nome = Elysia previne duplicação
const plugin = new Elysia({ name: 'unique-plugin' })
  .onStart(() => console.log('Plugin initialized'))

const app = new Elysia()
  .use(plugin)  // Log: "Plugin initialized"
  .use(plugin)  // Não executa novamente (deduplicated)
  .use(plugin)  // Não executa novamente

// Sem nome = Executa sempre
const anonymous = new Elysia()
  .onStart(() => console.log('Anonymous plugin'))

new Elysia()
  .use(anonymous)  // Log: "Anonymous plugin"
  .use(anonymous)  // Log: "Anonymous plugin" (duplicado)
```

### Plugin com Configuração

```typescript
// ✅ CORRETO: Plugin factory function
const configPlugin = (config: { prefix: string }) =>
  new Elysia({ name: `config-plugin-${config.prefix}` })
    .get(`${config.prefix}/hello`, () => 'Hello')
    .get(`${config.prefix}/bye`, () => 'Bye')

app.use(configPlugin({ prefix: '/api' }))
   .use(configPlugin({ prefix: '/v2' }))
```

### Service Locator Pattern

```typescript
// ✅ Plugin para dependency injection
const dbPlugin = new Elysia({ name: 'db' })
  .decorate('db', new DatabaseService())
  .as('global')

const authPlugin = new Elysia({ name: 'auth' })
  .use(dbPlugin)  // Importar dependência
  .derive(async function getAuthService({ db }) {
    return {
      authService: new AuthService(db)
    }
  })
  .as('global')

// Routes usam authService
app.use(authPlugin)
   .post('/login', ({ authService, body }) =>
     authService.login(body.username, body.password)
   )
```

### Singleton Lazy Loading Pattern (v5.6.1)

```typescript
// ✅ CORRETO: Singleton com lazy initialization
let _serviceSingleton: MyService | null = null

const getService = async () => {
  if (_serviceSingleton) {
    return { service: _serviceSingleton }
  }

  console.log('📦 Creating MyService (SINGLETON - first initialization)')
  _serviceSingleton = new MyService()
  await _serviceSingleton.initialize()
  console.log('✅ MyService ready (reused across all requests)')

  return { service: _serviceSingleton }
}

export const servicePlugin = new Elysia({ name: 'my-service' })
  .onStart(() => console.log('🔧 Service plugin starting'))
  .derive(async function getMyService() {
    return await getService()  // Named function for tracing
  })
  .as('global')  // ✅ CRITICAL
```

---

## Macros

### Conceito
Macros são "funções com controle sobre lifecycle, schema e context com type safety completo".

### Macro Básico

```typescript
const app = new Elysia()
  .macro({
    // Definir macro customizado
    role: (allowedRoles: string[]) => ({
      // Before handle hook
      beforeHandle({ set, userId }) {
        const user = getUserById(userId)

        if (!allowedRoles.includes(user.role)) {
          set.status = 403
          return { error: 'Forbidden' }
        }
      }
    })
  })

  // Usar macro
  .get('/admin', handler, {
    role: ['admin']  // Apenas admin pode acessar
  })

  .get('/moderator', handler, {
    role: ['admin', 'moderator']  // Admin ou moderator
  })
```

### Macro com Schema

```typescript
app.macro({
  pagination: (options?: { maxLimit?: number }) => ({
    // Transform query antes da validação
    transform({ query }) {
      query.page = parseInt(query.page || '1')
      query.limit = Math.min(
        parseInt(query.limit || '10'),
        options?.maxLimit || 100
      )
    },

    // Schema para query
    query: t.Object({
      page: t.Number({ minimum: 1 }),
      limit: t.Number({ minimum: 1, maximum: options?.maxLimit || 100 })
    })
  })
})

// Usar macro
.get('/users', ({ query }) => {
  return getUsersPaginated(query.page, query.limit)
}, {
  pagination: { maxLimit: 50 }
})
```

### Macro com Resolve

```typescript
app.macro({
  loadUser: (required: boolean = true) => ({
    resolve: async ({ params, set }) => {
      const user = await db.users.findById(params.userId)

      if (!user && required) {
        set.status = 404
        throw new Error('User not found')
      }

      return { user }
    },

    params: t.Object({
      userId: t.Number()
    })
  })
})

.get('/user/:userId', ({ user }) => user, {
  loadUser: true  // Carrega e valida user
})

.get('/user/:userId/optional', ({ user }) => user || 'Not found', {
  loadUser: false  // User pode ser null
})
```

### Macro Extension

```typescript
const baseApp = new Elysia()
  .macro({
    auth: (type: 'jwt' | 'apikey') => ({
      beforeHandle({ headers, set }) {
        const valid = type === 'jwt'
          ? validateJWT(headers.authorization)
          : validateApiKey(headers['api-key'])

        if (!valid) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
      }
    })
  })

// Extender macro em outra instância
const app = new Elysia()
  .use(baseApp)
  .macro({
    // Adicionar novo macro mantendo os existentes
    logging: (enabled: boolean) => ({
      onRequest({ method, path }) {
        if (enabled) console.log(`${method} ${path}`)
      }
    })
  })

  .get('/protected', handler, {
    auth: 'jwt',
    logging: true
  })
```

---

## Mount Pattern

### Conceito
Mount permite integrar diferentes frameworks que seguem WinterTC standard (Request/Response).

### Mount Outro Framework

```typescript
import { Hono } from 'hono'

const hono = new Hono()
  .get('/hello', (c) => c.text('Hello from Hono'))

const app = new Elysia()
  .get('/', 'Hello from Elysia')
  .mount('/hono', hono.fetch)  // Mount Hono app
  .listen(3000)

// GET /          → Elysia
// GET /hono/hello → Hono
```

### Reusable Elysia Instances

```typescript
const authRoutes = new Elysia()
  .post('/login', loginHandler)
  .post('/logout', logoutHandler)

const userRoutes = new Elysia()
  .get('/profile', profileHandler)
  .put('/profile', updateProfileHandler)

const adminRoutes = new Elysia()
  .guard({ role: 'admin' }, app =>
    app.get('/users', getAllUsers)
       .delete('/user/:id', deleteUser)
  )

// Montar todos
const app = new Elysia()
  .mount('/auth', authRoutes)
  .mount('/user', userRoutes)
  .mount('/admin', adminRoutes)
  .listen(3000)
```

### Mount vs Use

```typescript
// .use() = Compartilha contexto e lifecycle
const plugin = new Elysia()
  .decorate('shared', 'value')

app.use(plugin)
   .get('/', ({ shared }) => shared)  // ✅ Funciona

// .mount() = Isolado, sem compartilhar contexto
const isolated = new Elysia()
  .decorate('isolated', 'value')

app.mount('/isolated', isolated)
   .get('/', ({ isolated }) => isolated)  // ❌ Erro
```

---

## OpenAPI/Swagger

### Setup Básico

```typescript
import { Elysia } from 'elysia'
import { swagger } from '@elysiajs/swagger'

const app = new Elysia()
  .use(swagger({
    path: '/docs',
    documentation: {
      info: {
        title: 'BunSNC API',
        version: '1.0.0',
        description: 'ServiceNow integration API'
      },
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Tickets', description: 'Ticket management' }
      ]
    }
  }))
  .listen(3000)

// Documentação disponível em:
// http://localhost:3000/docs      → UI interativa (Scalar)
// http://localhost:3000/docs/json → OpenAPI JSON spec
```

### Documentar Endpoints

```typescript
app.post('/user', ({ body }) => createUser(body), {
  body: t.Object({
    name: t.String({ minLength: 3 }),
    email: t.String({ format: 'email' })
  }),

  response: {
    201: t.Object({
      id: t.Number(),
      name: t.String(),
      email: t.String()
    }),
    400: t.Object({
      error: t.String()
    })
  },

  detail: {
    summary: 'Create new user',
    description: 'Creates a new user account with email and name',
    tags: ['Users'],
    operationId: 'createUser',
    deprecated: false
  }
})
```

### Security Schemes

```typescript
app.use(swagger({
  documentation: {
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    }
  }
}))

// Aplicar security em endpoint
.get('/protected', handler, {
  detail: {
    security: [
      { BearerAuth: [] }
    ]
  }
})
```

### Excluir Rotas

```typescript
app.use(swagger({
  exclude: [
    '/internal',       // Excluir rota específica
    '/admin/*',        // Excluir por pattern
    /^\/debug.*/       // Excluir por regex
  ]
}))
```

---

## OpenTelemetry

### Configuração Correta para Bun

```typescript
// src/instrumentation.ts
import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export const instrumentation = opentelemetry({
  serviceName: 'BunSNC',

  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://10.219.8.210:4318/v1/traces',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    )
  ],

  // ⚠️ NÃO usar getNodeAutoInstrumentations() em Bun
  // Elysia plugin fornece instrumentação HTTP nativa
})
```

### Preload no bunfig.toml

```toml
# bunfig.toml
[run]
preload = ["./src/instrumentation.ts"]  # ✅ CRITICAL
```

**Por que é necessário:**
- OpenTelemetry precisa ser configurado ANTES de importar módulos
- Bun carrega instrumentation.ts antes de qualquer outro código
- Permite que OTLP exporter capture todas as requisições HTTP

### Usar no App

```typescript
// src/index.ts
import { Elysia } from 'elysia'
import { instrumentation } from './instrumentation'

const app = new Elysia()
  .use(instrumentation)  // ✅ Aplica OpenTelemetry
  .get('/health', () => 'OK')
  .listen(3000)
```

### Record Custom Spans

```typescript
import { record } from '@elysiajs/opentelemetry'

app.get('/data', async () => {
  const users = await record('database.query.users', () =>
    db.users.findAll()
  )

  const posts = await record('database.query.posts', () =>
    db.posts.findAll()
  )

  return { users, posts }
})
```

### Set Attributes

```typescript
import { setAttributes, getCurrentSpan } from '@elysiajs/opentelemetry'

app.derive(({ headers }) => {
  // Adicionar atributos ao span atual
  setAttributes({
    'user.agent': headers['user-agent'],
    'request.id': generateRequestId()
  })

  return {}
})
```

### Named Functions para Traces

```typescript
// ❌ INCORRETO: Span aparece como "anonymous"
.derive(async ({ userId }) => {
  return { user: await getUser(userId) }
})

// ✅ CORRETO: Span aparece como "getUserData"
.derive(async function getUserData({ userId }) {
  return { user: await getUser(userId) }
})
```

---

## Context Object

### Propriedades Disponíveis

```typescript
type Context = {
  // Request data
  body: any                    // Request body (auto-parsed)
  query: Record<string, string>  // Query string (?key=value)
  params: Record<string, string> // Path parameters (/:id)
  headers: Record<string, string> // HTTP headers

  // Request metadata
  request: Request              // Native Request object
  path: string                  // Request path
  method: string                // HTTP method

  // Response control
  set: {
    status?: number             // HTTP status code
    headers: Record<string, string> // Response headers
    redirect?: string           // Redirect URL
  }

  // State and context
  store: Record<string, any>    // Global mutable state
  cookie: Record<string, Cookie> // Cookie management

  // Custom decorators (added via .decorate())
  [key: string]: any
}
```

### Destructuring Pattern

```typescript
// ✅ CORRETO: Extrair apenas o necessário
app.post('/user/:id', ({ params, body, set }) => {
  set.status = 201
  return createUser(params.id, body)
})

// ✅ CORRETO: Context completo quando necessário
app.post('/complex', (ctx) => {
  const { body, query, params, headers, set, store } = ctx

  // Lógica complexa com múltiplos campos
  return processRequest(ctx)
})
```

### State (Global Mutable)

```typescript
app
  .state('version', '1.0.0')
  .state('config', { debug: true })

  .get('/info', ({ store }) => ({
    version: store.version,
    debug: store.config.debug
  }))

  // Modificar state
  .post('/debug', ({ store, body }) => {
    store.config.debug = body.enabled
    return store.config
  })
```

### Decorate (Adicionar ao Context)

```typescript
app
  .decorate('db', new Database())
  .decorate('logger', new Logger())

  .get('/users', async ({ db }) => {
    return await db.users.findAll()
  })

  .post('/log', ({ logger, body }) => {
    logger.info(body.message)
    return { logged: true }
  })
```

### Derive (Computar Valores)

```typescript
app
  .derive(({ headers }) => ({
    // Extrair user ID do token
    userId: parseJWT(headers.authorization)?.sub
  }))

  .derive(({ userId, db }) => ({
    // Carregar user (se userId existe)
    user: userId ? db.users.findById(userId) : null
  }))

  .get('/profile', ({ user }) => user || { error: 'Not authenticated' })
```

---

## Padrões de Resposta

### Response Types

```typescript
// String literal
app.get('/', 'Hello World')

// JSON object
app.get('/json', () => ({
  status: 'ok',
  timestamp: Date.now()
}))

// Custom status
app.get('/created', ({ set }) => {
  set.status = 201
  return { created: true }
})

// Headers
app.get('/headers', ({ set }) => {
  set.headers['x-custom'] = 'value'
  set.headers['cache-control'] = 'no-cache'
  return 'OK'
})

// Redirect
app.get('/redirect', ({ set }) => {
  set.redirect = '/new-location'
  // ou set.status = 302 + set.headers.location = '/new-location'
})
```

### File Response

```typescript
import { file } from 'elysia'

app.get('/image', () =>
  file('path/to/image.png')
)

app.get('/download', ({ set }) => {
  set.headers['content-disposition'] = 'attachment; filename="data.json"'
  return file('path/to/data.json')
})
```

### Stream Response

```typescript
// Generator function = stream
app.get('/stream', function* () {
  yield 'First chunk\n'
  yield 'Second chunk\n'
  yield 'Third chunk\n'
})

// Async generator
app.get('/async-stream', async function* () {
  for (let i = 0; i < 10; i++) {
    await sleep(1000)
    yield `Chunk ${i}\n`
  }
})
```

### Server-Sent Events (SSE)

```typescript
app.get('/events', function* () {
  yield new Response('data: Connected\n\n')

  setInterval(() => {
    yield new Response(`data: ${Date.now()}\n\n`)
  }, 1000)
})
```

### Error Response

```typescript
// ✅ CORRETO: Return error object
app.get('/error', ({ set }) => {
  set.status = 400
  return { error: 'Bad Request' }
})

// ✅ CORRETO: Throw error (capturado por onError)
app.get('/throw', () => {
  throw new Error('Something went wrong')
})

// Global error handler
app.onError(({ error, code, set }) => {
  set.status = code === 'VALIDATION' ? 422 : 500

  return {
    error: error.message,
    code
  }
})
```

---

## Comparação: Implementação Incorreta vs Correta

### Caso 1: Route Handler

#### ❌ INCORRETO (Express/Fastify style)
```typescript
import { serviceNowAuthClient } from '../services'

app.post('/login', async (req, res) => {
  const { username, password } = req.body

  try {
    const result = await serviceNowAuthClient.authenticate(username, password)
    res.status(200).json(result)
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})
```

**Problemas:**
- Importa service diretamente (quebra plugin pattern)
- Usa `req`/`res` em vez de context
- Não usa TypeBox validation
- Error handling manual
- Sem type safety

#### ✅ CORRETO (Elysia best practices)
```typescript
import { authPlugin } from '../plugins/auth'

app.use(authPlugin)
   .post('/login', async ({ authClient, body, set }) => {
     try {
       return await authClient.authenticate(body.username, body.password)
     } catch (error) {
       set.status = 401
       return { error: error.message }
     }
   }, {
     body: t.Object({
       username: t.String({ minLength: 3 }),
       password: t.String({ minLength: 8 })
     }),
     response: {
       200: t.Object({
         token: t.String(),
         expiresIn: t.Number()
       }),
       401: t.Object({
         error: t.String()
       })
     },
     detail: {
       summary: 'User login',
       tags: ['Auth']
     }
   })
```

**Benefícios:**
- ✅ Usa plugin (singleton, DI)
- ✅ Context destructuring
- ✅ TypeBox validation automática
- ✅ Response schema validation
- ✅ OpenAPI documentation
- ✅ Type safety end-to-end

### Caso 2: Plugin Implementation

#### ❌ INCORRETO
```typescript
// services/AuthService.ts
export class AuthService {
  async login(username: string, password: string) { ... }
}

// routes/auth.ts
import { AuthService } from '../services/AuthService'

const authService = new AuthService()  // ❌ Nova instância por arquivo

app.post('/login', ({ body }) => authService.login(body.username, body.password))
```

**Problemas:**
- Nova instância de service (não é singleton)
- Sem lazy loading
- Sem lifecycle scope
- Não reutilizável
- Memory leak potencial

#### ✅ CORRETO
```typescript
// plugins/auth.ts
import { Elysia } from 'elysia'
import { AuthService } from '../services/AuthService'

// Module-level singleton
let _authServiceSingleton: AuthService | null = null

const getAuthService = async () => {
  if (_authServiceSingleton) {
    return { authService: _authServiceSingleton }
  }

  console.log('📦 Creating AuthService (SINGLETON)')
  _authServiceSingleton = new AuthService()
  await _authServiceSingleton.initialize()
  console.log('✅ AuthService ready')

  return { authService: _authServiceSingleton }
}

export const authPlugin = new Elysia({ name: 'auth-plugin' })
  .onStart(() => console.log('🔧 Auth plugin starting'))
  .derive(async function getAuthService() {
    return await getAuthService()
  })
  .as('global')  // ✅ CRITICAL

// routes/auth.ts
import { authPlugin } from '../plugins/auth'

app.use(authPlugin)
   .post('/login', ({ authService, body }) =>
     authService.login(body.username, body.password)
   )
```

**Benefícios:**
- ✅ Singleton (criado uma vez)
- ✅ Lazy loading (primeira requisição)
- ✅ Global scope (reutilizável)
- ✅ Named function (OpenTelemetry traces)
- ✅ Memory efficient

### Caso 3: Validation

#### ❌ INCORRETO
```typescript
// Sem validação
app.post('/user', ({ body }) => {
  // body é 'any' - sem type safety
  return createUser(body.name, body.email)
})

// Validação manual
app.post('/user', ({ body }) => {
  if (!body.name || body.name.length < 3) {
    return { error: 'Invalid name' }
  }

  if (!body.email || !body.email.includes('@')) {
    return { error: 'Invalid email' }
  }

  return createUser(body.name, body.email)
})
```

**Problemas:**
- Sem type safety
- Validação manual (verbosa, propensa a erros)
- Sem OpenAPI documentation
- Sem response validation

#### ✅ CORRETO
```typescript
app.post('/user', ({ body }) => createUser(body.name, body.email), {
  body: t.Object({
    name: t.String({ minLength: 3, maxLength: 50 }),
    email: t.String({ format: 'email' })
  }),

  response: {
    201: t.Object({
      id: t.Number(),
      name: t.String(),
      email: t.String()
    }),
    400: t.Object({
      error: t.String(),
      validation: t.Array(t.Object({
        field: t.String(),
        message: t.String()
      }))
    })
  }
})
```

**Benefícios:**
- ✅ Type safety automático
- ✅ Validação declarativa
- ✅ OpenAPI schema gerado
- ✅ Response validation
- ✅ Error handling automático

### Caso 4: Lifecycle Hooks

#### ❌ INCORRETO
```typescript
// Middleware Express-style
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)

  // Rate limiting manual
  if (rateLimiter.check(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  // Auth manual
  const token = req.headers.authorization
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.userId = validateToken(token)
  next()
})
```

**Problemas:**
- Middleware queue-based (não é event-based)
- Lógica misturada (logging + rate limit + auth)
- Sem type safety
- `req.userId` não é type-safe

#### ✅ CORRETO
```typescript
app
  // Logging
  .onRequest(({ method, path }) => {
    console.log(`${method} ${path}`)
  })

  // Rate limiting
  .onRequest(({ ip, set }) => {
    if (rateLimiter.check(ip)) {
      set.status = 429
      return { error: 'Too many requests' }
    }
  })

  // Auth extraction (derive)
  .derive(async function extractAuth({ headers }) => {
    const token = headers.authorization?.replace('Bearer ', '')
    return {
      token,
      userId: token ? await validateToken(token) : null
    }
  })

  // Auth validation (beforeHandle)
  .beforeHandle(async function requireAuth({ userId, set }) => {
    if (!userId) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
  })
```

**Benefícios:**
- ✅ Event-based lifecycle
- ✅ Separação de responsabilidades
- ✅ Type-safe context
- ✅ Named functions (tracing)
- ✅ Declarativo e legível

### Caso 5: Guard vs Repetição

#### ❌ INCORRETO
```typescript
const authSchema = {
  headers: t.Object({
    authorization: t.String()
  })
}

app.get('/profile', handler, authSchema)
   .get('/settings', handler, authSchema)
   .post('/update', handler, authSchema)
   .delete('/account', handler, authSchema)
// Repetindo authSchema 4 vezes!
```

**Problemas:**
- Repetição de código (DRY violation)
- Difícil manter (mudar auth = mudar 4 lugares)
- Verboso

#### ✅ CORRETO
```typescript
app.guard({
  headers: t.Object({
    authorization: t.String()
  })
}, (app) =>
  app
    .derive(extractUserId)
    .beforeHandle(requireAuth)

    .get('/profile', ({ userId }) => getProfile(userId))
    .get('/settings', ({ userId }) => getSettings(userId))
    .post('/update', ({ userId, body }) => updateProfile(userId, body))
    .delete('/account', ({ userId }) => deleteAccount(userId))
)
```

**Benefícios:**
- ✅ DRY (schema definido uma vez)
- ✅ Fácil manutenção
- ✅ Hooks compartilhados (derive, beforeHandle)
- ✅ Context enriquecido (userId disponível)

---

## Checklist de Compliance

Ao revisar código Elysia, verificar:

### Básico
- [ ] Usa context object (não `req`/`res`)
- [ ] Retorna valores diretamente (não `res.send()`)
- [ ] Usa TypeBox para validação
- [ ] Named functions em hooks (não arrow functions)

### Plugins
- [ ] Services em plugins (não imports diretos)
- [ ] Singleton pattern implementado
- [ ] Lazy loading pattern
- [ ] `.as('global')` onde apropriado
- [ ] Plugin com `name` (deduplication)

### Validation
- [ ] Schema TypeBox em todas as rotas
- [ ] Response schema definido
- [ ] Transform quando necessário
- [ ] Model registry para schemas reutilizáveis

### Lifecycle
- [ ] Hooks corretos para cada caso (onRequest, derive, beforeHandle, etc)
- [ ] Guard para schemas compartilhados
- [ ] Error handling com onError
- [ ] Separação de responsabilidades

### Documentation
- [ ] Swagger/OpenAPI configurado
- [ ] `detail` em endpoints importantes
- [ ] Tags organizados
- [ ] Security schemes definidos

### Observability
- [ ] OpenTelemetry configurado
- [ ] Preload em bunfig.toml
- [ ] Named functions para traces
- [ ] Custom spans onde apropriado

---

## Conclusão

ElysiaJS não é Express/Fastify/Hono com sintaxe diferente. É um framework com filosofia própria focado em:

1. **Type Safety**: TypeBox nativo, inference automático
2. **Performance**: Static code analysis, otimizações em tempo de compilação
3. **Ergonomia**: Context object, response direto, declarativo
4. **Modularidade**: Plugins com escopo, deduplication, lazy loading
5. **Observability**: OpenTelemetry nativo, named functions

**Adotar ElysiaJS corretamente = Repensar arquitetura, não apenas portar código.**

---

**END OF DOCUMENT**

Author: Juliano Stefano <jsdealencar@ayesa.com>
Date: 2025-10-06
Version: v1.0.0
