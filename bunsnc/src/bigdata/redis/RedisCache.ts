/**
 * Advanced Redis Cache with Multiple Strategies and Analytics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import Redis, { Redis as RedisClient, Cluster as RedisCluster } from "ioredis";
import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";
import { performanceMonitor } from "../../utils/PerformanceMonitor";

export interface RedisCacheOptions {
  redis?: RedisClient | RedisCluster;
  defaultTtl?: number; // Default TTL in seconds (default: 3600)
  keyPrefix?: string; // Key prefix for namespacing
  serialization?: "json" | "msgpack" | "binary";
  compression?: "none" | "gzip" | "lz4";
  enableMetrics?: boolean; // Default: true
  maxMemoryPolicy?: "lru" | "lfu" | "ttl" | "random";
  enableWarmup?: boolean; // Default: false
  batchSize?: number; // Default: 100
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number;
  size: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  totalKeys: number;
  totalSize: number;
  hitRate: number;
  avgAccessTime: number;
  keysByType: Record<string, number>;
}

export interface CachePattern {
  pattern: string;
  ttl?: number;
  refreshInterval?: number;
  refreshCallback?: () => Promise<any>;
}

export class RedisCache extends EventEmitter {
  private redis: RedisClient | RedisCluster;
  private options: Required<RedisCacheOptions>;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    totalKeys: 0,
    totalSize: 0,
    hitRate: 0,
    avgAccessTime: 0,
    keysByType: {},
  };
  private warmupPatterns: Map<string, CachePattern> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private metricsTimer?: NodeJS.Timeout;

  constructor(
    redis: RedisClient | RedisCluster,
    options: RedisCacheOptions = {},
  ) {
    super();

    this.redis = redis;
    this.options = {
      redis: options.redis,
      defaultTtl: options.defaultTtl || 3600,
      keyPrefix: options.keyPrefix || "bunsnc:cache:",
      serialization: options.serialization || "json",
      compression: options.compression || "none",
      enableMetrics: options.enableMetrics ?? true,
      maxMemoryPolicy: options.maxMemoryPolicy || "lru",
      enableWarmup: options.enableWarmup ?? false,
      batchSize: options.batchSize || 100,
    };

    if (this.options.enableMetrics) {
      this.startMetricsCollection();
    }

    logger.info("RedisCache initialized with options:", "RedisCache", {
      defaultTtl: this.options.defaultTtl,
      keyPrefix: this.options.keyPrefix,
      serialization: this.options.serialization,
      compression: this.options.compression,
    });
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    const timerName = `redis_cache_get_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);
    const fullKey = this.buildKey(key);

    try {
      const result = await this.redis.get(fullKey);

      if (result === null) {
        this.metrics.misses++;
        this.emit("cache:miss", { key });
        return null;
      }

      // Update access metrics
      this.metrics.hits++;
      await this.updateAccessMetrics(fullKey);

      // Deserialize value
      const value = await this.deserialize<T>(result);

      this.emit("cache:hit", { key, value });
      return value;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      this.metrics.misses++;
      return null;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<boolean> {
    const timerName = `redis_cache_set_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);
    const fullKey = this.buildKey(key);
    const expiry = ttl || this.options.defaultTtl;

    try {
      // Serialize value
      const serialized = await this.serialize(value);

      // Set with expiration
      let result: string;
      if (expiry > 0) {
        result = (await this.redis.setex(
          fullKey,
          expiry,
          serialized,
        )) as string;
      } else {
        result = (await this.redis.set(fullKey, serialized)) as string;
      }

      if (result === "OK") {
        this.metrics.sets++;
        this.updateSizeMetrics(key, serialized);

        this.emit("cache:set", { key, value, ttl: expiry });
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    const timerName = `redis_cache_mget_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);
    const fullKeys = keys.map((key) => this.buildKey(key));

    try {
      const results = await this.redis.mget(...fullKeys);
      const values: (T | null)[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];

        if (result === null) {
          this.metrics.misses++;
          values.push(null);
        } else {
          this.metrics.hits++;
          const value = await this.deserialize<T>(result);
          values.push(value);

          // Update access metrics for hit
          await this.updateAccessMetrics(fullKeys[i]);
        }
      }

      this.emit("cache:mget", {
        keys,
        hitCount: values.filter((v) => v !== null).length,
      });
      return values;
    } catch (error) {
      logger.error(`Cache mget error for keys ${keys.join(", ")}:`, error);
      return keys.map(() => null);
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Set multiple values at once
   */
  async mset<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<boolean> {
    const timerName = `redis_cache_mset_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);

    try {
      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const fullKey = this.buildKey(entry.key);
        const serialized = await this.serialize(entry.value);
        const ttl = entry.ttl || this.options.defaultTtl;

        if (ttl > 0) {
          pipeline.setex(fullKey, ttl, serialized);
        } else {
          pipeline.set(fullKey, serialized);
        }
      }

      const results = await pipeline.exec();
      const success =
        results?.every(([error, result]) => !error && result === "OK") ?? false;

      if (success) {
        this.metrics.sets += entries.length;

        entries.forEach((entry) => {
          this.updateSizeMetrics(entry.key, "estimated");
        });

        this.emit("cache:mset", { count: entries.length });
      }

      return success;
    } catch (error) {
      logger.error("Cache mset error:", error);
      return false;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    const timerName = `redis_cache_del_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);
    const fullKey = this.buildKey(key);

    try {
      const result = await this.redis.del(fullKey);

      if (result > 0) {
        this.metrics.deletes++;
        this.metrics.totalKeys = Math.max(0, this.metrics.totalKeys - 1);

        this.emit("cache:delete", { key });
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Delete multiple keys at once
   */
  async mdel(keys: string[]): Promise<number> {
    const timerName = `redis_cache_mdel_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);
    const fullKeys = keys.map((key) => this.buildKey(key));

    try {
      const result = await this.redis.del(...fullKeys);

      this.metrics.deletes += result;
      this.metrics.totalKeys = Math.max(0, this.metrics.totalKeys - result);

      this.emit("cache:mdelete", { keys, deletedCount: result });
      return result;
    } catch (error) {
      logger.error(`Cache mdelete error for keys ${keys.join(", ")}:`, error);
      return 0;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);

    try {
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    const fullKey = this.buildKey(key);

    try {
      return await this.redis.ttl(fullKey);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    const fullKey = this.buildKey(key);

    try {
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment numeric value
   */
  async incr(key: string, by: number = 1): Promise<number> {
    const fullKey = this.buildKey(key);

    try {
      const result =
        by === 1
          ? await this.redis.incr(fullKey)
          : await this.redis.incrby(fullKey, by);

      this.emit("cache:increment", { key, by, newValue: result });
      return result;
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get or set pattern - if key doesn't exist, call factory function
   */
  async getOrSet<T = any>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const timerName = `redis_cache_get_or_set_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);

    try {
      // Try to get existing value
      const existing = await this.get<T>(key);
      if (existing !== null) {
        return existing;
      }

      // Generate new value
      const newValue = await factory();

      // Set in cache
      await this.set(key, newValue, ttl);

      return newValue;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Invalidate cache keys matching pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const timerName = `redis_cache_invalidate_pattern_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);
    const searchPattern = this.buildKey(pattern);

    try {
      const keys = await this.redis.keys(searchPattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);

      this.metrics.deletes += deleted;
      this.metrics.totalKeys = Math.max(0, this.metrics.totalKeys - deleted);

      this.emit("cache:pattern_invalidated", {
        pattern,
        deletedCount: deleted,
      });

      logger.info(`Invalidated ${deleted} keys matching pattern: ${pattern}`);
      return deleted;
    } catch (error) {
      logger.error(
        `Cache pattern invalidation error for pattern ${pattern}:`,
        error,
      );
      return 0;
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    const searchPattern = this.buildKey(pattern);

    try {
      const keys = await this.redis.keys(searchPattern);

      // Remove prefix from returned keys
      return keys.map((key) => key.replace(this.options.keyPrefix, ""));
    } catch (error) {
      logger.error(`Cache keys error for pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Add pattern for automatic warmup
   */
  addWarmupPattern(pattern: CachePattern): void {
    this.warmupPatterns.set(pattern.pattern, pattern);

    if (pattern.refreshInterval && pattern.refreshCallback) {
      const timer = setInterval(async () => {
        try {
          const value = await pattern.refreshCallback!();
          await this.set(pattern.pattern, value, pattern.ttl);

          this.emit("cache:pattern_refreshed", { pattern: pattern.pattern });
        } catch (error) {
          logger.error(`Pattern refresh error for ${pattern.pattern}:`, error);
        }
      }, pattern.refreshInterval);

      this.refreshTimers.set(pattern.pattern, timer);
    }

    logger.info(`Added warmup pattern: ${pattern.pattern}`);
  }

  /**
   * Remove warmup pattern
   */
  removeWarmupPattern(pattern: string): boolean {
    const removed = this.warmupPatterns.delete(pattern);

    const timer = this.refreshTimers.get(pattern);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(pattern);
    }

    if (removed) {
      logger.info(`Removed warmup pattern: ${pattern}`);
    }

    return removed;
  }

  /**
   * Execute cache warmup for all patterns
   */
  async warmup(): Promise<void> {
    const timerName = `redis_cache_warmup_${Date.now()}_${Math.random()}`;
    performanceMonitor.startTimer(timerName);

    try {
      logger.info(
        `Starting cache warmup for ${this.warmupPatterns.size} patterns`,
      );

      const promises = Array.from(this.warmupPatterns.values()).map(
        async (pattern) => {
          if (pattern.refreshCallback) {
            try {
              const value = await pattern.refreshCallback();
              await this.set(pattern.pattern, value, pattern.ttl);

              logger.debug(`Warmed up pattern: ${pattern.pattern}`);
            } catch (error) {
              logger.error(
                `Warmup error for pattern ${pattern.pattern}:`,
                error,
              );
            }
          }
        },
      );

      await Promise.all(promises);

      logger.info("Cache warmup completed");
      this.emit("cache:warmup_completed");
    } finally {
      performanceMonitor.endTimer(timerName);
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  getMetrics(): CacheMetrics {
    // Calculate hit rate
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;

    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      totalKeys: 0,
      totalSize: 0,
      hitRate: 0,
      avgAccessTime: 0,
      keysByType: {},
    };

    this.emit("cache:metrics_reset");
  }

  /**
   * Get cache health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    totalKeys: number;
    usedMemory: number;
    hitRate: number;
    avgResponseTime: number;
  }> {
    try {
      const info = await this.redis.info("memory");
      const keyspaceInfo = await this.redis.info("keyspace");

      const memoryUsed = this.parseMemoryInfo(info);
      const keyCount = this.parseKeyspaceInfo(keyspaceInfo);

      return {
        connected: true,
        totalKeys: keyCount,
        usedMemory: memoryUsed,
        hitRate: this.metrics.hitRate,
        avgResponseTime: this.metrics.avgAccessTime,
      };
    } catch (error) {
      return {
        connected: false,
        totalKeys: 0,
        usedMemory: 0,
        hitRate: 0,
        avgResponseTime: 0,
      };
    }
  }

  /**
   * Cleanup and close connections
   */
  async destroy(): Promise<void> {
    // Stop metrics collection
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Stop refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearInterval(timer);
    }
    this.refreshTimers.clear();

    this.removeAllListeners();

    logger.info("RedisCache destroyed");
  }

  private buildKey(key: string): string {
    return `${this.options.keyPrefix}${key}`;
  }

  private async serialize<T>(value: T): Promise<string> {
    try {
      switch (this.options.serialization) {
        case "json":
          return JSON.stringify(value);
        case "msgpack":
          // Would need msgpack library
          return JSON.stringify(value);
        case "binary":
          return Buffer.from(JSON.stringify(value)).toString("base64");
        default:
          return JSON.stringify(value);
      }
    } catch (error) {
      logger.error("Serialization error:", error);
      throw error;
    }
  }

  private async deserialize<T>(data: string): Promise<T> {
    try {
      switch (this.options.serialization) {
        case "json":
          return JSON.parse(data);
        case "msgpack":
          // Would need msgpack library
          return JSON.parse(data);
        case "binary":
          const buffer = Buffer.from(data, "base64");
          return JSON.parse(buffer.toString());
        default:
          return JSON.parse(data);
      }
    } catch (error) {
      logger.error("Deserialization error:", error);
      throw error;
    }
  }

  private async updateAccessMetrics(key: string): Promise<void> {
    try {
      // Update access time and count in separate hash
      const metricsKey = `${key}:metrics`;
      const now = Date.now();

      await this.redis.hmset(metricsKey, {
        last_accessed: now.toString(),
        access_count: await this.redis.hincrby(metricsKey, "access_count", 1),
      });

      // Set TTL for metrics key (longer than data TTL)
      await this.redis.expire(metricsKey, this.options.defaultTtl * 2);
    } catch (error) {
      // Don't fail main operation for metrics errors
      logger.debug("Access metrics update error:", error);
    }
  }

  private updateSizeMetrics(key: string, data: string | "estimated"): void {
    const size = data === "estimated" ? 100 : Buffer.byteLength(data, "utf8");

    this.metrics.totalSize += size;
    this.metrics.totalKeys++;

    // Track by key type/prefix
    const keyType = key.split(":")[0] || "unknown";
    this.metrics.keysByType[keyType] =
      (this.metrics.keysByType[keyType] || 0) + 1;
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.emit("cache:metrics", this.getMetrics());
    }, 60000); // Emit metrics every minute
  }

  private parseMemoryInfo(info: string): number {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private parseKeyspaceInfo(info: string): number {
    const match = info.match(/keys=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
}
