# Apêndice A: OpenAPI - Documentação Automática de APIs
**Author:** Juliano Stefano <jsdealencar@ayesa.com> [2025]
**Date:** 2025-10-06
**Version:** v1.0.0

---

## Índice

1. [Introdução](#introdução)
2. [Plugin OpenAPI vs Swagger (Deprecated)](#plugin-openapi-vs-swagger-deprecated)
3. [Instalação e Setup Básico](#instalação-e-setup-básico)
4. [Type-Based Documentation (fromTypes)](#type-based-documentation-fromtypes)
5. [Customização da Documentação](#customização-da-documentação)
6. [Describing Routes (detail)](#describing-routes-detail)
7. [Tags - Organização de Endpoints](#tags---organização-de-endpoints)
8. [Models e Reference Schemas](#models-e-reference-schemas)
9. [Response Headers](#response-headers)
10. [Security Schemes](#security-schemes)
11. [Guard com OpenAPI](#guard-com-openapi)
12. [Hide Routes](#hide-routes)
13. [Production Configuration](#production-configuration)
14. [Caveats e Troubleshooting](#caveats-e-troubleshooting)
15. [Exemplos Completos](#exemplos-completos)

---

## Introdução

O plugin OpenAPI do ElysiaJS gera automaticamente documentação interativa de APIs seguindo o padrão OpenAPI V3. A documentação é gerada a partir dos schemas TypeBox e tipos TypeScript, garantindo que a documentação esteja sempre sincronizada com o código.

### Características Principais

- **Auto-geração**: Documentação criada automaticamente a partir dos schemas
- **OpenAPI V3**: Compatível com o padrão OpenAPI 3.x
- **UI Interativa**: Interface Scalar por padrão (também suporta Swagger UI)
- **Type-Safe**: Integração com TypeScript para validação em tempo de compilação
- **Customizável**: Controle total sobre tags, security schemes, descriptions

---

## Plugin OpenAPI vs Swagger (Deprecated)

### ⚠️ IMPORTANTE: Swagger Plugin Deprecated

```typescript
// ❌ DEPRECATED: Não usar mais
import { swagger } from '@elysiajs/swagger'

app.use(swagger())
```

**Status:** O plugin `@elysiajs/swagger` está **deprecated** e não é mais mantido.

**Recomendação Oficial:** Migrar para `@elysiajs/openapi`

### ✅ Usar OpenAPI Plugin

```typescript
// ✅ CORRETO: Plugin atual
import { openapi } from '@elysiajs/openapi'

app.use(openapi())
```

### Diferenças Principais

| Aspecto | Swagger (deprecated) | OpenAPI (atual) |
|---------|---------------------|-----------------|
| **Manutenção** | ❌ Descontinuado | ✅ Ativo |
| **Instalação** | `@elysiajs/swagger` | `@elysiajs/openapi` |
| **Type Generation** | ❌ Não suporta | ✅ `fromTypes()` |
| **UI Padrão** | Scalar | Scalar |
| **Spec Format** | OpenAPI 3.x | OpenAPI 3.x |

---

## Instalação e Setup Básico

### Instalação

```bash
bun add @elysiajs/openapi
```

### Setup Mínimo

```typescript
import { Elysia } from 'elysia'
import { openapi } from '@elysiajs/openapi'

const app = new Elysia()
  .use(openapi())
  .get('/health', () => ({ status: 'ok' }))
  .listen(3000)

// Documentação disponível em:
// http://localhost:3000/       → UI interativa (Scalar)
// http://localhost:3000/json   → Spec OpenAPI JSON
```

**Por padrão:**
- UI disponível em `/` (root path)
- JSON spec em `/json`

### Customizar Path

```typescript
app.use(openapi({
  path: '/docs'  // UI em /docs, JSON em /docs/json
}))
```

---

## Type-Based Documentation (fromTypes)

### Conceito

`fromTypes()` permite gerar documentação OpenAPI a partir de **tipos TypeScript exportados**, não apenas schemas TypeBox.

### Setup Básico

```typescript
import { Elysia } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'

// ⚠️ IMPORTANTE: Exportar a instância Elysia
export const app = new Elysia()
  .use(
    openapi({
      references: fromTypes()  // Busca tipos no arquivo atual
    })
  )
  .get('/', { test: 'hello' as const })
  .post('/json', ({ body }) => body, {
    body: t.Object({
      hello: t.String()
    })
  })
```

### Especificar Source File

```typescript
// Especificar arquivo TypeScript com tipos
export const app = new Elysia()
  .use(
    openapi({
      references: fromTypes('src/index.ts')  // Arquivo explícito
    })
  )
```

### Configuração Avançada

```typescript
import path from 'path'

export const app = new Elysia()
  .use(
    openapi({
      references: fromTypes('src/index.ts', {
        // Root do projeto (importante em monorepos)
        projectRoot: path.join('..', import.meta.dir),

        // tsconfig.json customizado
        tsconfigPath: 'tsconfig.dts.json'
      })
    })
  )
```

### Environment-Specific Paths

```typescript
// ✅ CORRETO: Paths diferentes para dev/production
export const app = new Elysia()
  .use(
    openapi({
      references: fromTypes(
        process.env.NODE_ENV === 'production'
          ? 'dist/index.d.ts'  // Declaration files em produção
          : 'src/index.ts'     // Source files em dev
      )
    })
  )
```

**Benefício:** Em produção, usar `.d.ts` é mais rápido pois não precisa compilar TypeScript.

---

## Customização da Documentação

### Info Section

```typescript
app.use(
  openapi({
    documentation: {
      info: {
        title: 'BunSNC API',
        version: '1.0.0',
        description: 'ServiceNow Integration API using ElysiaJS',
        termsOfService: 'https://example.com/terms',
        contact: {
          name: 'API Support',
          email: 'support@example.com',
          url: 'https://example.com/support'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      }
    }
  })
)
```

### Servers Configuration

```typescript
app.use(
  openapi({
    documentation: {
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server'
        },
        {
          url: 'https://api.example.com',
          description: 'Production server'
        },
        {
          url: 'https://staging.api.example.com',
          description: 'Staging server'
        }
      ]
    }
  })
)
```

### ExternalDocs

```typescript
app.use(
  openapi({
    documentation: {
      externalDocs: {
        description: 'Find more info here',
        url: 'https://docs.example.com'
      }
    }
  })
)
```

---

## Describing Routes (detail)

### Properties Disponíveis

```typescript
app.post('/user', handler, {
  body: t.Object({
    name: t.String(),
    email: t.String()
  }),

  detail: {
    // Resumo curto (aparece na lista)
    summary: 'Create new user',

    // Descrição detalhada (Markdown suportado)
    description: `
      Creates a new user account.

      ## Requirements
      - Valid email format
      - Unique username
    `,

    // Tags para agrupamento
    tags: ['Users', 'Authentication'],

    // Operation ID (único)
    operationId: 'createUser',

    // Deprecated flag
    deprecated: false,

    // Ocultar da documentação
    hide: false,

    // Security requirements
    security: [
      { bearerAuth: [] }
    ],

    // Responses customizadas
    responses: {
      '200': {
        description: 'User created successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
})
```

### Description em Schema Fields

```typescript
app.post('/signin', ({ body }) => body, {
  body: t.Object({
    username: t.String({
      description: 'User login name'
    }),
    password: t.String({
      minLength: 8,
      description: 'User password (minimum 8 characters)'
    })
  }, {
    description: 'Expected username and password for authentication'
  }),

  detail: {
    summary: 'Sign in user',
    tags: ['Authentication']
  }
})
```

---

## Tags - Organização de Endpoints

### 1. Definir Tags Globalmente

```typescript
app.use(
  openapi({
    documentation: {
      tags: [
        {
          name: 'Auth',
          description: 'Authentication and authorization endpoints'
        },
        {
          name: 'Users',
          description: 'User management operations'
        },
        {
          name: 'Tickets',
          description: 'ServiceNow ticket operations',
          externalDocs: {
            description: 'Ticket API docs',
            url: 'https://docs.example.com/tickets'
          }
        },
        {
          name: 'Admin',
          description: '⚠️ Administrator-only endpoints'
        }
      ]
    }
  })
)
```

### 2. Aplicar Tags em Endpoints

```typescript
app
  .post('/login', loginHandler, {
    detail: {
      summary: 'User login',
      tags: ['Auth']  // ✅ Tag individual
    }
  })

  .get('/users', getUsersHandler, {
    detail: {
      summary: 'List all users',
      tags: ['Users', 'Admin']  // ✅ Múltiplas tags
    }
  })
```

### 3. Tags em Instância Elysia

```typescript
// ✅ Aplicar tag a todas as rotas de uma instância
const authRoutes = new Elysia({
  tags: ['Auth']  // Todas as rotas terão tag 'Auth'
})
  .post('/login', loginHandler)
  .post('/logout', logoutHandler)
  .post('/refresh', refreshHandler)

app.use(authRoutes)
```

### 4. Tags em Group

```typescript
app.group('/admin', {
  detail: {
    tags: ['Admin']  // Todas as rotas /admin/* terão tag 'Admin'
  }
}, (app) =>
  app
    .get('/users', getAllUsers)
    .delete('/user/:id', deleteUser)
    .post('/settings', updateSettings)
)
```

---

## Models e Reference Schemas

### Conceito

Models permitem **reutilizar schemas** e gerar automaticamente componentes na spec OpenAPI.

### 1. Definir Models

```typescript
app.model({
  // Model simples
  User: t.Object({
    id: t.Number(),
    username: t.String(),
    email: t.String({ format: 'email' }),
    createdAt: t.String({ format: 'date-time' })
  }),

  // Model para criação (sem ID)
  CreateUser: t.Object({
    username: t.String({ minLength: 3, maxLength: 50 }),
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 8 })
  }),

  // Model para atualização (campos opcionais)
  UpdateUser: t.Partial(
    t.Object({
      username: t.String(),
      email: t.String({ format: 'email' }),
      password: t.String({ minLength: 8 })
    })
  ),

  // Error model
  Error: t.Object({
    error: t.String(),
    message: t.String(),
    statusCode: t.Number()
  }),

  // Pagination
  Pagination: t.Object({
    page: t.Number({ minimum: 1 }),
    limit: t.Number({ minimum: 1, maximum: 100 }),
    total: t.Number(),
    totalPages: t.Number()
  })
})
```

### 2. Usar Models por Referência

```typescript
app
  .get('/user/:id', ({ params }) => getUserById(params.id), {
    params: t.Object({
      id: t.Number()
    }),

    response: {
      200: 'User',  // ✅ Referência ao model
      404: 'Error'
    },

    detail: {
      summary: 'Get user by ID',
      tags: ['Users']
    }
  })

  .post('/user', ({ body }) => createUser(body), {
    body: 'CreateUser',  // ✅ Referência ao model

    response: {
      201: 'User',
      400: 'Error'
    },

    detail: {
      summary: 'Create new user',
      tags: ['Users']
    }
  })

  .patch('/user/:id', ({ params, body }) => updateUser(params.id, body), {
    params: t.Object({
      id: t.Number()
    }),
    body: 'UpdateUser',  // ✅ Referência ao model

    response: {
      200: 'User',
      400: 'Error',
      404: 'Error'
    },

    detail: {
      summary: 'Update user',
      tags: ['Users']
    }
  })
```

### 3. Models com Composição

```typescript
app.model({
  BaseEntity: t.Object({
    id: t.Number(),
    createdAt: t.String({ format: 'date-time' }),
    updatedAt: t.String({ format: 'date-time' })
  }),

  // Compor models
  User: t.Composite([
    t.Reference('BaseEntity'),  // Herdar de BaseEntity
    t.Object({
      username: t.String(),
      email: t.String({ format: 'email' })
    })
  ]),

  // Lista paginada
  UserList: t.Object({
    data: t.Array(t.Reference('User')),
    pagination: t.Reference('Pagination')
  })
})

app.get('/users', ({ query }) => getUsers(query), {
  query: t.Object({
    page: t.Number({ default: 1 }),
    limit: t.Number({ default: 10 })
  }),

  response: {
    200: 'UserList'  // ✅ Model composto
  }
})
```

**Benefícios:**
- ✅ Reutilização de schemas
- ✅ Documentação centralizada
- ✅ Spec OpenAPI mais limpa (usa `$ref`)
- ✅ Fácil manutenção

---

## Response Headers

### withHeader Function

```typescript
import { openapi, withHeader } from '@elysiajs/openapi'

app.get('/data', ({ set }) => {
  // ⚠️ IMPORTANTE: Definir header manualmente
  set.headers['x-powered-by'] = 'Elysia'
  set.headers['x-request-id'] = generateRequestId()

  return { data: 'example' }
}, {
  response: withHeader(
    // Schema do response body
    t.Object({
      data: t.String()
    }),

    // Schema dos headers
    {
      'x-powered-by': t.Literal('Elysia'),
      'x-request-id': t.String({ format: 'uuid' })
    }
  ),

  detail: {
    summary: 'Get data with custom headers'
  }
})
```

**⚠️ CRÍTICO:** `withHeader` é **apenas annotation** para documentação. **NÃO valida nem define** headers automaticamente. Você **DEVE** definir headers manualmente com `set.headers`.

### Response Headers Complexos

```typescript
app.get('/file', ({ set }) => {
  set.headers['content-type'] = 'application/pdf'
  set.headers['content-disposition'] = 'attachment; filename="report.pdf"'
  set.headers['cache-control'] = 'no-cache'

  return file('path/to/report.pdf')
}, {
  response: withHeader(
    t.File(),
    {
      'content-type': t.Literal('application/pdf'),
      'content-disposition': t.String(),
      'cache-control': t.String()
    }
  )
})
```

---

## Security Schemes

### 1. Definir Security Schemes

```typescript
app.use(
  openapi({
    documentation: {
      components: {
        securitySchemes: {
          // Bearer JWT
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token obtained from /login endpoint'
          },

          // API Key em header
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key for server-to-server communication'
          },

          // OAuth2
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://example.com/oauth/authorize',
                tokenUrl: 'https://example.com/oauth/token',
                scopes: {
                  'read:users': 'Read user information',
                  'write:users': 'Modify user information',
                  'admin': 'Administrative access'
                }
              }
            }
          },

          // Basic Auth
          basicAuth: {
            type: 'http',
            scheme: 'basic'
          },

          // Cookie
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'session'
          }
        }
      }
    }
  })
)
```

### 2. Aplicar Security em Endpoints

```typescript
app
  // Endpoint público (sem security)
  .post('/login', loginHandler, {
    detail: {
      summary: 'User login',
      tags: ['Auth']
      // Sem security
    }
  })

  // Endpoint com Bearer auth
  .get('/profile', ({ headers }) => {
    const userId = validateToken(headers.authorization)
    return getProfile(userId)
  }, {
    detail: {
      summary: 'Get user profile',
      tags: ['Users'],
      security: [
        { bearerAuth: [] }  // ✅ Requer Bearer token
      ]
    }
  })

  // Endpoint com API Key
  .get('/admin/stats', ({ headers }) => {
    validateApiKey(headers['x-api-key'])
    return getAdminStats()
  }, {
    detail: {
      summary: 'Get admin statistics',
      tags: ['Admin'],
      security: [
        { apiKey: [] }  // ✅ Requer API Key
      ]
    }
  })

  // Endpoint com múltiplas opções de auth
  .get('/data', dataHandler, {
    detail: {
      summary: 'Get data',
      security: [
        { bearerAuth: [] },  // Opção 1: Bearer token
        { apiKey: [] }       // Opção 2: API Key
        // Cliente pode usar qualquer um
      ]
    }
  })

  // OAuth2 com scopes
  .patch('/user/:id', updateUserHandler, {
    detail: {
      summary: 'Update user',
      tags: ['Users'],
      security: [
        {
          oauth2: ['write:users']  // ✅ Requer scope específico
        }
      ]
    }
  })
```

### 3. Security Global (Guard)

```typescript
// ✅ Aplicar security a múltiplas rotas
app.guard({
  detail: {
    security: [
      { bearerAuth: [] }
    ]
  }
}, (app) =>
  app
    .get('/profile', profileHandler)
    .get('/settings', settingsHandler)
    .post('/logout', logoutHandler)
    // Todas essas rotas requerem bearerAuth
)
```

---

## Guard com OpenAPI

### Guard com Detail

```typescript
app.guard({
  // Schema validation
  headers: t.Object({
    authorization: t.String()
  }),

  // OpenAPI metadata
  detail: {
    description: 'Requires authentication. User must be logged in.',
    security: [
      { bearerAuth: [] }
    ]
  }
}, (app) =>
  app
    .get('/user', userHandler, {
      detail: {
        summary: 'Get current user',
        tags: ['Users']
        // security herdado do guard
      }
    })

    .post('/user/update', updateHandler, {
      detail: {
        summary: 'Update user profile',
        tags: ['Users']
        // security herdado do guard
      }
    })
)
```

### Nested Guards com Security Incremental

```typescript
app
  // Guard 1: API Key (todas as rotas /api)
  .guard({
    headers: t.Object({
      'x-api-key': t.String()
    }),
    detail: {
      description: 'Requires API key',
      security: [{ apiKey: [] }]
    }
  }, (app) =>
    app
      .get('/api/public', publicHandler)

      // Guard 2: Bearer token adicional (apenas /api/protected)
      .guard({
        headers: t.Object({
          authorization: t.String()
        }),
        detail: {
          description: 'Requires API key AND bearer token',
          security: [
            { apiKey: [] },
            { bearerAuth: [] }
          ]
        }
      }, (app) =>
        app
          .get('/api/protected/data', protectedDataHandler)
          .post('/api/protected/action', protectedActionHandler)
      )
  )
```

---

## Hide Routes

### Ocultar Endpoint Específico

```typescript
app
  .get('/public', publicHandler, {
    detail: {
      summary: 'Public endpoint',
      tags: ['Public']
    }
  })

  .get('/internal', internalHandler, {
    detail: {
      hide: true  // ✅ Não aparece na documentação
    }
  })

  .post('/debug', debugHandler, {
    detail: {
      hide: process.env.NODE_ENV === 'production'  // ✅ Ocultar em produção
    }
  })
```

### Ocultar Grupo de Rotas

```typescript
// ✅ Ocultar todas as rotas de debug
app.group('/debug', {
  detail: {
    hide: true
  }
}, (app) =>
  app
    .get('/stats', debugStatsHandler)
    .get('/logs', debugLogsHandler)
    .post('/clear', clearDebugHandler)
)
```

### Ocultar Instância Inteira

```typescript
const internalRoutes = new Elysia({
  detail: {
    hide: true  // ✅ Todas as rotas desta instância ocultas
  }
})
  .get('/internal/health', internalHealthHandler)
  .get('/internal/metrics', internalMetricsHandler)

app.use(internalRoutes)
```

---

## Production Configuration

### Recommended Production Setup

```typescript
import { Elysia } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import path from 'path'

export const app = new Elysia()
  .use(
    openapi({
      // Path customizado (evitar conflito com root)
      path: '/api-docs',

      // Type-based generation
      references: fromTypes(
        // Usar .d.ts em produção para performance
        process.env.NODE_ENV === 'production'
          ? 'dist/index.d.ts'
          : 'src/index.ts',
        {
          // Root do projeto (importante em monorepos)
          projectRoot: path.join(import.meta.dir, '..'),

          // tsconfig customizado
          tsconfigPath: 'tsconfig.json'
        }
      ),

      // Documentação completa
      documentation: {
        info: {
          title: 'BunSNC API',
          version: process.env.npm_package_version || '1.0.0',
          description: 'ServiceNow Integration API',
          contact: {
            name: 'API Support',
            email: 'support@example.com'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },

        servers: [
          {
            url: process.env.API_URL || 'http://localhost:3000',
            description: process.env.NODE_ENV === 'production'
              ? 'Production server'
              : 'Development server'
          }
        ],

        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Users', description: 'User management' },
          { name: 'Tickets', description: 'ServiceNow tickets' }
        ],

        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        }
      }
    })
  )
```

### Conditional Documentation (Production)

```typescript
// ✅ Desabilitar documentação em produção (opcional)
const app = new Elysia()

if (process.env.NODE_ENV !== 'production') {
  app.use(openapi({
    path: '/docs'
  }))
}

// Ou habilitar mas proteger
app.use(openapi({
  path: '/docs'
}))

if (process.env.NODE_ENV === 'production') {
  app.guard({
    beforeHandle({ headers, set }) {
      // Proteger docs com API key em produção
      if (headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        set.status = 403
        return { error: 'Forbidden' }
      }
    }
  }, (app) =>
    app.get('/docs', docsHandler)
       .get('/docs/json', docsJsonHandler)
  )
}
```

---

## Caveats e Troubleshooting

### 1. Root Path Issues (Monorepos)

**Problema:** Em monorepos, o generator pode não encontrar o root do projeto.

**Solução:**

```typescript
import path from 'path'

openapi({
  references: fromTypes('src/index.ts', {
    projectRoot: path.join('..', import.meta.dir)
  })
})
```

### 2. Multiple tsconfig.json

**Problema:** Projeto com múltiplos `tsconfig.json` (ex: `tsconfig.json`, `tsconfig.build.json`, `tsconfig.dts.json`).

**Solução:**

```typescript
openapi({
  references: fromTypes('src/index.ts', {
    tsconfigPath: 'tsconfig.dts.json'  // Especificar qual usar
  })
})
```

### 3. Type Generation Performance

**Problema:** Geração de tipos lenta em produção.

**Solução:** Pré-compilar tipos e usar `.d.ts`:

```bash
# Build script
bun build --target=bun --outdir=dist src/index.ts
bunx tsc --declaration --emitDeclarationOnly --outDir dist
```

```typescript
openapi({
  references: fromTypes(
    process.env.NODE_ENV === 'production'
      ? 'dist/index.d.ts'   // ✅ Rápido
      : 'src/index.ts'      // Dev mode
  )
})
```

### 4. Response Headers Não Validados

**Problema:** `withHeader` não valida headers automaticamente.

**Solução:** Sempre definir headers manualmente:

```typescript
app.get('/data', ({ set }) => {
  // ✅ SEMPRE definir manualmente
  set.headers['x-custom'] = 'value'

  return data
}, {
  response: withHeader(
    t.Object({ data: t.Any() }),
    { 'x-custom': t.String() }  // Apenas documentação
  )
})
```

### 5. Models Não Aparecem na Spec

**Problema:** Models definidos mas não aparecem em `components.schemas`.

**Solução:** Garantir que models são **referenciados** em rotas:

```typescript
app.model({
  User: t.Object({ ... })
})

// ❌ Model não usado = não aparece
// ✅ Usar model em response
app.get('/user', handler, {
  response: {
    200: 'User'  // Referência ao model
  }
})
```

### 6. Tags Não Definidas

**Problema:** Usar tag não definida em `documentation.tags`.

**Efeito:** Tag aparece mas sem description.

**Solução:** Sempre definir tags globalmente:

```typescript
openapi({
  documentation: {
    tags: [
      { name: 'Users', description: 'User operations' }
    ]
  }
})

// Agora pode usar
app.get('/user', handler, {
  detail: {
    tags: ['Users']  // ✅ Tag definida
  }
})
```

---

## Exemplos Completos

### Exemplo 1: API Completa com OpenAPI

```typescript
import { Elysia, t } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import path from 'path'

// Models
const models = new Elysia().model({
  User: t.Object({
    id: t.Number(),
    username: t.String(),
    email: t.String({ format: 'email' }),
    role: t.Union([
      t.Literal('admin'),
      t.Literal('user'),
      t.Literal('guest')
    ]),
    createdAt: t.String({ format: 'date-time' })
  }),

  CreateUser: t.Object({
    username: t.String({ minLength: 3, maxLength: 50 }),
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 8 })
  }),

  LoginRequest: t.Object({
    username: t.String(),
    password: t.String()
  }),

  LoginResponse: t.Object({
    token: t.String(),
    expiresIn: t.Number(),
    user: t.Reference('User')
  }),

  Error: t.Object({
    error: t.String(),
    message: t.String(),
    statusCode: t.Number()
  })
})

// Main app
export const app = new Elysia()
  .use(models)
  .use(
    openapi({
      path: '/docs',

      references: fromTypes('src/index.ts', {
        projectRoot: path.join(import.meta.dir, '..'),
        tsconfigPath: 'tsconfig.json'
      }),

      documentation: {
        info: {
          title: 'User Management API',
          version: '1.0.0',
          description: 'Complete user management system with JWT authentication'
        },

        servers: [
          {
            url: 'http://localhost:3000',
            description: 'Development'
          },
          {
            url: 'https://api.example.com',
            description: 'Production'
          }
        ],

        tags: [
          {
            name: 'Auth',
            description: 'Authentication and authorization'
          },
          {
            name: 'Users',
            description: 'User CRUD operations'
          }
        ],

        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT token from /login endpoint'
            }
          }
        }
      }
    })
  )

  // Public routes
  .post('/login', ({ body }) => {
    // Login logic
    return {
      token: 'jwt-token-here',
      expiresIn: 3600,
      user: { /* user data */ }
    }
  }, {
    body: 'LoginRequest',
    response: {
      200: 'LoginResponse',
      401: 'Error'
    },
    detail: {
      summary: 'User login',
      description: 'Authenticate user and return JWT token',
      tags: ['Auth']
    }
  })

  // Protected routes
  .guard({
    headers: t.Object({
      authorization: t.String()
    }),
    detail: {
      description: 'Requires authentication',
      security: [{ bearerAuth: [] }]
    }
  }, (app) =>
    app
      .derive(({ headers }) => ({
        userId: validateToken(headers.authorization)
      }))

      .get('/users', ({ userId }) => {
        // Get all users
        return users
      }, {
        response: {
          200: t.Array(t.Reference('User')),
          401: 'Error'
        },
        detail: {
          summary: 'List all users',
          tags: ['Users']
        }
      })

      .get('/user/:id', ({ params }) => {
        return getUserById(params.id)
      }, {
        params: t.Object({
          id: t.Number()
        }),
        response: {
          200: 'User',
          404: 'Error'
        },
        detail: {
          summary: 'Get user by ID',
          tags: ['Users']
        }
      })

      .post('/user', ({ body }) => {
        return createUser(body)
      }, {
        body: 'CreateUser',
        response: {
          201: 'User',
          400: 'Error'
        },
        detail: {
          summary: 'Create new user',
          tags: ['Users']
        }
      })
  )

  .listen(3000)
```

### Exemplo 2: ServiceNow API com OpenAPI

```typescript
import { Elysia, t } from 'elysia'
import { openapi } from '@elysiajs/openapi'

const app = new Elysia()
  .model({
    Incident: t.Object({
      sys_id: t.String(),
      number: t.String(),
      short_description: t.String(),
      state: t.Union([
        t.Literal('1'),  // New
        t.Literal('2'),  // In Progress
        t.Literal('6'),  // Resolved
        t.Literal('7')   // Closed
      ]),
      priority: t.Union([
        t.Literal('1'),  // Critical
        t.Literal('2'),  // High
        t.Literal('3'),  // Moderate
        t.Literal('4'),  // Low
        t.Literal('5')   // Planning
      ]),
      assigned_to: t.Optional(t.String()),
      assignment_group: t.Optional(t.String()),
      sys_created_on: t.String({ format: 'date-time' }),
      sys_updated_on: t.String({ format: 'date-time' })
    }),

    CreateIncident: t.Object({
      short_description: t.String({ minLength: 10 }),
      description: t.Optional(t.String()),
      priority: t.String({ default: '3' }),
      assignment_group: t.Optional(t.String())
    })
  })

  .use(
    openapi({
      path: '/api-docs',
      documentation: {
        info: {
          title: 'ServiceNow Integration API',
          version: '1.0.0'
        },
        tags: [
          {
            name: 'Incidents',
            description: 'ServiceNow incident management'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        }
      }
    })
  )

  .guard({
    detail: {
      security: [{ bearerAuth: [] }]
    }
  }, (app) =>
    app
      .get('/incidents', ({ query }) => {
        // Get incidents with filters
        return getIncidents(query)
      }, {
        query: t.Object({
          state: t.Optional(t.String()),
          priority: t.Optional(t.String()),
          limit: t.Number({ default: 50, maximum: 100 })
        }),
        response: {
          200: t.Array(t.Reference('Incident'))
        },
        detail: {
          summary: 'List incidents',
          description: 'Retrieve incidents from ServiceNow with optional filters',
          tags: ['Incidents']
        }
      })

      .post('/incident', ({ body }) => {
        return createIncident(body)
      }, {
        body: 'CreateIncident',
        response: {
          201: 'Incident',
          400: t.Object({
            error: t.String()
          })
        },
        detail: {
          summary: 'Create incident',
          tags: ['Incidents']
        }
      })
  )

  .listen(3000)
```

---

## Conclusão

O plugin OpenAPI do ElysiaJS oferece geração automática de documentação API com:

✅ **Type-Safety:** Integração com TypeScript via `fromTypes()`
✅ **Flexibilidade:** Customização completa de info, tags, security
✅ **DRY:** Models reutilizáveis com referências
✅ **Production-Ready:** Configurações para dev/production
✅ **Standards-Compliant:** OpenAPI V3 specification

**Key Takeaways:**
1. Use `@elysiajs/openapi`, não `@elysiajs/swagger` (deprecated)
2. Sempre exportar instância Elysia quando usar `fromTypes()`
3. Definir models para schemas reutilizáveis
4. Usar guards para aplicar security/metadata em grupos
5. `withHeader` é apenas documentação - definir headers manualmente
6. Em produção, usar `.d.ts` para performance

---

**END OF APPENDIX**

Author: Juliano Stefano <jsdealencar@ayesa.com>
Date: 2025-10-06
Version: v1.0.0
