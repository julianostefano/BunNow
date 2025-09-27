// plugins/redis.ts
import type { Elysia } from 'elysia'
import Redis, { RedisOptions } from 'ioredis'

type Backoff = {
  baseMs?: number;   // tempo base
  maxMs?: number;    // teto do backoff
  factor?: number;   // multiplicador exponencial
}

export type RedisPluginOptions = {
  /**
   * URL do Redis (ex: redis://user:pass@host:6379/0)
   * Se não for fornecido, tenta process.env.REDIS_URL
   */
  url?: string
  /**
   * Opções passadas ao ioredis
   */
  options?: RedisOptions
  /**
   * Tolerar iniciar sem Redis (fallback)? Se true, o app sobe com redis=null
   * Se false, lança erro e impede o start.
   */
  allowFallback?: boolean
  /**
   * Healthcheck ativo: ping periódico
   */
  healthcheck?: {
    enabled?: boolean
    intervalMs?: number
    timeoutMs?: number
  }
  /**
   * Política de retry expo durante o boot
   */
  startupRetry?: {
    attempts?: number
    backoff?: Backoff
  }
}

export type RedisBinding = {
  client: Redis | null
  /**
   * Estado observado do Redis
   */
  status: 'connected' | 'degraded' | 'unavailable'
  /**
   * Testa conectividade no momento (PING com timeout)
   */
  ping: () => Promise<boolean>
  /**
   * Utilitários seguros (no-throw) — retornam undefined em fallback
   */
  safeGet: (key: string) => Promise<string | null | undefined>
  safeSet: (key: string, value: string, ttlSec?: number) => Promise<'OK' | undefined>
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms))
}

function computeBackoff(attempt: number, backoff: Backoff): number {
  const base = backoff.baseMs ?? 250
  const factor = backoff.factor ?? 2
  const max = backoff.maxMs ?? 5000
  return Math.min(max, base * Math.pow(factor, Math.max(0, attempt - 1)))
}

/**
 * Plugin Elysia: redis()
 * - Injeta `redis` no contexto (store) e `ctx.redis` nos handlers
 * - Fallback controlado (allowFallback)
 * - Healthcheck ativo opcional
 * - Encerramento gracioso (QUIT no onStop)
 */
export function redisPlugin(opts: RedisPluginOptions = {}) {
  const {
    url = process.env.REDIS_URL,
    options,
    allowFallback = true,
    healthcheck = { enabled: true, intervalMs: 15_000, timeoutMs: 1_000 },
    startupRetry = { attempts: 5, backoff: { baseMs: 300, maxMs: 6000, factor: 2 } }
  } = opts

  if (!url && !options) {
    throw new Error(
      'redisPlugin: forneça url (REDIS_URL) ou options para conectar ao Redis.'
    )
  }

  let client: Redis | null = null
  let status: RedisBinding['status'] = 'unavailable'
  let hcTimer: Timer | null = null

  const binding: RedisBinding = {
    get client() {
      return client
    },
    get status() {
      return status
    },
    async ping() {
      if (!client) return false
      try {
        const p = client.ping()
        const race = Promise.race([
          p,
          new Promise((_r, rej) =>
            setTimeout(() => rej(new Error('ping-timeout')), healthcheck.timeoutMs ?? 1000)
          )
        ])
        const res = await race
        return res === 'PONG'
      } catch {
        return false
      }
    },
    async safeGet(key: string) {
      if (!client) return undefined
      try {
        return await client.get(key)
      } catch {
        return undefined
      }
    },
    async safeSet(key: string, value: string, ttlSec?: number) {
      if (!client) return undefined
      try {
        if (ttlSec && ttlSec > 0) {
          return await client.set(key, value, 'EX', ttlSec)
        }
        return await client.set(key, value)
      } catch {
        return undefined
      }
    }
  }

  async function connectWithRetry(): Promise<void> {
    const attempts = Math.max(1, startupRetry.attempts ?? 1)
    let lastErr: unknown = null

    for (let i = 1; i <= attempts; i++) {
      try {
        const c = url ? new Redis(url, options) : new Redis(options as RedisOptions)
        // inicializa eventos para observabilidade
        c.on('error', (err) => {
          // não derruba o processo; o status será verificado pelo healthcheck
          console.error('Redis error', { err: String(err) })
        })
        c.on('reconnecting', () => {
          status = 'degraded'
        })
        c.on('end', () => {
          status = 'unavailable'
        })
        // teste de ping (aguarda conexão)
        await c.ping()
        client = c
        status = 'connected'
        return
      } catch (err) {
        lastErr = err
        status = 'unavailable'
        if (i < attempts) {
          const wait = computeBackoff(i, startupRetry.backoff ?? {})
          console.warn(
            `Redis connect failed (attempt ${i}/${attempts}). Retrying in ${wait}ms...`
          )
          await sleep(wait)
        }
      }
    }

    // chegou aqui: falhou
    if (!allowFallback) {
      const msg = `redisPlugin: falha ao conectar ao Redis após ${attempts} tentativas.`
      console.error(msg, { lastErr: String(lastErr) })
      throw lastErr instanceof Error ? lastErr : new Error(msg)
    }
    // fallback
    console.warn('redisPlugin: iniciando em modo fallback (sem Redis).')
    client = null
    status = 'unavailable'
  }

  function startHealthcheck(app: Elysia) {
    if (!healthcheck.enabled) return
    if (hcTimer) clearInterval(hcTimer as unknown as number)

    hcTimer = setInterval(async () => {
      if (!client) {
        status = 'unavailable'
        return
      }
      const ok = await binding.ping()
      status = ok ? 'connected' : 'degraded'
      if (!ok) {
        // tenta reconectar silenciosamente (ioredis possui auto-reconnect,
        // aqui apenas sinalizamos status)
        app.report?.({
          name: 'redis.health.degraded',
          message: 'Redis healthcheck failed (PONG timeout).'
        })
      }
    }, healthcheck.intervalMs ?? 15000) as unknown as Timer
  }

  function stopHealthcheck() {
    if (hcTimer) {
      clearInterval(hcTimer as unknown as number)
      hcTimer = null
    }
  }

  return (app: Elysia) =>
    app
      // disponibiliza no .store e em ctx.redis
      .decorate('redis', binding)
      .state('redis', binding)
      .onStart(async () => {
        await connectWithRetry()
        startHealthcheck(app)
      })
      .onStop(async () => {
        stopHealthcheck()
        if (client) {
          try {
            await client.quit()
          } catch {
            try {
              client.disconnect()
            } catch {
              /* noop */
            }
          } finally {
            client = null
            status = 'unavailable'
          }
        }
      })
}
