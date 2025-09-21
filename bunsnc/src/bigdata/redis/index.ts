/**
 * Redis/KeyDB Integration Module - Streams, Cache, and Pub/Sub
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { RedisStreamManager, RedisConsumer } from "./RedisStreamManager";
export { RedisCache } from "./RedisCache";
export { RedisPubSub } from "./RedisPubSub";

export type {
  RedisStreamOptions,
  StreamMessage,
  ConsumerGroupOptions,
  StreamStats,
  RedisCacheOptions,
  CacheEntry,
  CacheMetrics,
  CachePattern,
  PubSubMessage,
  PubSubOptions,
  ChannelMetrics,
  PubSubMetrics,
} from "./RedisStreamManager";

import Redis from "ioredis";
import { RedisStreamManager } from "./RedisStreamManager";
import { RedisCache } from "./RedisCache";
import { RedisPubSub } from "./RedisPubSub";

/**
 * Factory class for creating integrated Redis services for ServiceNow data
 */
export class ServiceNowRedisFactory {
  private redis: Redis;

  constructor(
    redisConfig: {
      host?: string;
      port?: number;
      password?: string;
      db?: number;
      cluster?: {
        nodes: Array<{ host: string; port: number }>;
        options?: any;
      };
    } = {},
  ) {
    if (redisConfig.cluster) {
      this.redis = new Redis.Cluster(redisConfig.cluster.nodes, {
        ...redisConfig.cluster.options,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
      });
    } else {
      this.redis = new Redis({
        host: redisConfig.host || "localhost",
        port: redisConfig.port || 6379,
        password: redisConfig.password,
        db: redisConfig.db || 0,
        keyPrefix: "bunsnc:",
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        connectTimeout: 10000,
        commandTimeout: 5000,
        enableOfflineQueue: true,
        lazyConnect: false,
      });
    }
  }

  /**
   * Create Redis Stream Manager for real-time data processing
   */
  createStreamManager(
    options: import("./RedisStreamManager").RedisStreamOptions = {},
  ): RedisStreamManager {
    return new RedisStreamManager(this.redis, options);
  }

  /**
   * Create Redis Cache for high-performance caching
   */
  createCache(
    options: import("./RedisCache").RedisCacheOptions = {},
  ): RedisCache {
    return new RedisCache(this.redis, {
      keyPrefix: "cache:servicenow:",
      defaultTtl: 3600, // 1 hour
      serialization: "json",
      compression: "none",
      enableMetrics: true,
      maxMemoryPolicy: "lru",
      ...options,
    });
  }

  /**
   * Create Redis Pub/Sub for real-time messaging
   */
  createPubSub(
    options: import("./RedisPubSub").PubSubOptions = {},
  ): RedisPubSub {
    const subscriber = this.redis.duplicate();

    return new RedisPubSub(this.redis, subscriber, {
      enablePatternSubscription: true,
      enableMessageHistory: true,
      historySize: 1000,
      enableMetrics: true,
      ...options,
    });
  }

  /**
   * Create integrated ServiceNow data pipeline
   */
  createDataPipeline(): ServiceNowDataPipeline {
    return new ServiceNowDataPipeline(
      this.createStreamManager(),
      this.createCache(),
      this.createPubSub(),
    );
  }

  /**
   * Get Redis connection health
   */
  async getHealth(): Promise<{
    connected: boolean;
    latency: number;
    memory: any;
    keyspace: any;
  }> {
    try {
      const startTime = Date.now();
      const pong = await this.redis.ping();
      const latency = Date.now() - startTime;

      const info = await this.redis.info("memory");
      const keyspace = await this.redis.info("keyspace");

      return {
        connected: pong === "PONG",
        latency,
        memory: this.parseInfoString(info),
        keyspace: this.parseInfoString(keyspace),
      };
    } catch (error) {
      return {
        connected: false,
        latency: -1,
        memory: null,
        keyspace: null,
      };
    }
  }

  /**
   * Close all Redis connections
   */
  async disconnect(): Promise<void> {
    this.redis.disconnect();
  }

  private parseInfoString(info: string): any {
    const result: any = {};
    const lines = info.split("\r\n");

    for (const line of lines) {
      if (line.includes(":")) {
        const [key, value] = line.split(":");
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }

    return result;
  }
}

/**
 * Integrated ServiceNow Data Pipeline using Redis components
 */
export class ServiceNowDataPipeline {
  constructor(
    private streamManager: RedisStreamManager,
    private cache: RedisCache,
    private pubsub: RedisPubSub,
  ) {}

  /**
   * Process ServiceNow record through the pipeline
   */
  async processRecord(
    record: any,
    options: {
      streamKey?: string;
      cacheKey?: string;
      publishChannel?: string;
      cacheTtl?: number;
    } = {},
  ): Promise<void> {
    const {
      streamKey = "servicenow:records",
      cacheKey,
      publishChannel,
      cacheTtl = 3600,
    } = options;

    // Add to stream for processing
    const messageId = await this.streamManager.addMessage(streamKey, {
      table: record.table || "unknown",
      sys_id: record.sys_id,
      operation: record.operation || "update",
      data: record,
    });

    // Cache the record if cacheKey provided
    if (cacheKey) {
      await this.cache.set(cacheKey, record, cacheTtl);
    }

    // Publish notification if channel provided
    if (publishChannel) {
      await this.pubsub.publish(publishChannel, {
        type: "record_processed",
        table: record.table,
        sys_id: record.sys_id,
        messageId,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get comprehensive pipeline statistics
   */
  async getStats(): Promise<{
    streams: any;
    cache: import("./RedisCache").CacheMetrics;
    pubsub: import("./RedisPubSub").PubSubMetrics;
  }> {
    return {
      streams: this.streamManager.getActiveConsumers(),
      cache: this.cache.getMetrics(),
      pubsub: this.pubsub.getMetrics(),
    };
  }

  /**
   * Cleanup and disconnect all components
   */
  async disconnect(): Promise<void> {
    await this.streamManager.disconnect();
    await this.cache.destroy();
    await this.pubsub.disconnect();
  }
}

// Constants for ServiceNow-specific Redis operations
export const SERVICENOW_REDIS_DEFAULTS = {
  STREAM_KEYS: {
    INCIDENTS: "servicenow:incidents",
    PROBLEMS: "servicenow:problems",
    CHANGES: "servicenow:changes",
    USERS: "servicenow:users",
    ATTACHMENTS: "servicenow:attachments",
  },
  CACHE_PREFIXES: {
    RECORDS: "record:",
    QUERIES: "query:",
    USERS: "user:",
    SESSIONS: "session:",
  },
  PUBSUB_CHANNELS: {
    RECORD_UPDATES: "servicenow:record_updates",
    BULK_OPERATIONS: "servicenow:bulk_operations",
    SYSTEM_EVENTS: "servicenow:system_events",
    NOTIFICATIONS: "servicenow:notifications",
  },
  DEFAULT_TTL: {
    RECORDS: 3600, // 1 hour
    QUERIES: 1800, // 30 minutes
    USERS: 7200, // 2 hours
    SESSIONS: 86400, // 24 hours
  },
};
