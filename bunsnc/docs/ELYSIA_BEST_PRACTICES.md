# ElysiaJS Best Practices Guide

**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

Esta documentação compila todas as best practices do ElysiaJS baseadas na documentação oficial, fornecendo um guia técnico completo para desenvolvimento de aplicações robustas e escaláveis.

## Índice

1. [Fundamentos e Arquitetura](#fundamentos-e-arquitetura)
2. [Sistema de Rotas](#sistema-de-rotas)
3. [Handlers e Context](#handlers-e-context)
4. [Sistema de Validação](#sistema-de-validação)
5. [Plugin System](#plugin-system)
6. [Lifecycle Hooks](#lifecycle-hooks)
7. [Error Handling](#error-handling)
8. [Mount Patterns](#mount-patterns)
9. [Advanced TypeScript Patterns](#advanced-typescript-patterns)
10. [Advanced Context Extension](#advanced-context-extension)
11. [Cookie Management](#cookie-management)
12. [Eden Treaty Client](#eden-treaty-client)
13. [Testing Patterns](#testing-patterns)
14. [WebSocket & Real-time](#websocket--real-time)
15. [Configuration & Deployment](#configuration--deployment)
16. [Performance & Security](#performance--security)

---

## Fundamentos e Arquitetura

### Princípio Fundamental
**"1 Elysia instance = 1 controller"**

Este é o princípio central do ElysiaJS. Cada instância do Elysia deve funcionar como um controlador único e especializado.

### Estrutura de Pastas Recomendada

```
src/
├── modules/
│   ├── auth/
│   │   ├── index.ts       # Elysia controller
│   │   ├── service.ts     # Business logic
│   │   └── model.ts       # Type definitions
│   ├── user/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── model.ts
│   └── ticket/
│       ├── index.ts
│       ├── service.ts
│       └── model.ts
├── shared/
│   ├── types/
│   ├── utils/
│   └── config/
└── main.ts
```

### Separação de Responsabilidades

#### Controller (index.ts)
```typescript
// ✅ Correto - Controller limpo focado em routing
import { Elysia, t } from 'elysia';
import { userService } from './service';
import { UserModel } from './model';

export const userController = new Elysia({ prefix: '/users' })
  .use(UserModel)
  .get('/', () => userService.getAll())
  .get('/:id', ({ params: { id } }) => userService.getById(id), {
    params: t.Object({
      id: t.String()
    })
  })
  .post('/', ({ body }) => userService.create(body), {
    body: 'CreateUser'
  });
```

#### Service (service.ts)
```typescript
// ✅ Correto - Business logic isolada
export class UserService {
  static async getAll() {
    // Business logic here
    return users;
  }

  static async getById(id: string) {
    // Business logic here
    return user;
  }

  static async create(userData: CreateUserType) {
    // Business logic here
    return newUser;
  }
}

export const userService = UserService;
```

#### Model (model.ts)
```typescript
// ✅ Correto - Schemas e tipos centralizados
import { Elysia, t } from 'elysia';

export const UserModel = new Elysia()
  .model({
    'CreateUser': t.Object({
      name: t.String({ minLength: 2 }),
      email: t.String({ format: 'email' }),
      age: t.Optional(t.Number({ minimum: 0 }))
    }),
    'UpdateUser': t.Partial(t.Object({
      name: t.String({ minLength: 2 }),
      email: t.String({ format: 'email' }),
      age: t.Number({ minimum: 0 })
    })),
    'User': t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String(),
      age: t.Number(),
      createdAt: t.Date()
    })
  });

// ✅ Type inference
export type CreateUserType = typeof UserModel.definitions['CreateUser']['static'];
export type UpdateUserType = typeof UserModel.definitions['UpdateUser']['static'];
export type UserType = typeof UserModel.definitions['User']['static'];
```

### Princípios de Design

1. **Decouple business logic from HTTP handling**
2. **Leverage TypeScript's type inference**
3. **Prioritize type safety and runtime validation**
4. **Use services for request-independent logic**
5. **Use decorators only for request-dependent properties**

---

## Sistema de Rotas

### Tipos de Paths

#### 1. Static Paths (Maior Prioridade)
```typescript
app.get('/hello', () => 'Hello World');
app.get('/api/v1/users', () => 'Users list');
```

#### 2. Dynamic Paths
```typescript
app.get('/users/:id', ({ params: { id } }) => `User ${id}`);
app.get('/posts/:postId/comments/:commentId', ({ params }) => params);
```

#### 3. Wildcard Paths (Menor Prioridade)
```typescript
app.get('/files/*', ({ params }) => params['*']);
app.get('/api/*', ({ params }) => `Catch all: ${params['*']}`);
```

### Path Parameters Avançados

#### Parâmetros Opcionais
```typescript
app.get('/users/:id?', ({ params: { id } }) => {
  return id ? `User ${id}` : 'All users';
});
```

#### Múltiplos Parâmetros
```typescript
app.get('/org/:orgId/team/:teamId/user/:userId', ({ params }) => {
  const { orgId, teamId, userId } = params;
  return { orgId, teamId, userId };
});
```

### Agrupamento de Rotas

#### Agrupamento Básico
```typescript
const app = new Elysia()
  .group('/api/v1', (app) =>
    app
      .group('/users', (app) =>
        app
          .get('/', userService.getAll)
          .get('/:id', userService.getById)
          .post('/', userService.create)
          .put('/:id', userService.update)
          .delete('/:id', userService.delete)
      )
      .group('/tickets', (app) =>
        app
          .get('/', ticketService.getAll)
          .post('/', ticketService.create)
      )
  );
```

#### Agrupamento com Middleware
```typescript
const authGroup = new Elysia()
  .derive(({ headers }) => {
    const auth = headers.authorization;
    if (!auth) throw new Error('Unauthorized');
    return { user: validateToken(auth) };
  })
  .group('/protected', (app) =>
    app
      .get('/profile', ({ user }) => user)
      .get('/dashboard', ({ user }) => getDashboard(user))
  );
```

### Roteamento Programático

```typescript
// ✅ Correto - Usando handle() para requests programáticos
const app = new Elysia().get('/', () => 'Hello');

const response = await app.handle(new Request('http://localhost/'));
const text = await response.text(); // 'Hello'
```

---

## Handlers e Context

### Tipos de Handlers

#### 1. Literal Value
```typescript
app.get('/', 'Hello World');
app.get('/json', { message: 'Hello JSON' });
```

#### 2. Function Handler
```typescript
app.get('/', () => 'Hello World');
app.get('/user/:id', ({ params: { id } }) => `User ${id}`);
```

#### 3. Async Handler
```typescript
app.get('/async', async () => {
  const data = await fetchData();
  return data;
});
```

### Context Properties

#### Core Context Properties
```typescript
app.post('/example', ({
  body,        // Request body
  query,       // Query string parameters
  params,      // Path parameters
  headers,     // HTTP headers
  cookie,      // Cookie access
  set,         // Response setter
  path,        // Request path
  request      // Raw Request object
}) => {
  return { body, query, params };
});
```

#### Context Extension Methods

##### State - Global Mutable State
```typescript
const app = new Elysia()
  .state('counter', 0)
  .get('/count', ({ store }) => store.counter)
  .post('/increment', ({ store }) => {
    store.counter++;
    return store.counter;
  });
```

##### Decorate - Add Properties to Context
```typescript
const app = new Elysia()
  .decorate('db', database)
  .decorate('logger', logger)
  .get('/users', ({ db, logger }) => {
    logger.info('Fetching users');
    return db.users.findMany();
  });
```

##### Derive - Create Values from Context
```typescript
const app = new Elysia()
  .derive(({ headers }) => ({
    auth: headers.authorization?.replace('Bearer ', '')
  }))
  .derive(({ auth }) => ({
    user: auth ? validateToken(auth) : null
  }))
  .get('/profile', ({ user }) => {
    if (!user) return { error: 'Unauthorized' };
    return user;
  });
```

##### Resolve - Safely Resolve Properties
```typescript
const app = new Elysia()
  .resolve(({ headers }) => {
    const auth = headers.authorization;
    if (!auth) throw new Error('Missing authorization');

    return {
      user: validateToken(auth)
    };
  })
  .get('/secure', ({ user }) => user);
```

### Advanced Response Patterns

#### Streaming Responses
```typescript
app.get('/stream', function* () {
  yield 'chunk 1\n';
  yield 'chunk 2\n';
  yield 'chunk 3\n';
});
```

#### Server-Sent Events (SSE)
```typescript
import { sse } from 'elysia';

// ✅ Padrão correto: Generator síncrono (function*) com yield sse()
app.get('/events', function* () {
  // Send initial connection message
  yield sse({
    event: 'connected',
    data: { message: 'Connected to SSE stream' }
  });

  // Continuous streaming with async operations
  let counter = 0;
  while (true) {
    // ✅ await is ALLOWED in sync generators (JavaScript feature)
    await new Promise(resolve => setTimeout(resolve, 1000));

    yield sse({
      event: 'message',
      data: { counter: ++counter, timestamp: Date.now() },
      id: `msg-${counter}`
    });
  }
});

// ✅ Advanced SSE: Streaming with dynamic imports and services
app.get('/metrics', function* () {
  yield sse({ event: 'connected', data: { status: 'ready' } });

  // ✅ await import() works in sync generators
  const { metricsService } = await import('./services/metrics');

  while (true) {
    // ✅ await async service calls work in sync generators
    const metrics = await metricsService.getMetrics();

    yield sse({
      event: 'metrics',
      data: metrics,
      id: `metrics-${Date.now()}`
    });

    await new Promise(r => setTimeout(r, 5000));
  }
});

// ❌ Anti-pattern: Using async function* causes yield* delegation issues
// async function* streamMetrics() {  // ❌ Avoid async generators
//   yield sse({ ... });
// }

// ❌ Anti-pattern: Wrong import path
// import { sse } from 'elysia/sse';  // ❌ Não existe

// ❌ Anti-pattern: EventSource no servidor
// new EventSource('/events');  // ❌ EventSource é client-side apenas
```

**Lições Importantes sobre SSE no ElysiaJS:**
1. Usar `import { sse } from 'elysia'` (não `elysia/sse`)
2. Handlers devem ser generators síncronos `function*()` (não `async function*()`)
3. `await` é PERMITIDO dentro de generators síncronos (feature moderna do JavaScript)
4. Evitar `yield*` delegation quando usando `await` (causa incompatibilidades no Bun runtime)
5. EventSource é CLIENT-SIDE apenas (usado no navegador para consumir SSE)

#### File Responses
```typescript
app.get('/download', () => Bun.file('./files/document.pdf'));
app.get('/image', () => Bun.file('./images/photo.jpg'));
```

#### Custom Status Codes
```typescript
app.get('/not-found', ({ set }) => {
  set.status = 404;
  return 'Not Found';
});

app.post('/created', ({ set }) => {
  set.status = 201;
  return { id: 123, message: 'Created' };
});
```

---

## Sistema de Validação

### Validação TypeBox

#### Validação de Body
```typescript
app.post('/users', ({ body }) => {
  return createUser(body);
}, {
  body: t.Object({
    name: t.String({ minLength: 2, maxLength: 50 }),
    email: t.String({ format: 'email' }),
    age: t.Optional(t.Number({ minimum: 0, maximum: 120 })),
    tags: t.Array(t.String()),
    settings: t.Object({
      notifications: t.Boolean(),
      theme: t.Union([t.Literal('light'), t.Literal('dark')])
    })
  })
});
```

#### Validação de Query Parameters
```typescript
app.get('/search', ({ query }) => {
  return search(query);
}, {
  query: t.Object({
    q: t.String({ minLength: 1 }),
    page: t.Optional(t.Number({ minimum: 1 })),
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
    sort: t.Optional(t.Union([
      t.Literal('name'),
      t.Literal('date'),
      t.Literal('relevance')
    ]))
  })
});
```

#### Validação de Path Parameters
```typescript
app.get('/users/:id', ({ params: { id } }) => {
  return getUserById(id);
}, {
  params: t.Object({
    id: t.String({ pattern: '^[0-9a-f]{24}$' }) // MongoDB ObjectId
  })
});
```

#### Validação de Headers
```typescript
app.post('/upload', ({ headers, body }) => {
  return processUpload(body, headers);
}, {
  headers: t.Object({
    'content-type': t.Literal('multipart/form-data'),
    authorization: t.String({ pattern: '^Bearer .+' })
  }),
  body: t.Object({
    file: t.File(),
    metadata: t.Optional(t.String())
  })
});
```

#### Validação de Response
```typescript
app.get('/users/:id', ({ params: { id } }) => {
  return getUserById(id);
}, {
  params: t.Object({
    id: t.String()
  }),
  response: {
    200: t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String(),
      createdAt: t.Date()
    }),
    404: t.Object({
      error: t.String(),
      code: t.Literal('USER_NOT_FOUND')
    })
  }
});
```

### Custom Error Messages
```typescript
app.post('/users', ({ body }) => body, {
  body: t.Object({
    name: t.String({
      minLength: 2,
      error: 'Name must be at least 2 characters long'
    }),
    email: t.String({
      format: 'email',
      error: 'Please provide a valid email address'
    }),
    age: t.Number({
      minimum: 18,
      error: 'Age must be at least 18'
    })
  })
});
```

### Schema Reutilização com Models

```typescript
const UserModels = new Elysia()
  .model({
    'user.create': t.Object({
      name: t.String({ minLength: 2 }),
      email: t.String({ format: 'email' }),
      password: t.String({ minLength: 8 })
    }),
    'user.update': t.Partial(t.Object({
      name: t.String({ minLength: 2 }),
      email: t.String({ format: 'email' })
    })),
    'user.response': t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String(),
      createdAt: t.Date()
    })
  });

const userRoutes = new Elysia()
  .use(UserModels)
  .post('/users', ({ body }) => createUser(body), {
    body: 'user.create',
    response: {
      201: 'user.response'
    }
  })
  .put('/users/:id', ({ params: { id }, body }) => updateUser(id, body), {
    body: 'user.update',
    response: {
      200: 'user.response'
    }
  });
```

### Validação com Namespaces

```typescript
const ApiModels = new Elysia()
  .model({
    // User namespace
    'user.create': t.Object({
      name: t.String(),
      email: t.String({ format: 'email' })
    }),
    'user.response': t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String()
    }),

    // Ticket namespace
    'ticket.create': t.Object({
      title: t.String({ minLength: 1 }),
      description: t.String(),
      priority: t.Union([
        t.Literal('low'),
        t.Literal('medium'),
        t.Literal('high'),
        t.Literal('critical')
      ])
    }),
    'ticket.response': t.Object({
      id: t.String(),
      title: t.String(),
      status: t.String(),
      createdAt: t.Date()
    })
  });
```

---

## Plugin System

### Padrões de Criação de Plugins

#### 1. Separate Instance Method
```typescript
// ✅ Plugin como instância separada
const authPlugin = new Elysia({ name: 'auth' })
  .derive(({ headers }) => ({
    auth: headers.authorization?.replace('Bearer ', '')
  }))
  .derive(({ auth }) => ({
    user: auth ? validateToken(auth) : null
  }))
  .macro(({ onBeforeHandle }) => ({
    requireAuth(enabled: boolean) {
      if (!enabled) return;

      return onBeforeHandle(({ user }) => {
        if (!user) {
          throw new Error('Unauthorized');
        }
      });
    }
  }));

// Uso do plugin
const app = new Elysia()
  .use(authPlugin)
  .get('/profile', ({ user }) => user, {
    requireAuth: true
  });
```

#### 2. Functional Callback Method
```typescript
// ✅ Plugin como função
const rateLimit = (config: { maxRequests: number; windowMs: number }) => {
  const requests = new Map<string, number[]>();

  return (app: Elysia) => app
    .derive(({ request, set }) => {
      const ip = request.headers.get('x-forwarded-for') || 'unknown';
      const now = Date.now();
      const window = requests.get(ip) || [];

      // Clean old requests
      const validRequests = window.filter(time => now - time < config.windowMs);

      if (validRequests.length >= config.maxRequests) {
        set.status = 429;
        throw new Error('Rate limit exceeded');
      }

      validRequests.push(now);
      requests.set(ip, validRequests);

      return {};
    });
};

// Uso
const app = new Elysia()
  .use(rateLimit({ maxRequests: 100, windowMs: 60000 }));
```

### Plugin Scopes

#### Local Scope (Default)
```typescript
const localPlugin = new Elysia()
  .decorate('local', 'value')
  .get('/local', ({ local }) => local);

const app = new Elysia()
  .use(localPlugin)
  .get('/main', ({ local }) => local); // ❌ Error: 'local' não existe aqui
```

#### Scoped
```typescript
const scopedPlugin = new Elysia()
  .decorate('scoped', 'value')
  .get('/scoped', ({ scoped }) => scoped)
  .as('scoped');

const app = new Elysia()
  .use(scopedPlugin)
  .get('/main', ({ scoped }) => scoped); // ✅ OK: 'scoped' disponível
```

#### Global Scope
```typescript
const globalPlugin = new Elysia()
  .decorate('global', 'value')
  .get('/global', ({ global }) => global)
  .as('global');

const app = new Elysia()
  .use(globalPlugin)
  .get('/main', ({ global }) => global); // ✅ OK: 'global' disponível em toda aplicação
```

### Plugin Performance Optimization

#### Plugin Deduplication
```typescript
// ✅ Plugins nomeados são automaticamente deduplicados
const dbPlugin = new Elysia({ name: 'database' })
  .decorate('db', database);

const userPlugin = new Elysia()
  .use(dbPlugin); // Registrado uma vez

const ticketPlugin = new Elysia()
  .use(dbPlugin); // Deduplicado automaticamente

const app = new Elysia()
  .use(userPlugin)
  .use(ticketPlugin); // dbPlugin carregado apenas uma vez
```

#### Lazy Loading
```typescript
// ✅ Plugin com carregamento sob demanda
const heavyPlugin = new Elysia({ name: 'heavy-processing' })
  .derive(async () => {
    // Carrega apenas quando necessário
    const { HeavyProcessor } = await import('./heavy-processor');
    return {
      processor: new HeavyProcessor()
    };
  });
```

#### Async Plugins
```typescript
// ✅ Plugin assíncrono que não bloqueia o startup
const asyncPlugin = new Elysia({ name: 'async-init' })
  .onStart(async () => {
    // Inicialização assíncrona
    await connectToDatabase();
    await loadConfiguration();
  })
  .decorate('ready', true);
```

### Advanced Plugin Patterns

#### Guard Method para Aplicar Schemas
```typescript
const authGuard = new Elysia()
  .guard({
    headers: t.Object({
      authorization: t.String()
    })
  }, (app) =>
    app
      .resolve(({ headers }) => ({
        user: validateToken(headers.authorization)
      }))
      .get('/profile', ({ user }) => user)
      .get('/settings', ({ user }) => getUserSettings(user))
  );
```

#### Service Locator Pattern
```typescript
const serviceLocator = new Elysia({ name: 'services' })
  .decorate('userService', userService)
  .decorate('ticketService', ticketService)
  .decorate('notificationService', notificationService);

const apiRoutes = new Elysia()
  .use(serviceLocator)
  .get('/users', ({ userService }) => userService.getAll())
  .get('/tickets', ({ ticketService }) => ticketService.getAll());
```

#### Real-time Routes Pattern (WebSocket + SSE)

**❌ Anti-pattern: Object Wrapper**
```typescript
// Viola "1 instance = 1 controller" - empacota instâncias válidas
class NotificationManager {
  getElysiaRoutes() {
    const wsRoute = this.webSocketServer.createElysiaRoute();  // Elysia instance
    const sseRoutes = this.sseManager.createElysiaRoutes();    // Elysia instance

    return {
      websocket: wsRoute,   // ❌ Empacota em objeto plain
      sse: sseRoutes        // ❌ Perde tipo Elysia
    };
  }
}

// ❌ Erro ao tentar usar
const routes = await getRealtimeRoutes();  // Promise<{websocket, sse}>
app.use(routes);  // TypeError: Invalid plugin type
```

**✅ Best Practice: Separate Controller Instances**
```typescript
// Cada controlador retorna sua própria instância Elysia
class NotificationManager {
  /**
   * Get WebSocket Elysia routes
   * Follows "1 instance = 1 controller" pattern
   */
  getWebSocketRoutes() {
    return this.webSocketServer.createElysiaRoute();  // ✅ Retorna Elysia instance
  }

  /**
   * Get SSE Elysia routes
   * Follows "1 instance = 1 controller" pattern
   */
  getSSERoutes() {
    return this.sseManager.createElysiaRoutes();  // ✅ Retorna Elysia instance
  }
}

// ✅ Uso correto seguindo "1 instance = 1 controller"
const wsRoutes = await getWebSocketRoutes();   // Elysia instance
const sseRoutes = await getSSERoutes();        // Elysia instance

app
  .use(wsRoutes)   // ✅ 1 controller = WebSocket
  .use(sseRoutes); // ✅ 1 controller = SSE
```

---

## Lifecycle Hooks

### Pipeline de Processamento de Request

O ElysiaJS processa cada request através de um pipeline bem definido com hooks específicos:

```
Request → Parse → Transform → BeforeHandle → Handler → AfterHandle → MapResponse → Response
                                                    ↓
                                                 OnError (se erro ocorrer em qualquer etapa)
```

### 1. OnRequest - Início do Processamento

```typescript
const app = new Elysia()
  .onRequest(({ request, set }) => {
    // ✅ Casos de uso ideais:
    console.log(`${request.method} ${request.url}`);

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (isRateLimited(ip)) {
      set.status = 429;
      throw new Error('Rate limit exceeded');
    }

    // Caching headers
    if (request.method === 'GET') {
      set.headers['Cache-Control'] = 'public, max-age=300';
    }

    // Analytics/Logging
    trackRequest(request.url, request.method);
  })
  .get('/', () => 'Hello World');
```

### 2. OnParse - Parsing do Body

```typescript
const app = new Elysia()
  .onParse(({ request, contentType }) => {
    // ✅ Custom parsing para content types específicos
    if (contentType === 'application/custom') {
      return request.text().then(text => {
        return parseCustomFormat(text);
      });
    }

    // ✅ Modificar parsing padrão
    if (contentType === 'application/json') {
      return request.text().then(text => {
        // Add custom validation during parsing
        const data = JSON.parse(text);
        if (typeof data !== 'object') {
          throw new Error('Expected object');
        }
        return data;
      });
    }
  })
  .post('/custom', ({ body }) => {
    // body foi processado pelo onParse customizado
    return { received: body };
  });
```

### 3. OnTransform - Transformação do Context

```typescript
const app = new Elysia()
  .onTransform(({ body, query, params }) => {
    // ✅ Normalizar dados antes da validação
    if (body && typeof body === 'object') {
      // Trim strings
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') {
          body[key] = value.trim();
        }
      }
    }

    // ✅ Converter tipos
    if (query) {
      // Convert string numbers to actual numbers
      for (const [key, value] of Object.entries(query)) {
        if (typeof value === 'string' && /^\d+$/.test(value)) {
          query[key] = parseInt(value);
        }
      }
    }
  })
  .post('/users', ({ body }) => {
    // body já foi transformado
    return createUser(body);
  }, {
    body: t.Object({
      name: t.String(),
      age: t.Number() // Funciona mesmo recebendo string do cliente
    })
  });
```

### 4. OnBeforeHandle - Validação e Autorização

```typescript
const app = new Elysia()
  .onBeforeHandle(({ headers, set, path }) => {
    // ✅ Autenticação global
    if (path.startsWith('/api/protected/')) {
      const token = headers.authorization?.replace('Bearer ', '');

      if (!token) {
        set.status = 401;
        return { error: 'Missing authorization token' };
      }

      try {
        const user = validateToken(token);
        // Adicionar user ao context via derive seria melhor
        // mas pode ser feito aqui para casos simples
      } catch {
        set.status = 401;
        return { error: 'Invalid token' };
      }
    }
  })
  .derive(({ headers }) => {
    // ✅ Melhor abordagem: usar derive para auth
    const token = headers.authorization?.replace('Bearer ', '');
    return {
      user: token ? validateToken(token) : null
    };
  })
  .onBeforeHandle(({ user, set, path }) => {
    // ✅ Role-based access control
    if (path.startsWith('/api/admin/') && user?.role !== 'admin') {
      set.status = 403;
      return { error: 'Admin access required' };
    }
  })
  .get('/api/protected/profile', ({ user }) => user)
  .get('/api/admin/users', ({ user }) => getAllUsers());
```

### 5. OnAfterHandle - Transformação da Response

```typescript
const app = new Elysia()
  .onAfterHandle(({ response, set, path }) => {
    // ✅ Adicionar metadata às responses
    if (typeof response === 'object' && response !== null) {
      return {
        data: response,
        timestamp: new Date().toISOString(),
        path,
        version: '1.0.0'
      };
    }

    // ✅ CORS headers condicionais
    if (path.startsWith('/api/public/')) {
      set.headers['Access-Control-Allow-Origin'] = '*';
    }

    return response;
  })
  .onAfterHandle(({ response, set }) => {
    // ✅ Response compression hints
    if (typeof response === 'object') {
      set.headers['Content-Type'] = 'application/json';

      // Hint para compression se response for grande
      const responseSize = JSON.stringify(response).length;
      if (responseSize > 1000) {
        set.headers['Content-Encoding'] = 'gzip';
      }
    }

    return response;
  })
  .get('/api/users', () => getUsers());
```

### 6. OnMapResponse - Transformação Final

```typescript
const app = new Elysia()
  .onMapResponse(({ response, set }) => {
    // ✅ Última chance de modificar a response
    if (response instanceof Response) {
      // Response já está pronta, adicionar headers finais
      response.headers.set('X-Powered-By', 'ElysiaJS');
      response.headers.set('X-Request-Id', crypto.randomUUID());
      return response;
    }

    // ✅ Converter para Response customizada
    return new Response(
      typeof response === 'string' ? response : JSON.stringify(response),
      {
        status: set.status || 200,
        headers: {
          ...set.headers,
          'Content-Type': set.headers['Content-Type'] ||
            (typeof response === 'object' ? 'application/json' : 'text/plain')
        }
      }
    );
  })
  .get('/', () => 'Hello World');
```

### Lifecycle Hooks Locais vs Interceptors

#### Local Hooks (Para rotas específicas)
```typescript
app.get('/users', ({ query }) => getUsers(query), {
  // ✅ Hooks locais aplicados apenas a esta rota
  beforeHandle: ({ query, set }) => {
    if (!query.page) {
      set.status = 400;
      return { error: 'Page parameter required' };
    }
  },

  afterHandle: ({ response }) => {
    return {
      data: response,
      meta: { type: 'user_list' }
    };
  }
});
```

#### Global Hooks (Interceptors)
```typescript
// ✅ Aplicado a todas as rotas
const globalLogging = new Elysia()
  .onRequest(({ request }) => {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
  })
  .onError(({ error, request }) => {
    console.error(`[ERROR] ${request.method} ${request.url}:`, error.message);
  });

const app = new Elysia()
  .use(globalLogging)
  .get('/users', () => getUsers())
  .get('/tickets', () => getTickets());
```

### Advanced Lifecycle Patterns

#### Conditional Hooks
```typescript
const conditionalAuth = new Elysia()
  .onBeforeHandle(({ path, headers, set }) => {
    // ✅ Aplicar auth apenas para certas rotas
    const protectedPaths = ['/api/admin', '/api/user/profile'];
    const isProtected = protectedPaths.some(p => path.startsWith(p));

    if (isProtected) {
      const token = headers.authorization?.replace('Bearer ', '');
      if (!token || !validateToken(token)) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
    }
  });
```

#### Pipeline Composition
```typescript
const requestLogging = new Elysia()
  .onRequest(({ request }) => {
    console.log(`Request: ${request.method} ${request.url}`);
  });

const responseLogging = new Elysia()
  .onAfterHandle(({ response, request }) => {
    console.log(`Response: ${request.method} ${request.url} - ${typeof response}`);
  });

const securityHeaders = new Elysia()
  .onMapResponse(({ response, set }) => {
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    return response;
  });

// ✅ Compose multiple lifecycle plugins
const app = new Elysia()
  .use(requestLogging)
  .use(responseLogging)
  .use(securityHeaders)
  .get('/', () => 'Hello with full pipeline');
```

---

## Error Handling

### Custom Error Types

```typescript
// ✅ Definição de erros customizados
const app = new Elysia()
  .error({
    'VALIDATION_ERROR': Error,
    'NOT_FOUND': Error,
    'UNAUTHORIZED': Error,
    'RATE_LIMITED': Error
  })
  .onError(({ code, error, set }) => {
    switch (code) {
      case 'VALIDATION_ERROR':
        set.status = 400;
        return {
          error: 'Validation failed',
          message: error.message,
          code: 'VALIDATION_ERROR'
        };

      case 'NOT_FOUND':
        set.status = 404;
        return {
          error: 'Resource not found',
          message: error.message,
          code: 'NOT_FOUND'
        };

      case 'UNAUTHORIZED':
        set.status = 401;
        return {
          error: 'Unauthorized access',
          message: 'Please provide valid credentials',
          code: 'UNAUTHORIZED'
        };

      case 'RATE_LIMITED':
        set.status = 429;
        return {
          error: 'Rate limit exceeded',
          message: 'Too many requests',
          code: 'RATE_LIMITED'
        };

      default:
        set.status = 500;
        return {
          error: 'Internal server error',
          message: 'Something went wrong',
          code: 'INTERNAL_ERROR'
        };
    }
  });
```

### Error Throwing vs Returning

#### Throwing Errors (Processado por onError)
```typescript
app.get('/users/:id', ({ params: { id } }) => {
  const user = findUser(id);

  if (!user) {
    // ✅ Throw - será capturado pelo onError
    throw new Error('User not found');
  }

  return user;
});
```

#### Returning Errors (Não processado por onError)
```typescript
app.get('/users/:id', ({ params: { id }, set }) => {
  const user = findUser(id);

  if (!user) {
    // ✅ Return - bypass onError, controle direto
    set.status = 404;
    return {
      error: 'User not found',
      code: 'USER_NOT_FOUND'
    };
  }

  return user;
});
```

### Validation Error Handling

```typescript
const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 400;

      // Em produção, esconde detalhes
      if (process.env.NODE_ENV === 'production') {
        return {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR'
        };
      }

      // Em desenvolvimento, mostra detalhes
      return {
        error: 'Validation failed',
        details: error.message,
        code: 'VALIDATION_ERROR'
      };
    }
  })
  .post('/users', ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String({
        minLength: 2,
        error: 'Name must be at least 2 characters'
      }),
      email: t.String({
        format: 'email',
        error: 'Invalid email format'
      })
    })
  });
```

### Centralized Error Handling

```typescript
// errors/errorHandler.ts
export const errorHandler = new Elysia({ name: 'error-handler' })
  .error({
    'BUSINESS_ERROR': Error,
    'VALIDATION_ERROR': Error,
    'AUTH_ERROR': Error
  })
  .onError(({ code, error, set, request }) => {
    // Log erro
    console.error(`[${code}] ${request.method} ${request.url}:`, error.message);

    const errorResponse = {
      success: false,
      timestamp: new Date().toISOString(),
      path: new URL(request.url).pathname
    };

    switch (code) {
      case 'BUSINESS_ERROR':
        set.status = 422;
        return {
          ...errorResponse,
          error: 'Business rule violation',
          message: error.message
        };

      case 'VALIDATION_ERROR':
        set.status = 400;
        return {
          ...errorResponse,
          error: 'Invalid input',
          message: error.message
        };

      case 'AUTH_ERROR':
        set.status = 401;
        return {
          ...errorResponse,
          error: 'Authentication failed',
          message: 'Invalid credentials'
        };

      default:
        set.status = 500;
        return {
          ...errorResponse,
          error: 'Internal server error',
          message: 'An unexpected error occurred'
        };
    }
  });

// Uso em toda aplicação
const app = new Elysia()
  .use(errorHandler)
  .get('/users/:id', ({ params: { id } }) => {
    const user = findUser(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  });
```

---

## Mount Patterns

### Conceito de Mount

O ElysiaJS segue o padrão WinterTC para interoperabilidade entre servidores HTTP, permitindo executar diferentes frameworks web usando `Request` e `Response` padrão.

#### Frameworks Suportados
```typescript
import { Elysia } from 'elysia';
import { Hono } from 'hono';
import { createApp } from 'h3';

// ✅ Montando diferentes frameworks
const honoApp = new Hono()
  .get('/hono-route', (c) => c.text('Hello from Hono'));

const h3App = createApp()
  .use('/h3-route', (event) => 'Hello from H3');

const app = new Elysia()
  .get('/', () => 'Hello from Elysia')
  .mount('/hono', honoApp.fetch)        // Monta Hono
  .mount('/h3', h3App.fetch)            // Monta H3
  .listen(3000);
```

### Composição de Aplicações

#### Sub-aplicações Elysia
```typescript
// ✅ Compondo múltiplas aplicações Elysia
const userApp = new Elysia({ prefix: '/users' })
  .get('/', () => getUsers())
  .get('/:id', ({ params: { id } }) => getUser(id))
  .post('/', ({ body }) => createUser(body));

const ticketApp = new Elysia({ prefix: '/tickets' })
  .get('/', () => getTickets())
  .post('/', ({ body }) => createTicket(body));

const adminApp = new Elysia({ prefix: '/admin' })
  .use(authMiddleware)
  .mount('/users', userApp.fetch)
  .mount('/tickets', ticketApp.fetch);

const mainApp = new Elysia()
  .mount('/api', adminApp.fetch)
  .get('/', () => 'Main app')
  .listen(3000);
```

#### Mount com Type Safety
```typescript
// ✅ Mantendo type safety entre aplicações
const apiV1 = new Elysia({ prefix: '/v1' })
  .get('/users', () => getUsers())
  .post('/users', ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: 'email' })
    })
  });

const apiV2 = new Elysia({ prefix: '/v2' })
  .get('/users', () => getUsersV2())
  .post('/users', ({ body }) => createUserV2(body), {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: 'email' }),
      profile: t.Object({
        bio: t.String(),
        avatar: t.Optional(t.String())
      })
    })
  });

// Export para Eden Treaty
export const app = new Elysia()
  .mount('/api', apiV1.fetch)
  .mount('/api', apiV2.fetch);

export type App = typeof app;
```

### Micro-services Architecture

#### Service Discovery Pattern
```typescript
// services/user-service.ts
export const userService = new Elysia({ name: 'user-service' })
  .get('/health', () => ({ status: 'healthy', service: 'users' }))
  .get('/users', () => getUsers())
  .get('/users/:id', ({ params: { id } }) => getUser(id));

// services/order-service.ts
export const orderService = new Elysia({ name: 'order-service' })
  .get('/health', () => ({ status: 'healthy', service: 'orders' }))
  .get('/orders', () => getOrders())
  .post('/orders', ({ body }) => createOrder(body));

// gateway.ts
const gateway = new Elysia()
  .get('/health', async () => {
    // ✅ Health check aggregado
    const services = [
      { name: 'users', check: () => userService.handle(new Request('http://localhost/health')) },
      { name: 'orders', check: () => orderService.handle(new Request('http://localhost/health')) }
    ];

    const results = await Promise.allSettled(
      services.map(async (service) => {
        const response = await service.check();
        const data = await response.json();
        return { service: service.name, ...data };
      })
    );

    return {
      status: 'healthy',
      services: results.map(result =>
        result.status === 'fulfilled' ? result.value : { error: result.reason }
      )
    };
  })
  .mount('/api/users', userService.fetch)
  .mount('/api/orders', orderService.fetch)
  .listen(3000);
```

#### Cross-Runtime Support
```typescript
// ✅ Runtime agnóstico
const universalApp = new Elysia()
  .get('/', () => ({
    runtime: typeof Bun !== 'undefined' ? 'Bun' :
             typeof Deno !== 'undefined' ? 'Deno' : 'Node',
    platform: process.platform,
    timestamp: Date.now()
  }));

// Funciona em:
// - Bun
// - Deno
// - Vercel Edge Runtime
// - Cloudflare Workers
// - Netlify Edge Functions
```

### Advanced Mount Patterns

#### Load Balancing Pattern
```typescript
// ✅ Simple load balancer
class LoadBalancer {
  private services: Array<{ fetch: Function; healthy: boolean }> = [];
  private currentIndex = 0;

  addService(service: { fetch: Function }) {
    this.services.push({ fetch: service.fetch, healthy: true });
  }

  async route(request: Request): Promise<Response> {
    const availableServices = this.services.filter(s => s.healthy);

    if (availableServices.length === 0) {
      return new Response('No healthy services', { status: 503 });
    }

    // Round-robin
    const service = availableServices[this.currentIndex % availableServices.length];
    this.currentIndex++;

    try {
      return await service.fetch(request);
    } catch (error) {
      service.healthy = false;
      // Retry with next service
      return this.route(request);
    }
  }
}

const lb = new LoadBalancer();
lb.addService(userService);
lb.addService(userServiceReplica);

const app = new Elysia()
  .mount('/api/users', (request) => lb.route(request));
```

#### Plugin Sharing Across Mounts
```typescript
// ✅ Shared plugins across mounted apps
const sharedPlugins = new Elysia({ name: 'shared' })
  .derive(({ headers }) => ({
    requestId: headers['x-request-id'] || crypto.randomUUID()
  }))
  .derive(({ headers }) => ({
    user: headers.authorization ? validateToken(headers.authorization) : null
  }));

const authApp = new Elysia()
  .use(sharedPlugins)
  .post('/login', ({ body, requestId }) => {
    console.log(`Login attempt ${requestId}`);
    return authenticateUser(body);
  });

const protectedApp = new Elysia()
  .use(sharedPlugins)
  .onBeforeHandle(({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
  })
  .get('/profile', ({ user, requestId }) => {
    console.log(`Profile access ${requestId} by ${user.id}`);
    return user;
  });

const gateway = new Elysia()
  .mount('/auth', authApp.fetch)
  .mount('/api', protectedApp.fetch);
```

---

## Observability & OpenTelemetry

### Configuração Básica

#### Setup Básico do OpenTelemetry
```typescript
import { Elysia } from 'elysia';
import { opentelemetry } from '@elysiajs/opentelemetry';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

const app = new Elysia()
  .use(opentelemetry({
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter())
    ]
  }))
  .get('/', () => 'Hello World')
  .listen(3000);
```

#### Export para Diferentes Backends
```typescript
// ✅ Axiom
const axiomApp = new Elysia()
  .use(opentelemetry({
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: 'https://api.axiom.co/v1/traces',
          headers: {
            Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
            'X-Axiom-Dataset': process.env.AXIOM_DATASET
          }
        })
      )
    ]
  }));

// ✅ Jaeger
const jaegerApp = new Elysia()
  .use(opentelemetry({
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: 'http://localhost:14268/api/traces',
        })
      )
    ]
  }));

// ✅ New Relic
const newRelicApp = new Elysia()
  .use(opentelemetry({
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: 'https://otlp.nr-data.net:4318/v1/traces',
          headers: {
            'Api-Key': process.env.NEW_RELIC_LICENSE_KEY
          }
        })
      )
    ]
  }));
```

### Instrumentação Avançada

#### Database Instrumentation
```typescript
// src/instrumentation.ts
import { opentelemetry } from '@elysiajs/opentelemetry';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PrismaInstrumentation } from '@prisma/instrumentation';

export const instrumentation = opentelemetry({
  instrumentations: [
    new PgInstrumentation(),
    new PrismaInstrumentation()
  ],
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter())
  ]
});

// bunfig.toml
// preload = ["./src/instrumentation.ts"]

// src/index.ts
import { Elysia } from 'elysia';
import { instrumentation } from './instrumentation';

const app = new Elysia()
  .use(instrumentation)
  .get('/users', async () => {
    // ✅ Queries são automaticamente traced
    const users = await prisma.user.findMany();
    return users;
  })
  .listen(3000);
```

#### Custom Spans e Metrics
```typescript
import { record, getCurrentSpan, setAttributes } from '@elysiajs/opentelemetry';

const app = new Elysia()
  .use(opentelemetry())
  .derive(async function authenticateUser({ headers }) {
    // ✅ Custom span para autenticação
    return record('auth.validate_token', async () => {
      const token = headers.authorization?.replace('Bearer ', '');

      if (!token) {
        setAttributes({ 'auth.result': 'missing_token' });
        return { user: null };
      }

      try {
        const user = await validateTokenWithCache(token);
        setAttributes({
          'auth.result': 'success',
          'auth.user_id': user.id,
          'auth.user_role': user.role
        });
        return { user };
      } catch (error) {
        setAttributes({
          'auth.result': 'failed',
          'auth.error': error.message
        });
        return { user: null };
      }
    });
  })
  .get('/api/users', ({ user }) => {
    return record('database.get_users', async () => {
      // ✅ Span customizado para operação de DB
      const span = getCurrentSpan();
      span?.setAttributes({
        'db.operation': 'select',
        'db.table': 'users',
        'user.requesting': user?.id || 'anonymous'
      });

      const users = await getUsers();

      span?.setAttributes({
        'db.result.count': users.length
      });

      return users;
    });
  });
```

### Production Best Practices

#### Named Functions para Melhor Tracing
```typescript
// ❌ Ruim - spans serão "anonymous"
const badApp = new Elysia()
  .derive(async ({ headers }) => {
    return { user: await getUser(headers.authorization) };
  })
  .get('/profile', ({ user }) => user);

// ✅ Bom - spans terão nomes descritivos
const goodApp = new Elysia()
  .derive(async function getUserFromAuth({ headers }) {
    return { user: await getUser(headers.authorization) };
  })
  .get('/profile', function getUserProfile({ user }) {
    return user;
  });
```

#### Error Tracking e Exception Handling
```typescript
const app = new Elysia()
  .use(opentelemetry())
  .onError(({ error, set, code }) => {
    // ✅ OpenTelemetry automaticamente captura exceções
    const span = getCurrentSpan();

    span?.setAttributes({
      'error.type': code,
      'error.message': error.message,
      'error.stack': error.stack,
      'http.status_code': set.status || 500
    });

    // Log estruturado para correlação
    console.error('Request failed', {
      error: error.message,
      code,
      traceId: span?.spanContext().traceId,
      spanId: span?.spanContext().spanId
    });

    return {
      error: 'Internal server error',
      traceId: span?.spanContext().traceId
    };
  })
  .get('/risky-operation', () => {
    return record('business.risky_operation', async () => {
      try {
        const result = await performRiskyOperation();
        setAttributes({ 'operation.result': 'success' });
        return result;
      } catch (error) {
        setAttributes({
          'operation.result': 'failed',
          'operation.error': error.message
        });
        throw error;
      }
    });
  });
```

#### Performance Monitoring
```typescript
const performanceApp = new Elysia()
  .use(opentelemetry())
  .derive(function trackPerformance({ request }) {
    const startTime = Date.now();

    return {
      trackOperation: (name: string) => {
        return record(name, async (operation) => {
          const result = await operation();
          const duration = Date.now() - startTime;

          setAttributes({
            'performance.duration_ms': duration,
            'performance.operation': name,
            'http.method': request.method,
            'http.url': request.url
          });

          // Alert se operação for muito lenta
          if (duration > 5000) {
            console.warn(`Slow operation detected: ${name} took ${duration}ms`);
          }

          return result;
        });
      }
    };
  })
  .get('/heavy-operation', ({ trackOperation }) => {
    return trackOperation('heavy_computation')(() => {
      return performHeavyComputation();
    });
  });
```

#### Build Configuration para Produção
```bash
# ✅ Excluir bibliotecas instrumentadas do bundle
bun build --compile --external pg --external prisma --outfile server src/index.ts

# ✅ Package.json para produção
{
  "dependencies": {
    "pg": "^8.15.6",
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "@elysiajs/opentelemetry": "^1.2.0",
    "@opentelemetry/instrumentation-pg": "^0.52.0",
    "@prisma/instrumentation": "^5.0.0"
  }
}

# ✅ Install apenas deps de produção no servidor
bun install --production
```

---

## Testing Patterns

### Bun Test Runner

#### Configuração Básica
```typescript
// tests/setup.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Elysia } from 'elysia';

export { describe, it, expect, beforeAll, afterAll };

export const createTestApp = () => new Elysia();

export const makeRequest = (app: Elysia, path: string, options?: RequestInit) => {
  return app.handle(new Request(`http://localhost${path}`, options));
};
```

#### Unit Tests para Controllers
```typescript
// tests/user.test.ts
import { describe, it, expect } from './setup';
import { userController } from '../src/modules/user';

describe('User Controller', () => {
  it('should get all users', async () => {
    const response = await userController.handle(
      new Request('http://localhost/users')
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should get user by id', async () => {
    const response = await userController.handle(
      new Request('http://localhost/users/123')
    );

    expect(response.status).toBe(200);

    const user = await response.json();
    expect(user).toHaveProperty('id', '123');
  });

  it('should create new user', async () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com'
    };

    const response = await userController.handle(
      new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
    );

    expect(response.status).toBe(201);

    const user = await response.json();
    expect(user).toHaveProperty('name', userData.name);
    expect(user).toHaveProperty('email', userData.email);
    expect(user).toHaveProperty('id');
  });

  it('should validate user creation', async () => {
    const invalidData = {
      name: 'a', // muito curto
      email: 'invalid-email'
    };

    const response = await userController.handle(
      new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })
    );

    expect(response.status).toBe(400);

    const error = await response.json();
    expect(error).toHaveProperty('error');
  });
});
```

#### Integration Tests
```typescript
// tests/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from './setup';
import { app } from '../src/main';

describe('App Integration', () => {
  beforeAll(async () => {
    // Setup test database, etc.
    await setupTestEnvironment();
  });

  afterAll(async () => {
    // Cleanup
    await cleanupTestEnvironment();
  });

  it('should handle full user lifecycle', async () => {
    // 1. Create user
    const createResponse = await app.handle(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com'
        })
      })
    );

    expect(createResponse.status).toBe(201);
    const user = await createResponse.json();

    // 2. Get user
    const getResponse = await app.handle(
      new Request(`http://localhost/api/users/${user.id}`)
    );

    expect(getResponse.status).toBe(200);
    const fetchedUser = await getResponse.json();
    expect(fetchedUser.id).toBe(user.id);

    // 3. Update user
    const updateResponse = await app.handle(
      new Request(`http://localhost/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' })
      })
    );

    expect(updateResponse.status).toBe(200);

    // 4. Delete user
    const deleteResponse = await app.handle(
      new Request(`http://localhost/api/users/${user.id}`, {
        method: 'DELETE'
      })
    );

    expect(deleteResponse.status).toBe(204);
  });
});
```

### Eden Treaty Testing

```typescript
// tests/eden.test.ts
import { treaty } from '@elysiajs/eden';
import { describe, it, expect } from './setup';
import type { App } from '../src/main';

const api = treaty<App>('http://localhost:3000');

describe('Eden Treaty Tests', () => {
  it('should provide type-safe API calls', async () => {
    // ✅ Type-safe API call
    const { data, error } = await api.users.post({
      name: 'John Doe',
      email: 'john@example.com'
    });

    if (error) {
      expect(error.status).toBe(400);
      expect(error.value).toHaveProperty('message');
    } else {
      expect(data).toHaveProperty('id');
      expect(data.name).toBe('John Doe');
    }
  });

  it('should handle errors type-safely', async () => {
    const { data, error } = await api.users({ id: 'invalid-id' }).get();

    if (error) {
      expect(error.status).toBe(404);
      expect(error.value.code).toBe('USER_NOT_FOUND');
    }
  });
});
```

### Testing Utilities

```typescript
// tests/utils.ts
import { Elysia } from 'elysia';

export class TestClient {
  constructor(private app: Elysia) {}

  async get(path: string, headers?: Record<string, string>) {
    return this.request('GET', path, undefined, headers);
  }

  async post(path: string, body?: any, headers?: Record<string, string>) {
    return this.request('POST', path, body, headers);
  }

  async put(path: string, body?: any, headers?: Record<string, string>) {
    return this.request('PUT', path, body, headers);
  }

  async delete(path: string, headers?: Record<string, string>) {
    return this.request('DELETE', path, undefined, headers);
  }

  private async request(
    method: string,
    path: string,
    body?: any,
    headers: Record<string, string> = {}
  ) {
    const request = new Request(`http://localhost${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const response = await this.app.handle(request);

    return {
      status: response.status,
      headers: response.headers,
      json: async () => response.json(),
      text: async () => response.text()
    };
  }
}

// Uso
const client = new TestClient(userController);
const response = await client.post('/users', { name: 'Test' });
```

---

## WebSocket & Real-time

### WebSocket Básico

```typescript
import { Elysia } from 'elysia';

const app = new Elysia()
  .ws('/ws', {
    // Quando nova conexão é estabelecida
    open(ws) {
      console.log('Client connected:', ws.id);
      ws.send('Welcome to WebSocket!');
    },

    // Quando mensagem é recebida
    message(ws, message) {
      console.log('Received:', message);

      // Echo de volta para o cliente
      ws.send(`Echo: ${message}`);

      // Ou broadcast para todos os clientes
      ws.publish('global', `Broadcast: ${message}`);
    },

    // Quando conexão é fechada
    close(ws, code, reason) {
      console.log('Client disconnected:', ws.id, code, reason);
    },

    // Quando pronto para receber mais dados
    drain(ws) {
      console.log('Ready for more data');
    }
  });
```

### WebSocket com Validação

```typescript
const chatApp = new Elysia()
  .ws('/chat', {
    body: t.Object({
      type: t.Union([
        t.Literal('message'),
        t.Literal('join'),
        t.Literal('leave')
      ]),
      content: t.String(),
      room: t.Optional(t.String())
    }),

    response: t.Object({
      type: t.String(),
      content: t.String(),
      timestamp: t.Number(),
      user: t.Optional(t.String())
    }),

    message(ws, { type, content, room }) {
      const response = {
        type,
        content,
        timestamp: Date.now(),
        user: ws.data.user?.name
      };

      switch (type) {
        case 'message':
          if (room) {
            ws.publish(room, response);
          } else {
            ws.publish('global', response);
          }
          break;

        case 'join':
          ws.subscribe(content); // content = room name
          ws.publish(content, {
            type: 'notification',
            content: `${ws.data.user?.name} joined the room`,
            timestamp: Date.now()
          });
          break;

        case 'leave':
          ws.unsubscribe(content);
          ws.publish(content, {
            type: 'notification',
            content: `${ws.data.user?.name} left the room`,
            timestamp: Date.now()
          });
          break;
      }
    }
  });
```

### WebSocket Authentication

```typescript
const authenticatedWS = new Elysia()
  .ws('/ws', {
    beforeHandle({ headers, set }) {
      const token = headers.authorization?.replace('Bearer ', '');

      if (!token) {
        set.status = 401;
        return 'Unauthorized';
      }

      try {
        const user = validateToken(token);
        return { user };
      } catch {
        set.status = 401;
        return 'Invalid token';
      }
    },

    open(ws) {
      console.log(`User ${ws.data.user.name} connected`);

      // Subscribe to user-specific channel
      ws.subscribe(`user:${ws.data.user.id}`);

      // Subscribe to user's groups
      ws.data.user.groups.forEach(group => {
        ws.subscribe(`group:${group.id}`);
      });
    },

    message(ws, message) {
      // Todas as mensagens incluem informações do usuário
      const enrichedMessage = {
        ...message,
        user: ws.data.user,
        timestamp: Date.now()
      };

      ws.publish('global', enrichedMessage);
    }
  });
```

### Real-time Notifications

```typescript
// Real-time notification system
class NotificationManager {
  private app: Elysia;

  constructor(app: Elysia) {
    this.app = app;
  }

  // Notificação para usuário específico
  notifyUser(userId: string, notification: any) {
    this.app.server?.publish(
      `user:${userId}`,
      JSON.stringify({
        type: 'notification',
        data: notification,
        timestamp: Date.now()
      })
    );
  }

  // Notificação para grupo
  notifyGroup(groupId: string, notification: any) {
    this.app.server?.publish(
      `group:${groupId}`,
      JSON.stringify({
        type: 'group_notification',
        data: notification,
        timestamp: Date.now()
      })
    );
  }

  // Broadcast global
  broadcast(notification: any) {
    this.app.server?.publish(
      'global',
      JSON.stringify({
        type: 'broadcast',
        data: notification,
        timestamp: Date.now()
      })
    );
  }
}

const app = new Elysia()
  .decorate('notifications', new NotificationManager(app))
  .ws('/notifications', {
    open(ws) {
      const userId = ws.data.user.id;
      ws.subscribe(`user:${userId}`);
      ws.subscribe('global');

      // Subscribe to user's groups
      ws.data.user.groups.forEach(group => {
        ws.subscribe(`group:${group.id}`);
      });
    },

    message(ws, message) {
      // Handle client actions that might trigger notifications
      if (message.type === 'mark_read') {
        // Handle read receipts
        markNotificationAsRead(message.notificationId);
      }
    }
  })
  .post('/api/notify/:userId', ({ params: { userId }, body, notifications }) => {
    notifications.notifyUser(userId, body);
    return { success: true };
  });
```

### WebSocket Configuration

```typescript
const wsApp = new Elysia()
  .ws('/ws', {
    // Configuração de compressão
    perMessageDeflate: true,

    // Tamanho máximo da mensagem (em bytes)
    maxPayloadLength: 1024 * 1024, // 1MB

    // Timeout de inatividade (em segundos)
    idleTimeout: 300, // 5 minutos

    // Limite de backpressure
    backpressureLimit: 1024 * 1024, // 1MB

    message(ws, message) {
      ws.send(message);
    }
  }, {
    // Validação da query string na conexão
    query: t.Object({
      token: t.String(),
      room: t.Optional(t.String())
    })
  });
```

---

## Configuration & Deployment

### Server Configuration

```typescript
// config/server.ts
export const serverConfig = {
  development: {
    port: 3000,
    hostname: 'localhost',
    reusePort: true
  },

  production: {
    port: process.env.PORT || 8080,
    hostname: '0.0.0.0',
    reusePort: true,

    // TLS Configuration
    tls: process.env.TLS_KEY && process.env.TLS_CERT ? {
      key: Bun.file(process.env.TLS_KEY),
      cert: Bun.file(process.env.TLS_CERT)
    } : undefined
  }
};

const app = new Elysia({
  serve: serverConfig[process.env.NODE_ENV as keyof typeof serverConfig]
});
```

### Environment Configuration

```typescript
// config/env.ts
import { t } from 'elysia';

const envSchema = t.Object({
  NODE_ENV: t.Union([
    t.Literal('development'),
    t.Literal('production'),
    t.Literal('test')
  ]),
  PORT: t.Number({ minimum: 1, maximum: 65535 }),
  DATABASE_URL: t.String(),
  REDIS_URL: t.String(),
  JWT_SECRET: t.String({ minLength: 32 }),
  API_RATE_LIMIT: t.Number({ minimum: 1 })
});

export const env = (() => {
  try {
    return envSchema.parse({
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: parseInt(process.env.PORT || '3000'),
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      API_RATE_LIMIT: parseInt(process.env.API_RATE_LIMIT || '100')
    });
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
})();
```

### Performance Optimization

#### Ahead of Time (AOT) Compilation
```typescript
const app = new Elysia({
  aot: true // Enable AOT compilation for better performance
})
  .get('/', () => 'Hello World')
  .get('/json', () => ({ message: 'Hello JSON' }))
  .post('/echo', ({ body }) => body);
```

#### Plugin Naming for Performance
```typescript
// ✅ Named plugins são cached e deduplicados
const databasePlugin = new Elysia({ name: 'database' })
  .decorate('db', database);

const cachePlugin = new Elysia({ name: 'cache' })
  .decorate('cache', redisCache);

// Plugins são automaticamente deduplicados
const userModule = new Elysia()
  .use(databasePlugin)
  .use(cachePlugin);

const orderModule = new Elysia()
  .use(databasePlugin) // Não será duplicado
  .use(cachePlugin);   // Não será duplicado
```

### Production Deployment

#### Docker Configuration
```dockerfile
# Dockerfile
FROM oven/bun:1.0-slim

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build application
RUN bun build src/main.ts --outdir dist --target bun

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 bunapp && \
    adduser --system --uid 1001 bunapp

USER bunapp

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

CMD ["bun", "dist/main.js"]
```

#### Health Check Endpoint
```typescript
const healthCheck = new Elysia()
  .get('/health', () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  }))
  .get('/ready', async ({ set }) => {
    try {
      // Check dependencies
      await Promise.all([
        database.ping(),
        redis.ping(),
        // other health checks
      ]);

      return { status: 'ready' };
    } catch (error) {
      set.status = 503;
      return {
        status: 'not ready',
        error: error.message
      };
    }
  });
```

#### Graceful Shutdown
```typescript
// main.ts
const app = new Elysia()
  .use(healthCheck)
  .use(apiRoutes)
  .listen(3000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');

  // Stop accepting new connections
  app.stop();

  // Close database connections
  await database.close();
  await redis.quit();

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  app.stop();
  process.exit(0);
});
```

---

## Performance & Security

### Performance Best Practices

#### 1. Use Static Responses
```typescript
// ✅ Static responses são otimizadas automaticamente
app.get('/ping', 'pong');
app.get('/health', { status: 'ok' });
```

#### 2. Minimize Context Usage
```typescript
// ❌ Evite: Passar contexto inteiro para services
app.get('/users', (context) => userService.getAll(context));

// ✅ Prefira: Extrair apenas o necessário
app.get('/users', ({ query }) => userService.getAll(query));
```

#### 3. Use Derive Wisely
```typescript
// ✅ Derive para computações caras que são reutilizadas
app.derive(({ headers }) => {
  // Executado uma vez por request
  const auth = parseAuthHeader(headers.authorization);
  return { auth };
});

// ❌ Evite: Derive para valores simples
app.derive(() => ({ timestamp: Date.now() })); // Redundante
```

#### 4. Plugin Performance
```typescript
// ✅ Plugin nomeado para cache automático
const expensivePlugin = new Elysia({ name: 'expensive', seed: config })
  .derive(async () => {
    const data = await expensiveComputation();
    return { data };
  });
```

### Security Best Practices

#### 1. Input Validation
```typescript
// ✅ Sempre validar inputs
app.post('/users', ({ body }) => createUser(body), {
  body: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    email: t.String({ format: 'email' }),
    age: t.Number({ minimum: 0, maximum: 120 }),
    // Evitar campos não esperados
    additionalProperties: false
  })
});
```

#### 2. Authentication & Authorization
```typescript
const authMiddleware = new Elysia()
  .derive(({ headers, set }) => {
    const token = headers.authorization?.replace('Bearer ', '');

    if (!token) {
      set.status = 401;
      throw new Error('Missing authorization token');
    }

    try {
      const user = validateJWT(token);
      return { user };
    } catch {
      set.status = 401;
      throw new Error('Invalid token');
    }
  });

const adminOnly = new Elysia()
  .use(authMiddleware)
  .derive(({ user, set }) => {
    if (user.role !== 'admin') {
      set.status = 403;
      throw new Error('Admin access required');
    }

    return {};
  });
```

#### 3. Rate Limiting
```typescript
const rateLimit = (config: { requests: number; windowMs: number }) => {
  const windows = new Map<string, { count: number; resetTime: number }>();

  return new Elysia()
    .derive(({ request, set }) => {
      const ip = request.headers.get('x-forwarded-for') ||
                 request.headers.get('x-real-ip') ||
                 'unknown';
      const now = Date.now();

      let window = windows.get(ip);

      if (!window || now > window.resetTime) {
        window = { count: 0, resetTime: now + config.windowMs };
        windows.set(ip, window);
      }

      window.count++;

      if (window.count > config.requests) {
        set.status = 429;
        set.headers['Retry-After'] = Math.ceil((window.resetTime - now) / 1000).toString();
        throw new Error('Rate limit exceeded');
      }

      // Cleanup old windows periodically
      if (Math.random() < 0.01) {
        for (const [key, win] of windows) {
          if (now > win.resetTime) {
            windows.delete(key);
          }
        }
      }

      return {};
    });
};

// Uso
app.use(rateLimit({ requests: 100, windowMs: 60000 }));
```

#### 4. CORS Configuration
```typescript
import { cors } from '@elysiajs/cors';

const app = new Elysia()
  .use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['https://yourdomain.com']
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
```

#### 5. Security Headers
```typescript
const securityHeaders = new Elysia()
  .derive(({ set }) => {
    // Security headers
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    set.headers['X-XSS-Protection'] = '1; mode=block';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    set.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()';

    if (process.env.NODE_ENV === 'production') {
      set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }

    return {};
  });
```

#### 6. Input Sanitization
```typescript
import { rateLimit } from '@elysiajs/rate-limit';
import { helmet } from 'elysia-helmet';

const secureApp = new Elysia()
  .use(helmet()) // Security headers automáticos
  .use(rateLimit())
  .derive(({ body, query, params }) => {
    // Sanitize inputs
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj.trim().slice(0, 1000); // Limit string length
      }
      if (typeof obj === 'object' && obj !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof key === 'string' && key.length < 100) {
            sanitized[key] = sanitize(value);
          }
        }
        return sanitized;
      }
      return obj;
    };

    return {
      sanitizedBody: body ? sanitize(body) : undefined,
      sanitizedQuery: query ? sanitize(query) : undefined,
      sanitizedParams: params ? sanitize(params) : undefined
    };
  });
```

### Type Safety Patterns

#### 1. Strict Type Inference
```typescript
// ✅ Use o sistema de tipos do Elysia
const UserModel = new Elysia()
  .model({
    'user': t.Object({
      id: t.String(),
      name: t.String(),
      email: t.String({ format: 'email' })
    })
  });

// ✅ Type inference automática
type User = typeof UserModel.definitions['user']['static'];
```

#### 2. Eden Treaty for Client Type Safety
```typescript
// server.ts - Export app type
export const app = new Elysia()
  .get('/users', () => getUsers())
  .post('/users', ({ body }) => createUser(body), {
    body: 'CreateUser'
  });

export type App = typeof app;

// client.ts - Type-safe client
import { treaty } from '@elysiajs/eden';
import type { App } from './server';

const api = treaty<App>('http://localhost:3000');

// ✅ Completamente type-safe
const { data, error } = await api.users.post({
  name: 'John',
  email: 'john@example.com'
});
```

#### 3. Database Type Safety
```typescript
// ✅ Type-safe database operations
interface User {
  id: string;
  name: string;
  email: string;
}

const dbPlugin = new Elysia()
  .decorate('db', {
    users: {
      async findMany(): Promise<User[]> {
        // Implementation
        return [];
      },
      async findById(id: string): Promise<User | null> {
        // Implementation
        return null;
      },
      async create(data: Omit<User, 'id'>): Promise<User> {
        // Implementation
        return { id: '1', ...data };
      }
    }
  });

// ✅ Usage com type safety completa
const userRoutes = new Elysia()
  .use(dbPlugin)
  .get('/users', ({ db }) => db.users.findMany()) // Return type: Promise<User[]>
  .get('/users/:id', ({ params: { id }, db }) =>
    db.users.findById(id) // Return type: Promise<User | null>
  );
```

---

## Advanced TypeScript Patterns

### 1. Type Validation com TypeBox

ElysiaJS utiliza TypeBox para validação de tipos em runtime, fornecendo type safety completa:

```typescript
import { t } from 'elysia';

// ✅ Tipos primitivos básicos
const userSchema = t.Object({
  name: t.String(),
  age: t.Number(),
  active: t.Boolean(),
  tags: t.Array(t.String())
});

// ✅ Tipos avançados e utilities
const advancedSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  email: t.String({ format: 'email' }),
  role: t.Union([
    t.Literal('admin'),
    t.Literal('user'),
    t.Literal('guest')
  ]),
  metadata: t.Optional(t.Object({
    preferences: t.Partial(t.Object({
      theme: t.String(),
      language: t.String()
    }))
  })),
  avatar: t.Nullable(t.String()),
  permissions: t.UnionEnum(['read', 'write', 'delete'])
});
```

### 2. Conversões Automáticas para HTTP

ElysiaJS automaticamente converte tipos para adequação HTTP:

```typescript
const app = new Elysia()
  .get('/user/:id', ({ params, query }) => {
    // params.id é automaticamente string
    // query pode ser convertido conforme schema
    return { id: params.id };
  }, {
    params: t.Object({
      id: t.Number() // ✅ Automaticamente convertido para t.Numeric()
    }),
    query: t.Object({
      active: t.Boolean() // ✅ Automaticamente convertido para t.BooleanString()
    })
  });
```

### 3. Tipos Especializados

```typescript
// ✅ File uploads
const fileUploadSchema = t.Object({
  document: t.File({
    type: ['application/pdf', 'image/jpeg'],
    maxSize: '5m'
  }),
  images: t.Files({
    type: ['image/*'],
    maxItems: 5
  })
});

// ✅ Form data handling
const formSchema = t.Form({
  username: t.String(),
  password: t.String({ minLength: 8 }),
  remember: t.Optional(t.Boolean())
});

// ✅ Cookie validation
const cookieSchema = t.Cookie({
  session: t.String(),
  preferences: t.Optional(t.Object({
    theme: t.String()
  }))
});
```

---

## Advanced Context Extension

### 1. State - Global Mutable Storage

O `state` é usado para valores primitivos mutáveis compartilhados globalmente:

```typescript
const app = new Elysia()
  .state('version', '1.0.0')
  .state('requestCount', 0)
  .state('config', {
    maxUsers: 1000,
    maintenance: false
  })
  .get('/stats', ({ store }) => {
    // ✅ Incrementar contador de requests
    store.requestCount++;

    return {
      version: store.version,
      requestCount: store.requestCount,
      config: store.config
    };
  })
  .post('/maintenance', ({ store, body }) => {
    // ✅ Modificar estado global
    store.config.maintenance = body.enabled;
    return { success: true };
  }, {
    body: t.Object({
      enabled: t.Boolean()
    })
  });
```

### 2. Decorate - Constant Properties e Objects

O `decorate` é usado para propriedades readonly e objetos não-primitivos:

```typescript
class Logger {
  log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  error(message: string) {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
  }
}

const database = {
  async findUser(id: string) {
    // Database implementation
    return { id, name: 'User' };
  },

  async createUser(data: any) {
    // Database implementation
    return { id: crypto.randomUUID(), ...data };
  }
};

const app = new Elysia()
  .decorate('logger', new Logger())
  .decorate('db', database)
  .decorate('constants', {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png'],
    API_VERSION: '1.0'
  })
  .get('/users/:id', async ({ params: { id }, logger, db }) => {
    logger.log(`Fetching user ${id}`);

    try {
      const user = await db.findUser(id);
      return user;
    } catch (error) {
      logger.error(`Failed to fetch user ${id}: ${error}`);
      throw new Error('User not found');
    }
  });
```

### 3. Derive - Dynamic Property Creation

O `derive` cria propriedades dinamicamente a partir do contexto existente:

```typescript
const authApp = new Elysia()
  .derive(({ headers }) => {
    const auth = headers.authorization;

    return {
      // ✅ Extrair Bearer token
      bearer: auth?.startsWith('Bearer ') ? auth.slice(7) : null,

      // ✅ Parse de User-Agent
      userAgent: headers['user-agent'] || 'unknown',

      // ✅ Detectar tipo de cliente
      clientType: headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop'
    };
  })
  .derive(({ bearer }) => {
    // ✅ Decode JWT token (exemplo)
    if (!bearer) return { user: null };

    try {
      const payload = decodeJWT(bearer);
      return {
        user: {
          id: payload.sub,
          role: payload.role,
          permissions: payload.permissions || []
        }
      };
    } catch {
      return { user: null };
    }
  })
  .get('/profile', ({ user, clientType }) => {
    if (!user) {
      throw new Error('Unauthorized');
    }

    return {
      user,
      optimizedFor: clientType
    };
  });
```

### 4. Resolve - Type-Safe Property Assignment

O `resolve` garante integridade de tipos e é executado após validação:

```typescript
const secureApp = new Elysia()
  .resolve(({ headers, query }) => {
    // ✅ Validação de API key obrigatória
    const apiKey = headers['x-api-key'];
    if (!apiKey) {
      throw new Error('API key required');
    }

    // ✅ Validação de rate limiting
    const rateLimitKey = `rate_limit:${apiKey}`;
    const currentRequests = getRateLimitCount(rateLimitKey);
    if (currentRequests > 100) {
      throw new Error('Rate limit exceeded');
    }

    return {
      validatedApiKey: apiKey,
      remainingRequests: 100 - currentRequests,

      // ✅ Parse seguro de parâmetros
      pagination: {
        page: Math.max(1, parseInt(query.page || '1')),
        limit: Math.min(100, Math.max(1, parseInt(query.limit || '10')))
      }
    };
  })
  .get('/data', ({ validatedApiKey, pagination, remainingRequests }) => {
    // ✅ Contexto já validado e type-safe
    incrementRateLimit(`rate_limit:${validatedApiKey}`);

    return {
      data: getData(pagination),
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        remainingRequests: remainingRequests - 1
      }
    };
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String())
    })
  });
```

### 5. Advanced Context Patterns

```typescript
// ✅ Plugin com context extension
const auditPlugin = new Elysia({ name: 'audit' })
  .derive(() => ({
    requestId: crypto.randomUUID(),
    startTime: Date.now()
  }))
  .resolve(({ requestId, headers }) => {
    const userId = extractUserIdFromHeaders(headers);

    return {
      auditContext: {
        requestId,
        userId,
        timestamp: new Date().toISOString(),
        userAgent: headers['user-agent']
      }
    };
  })
  .onAfterHandle(({ auditContext, response }) => {
    // ✅ Log de auditoria automático
    logAuditEvent({
      ...auditContext,
      responseStatus: response instanceof Response ? response.status : 200,
      duration: Date.now() - auditContext.timestamp
    });
  });

// ✅ Context com cache inteligente
const cachePlugin = new Elysia({ name: 'cache' })
  .derive(({ request }) => {
    const cacheKey = generateCacheKey(request.url, request.method);

    return {
      cacheKey,

      // ✅ Cache utilities
      cache: {
        async get<T>(): Promise<T | null> {
          return getCachedData<T>(cacheKey);
        },

        async set<T>(data: T, ttl: number = 3600): Promise<void> {
          await setCachedData(cacheKey, data, ttl);
        },

        async invalidate(): Promise<void> {
          await deleteCachedData(cacheKey);
        }
      }
    };
  });

// ✅ Usage combinado
const apiApp = new Elysia()
  .use(auditPlugin)
  .use(cachePlugin)
  .get('/expensive-operation', async ({ cache, auditContext }) => {
    // ✅ Verificar cache primeiro
    const cached = await cache.get();
    if (cached) {
      return { data: cached, source: 'cache' };
    }

    // ✅ Operação custosa
    const result = await performExpensiveOperation();

    // ✅ Salvar no cache
    await cache.set(result, 1800); // 30 minutos

    return { data: result, source: 'computed' };
  });
```

### 6. Error Handling em Context Extension

```typescript
const robustApp = new Elysia()
  .derive(({ headers }) => {
    try {
      const auth = headers.authorization;
      if (!auth) return { auth: null };

      return {
        auth: parseAuthHeader(auth)
      };
    } catch (error) {
      // ✅ Retornar Error para exit early
      return new Error('Invalid authorization header');
    }
  })
  .resolve(({ auth }) => {
    if (!auth) {
      // ✅ Exit early com erro type-safe
      return new Error('Authentication required');
    }

    if (!isValidAuth(auth)) {
      return new Error('Invalid credentials');
    }

    return {
      validatedAuth: auth,
      permissions: getPermissions(auth.userId)
    };
  })
  .get('/protected', ({ validatedAuth, permissions }) => {
    // ✅ Contexto garantidamente válido aqui
    return {
      user: validatedAuth.userId,
      permissions
    };
  });
```

### 7. Plugin Context Isolation com Affix

```typescript
// ✅ Plugin com prefix para evitar conflitos
const dbPlugin = new Elysia({ name: 'database' })
  .decorate({
    connection: createDatabaseConnection(),
    query: createQueryBuilder(),
    transaction: createTransactionManager()
  })
  .affix('pre', 'db'); // Adiciona 'db' prefix

const cachePlugin = new Elysia({ name: 'cache' })
  .decorate({
    client: createRedisClient(),
    get: createCacheGetter(),
    set: createCacheSetter()
  })
  .affix('pre', 'cache'); // Adiciona 'cache' prefix

// ✅ Usage com namespaces isolados
const app = new Elysia()
  .use(dbPlugin)
  .use(cachePlugin)
  .get('/users/:id', async ({
    params: { id },
    dbConnection,
    dbQuery,
    cacheClient,
    cacheGet
  }) => {
    // ✅ Context properties têm prefixes claros
    const cached = await cacheGet(`user:${id}`);
    if (cached) return cached;

    const user = await dbQuery.findUser(id);
    await cacheSet(`user:${id}`, user, 3600);

    return user;
  });
```

---

## Advanced Context Extension

### 1. State - Global Mutable Storage

Use `state` para valores primitivos mutáveis compartilhados globalmente:

```typescript
const app = new Elysia()
  .state('requestCount', 0)
  .state('startTime', Date.now())
  .state('config', {
    maxRetries: 3,
    timeout: 5000
  })
  .get('/stats', ({ store }) => {
    // ✅ Acesso ao state global
    store.requestCount++;

    return {
      requests: store.requestCount,
      uptime: Date.now() - store.startTime,
      config: store.config
    };
  })
  .put('/config', ({ body, store, set }) => {
    // ✅ Modificação do state
    if (body.maxRetries && body.maxRetries > 0) {
      store.config.maxRetries = body.maxRetries;
    }

    if (body.timeout && body.timeout > 1000) {
      store.config.timeout = body.timeout;
    }

    set.status = 200;
    return { message: 'Config updated', config: store.config };
  }, {
    body: t.Object({
      maxRetries: t.Optional(t.Number()),
      timeout: t.Optional(t.Number())
    })
  });
```

### 2. Decorate - Constant Objects and Services

Use `decorate` para objetos constantes, classes e serviços:

```typescript
import { Database } from './db';
import { Logger } from './logger';
import { RedisCache } from './cache';

const app = new Elysia()
  .decorate('db', new Database())
  .decorate('logger', new Logger('api'))
  .decorate('cache', new RedisCache())
  .decorate('crypto', {
    hash: (data: string) => crypto.createHash('sha256').update(data).digest('hex'),
    encrypt: (data: string, key: string) => { /* implementation */ },
    decrypt: (data: string, key: string) => { /* implementation */ }
  })
  .get('/users/:id', async ({ params: { id }, db, logger, cache }) => {
    logger.info(`Fetching user ${id}`);

    // ✅ Try cache first
    const cached = await cache.get(`user:${id}`);
    if (cached) {
      logger.info(`Cache hit for user ${id}`);
      return cached;
    }

    // ✅ Fallback to database
    const user = await db.users.findById(id);
    if (user) {
      await cache.set(`user:${id}`, user, 300); // 5 minutes
      logger.info(`User ${id} cached`);
    }

    return user;
  })
  .post('/auth/login', async ({ body, crypto, db, logger }) => {
    const { username, password } = body;

    // ✅ Use decorated crypto service
    const hashedPassword = crypto.hash(password);

    const user = await db.users.findByCredentials(username, hashedPassword);
    if (!user) {
      logger.warn(`Failed login attempt for ${username}`);
      throw new Error('Invalid credentials');
    }

    logger.info(`Successful login for ${username}`);
    return { token: generateToken(user) };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  });
```

### 3. Derive - Dynamic Property Creation

Use `derive` para criar propriedades dinâmicas baseadas no contexto:

```typescript
const authApp = new Elysia()
  .derive(({ headers }) => {
    const authorization = headers.authorization;

    return {
      // ✅ Extract bearer token
      bearerToken: authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : null,

      // ✅ Parse user agent
      userAgent: {
        raw: headers['user-agent'] || '',
        isMobile: /Mobile|Android|iPhone/.test(headers['user-agent'] || ''),
        browser: extractBrowser(headers['user-agent'] || '')
      },

      // ✅ Request context
      requestId: crypto.randomUUID(),
      timestamp: Date.now()
    };
  })
  .derive(({ bearerToken, requestId }) => {
    return {
      // ✅ Decode JWT if present (pode falhar)
      tokenPayload: bearerToken ? decodeJWT(bearerToken) : null,
      correlationId: `req_${requestId.slice(0, 8)}`
    };
  })
  .get('/profile', ({ bearerToken, tokenPayload, userAgent, correlationId }) => {
    if (!bearerToken || !tokenPayload) {
      throw new Error('Authentication required');
    }

    return {
      user: tokenPayload.user,
      sessionInfo: {
        correlationId,
        userAgent: userAgent.raw,
        isMobile: userAgent.isMobile
      }
    };
  });
```

### 4. Resolve - Type-Safe Property Creation

Use `resolve` para criação type-safe de propriedades com validação:

```typescript
const secureApp = new Elysia()
  .resolve(({ headers, query }) => {
    const auth = headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      throw new Error('Invalid authorization header format');
    }

    const token = auth.slice(7);
    const payload = verifyJWT(token); // Throws if invalid

    if (!payload || !payload.user) {
      throw new Error('Invalid token payload');
    }

    return {
      // ✅ Type-safe user context
      authenticatedUser: {
        id: payload.user.id,
        email: payload.user.email,
        role: payload.user.role,
        permissions: payload.permissions || []
      },

      // ✅ Request metadata
      requestMeta: {
        apiVersion: query.v || '1.0',
        clientId: headers['x-client-id'] || 'unknown',
        timestamp: new Date().toISOString()
      }
    };
  })
  .get('/admin/users', ({ authenticatedUser, requestMeta }) => {
    // ✅ User is guaranteed to be authenticated here
    if (!authenticatedUser.permissions.includes('users:read')) {
      throw new Error('Insufficient permissions');
    }

    return {
      users: getUsersList(),
      requestedBy: authenticatedUser.email,
      apiVersion: requestMeta.apiVersion
    };
  })
  .delete('/admin/users/:id', ({ params: { id }, authenticatedUser }) => {
    // ✅ Type-safe access to authenticated user
    if (authenticatedUser.role !== 'admin') {
      throw new Error('Admin role required');
    }

    return deleteUser(id, authenticatedUser.id);
  });
```

### 5. Advanced Patterns - Conditional Context Extension

```typescript
// ✅ Conditional decoration based on environment
const conditionalApp = new Elysia()
  .derive(() => {
    const isDevelopment = process.env.NODE_ENV === 'development';

    return {
      debug: isDevelopment ? {
        log: console.log,
        time: (label: string) => console.time(label),
        timeEnd: (label: string) => console.timeEnd(label)
      } : {
        log: () => {},
        time: () => {},
        timeEnd: () => {}
      }
    };
  })
  .get('/api/heavy-operation', async ({ debug }) => {
    debug.time('heavy-operation');
    debug.log('Starting heavy operation...');

    const result = await performHeavyOperation();

    debug.timeEnd('heavy-operation');
    debug.log('Heavy operation completed');

    return result;
  });

// ✅ Context extension com error handling
const errorSafeApp = new Elysia()
  .derive(({ headers }) => {
    try {
      const sessionData = headers['x-session-data'];
      const parsed = sessionData ? JSON.parse(atob(sessionData)) : null;

      return {
        session: parsed,
        hasValidSession: Boolean(parsed?.userId)
      };
    } catch (error) {
      // ✅ Graceful fallback
      return {
        session: null,
        hasValidSession: false
      };
    }
  })
  .get('/dashboard', ({ session, hasValidSession }) => {
    if (!hasValidSession) {
      return { redirect: '/login' };
    }

    return {
      dashboard: getDashboardData(session.userId),
      user: session
    };
  });
```

### 6. Plugin Context Extension

```typescript
// ✅ Reusable context extension plugin
const createAuthPlugin = (options: { jwtSecret: string; requiredRole?: string }) => {
  return new Elysia({ name: 'auth-plugin' })
    .derive(({ headers }) => {
      const token = headers.authorization?.replace('Bearer ', '');

      return {
        rawToken: token || null
      };
    })
    .resolve(({ rawToken }) => {
      if (!rawToken) {
        throw new Error('Authentication required');
      }

      const user = verifyJWT(rawToken, options.jwtSecret);

      if (options.requiredRole && user.role !== options.requiredRole) {
        throw new Error(`Role ${options.requiredRole} required`);
      }

      return {
        currentUser: user,
        isAuthenticated: true
      };
    });
};

// ✅ Usage em diferentes contexts
const adminApp = new Elysia()
  .use(createAuthPlugin({
    jwtSecret: process.env.JWT_SECRET!,
    requiredRole: 'admin'
  }))
  .get('/admin/dashboard', ({ currentUser }) => {
    // currentUser é garantidamente admin
    return getAdminDashboard(currentUser.id);
  });

const userApp = new Elysia()
  .use(createAuthPlugin({
    jwtSecret: process.env.JWT_SECRET!
  }))
  .get('/profile', ({ currentUser }) => {
    // currentUser é garantidamente autenticado
    return getUserProfile(currentUser.id);
  });
```

---

## Cookie Management

### 1. Reactive Cookie Handling

ElysiaJS oferece gerenciamento reativo de cookies com encoding/decoding automático:

```typescript
const app = new Elysia()
  .get('/profile', ({ cookie: { session, preferences } }) => {
    // ✅ Leitura de cookie
    if (!session.value) {
      return { error: 'Not authenticated' };
    }

    // ✅ Modificação reativa
    preferences.value = {
      theme: 'dark',
      language: 'pt-BR'
    };

    return { session: session.value, preferences: preferences.value };
  })
  .post('/login', ({ body, cookie: { session } }) => {
    // ✅ Definição de cookie com configurações
    session.value = generateSessionToken();
    session.set({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 7 dias
    });

    return { success: true };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  });
```

### 2. Cookie Configuration e Security

```typescript
const secureApp = new Elysia({
  cookie: {
    // ✅ Configuração de assinatura
    secrets: ['primary-secret-key', 'backup-secret-key'],
    sign: ['session', 'auth_token'], // Cookies a serem assinados

    // ✅ Configurações padrão de segurança
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
})
  .get('/secure-data', ({ cookie: { session } }) => {
    // Cookie automaticamente verificado se assinado
    if (!session.value) {
      throw new Error('Invalid session');
    }

    return { data: 'sensitive information' };
  });
```

### 3. Advanced Cookie Patterns

```typescript
// ✅ Cookie schema validation
const cookieValidationApp = new Elysia()
  .get('/user-prefs', ({ cookie }) => {
    return cookie;
  }, {
    cookie: t.Cookie({
      user_id: t.String({ format: 'uuid' }),
      preferences: t.Object({
        theme: t.Union([t.Literal('light'), t.Literal('dark')]),
        notifications: t.Boolean()
      }),
      session_expires: t.Nullable(t.Number())
    })
  });

// ✅ Cookie rotation for security
const rotatingCookieApp = new Elysia()
  .derive(({ cookie: { auth_token } }) => {
    // Rotação automática de tokens
    if (auth_token.value && isTokenExpiringSoon(auth_token.value)) {
      auth_token.value = refreshToken(auth_token.value);
    }

    return { currentUser: getUserFromToken(auth_token.value) };
  });
```

---

## Eden Treaty Client

### 1. Type-Safe Client Setup

Eden Treaty fornece comunicação type-safe entre cliente e servidor:

```typescript
// ✅ Server setup
const app = new Elysia()
  .get('/users', () => getUsers())
  .get('/users/:id', ({ params: { id } }) => getUserById(id))
  .post('/users', ({ body }) => createUser(body), {
    body: t.Object({
      name: t.String(),
      email: t.String({ format: 'email' })
    })
  })
  .ws('/chat', {
    body: t.String(),
    response: t.String(),
    message(ws, message) {
      ws.send(`Echo: ${message}`);
    }
  });

export type App = typeof app;

// ✅ Client setup
import { treaty } from '@elysiajs/eden';
import type { App } from './server';

const api = treaty<App>('localhost:3000');
```

### 2. Client Usage Patterns

```typescript
// ✅ GET requests
const getUsers = async () => {
  const { data, error } = await api.users.get();

  if (error) {
    console.error('Failed to fetch users:', error.value);
    return;
  }

  // data é type-safe baseado no retorno do servidor
  return data;
};

// ✅ Dynamic routes
const getUser = async (userId: string) => {
  const { data, error } = await api.users({ id: userId }).get();

  if (error) {
    switch (error.status) {
      case 404:
        throw new Error('User not found');
      case 500:
        throw new Error('Server error');
      default:
        throw new Error('Unknown error');
    }
  }

  return data;
};

// ✅ POST with body
const createUser = async (userData: { name: string; email: string }) => {
  const { data, error } = await api.users.post(userData);

  if (error) {
    throw error.value;
  }

  return data;
};
```

### 3. Advanced Eden Treaty Features

```typescript
// ✅ Configuration with headers and interceptors
const configuredApi = treaty<App>('localhost:3000', {
  headers: {
    'X-API-Version': '1.0',
    'User-Agent': 'MyApp/1.0'
  },

  // ✅ Request interceptor
  onRequest(path, options) {
    // Adicionar autenticação dinamicamente
    if (path.startsWith('users') && !path.includes('login')) {
      return {
        headers: {
          authorization: `Bearer ${getAuthToken()}`
        }
      };
    }
  },

  // ✅ Response interceptor
  onResponse(response) {
    // Log de responses
    console.log(`API Response [${response.status}]:`, response.url);

    // Refresh token se necessário
    if (response.status === 401) {
      refreshAuthToken();
    }

    return response;
  }
});

// ✅ WebSocket communication
const connectToChat = () => {
  const chat = api.chat.subscribe();

  chat.subscribe((message) => {
    console.log('Received:', message);
  });

  chat.send('Hello from client!');

  // Acesso ao WebSocket raw se necessário
  chat.raw.addEventListener('close', () => {
    console.log('Chat connection closed');
  });
};

// ✅ File uploads
const uploadFile = async (file: File) => {
  const { data, error } = await api.upload.post({
    file: file,
    metadata: {
      description: 'Profile picture'
    }
  }, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return { data, error };
};

// ✅ Stream handling
const streamData = async () => {
  const { data } = await api.stream.get();

  if (data) {
    // data é AsyncGenerator para streams
    for await (const chunk of data) {
      console.log('Stream chunk:', chunk);
    }
  }
};
```

### 4. Error Handling Best Practices

```typescript
// ✅ Utility para unwrapping responses
const safeApiCall = async <T>(
  apiCall: () => Promise<{ data: T | null; error: any }>
): Promise<T> => {
  const { data, error } = await apiCall();

  if (error) {
    // Log estruturado do erro
    console.error('API Error:', {
      status: error.status,
      message: error.value,
      timestamp: new Date().toISOString()
    });

    throw new Error(`API Error [${error.status}]: ${error.value}`);
  }

  if (!data) {
    throw new Error('No data received from API');
  }

  return data;
};

// ✅ Usage
const users = await safeApiCall(() => api.users.get());
const user = await safeApiCall(() => api.users({ id: '123' }).get());
```

---

## Conclusão

Este guia compila as principais best practices do ElysiaJS para desenvolvimento de aplicações web modernas, escaláveis e type-safe. Os padrões apresentados foram extraídos da documentação oficial e testados em cenários reais de produção.

### Principais Takeaways:

1. **"1 Elysia instance = 1 controller"** - Princípio fundamental para organização
2. **Separation of Concerns** - Controllers, Services e Models bem definidos
3. **Type Safety First** - Aproveite ao máximo o sistema de tipos
4. **Plugin Architecture** - Modularidade e reutilização
5. **Performance by Design** - Otimizações automáticas e manuais
6. **Security by Default** - Validação, autenticação e headers de segurança

### Recursos Adicionais:

- [Documentação Oficial ElysiaJS](https://elysiajs.com)
- [Eden Treaty para Type Safety](https://elysiajs.com/eden/overview.html)
- [Plugin Ecosystem](https://elysiajs.com/plugins/overview.html)

**Lembre-se**: ElysiaJS é projetado para TypeScript-first development com Bun runtime, priorizando performance e developer experience através de type safety end-to-end.