/**
 * Redis Connection Singleton - Centralized Redis Connection Management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import Redis, { Redis as RedisClient, Cluster as RedisCluster } from "ioredis";
import { EventEmitter } from "events";
import { logger } from "./Logger";

export interface RedisConnectionConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  enableOfflineQueue?: boolean;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
  cluster?: {
    nodes: Array<{ host: string; port: number }>;
    options?: any;
  };
}

export interface RedisConnectionStats {
  isConnected: boolean;
  connectionCount: number;
  totalConnections: number;
  uptime: number;
  memoryUsage: {
    used: number;
    peak: number;
  };
  commandsProcessed: number;
  lastConnectedAt: Date | null;
}

class RedisConnectionManager extends EventEmitter {
  private static instance: RedisConnectionManager;
  private redis: RedisClient | RedisCluster | null = null;
  private isConnected: boolean = false;
  private connectionCount: number = 0;
  private totalConnections: number = 0;
  private connectedAt: Date | null = null;
  private config: RedisConnectionConfig;
  private reconnectTimer?: NodeJS.Timeout;
  private connectionPromise: Promise<RedisClient | RedisCluster> | null = null;

  private constructor() {
    super();
    this.config = this.getDefaultConfig();
  }

  public static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  private getDefaultConfig(): RedisConnectionConfig {
    return {
      host: process.env.REDIS_HOST || "10.219.8.210",
      port: parseInt(process.env.REDIS_PORT || "6380"),
      password: process.env.REDIS_PASSWORD || "nexcdc2025",
      db: parseInt(process.env.REDIS_DB || "1"),
      keyPrefix: process.env.REDIS_KEY_PREFIX || "bunsnc:",
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      connectTimeout: 10000,
      commandTimeout: 5000,
      enableOfflineQueue: true,
      enableReadyCheck: true,
      lazyConnect: false,
    };
  }

  public async connect(
    customConfig?: Partial<RedisConnectionConfig>,
  ): Promise<RedisClient | RedisCluster> {
    // Return existing connection if already connected
    if (this.redis && this.isConnected) {
      this.connectionCount++;
      return this.redis;
    }

    // If already connecting, wait for the existing connection promise
    if (this.connectionPromise) {
      logger.info(
        "Redis connection already in progress, waiting...",
        "RedisConnection",
      );
      const connection = await this.connectionPromise;
      this.connectionCount++;
      return connection;
    }

    // Merge custom config with defaults
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // Create connection promise to prevent concurrent connections
    this.connectionPromise = this.createConnection();

    try {
      const connection = await this.connectionPromise;
      this.connectionCount++;
      this.totalConnections++;
      this.connectionPromise = null; // Clear promise after successful connection
      return connection;
    } catch (error) {
      this.connectionPromise = null; // Clear promise on error
      logger.error("Failed to create Redis connection", "RedisConnection", {
        error,
      });
      throw error;
    }
  }

  private async createConnection(): Promise<RedisClient | RedisCluster> {
    try {
      if (this.config.cluster) {
        this.redis = new Redis.Cluster(this.config.cluster.nodes, {
          ...this.config.cluster.options,
          enableReadyCheck: this.config.enableReadyCheck,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          retryDelayOnFailover: this.config.retryDelayOnFailover,
        });
        logger.info("Creating Redis Cluster connection", "RedisConnection");
      } else {
        this.redis = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          retryDelayOnFailover: this.config.retryDelayOnFailover,
          connectTimeout: this.config.connectTimeout,
          commandTimeout: this.config.commandTimeout,
          enableOfflineQueue: this.config.enableOfflineQueue,
          lazyConnect: this.config.lazyConnect || true, // Always use lazy connect to avoid race conditions
        });
        logger.info(
          `Creating Redis connection to ${this.config.host}:${this.config.port}`,
          "RedisConnection",
        );
      }

      this.setupEventHandlers();

      // Always connect explicitly after setup
      await this.redis.connect();

      return this.redis;
    } catch (error) {
      logger.error("Failed to initialize Redis connection", "RedisConnection", {
        error,
      });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.redis) return;

    // Single ready event for the entire application
    this.redis.once("ready", () => {
      this.isConnected = true;
      this.connectedAt = new Date();
      logger.info(
        "Redis connection ready - Centralized connection manager active",
        "RedisConnection",
        {
          host: this.config.host,
          port: this.config.port,
          db: this.config.db,
          connectionCount: this.connectionCount,
        },
      );
      this.emit("ready");
    });

    this.redis.on("connect", () => {
      logger.debug("Redis connecting...", "RedisConnection");
      this.emit("connect");
    });

    this.redis.on("reconnecting", (delay: number) => {
      logger.warn(`Redis reconnecting in ${delay}ms`, "RedisConnection");
      this.emit("reconnecting", delay);
    });

    this.redis.on("error", (error: Error) => {
      logger.error("Redis connection error", "RedisConnection", {
        error: error.message,
        connectionCount: this.connectionCount,
      });
      this.emit("error", error);
    });

    this.redis.on("close", () => {
      this.isConnected = false;
      logger.warn("Redis connection closed", "RedisConnection");
      this.emit("close");

      // Attempt to reconnect after a delay
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.reconnect();
        }, this.config.retryDelayOnFailover || 100);
      }
    });

    this.redis.on("end", () => {
      this.isConnected = false;
      logger.info("Redis connection ended", "RedisConnection");
      this.emit("end");
    });
  }

  private async reconnect(): Promise<void> {
    try {
      logger.info("Attempting Redis reconnection...", "RedisConnection");
      if (this.redis) {
        await this.redis.connect();
      }
    } catch (error) {
      logger.error("Failed to reconnect to Redis", "RedisConnection", {
        error,
      });
      // Schedule another reconnection attempt
      this.reconnectTimer = setTimeout(
        () => {
          this.reconnectTimer = undefined;
          this.reconnect();
        },
        (this.config.retryDelayOnFailover || 100) * 2,
      );
    }
  }

  public getConnection(): RedisClient | RedisCluster | null {
    return this.redis;
  }

  public isReady(): boolean {
    return this.isConnected && this.redis !== null;
  }

  public async disconnect(): Promise<void> {
    this.connectionCount = Math.max(0, this.connectionCount - 1);

    // Only disconnect when no more references exist
    if (this.connectionCount === 0 && this.redis) {
      logger.info(
        "Disconnecting Redis - no more active connections",
        "RedisConnection",
      );

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }

      if (this.connectionPromise) {
        this.connectionPromise = null;
      }

      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
      this.connectedAt = null;
    }
  }

  public async getStats(): Promise<RedisConnectionStats> {
    let memoryUsage = { used: 0, peak: 0 };
    let commandsProcessed = 0;

    if (this.redis && this.isConnected) {
      try {
        // Get Redis info
        const info = await this.redis.info("memory");
        const stats = await this.redis.info("stats");

        // Parse memory info
        const memoryUsedMatch = info.match(/used_memory:(\d+)/);
        const memoryPeakMatch = info.match(/used_memory_peak:(\d+)/);

        if (memoryUsedMatch) memoryUsage.used = parseInt(memoryUsedMatch[1]);
        if (memoryPeakMatch) memoryUsage.peak = parseInt(memoryPeakMatch[1]);

        // Parse stats info
        const commandsMatch = stats.match(/total_commands_processed:(\d+)/);
        if (commandsMatch) commandsProcessed = parseInt(commandsMatch[1]);
      } catch (error) {
        logger.debug("Failed to get Redis stats", "RedisConnection", { error });
      }
    }

    return {
      isConnected: this.isConnected,
      connectionCount: this.connectionCount,
      totalConnections: this.totalConnections,
      uptime: this.connectedAt ? Date.now() - this.connectedAt.getTime() : 0,
      memoryUsage,
      commandsProcessed,
      lastConnectedAt: this.connectedAt,
    };
  }

  public async healthCheck(): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch (error) {
      logger.error("Redis health check failed", "RedisConnection", { error });
      return false;
    }
  }

  public getConfig(): RedisConnectionConfig {
    return { ...this.config };
  }
}

// Export singleton instance and convenience functions
export const redisConnectionManager = RedisConnectionManager.getInstance();

// Convenience functions for common operations
export async function getRedisConnection(
  config?: Partial<RedisConnectionConfig>,
): Promise<RedisClient | RedisCluster> {
  return redisConnectionManager.connect(config);
}

export function getExistingRedisConnection():
  | RedisClient
  | RedisCluster
  | null {
  return redisConnectionManager.getConnection();
}

export async function disconnectRedis(): Promise<void> {
  return redisConnectionManager.disconnect();
}

export async function isRedisReady(): Promise<boolean> {
  return redisConnectionManager.isReady();
}

export async function getRedisStats(): Promise<RedisConnectionStats> {
  return redisConnectionManager.getStats();
}

export async function checkRedisHealth(): Promise<boolean> {
  return redisConnectionManager.healthCheck();
}

// Export the manager for advanced usage
export { RedisConnectionManager };

// Default export for easy importing
export default redisConnectionManager;
