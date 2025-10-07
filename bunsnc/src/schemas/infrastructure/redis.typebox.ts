/**
 * Redis TypeBox Schemas - Redis operations, streams, and caching validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all Redis validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Redis-specific validations
 * - Streams, caching, and pub/sub
 */

import { t, type Static } from "elysia";
import { SysId, ServiceNowDateTime } from "../core/base.typebox";

// ===== REDIS CONFIGURATION =====

/**
 * Redis connection configuration
 */
export const RedisConfig = t.Object({
  host: t.String({ minLength: 1 }),
  port: t.Integer({ minimum: 1, maximum: 65535, default: 6379 }),
  username: t.Optional(t.String()),
  password: t.Optional(t.String()),
  database: t.Integer({ minimum: 0, maximum: 15, default: 0 }),
  keyPrefix: t.Optional(t.String()),

  // Connection options
  connectTimeout: t.Integer({ minimum: 1, default: 10000 }),
  commandTimeout: t.Integer({ minimum: 1, default: 5000 }),
  retryDelayOnFailover: t.Integer({ minimum: 1, default: 100 }),
  maxRetriesPerRequest: t.Integer({ minimum: 0, default: 3 }),
  keepAlive: t.Integer({ minimum: 0, default: 30000 }),

  // TLS options
  tls: t.Optional(
    t.Object({
      enabled: t.Boolean({ default: false }),
      cert: t.Optional(t.String()),
      key: t.Optional(t.String()),
      ca: t.Optional(t.String()),
      rejectUnauthorized: t.Boolean({ default: true }),
    }),
  ),

  // Cluster options
  cluster: t.Optional(
    t.Object({
      enableOfflineQueue: t.Boolean({ default: false }),
      redisOptions: t.Optional(t.Record(t.String(), t.Any())),
      maxRedirections: t.Integer({ minimum: 1, default: 16 }),
      retryDelayOnFailover: t.Integer({ minimum: 1, default: 100 }),
    }),
  ),

  // Performance options
  lazyConnect: t.Boolean({ default: false }),
  maxLoadingTimeout: t.Integer({ minimum: 1, default: 5000 }),
});

export type RedisConfigType = Static<typeof RedisConfig>;

/**
 * Redis Sentinel configuration
 */
export const RedisSentinelConfig = t.Object({
  sentinels: t.Array(
    t.Object({
      host: t.String({ minLength: 1 }),
      port: t.Integer({ minimum: 1, maximum: 65535 }),
    }),
    { minItems: 1 },
  ),
  name: t.String({ minLength: 1 }),
  role: t.Union([t.Literal("master"), t.Literal("slave")]),
  password: t.Optional(t.String()),
  sentinelPassword: t.Optional(t.String()),
});

export type RedisSentinelConfigType = Static<typeof RedisSentinelConfig>;

// ===== REDIS CACHE SCHEMAS =====

/**
 * Cache key schema with TTL
 */
export const CacheKey = t.Object({
  key: t.String({ minLength: 1 }),
  value: t.String(),
  ttl: t.Optional(t.Integer({ minimum: 1 })), // TTL in seconds
  tags: t.Optional(t.Array(t.String())), // For cache invalidation
  namespace: t.Optional(t.String()),
});

export type CacheKeyType = Static<typeof CacheKey>;

/**
 * ServiceNow ticket cache entry
 */
export const TicketCache = t.Object({
  sys_id: SysId,
  table: t.Union([
    t.Literal("incident"),
    t.Literal("change_task"),
    t.Literal("sc_task"),
  ]),
  data: t.Record(t.String(), t.Any()),
  cached_at: t.Date(),
  expires_at: t.Date(),
  version: t.Optional(t.String()), // For cache versioning
  checksum: t.Optional(t.String()), // For data integrity
});

export type TicketCacheType = Static<typeof TicketCache>;

/**
 * Query result cache schema
 */
export const QueryCache = t.Object({
  query_hash: t.String({ minLength: 1 }),
  table: t.String({ minLength: 1 }),
  filters: t.Record(t.String(), t.Any()),
  results: t.Array(t.Record(t.String(), t.Any())),
  total_count: t.Integer({ minimum: 0 }),
  cached_at: t.Date(),
  expires_at: t.Date(),
  hit_count: t.Integer({ minimum: 0, default: 0 }),
  last_accessed: t.Date(),
});

export type QueryCacheType = Static<typeof QueryCache>;

// ===== REDIS STREAMS =====

/**
 * Redis Stream entry schema
 */
export const RedisStreamEntry = t.Object({
  id: t.String({ pattern: "^\\d+-\\d+$" }),
  fields: t.Record(t.String(), t.String()),
  timestamp: t.Number({ minimum: 0 }),
});

export type RedisStreamEntryType = Static<typeof RedisStreamEntry>;

/**
 * ServiceNow event stream schema
 */
export const ServiceNowEvent = t.Object({
  event_type: t.Union([
    t.Literal("ticket_created"),
    t.Literal("ticket_updated"),
    t.Literal("ticket_assigned"),
    t.Literal("ticket_resolved"),
    t.Literal("ticket_closed"),
    t.Literal("sla_breach"),
  ]),
  table: t.Union([
    t.Literal("incident"),
    t.Literal("change_task"),
    t.Literal("sc_task"),
  ]),
  sys_id: SysId,
  number: t.String(),
  timestamp: t.Date(),
  user_id: t.Optional(t.String()),
  changes: t.Optional(
    t.Array(
      t.Object({
        field: t.String(),
        old_value: t.Optional(t.String()),
        new_value: t.Optional(t.String()),
      }),
    ),
  ),
  metadata: t.Optional(t.Record(t.String(), t.Any())),
});

export type ServiceNowEventType = Static<typeof ServiceNowEvent>;

/**
 * Stream consumer group schema
 */
export const StreamConsumer = t.Object({
  group: t.String({ minLength: 1 }),
  consumer: t.String({ minLength: 1 }),
  stream: t.String({ minLength: 1 }),
  last_delivered_id: t.Optional(t.String()),
  pending_count: t.Integer({ minimum: 0, default: 0 }),
  idle_time: t.Integer({ minimum: 0, default: 0 }),
});

export type StreamConsumerType = Static<typeof StreamConsumer>;

/**
 * Stream processing configuration
 */
export const StreamProcessingConfig = t.Object({
  stream_name: t.String({ minLength: 1 }),
  consumer_group: t.String({ minLength: 1 }),
  consumer_name: t.String({ minLength: 1 }),
  batch_size: t.Integer({ minimum: 1, default: 10 }),
  block_time: t.Integer({ minimum: 0, default: 1000 }), // milliseconds
  claim_min_idle: t.Integer({ minimum: 1, default: 60000 }), // milliseconds
  max_retries: t.Integer({ minimum: 0, default: 3 }),
  retry_delay: t.Integer({ minimum: 1, default: 5000 }), // milliseconds
});

export type StreamProcessingConfigType = Static<
  typeof StreamProcessingConfig
>;

// ===== REDIS PUB/SUB =====

/**
 * Redis pub/sub message schema
 */
export const PubSubMessage = t.Object({
  channel: t.String({ minLength: 1 }),
  pattern: t.Optional(t.String()),
  message: t.String(),
  timestamp: t.Date(),
  publisher: t.Optional(t.String()),
});

export type PubSubMessageType = Static<typeof PubSubMessage>;

/**
 * Notification message schema
 */
export const NotificationMessage = t.Object({
  type: t.Union([
    t.Literal("info"),
    t.Literal("warning"),
    t.Literal("error"),
    t.Literal("success"),
  ]),
  title: t.String({ minLength: 1 }),
  message: t.String({ minLength: 1 }),
  user_id: t.Optional(t.String()),
  group_id: t.Optional(t.String()),
  ticket_id: t.Optional(SysId),
  priority: t.Union([
    t.Literal("low"),
    t.Literal("normal"),
    t.Literal("high"),
    t.Literal("urgent"),
  ]),
  expires_at: t.Optional(t.Date()),
  read: t.Boolean({ default: false }),
  metadata: t.Optional(t.Record(t.String(), t.Any())),
});

export type NotificationMessageType = Static<typeof NotificationMessage>;

// ===== REDIS OPERATIONS =====

/**
 * Redis command schema
 */
export const RedisCommand = t.Object({
  command: t.Union([
    t.Literal("GET"),
    t.Literal("SET"),
    t.Literal("DEL"),
    t.Literal("EXISTS"),
    t.Literal("EXPIRE"),
    t.Literal("TTL"),
    t.Literal("INCR"),
    t.Literal("DECR"),
    t.Literal("HGET"),
    t.Literal("HSET"),
    t.Literal("HDEL"),
    t.Literal("LPUSH"),
    t.Literal("RPUSH"),
    t.Literal("LPOP"),
    t.Literal("RPOP"),
    t.Literal("SADD"),
    t.Literal("SREM"),
    t.Literal("SMEMBERS"),
  ]),
  key: t.String({ minLength: 1 }),
  value: t.Optional(t.Union([t.String(), t.Number(), t.Array(t.String())])),
  options: t.Optional(t.Record(t.String(), t.Any())),
  ttl: t.Optional(t.Integer({ minimum: 1 })),
});

export type RedisCommandType = Static<typeof RedisCommand>;

/**
 * Redis pipeline operation
 */
export const RedisPipeline = t.Object({
  operations: t.Array(RedisCommand, { minItems: 1, maxItems: 1000 }),
  atomic: t.Boolean({ default: false }), // Use MULTI/EXEC
  timeout: t.Integer({ minimum: 1, default: 10000 }),
});

export type RedisPipelineType = Static<typeof RedisPipeline>;

/**
 * Redis Lua script schema
 */
export const RedisLuaScript = t.Object({
  script: t.String({ minLength: 1 }),
  keys: t.Array(t.String()),
  args: t.Array(t.Union([t.String(), t.Number()])),
  sha: t.Optional(t.String()), // For EVALSHA
});

export type RedisLuaScriptType = Static<typeof RedisLuaScript>;

// ===== REDIS MONITORING =====

/**
 * Redis performance metrics
 */
export const RedisMetrics = t.Object({
  command: t.String(),
  execution_time_ms: t.Number({ minimum: 0 }),
  memory_usage_bytes: t.Integer({ minimum: 0 }),
  key_count: t.Integer({ minimum: 0 }),
  hit_rate: t.Number({ minimum: 0, maximum: 1 }),
  evictions: t.Integer({ minimum: 0 }),
  connections: t.Integer({ minimum: 0 }),
  ops_per_sec: t.Number({ minimum: 0 }),
  network_io_bytes: t.Integer({ minimum: 0 }),
  timestamp: t.Date(),
});

export type RedisMetricsType = Static<typeof RedisMetrics>;

/**
 * Redis health check schema
 */
export const RedisHealth = t.Object({
  status: t.Union([
    t.Literal("healthy"),
    t.Literal("degraded"),
    t.Literal("unhealthy"),
  ]),
  latency_ms: t.Number({ minimum: 0 }),
  memory_usage_mb: t.Number({ minimum: 0 }),
  connected_clients: t.Integer({ minimum: 0 }),
  uptime_seconds: t.Integer({ minimum: 0 }),
  version: t.String(),
  role: t.Optional(t.Union([t.Literal("master"), t.Literal("slave")])),
  replication_offset: t.Optional(t.Integer({ minimum: 0 })),
  last_check: t.Date(),
  errors: t.Optional(t.Array(t.String())),
});

export type RedisHealthType = Static<typeof RedisHealth>;

// ===== EXPORT SUMMARY =====

/**
 * Redis schemas exported:
 *
 * Configuration:
 * - RedisConfig: Connection and performance settings
 * - RedisSentinelConfig: Sentinel high availability setup
 *
 * Caching:
 * - CacheKey: Key-value with TTL and tags
 * - TicketCache: ServiceNow ticket caching
 * - QueryCache: Query result caching with hit tracking
 *
 * Streams:
 * - RedisStreamEntry: Stream event entries
 * - ServiceNowEvent: ServiceNow event tracking
 * - StreamConsumer: Consumer group management
 * - StreamProcessingConfig: Processing configuration
 *
 * Pub/Sub:
 * - PubSubMessage: Channel messaging
 * - NotificationMessage: User notifications
 *
 * Operations:
 * - RedisCommand: Individual Redis commands
 * - RedisPipeline: Batch operations (1-1000 ops)
 * - RedisLuaScript: Lua script execution
 *
 * Monitoring:
 * - RedisMetrics: Performance metrics
 * - RedisHealth: Health check status
 *
 * All schemas use TypeBox for Elysia native validation
 */
