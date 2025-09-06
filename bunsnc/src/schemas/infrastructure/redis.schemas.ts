/**
 * Redis Schemas - Redis operations, streams, and caching validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Redis-specific validations
 * - Streams, caching, and pub/sub
 */

import { z } from 'zod';
import { SysIdSchema, ServiceNowDateTimeSchema } from '../core/base.schemas';

// ===== REDIS CONFIGURATION =====

/**
 * Redis connection configuration
 */
export const RedisConfigSchema = z.object({
  host: z.string().min(1, 'Redis host is required'),
  port: z.number().int().min(1).max(65535).default(6379),
  username: z.string().optional(),
  password: z.string().optional(),
  database: z.number().int().min(0).max(15).default(0),
  keyPrefix: z.string().optional(),
  
  // Connection options
  connectTimeout: z.number().int().positive().default(10000),
  commandTimeout: z.number().int().positive().default(5000),
  retryDelayOnFailover: z.number().int().positive().default(100),
  maxRetriesPerRequest: z.number().int().min(0).default(3),
  keepAlive: z.number().int().min(0).default(30000),
  
  // TLS options
  tls: z.object({
    enabled: z.boolean().default(false),
    cert: z.string().optional(),
    key: z.string().optional(),
    ca: z.string().optional(),
    rejectUnauthorized: z.boolean().default(true)
  }).optional(),
  
  // Cluster options
  cluster: z.object({
    enableOfflineQueue: z.boolean().default(false),
    redisOptions: z.record(z.any()).optional(),
    maxRedirections: z.number().int().positive().default(16),
    retryDelayOnFailover: z.number().int().positive().default(100)
  }).optional(),
  
  // Performance options
  lazyConnect: z.boolean().default(false),
  maxLoadingTimeout: z.number().int().positive().default(5000)
});

/**
 * Redis Sentinel configuration
 */
export const RedisSentinelConfigSchema = z.object({
  sentinels: z.array(z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535)
  })).min(1, 'At least one sentinel is required'),
  name: z.string().min(1, 'Master name is required'),
  role: z.enum(['master', 'slave']).default('master'),
  password: z.string().optional(),
  sentinelPassword: z.string().optional()
});

// ===== REDIS CACHE SCHEMAS =====

/**
 * Cache key schema with TTL
 */
export const CacheKeySchema = z.object({
  key: z.string().min(1, 'Cache key is required'),
  value: z.string(),
  ttl: z.number().int().positive().optional(), // TTL in seconds
  tags: z.array(z.string()).optional(), // For cache invalidation
  namespace: z.string().optional()
});

/**
 * ServiceNow ticket cache entry
 */
export const TicketCacheSchema = z.object({
  sys_id: SysIdSchema,
  table: z.enum(['incident', 'change_task', 'sc_task']),
  data: z.record(z.any()),
  cached_at: z.date().default(() => new Date()),
  expires_at: z.date(),
  version: z.string().optional(), // For cache versioning
  checksum: z.string().optional() // For data integrity
});

/**
 * Query result cache schema
 */
export const QueryCacheSchema = z.object({
  query_hash: z.string().min(1, 'Query hash is required'),
  table: z.string().min(1, 'Table name is required'),
  filters: z.record(z.any()),
  results: z.array(z.record(z.any())),
  total_count: z.number().int().min(0),
  cached_at: z.date().default(() => new Date()),
  expires_at: z.date(),
  hit_count: z.number().int().min(0).default(0),
  last_accessed: z.date().default(() => new Date())
});

// ===== REDIS STREAMS =====

/**
 * Redis Stream entry schema
 */
export const RedisStreamEntrySchema = z.object({
  id: z.string().regex(/^\d+-\d+$/, 'Invalid stream entry ID format'),
  fields: z.record(z.string()),
  timestamp: z.number().positive()
});

/**
 * ServiceNow event stream schema
 */
export const ServiceNowEventSchema = z.object({
  event_type: z.enum(['ticket_created', 'ticket_updated', 'ticket_assigned', 'ticket_resolved', 'ticket_closed', 'sla_breach']),
  table: z.enum(['incident', 'change_task', 'sc_task']),
  sys_id: SysIdSchema,
  number: z.string(),
  timestamp: z.date().default(() => new Date()),
  user_id: z.string().optional(),
  changes: z.object({
    field: z.string(),
    old_value: z.string().optional(),
    new_value: z.string().optional()
  }).array().optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * Stream consumer group schema
 */
export const StreamConsumerSchema = z.object({
  group: z.string().min(1, 'Consumer group name is required'),
  consumer: z.string().min(1, 'Consumer name is required'),
  stream: z.string().min(1, 'Stream name is required'),
  last_delivered_id: z.string().optional(),
  pending_count: z.number().int().min(0).default(0),
  idle_time: z.number().int().min(0).default(0)
});

/**
 * Stream processing configuration
 */
export const StreamProcessingConfigSchema = z.object({
  stream_name: z.string().min(1, 'Stream name is required'),
  consumer_group: z.string().min(1, 'Consumer group is required'),
  consumer_name: z.string().min(1, 'Consumer name is required'),
  batch_size: z.number().int().positive().default(10),
  block_time: z.number().int().min(0).default(1000), // milliseconds
  claim_min_idle: z.number().int().positive().default(60000), // milliseconds
  max_retries: z.number().int().min(0).default(3),
  retry_delay: z.number().int().positive().default(5000) // milliseconds
});

// ===== REDIS PUB/SUB =====

/**
 * Redis pub/sub message schema
 */
export const PubSubMessageSchema = z.object({
  channel: z.string().min(1, 'Channel name is required'),
  pattern: z.string().optional(),
  message: z.string(),
  timestamp: z.date().default(() => new Date()),
  publisher: z.string().optional()
});

/**
 * Notification message schema
 */
export const NotificationMessageSchema = z.object({
  type: z.enum(['info', 'warning', 'error', 'success']),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  user_id: z.string().optional(),
  group_id: z.string().optional(),
  ticket_id: SysIdSchema.optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  expires_at: z.date().optional(),
  read: z.boolean().default(false),
  metadata: z.record(z.any()).optional()
});

// ===== REDIS OPERATIONS =====

/**
 * Redis command schema
 */
export const RedisCommandSchema = z.object({
  command: z.enum(['GET', 'SET', 'DEL', 'EXISTS', 'EXPIRE', 'TTL', 'INCR', 'DECR', 'HGET', 'HSET', 'HDEL', 'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'SADD', 'SREM', 'SMEMBERS']),
  key: z.string().min(1, 'Key is required'),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
  options: z.record(z.any()).optional(),
  ttl: z.number().int().positive().optional()
});

/**
 * Redis pipeline operation
 */
export const RedisPipelineSchema = z.object({
  operations: z.array(RedisCommandSchema).min(1, 'At least one operation is required').max(1000, 'Maximum 1000 operations per pipeline'),
  atomic: z.boolean().default(false), // Use MULTI/EXEC
  timeout: z.number().int().positive().default(10000)
});

/**
 * Redis Lua script schema
 */
export const RedisLuaScriptSchema = z.object({
  script: z.string().min(1, 'Lua script is required'),
  keys: z.array(z.string()),
  args: z.array(z.union([z.string(), z.number()])),
  sha: z.string().optional() // For EVALSHA
});

// ===== REDIS MONITORING =====

/**
 * Redis performance metrics
 */
export const RedisMetricsSchema = z.object({
  command: z.string(),
  execution_time_ms: z.number().positive(),
  memory_usage_bytes: z.number().int().min(0),
  key_count: z.number().int().min(0),
  hit_rate: z.number().min(0).max(1),
  evictions: z.number().int().min(0),
  connections: z.number().int().min(0),
  ops_per_sec: z.number().min(0),
  network_io_bytes: z.number().int().min(0),
  timestamp: z.date().default(() => new Date())
});

/**
 * Redis health check schema
 */
export const RedisHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  latency_ms: z.number().positive(),
  memory_usage_mb: z.number().positive(),
  connected_clients: z.number().int().min(0),
  uptime_seconds: z.number().int().min(0),
  version: z.string(),
  role: z.enum(['master', 'slave']).optional(),
  replication_offset: z.number().int().min(0).optional(),
  last_check: z.date().default(() => new Date()),
  errors: z.array(z.string()).optional()
});

// ===== TYPE EXPORTS =====

export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type RedisSentinelConfig = z.infer<typeof RedisSentinelConfigSchema>;
export type CacheKey = z.infer<typeof CacheKeySchema>;
export type TicketCache = z.infer<typeof TicketCacheSchema>;
export type QueryCache = z.infer<typeof QueryCacheSchema>;
export type RedisStreamEntry = z.infer<typeof RedisStreamEntrySchema>;
export type ServiceNowEvent = z.infer<typeof ServiceNowEventSchema>;
export type StreamConsumer = z.infer<typeof StreamConsumerSchema>;
export type StreamProcessingConfig = z.infer<typeof StreamProcessingConfigSchema>;
export type PubSubMessage = z.infer<typeof PubSubMessageSchema>;
export type NotificationMessage = z.infer<typeof NotificationMessageSchema>;
export type RedisCommand = z.infer<typeof RedisCommandSchema>;
export type RedisPipeline = z.infer<typeof RedisPipelineSchema>;
export type RedisLuaScript = z.infer<typeof RedisLuaScriptSchema>;
export type RedisMetrics = z.infer<typeof RedisMetricsSchema>;
export type RedisHealth = z.infer<typeof RedisHealthSchema>;