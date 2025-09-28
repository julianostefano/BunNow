/**
 * Redis Plugin - Elysia Dependency Injection Pattern
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements Redis connection management via Elysia DI instead of singleton pattern
 * Following Elysia best practices for resource management
 */

import { Elysia } from "elysia";
import Redis, { Redis as RedisClient } from "ioredis";
import { logger } from "../utils/Logger";

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  connectTimeout?: number;
  commandTimeout?: number;
}

export interface RedisPluginContext {
  redis: RedisClient;
  redisCache: RedisClient;
  redisStreams: RedisClient;
  getRedisStats: () => Promise<any>;
  healthCheckRedis: () => Promise<boolean>;
}

const getDefaultRedisConfig = (): RedisConfig => ({
  host: process.env.REDIS_HOST || "10.219.8.210",
  port: parseInt(process.env.REDIS_PORT || "6380"),
  password: process.env.REDIS_PASSWORD || "nexcdc2025",
  db: parseInt(process.env.REDIS_DB || "1"),
  keyPrefix: process.env.REDIS_KEY_PREFIX || "bunsnc:",
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  connectTimeout: 10000,
  commandTimeout: 5000,
});

const createRedisConnection = async (
  config: RedisConfig,
  name: string,
): Promise<RedisClient> => {
  const redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    keyPrefix: config.keyPrefix,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryDelayOnFailover: config.retryDelayOnFailover,
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    enableOfflineQueue: true,
    lazyConnect: false,
  });

  // Set up event handlers
  redis.on("ready", () => {
    logger.info(
      `Redis ${name} connection ready via Elysia plugin`,
      "RedisPlugin",
      {
        host: config.host,
        port: config.port,
        db: config.db,
      },
    );
  });

  redis.on("error", (error: Error) => {
    logger.error(`Redis ${name} connection error`, "RedisPlugin", {
      error: error.message,
    });
  });

  return redis;
};

/**
 * Redis Plugin - Single instance pattern with proper Elysia DI
 */
export const redisPlugin = new Elysia({
  name: "redis-plugin",
})
  .onStart(async () => {
    console.log("🔌 Redis Plugin initializing with Elysia DI pattern...");
  })

  // Derive Redis connections using Elysia pattern
  .derive(async () => {
    const config = getDefaultRedisConfig();

    console.log(
      "📦 Creating Redis connections via Elysia derive() - single initialization",
    );

    // Create specialized Redis connections for different purposes
    const [redis, redisCache, redisStreams] = await Promise.all([
      createRedisConnection({ ...config, db: 1 }, "primary"),
      createRedisConnection({ ...config, db: 2 }, "cache"),
      createRedisConnection({ ...config, db: 3 }, "streams"),
    ]);

    console.log("✅ Redis connections established via Elysia plugin context");

    return {
      redis,
      redisCache,
      redisStreams,
    };
  })

  // Decorate utility methods
  .decorate("getRedisStats", async function () {
    try {
      const info = await this.redis.info("memory");
      const stats = await this.redis.info("stats");

      return {
        memory: info,
        stats: stats,
        isConnected: this.redis.status === "ready",
      };
    } catch (error) {
      logger.error("Failed to get Redis stats", "RedisPlugin", { error });
      return null;
    }
  })

  .decorate("healthCheckRedis", async function () {
    try {
      const results = await Promise.all([
        this.redis.ping(),
        this.redisCache.ping(),
        this.redisStreams.ping(),
      ]);

      return results.every((result) => result === "PONG");
    } catch (error) {
      logger.error("Redis health check failed", "RedisPlugin", { error });
      return false;
    }
  })

  // Health check endpoint
  .get("/redis/health", async ({ healthCheckRedis }) => {
    const isHealthy = await healthCheckRedis();
    return {
      redis: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
    };
  })

  .get("/redis/stats", async ({ getRedisStats }) => {
    const stats = await getRedisStats();
    return {
      stats,
      timestamp: new Date().toISOString(),
    };
  })

  // Cleanup on server stop
  .onStop(async ({ redis, redisCache, redisStreams }) => {
    console.log("🛑 Redis Plugin shutting down connections...");

    try {
      await Promise.all([redis.quit(), redisCache.quit(), redisStreams.quit()]);
      console.log("✅ Redis connections closed successfully");
    } catch (error) {
      logger.error("Error closing Redis connections", "RedisPlugin", { error });
    }
  })

  .as("global");

// Export for type inference
export type RedisPluginApp = typeof redisPlugin;

// Functional callback method
export const createRedisPlugin = (config?: Partial<RedisConfig>) => {
  return (app: Elysia) => app.use(redisPlugin);
};
