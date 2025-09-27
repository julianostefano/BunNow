// server.ts
import { Elysia } from 'elysia'
import { redisPlugin } from './plugins/redis'

const app = new Elysia()
  .use(
    redisPlugin({
      // Deixe sem URL aqui se quiser usar process.env.REDIS_URL
      allowFallback: true, // app sobe mesmo sem Redis (status=unavailable)
      healthcheck: { enabled: true, intervalMs: 10_000, timeoutMs: 800 },
      startupRetry: { attempts: 6, backoff: { baseMs: 300, factor: 2, maxMs: 8000 } }
    })
  )

  // endpoint de saúde (inclui visão do redis)
  .get('/health', async ({ redis }) => {
    const healthy = await redis.ping()
    return {
      service: 'ok',
      redis: {
        status: redis.status,
        healthy
      }
    }
  })

  // exemplo de cache seguro (não lança se sem Redis)
  .get('/cache/:key', async ({ params, redis }) => {
    const value = await redis.safeGet(params.key)
    return { key: params.key, value, redis: redis.status }
  })

  .post('/cache/:key', async ({ params, body, redis }) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body)
    // TTL de 60s como exemplo
    const res = await redis.safeSet(params.key, payload, 60)
    return { ok: res === 'OK', redis: redis.status }
  })

  // observabilidade de estado explícita
  .get('/redis/status', ({ redis }) => ({ status: redis.status }))

  .listen(3000)

console.log(`up on http://localhost:3000`)

