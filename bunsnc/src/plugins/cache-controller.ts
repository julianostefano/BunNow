/**
 * Cache Controller - Specialized Elysia Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements "1 controller = 1 instância" Elysia best practice
 * Handles Redis cache operations, streams, and pub/sub functionality
 *
 * Features:
 * - Redis connection management with clustering support
 * - Key-value cache operations with TTL support
 * - Redis Streams for real-time data processing
 * - Pub/Sub messaging for notifications
 * - Connection health monitoring and failover
 * - Graceful degradation with in-memory fallback
 */

import { Elysia } from "elysia";
import Redis, { RedisOptions, Cluster } from "ioredis";
import { logger } from "../utils/Logger";

// Cache Configuration Interface
export interface CacheConfig {
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  maxRetriesPerCommand?: number;
  lazyConnect?: boolean;
  cluster?: {
    enabled: boolean;
    nodes?: Array<{ host: string; port: number }>;
  };
}

// Cache Service Interface
export interface CacheService {
  isConnected: boolean;
  client: Redis | Cluster | null;

  // Basic cache operations
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttl: number): Promise<boolean>;
  ttl(key: string): Promise<number>;

  // Hash operations
  hget<T = any>(key: string, field: string): Promise<T | null>;
  hset(key: string, field: string, value: any): Promise<boolean>;
  hgetall<T = any>(key: string): Promise<T | null>;
  hdel(key: string, field: string): Promise<boolean>;
  hkeys(key: string): Promise<string[]>;

  // List operations
  lpush(key: string, value: any): Promise<number>;
  rpush(key: string, value: any): Promise<number>;
  lpop<T = any>(key: string): Promise<T | null>;
  rpop<T = any>(key: string): Promise<T | null>;
  llen(key: string): Promise<number>;
  lrange<T = any>(key: string, start: number, stop: number): Promise<T[]>;

  // Set operations
  sadd(key: string, member: any): Promise<boolean>;
  srem(key: string, member: any): Promise<boolean>;
  smembers<T = any>(key: string): Promise<T[]>;
  sismember(key: string, member: any): Promise<boolean>;

  // Stream operations
  xadd(stream: string, fields: Record<string, any>): Promise<string>;
  xread(streams: Record<string, string>, count?: number, block?: number): Promise<any[]>;
  xrange(stream: string, start?: string, end?: string, count?: number): Promise<any[]>;
  xlen(stream: string): Promise<number>;

  // Pub/Sub operations
  publish(channel: string, message: any): Promise<number>;
  subscribe(channel: string, callback: (message: any) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;

  // Batch operations
  pipeline(): any;
  multi(): any;

  // Utility operations
  keys(pattern: string): Promise<string[]>;
  flushdb(): Promise<boolean>;
  info(section?: string): Promise<string>;

  // Health and monitoring
  healthCheck(): Promise<boolean>;
  getStats(): Promise<any>;
}

/**
 * Redis Cache Service Implementation
 */
class RedisCacheService implements CacheService {
  public isConnected = false;
  public client: Redis | Cluster | null = null;

  private config: CacheConfig;
  private connectionRetries = 0;
  private maxRetries = 3;
  private retryDelay = 2000;
  private subscribers: Map<string, (message: any) => void> = new Map();
  private fallbackCache: Map<string, { value: any; expires?: number }> = new Map();

  constructor(config: CacheConfig) {
    this.config = {
      host: config.host || process.env.REDIS_HOST || "10.219.8.210",
      port: config.port || parseInt(process.env.REDIS_PORT || "6380"),
      password: config.password || process.env.REDIS_PASSWORD,
      database: config.database || parseInt(process.env.REDIS_DB || "0"),
      keyPrefix: config.keyPrefix || "bunsnc:",
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      enableReadyCheck: config.enableReadyCheck !== false,
      maxRetriesPerCommand: config.maxRetriesPerCommand || 3,
      lazyConnect: config.lazyConnect !== false,
      cluster: config.cluster || { enabled: false }
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    try {
      logger.info("🔌 Connecting to Redis...", "CacheController", {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        cluster: this.config.cluster?.enabled
      });

      const redisOptions: RedisOptions = {
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.database,
        keyPrefix: this.config.keyPrefix,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        retryDelayOnFailover: this.config.retryDelayOnFailover,
        enableReadyCheck: this.config.enableReadyCheck,
        lazyConnect: this.config.lazyConnect,
        reconnectOnError: (err) => {
          logger.warn("🔄 Redis reconnecting on error", "CacheController", { error: err.message });
          return true;
        }
      };

      // Create Redis client (cluster or single)
      if (this.config.cluster?.enabled && this.config.cluster.nodes) {
        this.client = new Redis.Cluster(this.config.cluster.nodes, {
          redisOptions,
          enableOfflineQueue: false
        });
      } else {
        this.client = new Redis(redisOptions);
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Test connection
      await this.client.ping();
      this.isConnected = true;
      this.connectionRetries = 0;

      logger.info("✅ Redis connected successfully", "CacheController", {
        cluster: this.config.cluster?.enabled,
        database: this.config.database,
        keyPrefix: this.config.keyPrefix
      });

    } catch (error: any) {
      await this.handleConnectionError(error);
    }
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.isConnected = false;
      this.client = null;
      this.subscribers.clear();
      logger.info("🔌 Redis connection closed", "CacheController");
    }
  }

  // Basic Cache Operations

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        return this.getFallback<T>(key);
      }

      const result = await this.client!.get(key);
      if (result === null) return null;

      try {
        return JSON.parse(result) as T;
      } catch {
        return result as T;
      }
    } catch (error: any) {
      logger.error(`❌ Redis get failed for key ${key}`, "CacheController", { error: error.message });
      return this.getFallback<T>(key);
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return this.setFallback(key, value, ttl);
      }

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttl) {
        await this.client!.setex(key, ttl, serializedValue);
      } else {
        await this.client!.set(key, serializedValue);
      }

      // Also store in fallback cache
      this.setFallback(key, value, ttl);
      return true;
    } catch (error: any) {
      logger.error(`❌ Redis set failed for key ${key}`, "CacheController", { error: error.message });
      return this.setFallback(key, value, ttl);
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        this.fallbackCache.delete(key);
        return true;
      }

      const result = await this.client!.del(key);
      this.fallbackCache.delete(key);
      return result > 0;
    } catch (error: any) {
      logger.error(`❌ Redis del failed for key ${key}`, "CacheController", { error: error.message });
      this.fallbackCache.delete(key);
      return true;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return this.fallbackCache.has(key);
      }

      const result = await this.client!.exists(key);
      return result > 0;
    } catch (error: any) {
      logger.error(`❌ Redis exists failed for key ${key}`, "CacheController", { error: error.message });
      return this.fallbackCache.has(key);
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        const item = this.fallbackCache.get(key);
        if (item) {
          item.expires = Date.now() + (ttl * 1000);
          return true;
        }
        return false;
      }

      const result = await this.client!.expire(key, ttl);
      return result === 1;
    } catch (error: any) {
      logger.error(`❌ Redis expire failed for key ${key}`, "CacheController", { error: error.message });
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        const item = this.fallbackCache.get(key);
        if (item && item.expires) {
          return Math.max(0, Math.floor((item.expires - Date.now()) / 1000));
        }
        return -1;
      }

      return await this.client!.ttl(key);
    } catch (error: any) {
      logger.error(`❌ Redis ttl failed for key ${key}`, "CacheController", { error: error.message });
      return -1;
    }
  }

  // Hash Operations

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      if (!this.isConnected) return null;

      const result = await this.client!.hget(key, field);
      if (result === null) return null;

      try {
        return JSON.parse(result) as T;
      } catch {
        return result as T;
      }
    } catch (error: any) {
      logger.error(`❌ Redis hget failed for ${key}.${field}`, "CacheController", { error: error.message });
      return null;
    }
  }

  async hset(key: string, field: string, value: any): Promise<boolean> {
    try {
      if (!this.isConnected) return false;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client!.hset(key, field, serializedValue);
      return true;
    } catch (error: any) {
      logger.error(`❌ Redis hset failed for ${key}.${field}`, "CacheController", { error: error.message });
      return false;
    }
  }

  async hgetall<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) return null;

      const result = await this.client!.hgetall(key);
      if (!result || Object.keys(result).length === 0) return null;

      // Try to parse JSON values
      const parsed: any = {};
      for (const [field, value] of Object.entries(result)) {
        try {
          parsed[field] = JSON.parse(value);
        } catch {
          parsed[field] = value;
        }
      }

      return parsed as T;
    } catch (error: any) {
      logger.error(`❌ Redis hgetall failed for key ${key}`, "CacheController", { error: error.message });
      return null;
    }
  }

  async hdel(key: string, field: string): Promise<boolean> {
    try {
      if (!this.isConnected) return false;

      const result = await this.client!.hdel(key, field);
      return result > 0;
    } catch (error: any) {
      logger.error(`❌ Redis hdel failed for ${key}.${field}`, "CacheController", { error: error.message });
      return false;
    }
  }

  async hkeys(key: string): Promise<string[]> {
    try {
      if (!this.isConnected) return [];

      return await this.client!.hkeys(key);
    } catch (error: any) {
      logger.error(`❌ Redis hkeys failed for key ${key}`, "CacheController", { error: error.message });
      return [];
    }
  }

  // List Operations

  async lpush(key: string, value: any): Promise<number> {
    try {
      if (!this.isConnected) return 0;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      return await this.client!.lpush(key, serializedValue);
    } catch (error: any) {
      logger.error(`❌ Redis lpush failed for key ${key}`, "CacheController", { error: error.message });
      return 0;
    }
  }

  async rpush(key: string, value: any): Promise<number> {
    try {
      if (!this.isConnected) return 0;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      return await this.client!.rpush(key, serializedValue);
    } catch (error: any) {
      logger.error(`❌ Redis rpush failed for key ${key}`, "CacheController", { error: error.message });
      return 0;
    }
  }

  async lpop<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) return null;

      const result = await this.client!.lpop(key);
      if (result === null) return null;

      try {
        return JSON.parse(result) as T;
      } catch {
        return result as T;
      }
    } catch (error: any) {
      logger.error(`❌ Redis lpop failed for key ${key}`, "CacheController", { error: error.message });
      return null;
    }
  }

  async rpop<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) return null;

      const result = await this.client!.rpop(key);
      if (result === null) return null;

      try {
        return JSON.parse(result) as T;
      } catch {
        return result as T;
      }
    } catch (error: any) {
      logger.error(`❌ Redis rpop failed for key ${key}`, "CacheController", { error: error.message });
      return null;
    }
  }

  async llen(key: string): Promise<number> {
    try {
      if (!this.isConnected) return 0;

      return await this.client!.llen(key);
    } catch (error: any) {
      logger.error(`❌ Redis llen failed for key ${key}`, "CacheController", { error: error.message });
      return 0;
    }
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      if (!this.isConnected) return [];

      const results = await this.client!.lrange(key, start, stop);
      return results.map(result => {
        try {
          return JSON.parse(result) as T;
        } catch {
          return result as T;
        }
      });
    } catch (error: any) {
      logger.error(`❌ Redis lrange failed for key ${key}`, "CacheController", { error: error.message });
      return [];
    }
  }

  // Set Operations

  async sadd(key: string, member: any): Promise<boolean> {
    try {
      if (!this.isConnected) return false;

      const serializedMember = typeof member === 'string' ? member : JSON.stringify(member);
      const result = await this.client!.sadd(key, serializedMember);
      return result > 0;
    } catch (error: any) {
      logger.error(`❌ Redis sadd failed for key ${key}`, "CacheController", { error: error.message });
      return false;
    }
  }

  async srem(key: string, member: any): Promise<boolean> {
    try {
      if (!this.isConnected) return false;

      const serializedMember = typeof member === 'string' ? member : JSON.stringify(member);
      const result = await this.client!.srem(key, serializedMember);
      return result > 0;
    } catch (error: any) {
      logger.error(`❌ Redis srem failed for key ${key}`, "CacheController", { error: error.message });
      return false;
    }
  }

  async smembers<T = any>(key: string): Promise<T[]> {
    try {
      if (!this.isConnected) return [];

      const results = await this.client!.smembers(key);
      return results.map(result => {
        try {
          return JSON.parse(result) as T;
        } catch {
          return result as T;
        }
      });
    } catch (error: any) {
      logger.error(`❌ Redis smembers failed for key ${key}`, "CacheController", { error: error.message });
      return [];
    }
  }

  async sismember(key: string, member: any): Promise<boolean> {
    try {
      if (!this.isConnected) return false;

      const serializedMember = typeof member === 'string' ? member : JSON.stringify(member);
      const result = await this.client!.sismember(key, serializedMember);
      return result === 1;
    } catch (error: any) {
      logger.error(`❌ Redis sismember failed for key ${key}`, "CacheController", { error: error.message });
      return false;
    }
  }

  // Stream Operations

  async xadd(stream: string, fields: Record<string, any>): Promise<string> {
    try {
      if (!this.isConnected) return "0-0";

      // Convert fields to Redis stream format
      const streamFields: string[] = [];
      for (const [key, value] of Object.entries(fields)) {
        streamFields.push(key, typeof value === 'string' ? value : JSON.stringify(value));
      }

      return await this.client!.xadd(stream, "*", ...streamFields);
    } catch (error: any) {
      logger.error(`❌ Redis xadd failed for stream ${stream}`, "CacheController", { error: error.message });
      return "0-0";
    }
  }

  async xread(streams: Record<string, string>, count?: number, block?: number): Promise<any[]> {
    try {
      if (!this.isConnected) return [];

      const args: any[] = [];
      if (count) {
        args.push("COUNT", count);
      }
      if (block !== undefined) {
        args.push("BLOCK", block);
      }
      args.push("STREAMS");

      for (const [stream, id] of Object.entries(streams)) {
        args.push(stream);
      }
      for (const id of Object.values(streams)) {
        args.push(id);
      }

      const result = await this.client!.xread(...args);
      return result || [];
    } catch (error: any) {
      logger.error("❌ Redis xread failed", "CacheController", { error: error.message });
      return [];
    }
  }

  async xrange(stream: string, start = "-", end = "+", count?: number): Promise<any[]> {
    try {
      if (!this.isConnected) return [];

      const args: any[] = [stream, start, end];
      if (count) {
        args.push("COUNT", count);
      }

      const result = await this.client!.xrange(...args);
      return result || [];
    } catch (error: any) {
      logger.error(`❌ Redis xrange failed for stream ${stream}`, "CacheController", { error: error.message });
      return [];
    }
  }

  async xlen(stream: string): Promise<number> {
    try {
      if (!this.isConnected) return 0;

      return await this.client!.xlen(stream);
    } catch (error: any) {
      logger.error(`❌ Redis xlen failed for stream ${stream}`, "CacheController", { error: error.message });
      return 0;
    }
  }

  // Pub/Sub Operations

  async publish(channel: string, message: any): Promise<number> {
    try {
      if (!this.isConnected) return 0;

      const serializedMessage = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.client!.publish(channel, serializedMessage);
    } catch (error: any) {
      logger.error(`❌ Redis publish failed for channel ${channel}`, "CacheController", { error: error.message });
      return 0;
    }
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    try {
      if (!this.isConnected) return;

      this.subscribers.set(channel, callback);
      await this.client!.subscribe(channel);

      this.client!.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch {
            callback(message);
          }
        }
      });
    } catch (error: any) {
      logger.error(`❌ Redis subscribe failed for channel ${channel}`, "CacheController", { error: error.message });
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    try {
      if (!this.isConnected) return;

      await this.client!.unsubscribe(channel);
      this.subscribers.delete(channel);
    } catch (error: any) {
      logger.error(`❌ Redis unsubscribe failed for channel ${channel}`, "CacheController", { error: error.message });
    }
  }

  // Batch Operations

  pipeline(): any {
    if (!this.isConnected || !this.client) {
      throw new Error("Redis not connected");
    }
    return this.client.pipeline();
  }

  multi(): any {
    if (!this.isConnected || !this.client) {
      throw new Error("Redis not connected");
    }
    return this.client.multi();
  }

  // Utility Operations

  async keys(pattern: string): Promise<string[]> {
    try {
      if (!this.isConnected) return [];

      return await this.client!.keys(pattern);
    } catch (error: any) {
      logger.error(`❌ Redis keys failed for pattern ${pattern}`, "CacheController", { error: error.message });
      return [];
    }
  }

  async flushdb(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        this.fallbackCache.clear();
        return true;
      }

      await this.client!.flushdb();
      this.fallbackCache.clear();
      return true;
    } catch (error: any) {
      logger.error("❌ Redis flushdb failed", "CacheController", { error: error.message });
      return false;
    }
  }

  async info(section?: string): Promise<string> {
    try {
      if (!this.isConnected) return "";

      return await this.client!.info(section);
    } catch (error: any) {
      logger.error("❌ Redis info failed", "CacheController", { error: error.message });
      return "";
    }
  }

  // Health and Monitoring

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected || !this.client) {
        return false;
      }
      await this.client.ping();
      return true;
    } catch (error: any) {
      logger.warn("⚠️ Redis health check failed", "CacheController", { error: error.message });
      return false;
    }
  }

  async getStats(): Promise<any> {
    try {
      if (!this.isConnected || !this.client) {
        return {
          connected: false,
          fallbackCacheSize: this.fallbackCache.size,
          error: "Not connected"
        };
      }

      const info = await this.client.info();
      const dbSize = await this.client.dbsize();

      return {
        connected: this.isConnected,
        database: this.config.database,
        keyPrefix: this.config.keyPrefix,
        dbSize,
        fallbackCacheSize: this.fallbackCache.size,
        subscribers: this.subscribers.size,
        cluster: this.config.cluster?.enabled,
        info: this.parseRedisInfo(info)
      };
    } catch (error: any) {
      return {
        connected: false,
        fallbackCacheSize: this.fallbackCache.size,
        error: error.message
      };
    }
  }

  // Private Helper Methods

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.info("🔌 Redis connected", "CacheController");
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info("✅ Redis ready", "CacheController");
    });

    this.client.on('error', (error) => {
      logger.error("❌ Redis error", "CacheController", { error: error.message });
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn("🔌 Redis connection closed", "CacheController");
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info("🔄 Redis reconnecting...", "CacheController");
    });
  }

  private getFallback<T>(key: string): T | null {
    const item = this.fallbackCache.get(key);
    if (!item) return null;

    if (item.expires && Date.now() > item.expires) {
      this.fallbackCache.delete(key);
      return null;
    }

    return item.value as T;
  }

  private setFallback(key: string, value: any, ttl?: number): boolean {
    const item: { value: any; expires?: number } = { value };
    if (ttl) {
      item.expires = Date.now() + (ttl * 1000);
    }
    this.fallbackCache.set(key, item);
    return true;
  }

  private parseRedisInfo(info: string): any {
    const parsed: any = {};
    const sections = info.split('\r\n\r\n');

    for (const section of sections) {
      const lines = section.split('\r\n');
      const sectionName = lines[0]?.replace('# ', '') || 'unknown';
      parsed[sectionName] = {};

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value !== undefined) {
            parsed[sectionName][key] = value;
          }
        }
      }
    }

    return parsed;
  }

  private async handleConnectionError(error: any): Promise<void> {
    logger.error("❌ Redis connection failed", "CacheController", {
      error: error.message,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries
    });

    if (this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      logger.info(`🔄 Retrying Redis connection in ${this.retryDelay}ms... (${this.connectionRetries}/${this.maxRetries})`, "CacheController");

      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      await this.initialize();
    } else {
      logger.warn("⚠️ Redis connection failed after max retries - running with in-memory fallback", "CacheController");
      this.isConnected = false;
    }
  }
}

/**
 * Cache Controller Plugin
 * Follows Elysia "1 controller = 1 instância" best practice
 */
export const cacheController = new Elysia({ name: "cache" })
  .onStart(async () => {
    logger.info("🗄️ Cache Controller initializing...", "CacheController");
  })
  .derive(async ({ config }) => {
    // Get Redis configuration
    const cacheConfig: CacheConfig = {
      host: config?.redis?.host,
      port: config?.redis?.port,
      password: config?.redis?.password,
      database: config?.redis?.database,
      keyPrefix: config?.redis?.keyPrefix || "bunsnc:",
      cluster: config?.redis?.cluster
    };

    // Create Redis cache service instance
    const cacheService = new RedisCacheService(cacheConfig);

    try {
      // Initialize connection
      await cacheService.initialize();

      logger.info("✅ Cache Controller ready", "CacheController", {
        connected: cacheService.isConnected,
        database: cacheConfig.database,
        keyPrefix: cacheConfig.keyPrefix
      });

      return {
        cache: cacheService,
        cacheService,
        // Expose individual methods for convenience
        cacheGet: cacheService.get.bind(cacheService),
        cacheSet: cacheService.set.bind(cacheService),
        cacheDel: cacheService.del.bind(cacheService),
        cacheExists: cacheService.exists.bind(cacheService),
        cacheExpire: cacheService.expire.bind(cacheService),
        cacheTtl: cacheService.ttl.bind(cacheService),
        cacheHget: cacheService.hget.bind(cacheService),
        cacheHset: cacheService.hset.bind(cacheService),
        cacheHgetall: cacheService.hgetall.bind(cacheService),
        cacheKeys: cacheService.keys.bind(cacheService),
        cachePublish: cacheService.publish.bind(cacheService),
        cacheSubscribe: cacheService.subscribe.bind(cacheService),
        cacheXadd: cacheService.xadd.bind(cacheService),
        cacheXread: cacheService.xread.bind(cacheService),
        cacheXrange: cacheService.xrange.bind(cacheService),
        cacheHealthCheck: cacheService.healthCheck.bind(cacheService),
        cacheStats: cacheService.getStats.bind(cacheService)
      };

    } catch (error: any) {
      logger.error("❌ Cache Controller initialization failed", "CacheController", {
        error: error.message
      });

      // Return fallback service that doesn't crash the application
      const fallbackService: CacheService = {
        isConnected: false,
        client: null,
        get: async () => null,
        set: async () => false,
        del: async () => false,
        exists: async () => false,
        expire: async () => false,
        ttl: async () => -1,
        hget: async () => null,
        hset: async () => false,
        hgetall: async () => null,
        hdel: async () => false,
        hkeys: async () => [],
        lpush: async () => 0,
        rpush: async () => 0,
        lpop: async () => null,
        rpop: async () => null,
        llen: async () => 0,
        lrange: async () => [],
        sadd: async () => false,
        srem: async () => false,
        smembers: async () => [],
        sismember: async () => false,
        xadd: async () => "0-0",
        xread: async () => [],
        xrange: async () => [],
        xlen: async () => 0,
        publish: async () => 0,
        subscribe: async () => {},
        unsubscribe: async () => {},
        pipeline: () => null,
        multi: () => null,
        keys: async () => [],
        flushdb: async () => false,
        info: async () => "",
        healthCheck: async () => false,
        getStats: async () => ({ connected: false, error: "Connection failed" })
      };

      return {
        cache: fallbackService,
        cacheService: fallbackService,
        cacheGet: fallbackService.get,
        cacheSet: fallbackService.set,
        cacheDel: fallbackService.del,
        cacheExists: fallbackService.exists,
        cacheExpire: fallbackService.expire,
        cacheTtl: fallbackService.ttl,
        cacheHget: fallbackService.hget,
        cacheHset: fallbackService.hset,
        cacheHgetall: fallbackService.hgetall,
        cacheKeys: fallbackService.keys,
        cachePublish: fallbackService.publish,
        cacheSubscribe: fallbackService.subscribe,
        cacheXadd: fallbackService.xadd,
        cacheXread: fallbackService.xread,
        cacheXrange: fallbackService.xrange,
        cacheHealthCheck: fallbackService.healthCheck,
        cacheStats: fallbackService.getStats
      };
    }
  })
  .onStop(async ({ cacheService }) => {
    if (cacheService && cacheService.isConnected) {
      await cacheService.close();
      logger.info("🛑 Cache Controller stopped", "CacheController");
    }
  })
  .as('global'); // Global scope for cache access across all routes

// Cache Controller Context Type
export interface CacheControllerContext {
  cache: CacheService;
  cacheService: CacheService;
  cacheGet: CacheService['get'];
  cacheSet: CacheService['set'];
  cacheDel: CacheService['del'];
  cacheExists: CacheService['exists'];
  cacheExpire: CacheService['expire'];
  cacheTtl: CacheService['ttl'];
  cacheHget: CacheService['hget'];
  cacheHset: CacheService['hset'];
  cacheHgetall: CacheService['hgetall'];
  cacheKeys: CacheService['keys'];
  cachePublish: CacheService['publish'];
  cacheSubscribe: CacheService['subscribe'];
  cacheXadd: CacheService['xadd'];
  cacheXread: CacheService['xread'];
  cacheXrange: CacheService['xrange'];
  cacheHealthCheck: CacheService['healthCheck'];
  cacheStats: CacheService['getStats'];
}

export default cacheController;