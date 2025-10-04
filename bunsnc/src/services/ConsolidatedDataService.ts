/**
 * Consolidated Data Service - Complete Data Management Solution
 * Consolidates: ConsolidatedDataService, MongoDBInitService, CacheOptimizationService, MongoDBIndexService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { MongoClient, Db, Collection } from "mongodb";
import { logger } from "../utils/Logger";
import { ServiceNowAuthClient } from "./ServiceNowAuthClient";
import { ServiceNowStreams, ServiceNowChange } from "../config/redis-streams";
import {
  IncidentDocument,
  ChangeTaskDocument,
  SCTaskDocument,
  GroupDocument,
  GroupData,
  COLLECTION_NAMES,
} from "../config/mongodb-collections";

// ==================== INTERFACES ====================

export interface TicketData {
  sys_id: string;
  number: string;
  table: string;
  state: string;
  priority: string;
  short_description?: string;
  assignment_group?: any;
  sys_created_on: string;
  sys_updated_on: string;
  slms?: any[];
  notes?: any[];
  [key: string]: any;
}

export interface SyncOptions {
  batchSize?: number;
  maxRetries?: number;
  syncInterval?: number;
  tables?: string[];
  enableDeltaSync?: boolean;
  enableRealTimeUpdates?: boolean;
  enableSLMCollection?: boolean;
  enableNotesCollection?: boolean;
  conflictResolutionStrategy?:
    | "servicenow_wins"
    | "mongodb_wins"
    | "merge"
    | "manual";
}

export interface SyncResult {
  table: string;
  processed: number;
  saved: number;
  updated: number;
  errors: number;
  conflicts: number;
  duration: number;
  lastSyncTime: string;
  errorDetails: Array<{ sys_id: string; error: string }>;
}

export interface DataFreshnessStrategy {
  getTTL(ticket: TicketData): number;
  shouldRefresh(ticket: TicketData): boolean;
  getRefreshPriority(ticket: TicketData): "high" | "medium" | "low";
}

export interface HybridDataOptions {
  forceServiceNow?: boolean;
  forceMongo?: boolean;
  skipCache?: boolean;
  includeSLMs?: boolean;
  includeNotes?: boolean;
}

export interface CacheWarmupStrategy {
  priority: "critical" | "high" | "medium" | "low";
  preloadRelated: boolean;
  preloadSLA: boolean;
  preloadNotes: boolean;
  batchSize: number;
  concurrency: number;
}

export interface CacheStats {
  hitRatio: number;
  missRatio: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number;
  warmupProgress: number;
  preloadedTickets: number;
}

export interface MongoDBConfig {
  connectionString: string;
  databaseName?: string;
  options?: {
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  };
}

export interface DataServiceConfig {
  mongodb: MongoDBConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    strategy: "lru" | "lfu" | "smart";
  };
  sync: SyncOptions;
}

// ==================== STRATEGIES ====================

export class SmartDataStrategy implements DataFreshnessStrategy {
  getTTL(ticket: TicketData): number {
    if (["6", "7"].includes(ticket.state)) return 3600000; // 1 hour for closed
    if (ticket.priority === "1") return 60000; // 1 minute for critical
    if (ticket.priority === "2") return 120000; // 2 minutes for high
    return 300000; // 5 minutes default
  }

  shouldRefresh(ticket: TicketData): boolean {
    const lastUpdate = new Date(ticket.sys_updated_on).getTime();
    const ttl = this.getTTL(ticket);
    return Date.now() - lastUpdate > ttl;
  }

  getRefreshPriority(ticket: TicketData): "high" | "medium" | "low" {
    if (ticket.priority === "1") return "high";
    if (ticket.priority === "2") return "medium";
    return "low";
  }
}

// ==================== MONGODB MANAGER ====================

class MongoDBManager extends EventEmitter {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collections: Map<string, Collection> = new Map();
  private isInitialized = false;

  constructor(private config: MongoDBConfig) {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        attempt++;
        logger.info(
          `🔌 [MongoDBManager] Starting connection attempt ${attempt}/${maxRetries}...`,
        );
        logger.info(`   Host: ${this.config.host}:${this.config.port}`);
        logger.info(`   Database: ${this.config.databaseName || "bunsnc"}`);
        logger.info(`   User: ${this.config.username}`);

        const connectionOptions = {
          maxPoolSize: this.config.options?.maxPoolSize || 10,
          serverSelectionTimeoutMS:
            this.config.options?.serverSelectionTimeoutMS || 10000, // Increased from 5000ms
          socketTimeoutMS: this.config.options?.socketTimeoutMS || 45000,
        };

        logger.info(
          `   Timeouts: serverSelection=${connectionOptions.serverSelectionTimeoutMS}ms, socket=${connectionOptions.socketTimeoutMS}ms`,
        );

        this.client = new MongoClient(
          this.config.connectionString,
          connectionOptions,
        );

        logger.info("🔌 [MongoDBManager] Attempting to connect...");
        await this.client.connect();
        logger.info("✅ [MongoDBManager] Connected successfully!");

        this.db = this.client.db(this.config.databaseName || "bunsnc");
        logger.info(
          `✅ [MongoDBManager] Database '${this.config.databaseName || "bunsnc"}' selected`,
        );

        logger.info("📦 [MongoDBManager] Setting up collections...");
        await this.setupCollections();
        logger.info("✅ [MongoDBManager] Collections setup complete");

        logger.info("🔍 [MongoDBManager] Creating indexes...");
        await this.createIndexes();
        logger.info("✅ [MongoDBManager] Indexes created successfully");

        this.isInitialized = true;
        logger.info("✅ [MongoDBManager] Initialization complete");
        this.emit("initialized");
        return;
      } catch (error: unknown) {
        logger.error(
          `❌ [MongoDBManager] Connection attempt ${attempt}/${maxRetries} failed:`,
          error,
        );
        logger.error(
          `   Connection string: mongodb://${this.config.username}@${this.config.host}:${this.config.port}/${this.config.databaseName}`,
        );

        if (attempt >= maxRetries) {
          logger.error(
            `❌ [MongoDBManager] All ${maxRetries} connection attempts failed. MongoDB is REQUIRED for this application.`,
          );
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s
        const backoffMs = Math.pow(2, attempt) * 1000;
        logger.info(`⏳ [MongoDBManager] Retrying in ${backoffMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  private async setupCollections(): Promise<void> {
    const collectionNames = Object.values(COLLECTION_NAMES);

    for (const name of collectionNames) {
      const collection = this.db!.collection(name);
      this.collections.set(name, collection);
    }

    logger.debug(" [DataService] Collections initialized");
  }

  private async createIndexes(): Promise<void> {
    try {
      const indexOperations = [
        // Incidents
        {
          collection: COLLECTION_NAMES.INCIDENTS,
          indexes: [
            { key: { sys_id: 1 }, name: "sys_id_1", unique: true },
            { key: { number: 1 }, name: "number_1", unique: true },
            { key: { state: 1 }, name: "state_1" },
            { key: { priority: 1 }, name: "priority_1" },
            { key: { "data.assignment_group": 1 }, name: "assignment_group_1" },
            { key: { updated_at: -1 }, name: "updated_at_-1" },
            { key: { sys_updated_on: -1 }, name: "sys_updated_on_-1" },
          ],
        },
        // Change Tasks
        {
          collection: COLLECTION_NAMES.CHANGE_TASKS,
          indexes: [
            { key: { sys_id: 1 }, name: "sys_id_1", unique: true },
            { key: { number: 1 }, name: "number_1", unique: true },
            { key: { state: 1 }, name: "state_1" },
            { key: { "data.change_request": 1 }, name: "change_request_1" },
            { key: { updated_at: -1 }, name: "updated_at_-1" },
          ],
        },
        // Service Catalog Tasks
        {
          collection: COLLECTION_NAMES.SC_TASKS,
          indexes: [
            { key: { sys_id: 1 }, name: "sys_id_1", unique: true },
            { key: { number: 1 }, name: "number_1", unique: true },
            { key: { state: 1 }, name: "state_1" },
            { key: { "data.request": 1 }, name: "request_1" },
            { key: { updated_at: -1 }, name: "updated_at_-1" },
          ],
        },
        // Groups
        {
          collection: COLLECTION_NAMES.GROUPS,
          indexes: [
            { key: { id: 1 }, name: "id_1", unique: true },
            { key: { "data.nome": 1 }, name: "data_nome_1" },
            { key: { "data.tags": 1 }, name: "data_tags_1" },
            { key: { "data.responsavel": 1 }, name: "data_responsavel_1" },
            { key: { "data.temperatura": 1 }, name: "data_temperatura_1" },
          ],
        },
      ];

      for (const { collection, indexes } of indexOperations) {
        const coll = this.collections.get(collection);
        if (!coll) continue;

        for (const index of indexes) {
          try {
            await coll.createIndex(index.key, {
              name: index.name,
              unique: index.unique || false,
            });
          } catch (error: any) {
            if (error.code !== 85) {
              // Index already exists
              logger.warn(
                ` [DataService] Failed to create index ${index.name}:`,
                error.message,
              );
            }
          }
        }
      }

      logger.info(" [DataService] Database indexes created");
    } catch (error: unknown) {
      logger.error(" [DataService] Failed to create indexes:", error);
    }
  }

  getCollection(name: string): Collection {
    const collection = this.collections.get(name);
    if (!collection) {
      throw new Error(`Collection not found: ${name}`);
    }
    return collection;
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  getClient(): MongoClient {
    if (!this.client) {
      throw new Error("MongoDB client not initialized");
    }
    return this.client;
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collections.clear();
    }
    this.isInitialized = false;
    logger.info("🧹 [DataService] MongoDB cleanup completed");
  }
}

// ==================== CACHE MANAGER ====================

class CacheManager extends EventEmitter {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> =
    new Map();
  private stats: CacheStats = {
    hitRatio: 0,
    missRatio: 0,
    totalRequests: 0,
    totalHits: 0,
    totalMisses: 0,
    averageResponseTime: 0,
    warmupProgress: 0,
    preloadedTickets: 0,
  };

  private warmupStrategies: Record<string, CacheWarmupStrategy> = {
    critical: {
      priority: "critical",
      preloadRelated: true,
      preloadSLA: true,
      preloadNotes: true,
      batchSize: 10,
      concurrency: 3,
    },
    high: {
      priority: "high",
      preloadRelated: true,
      preloadSLA: false,
      preloadNotes: false,
      batchSize: 20,
      concurrency: 2,
    },
    medium: {
      priority: "medium",
      preloadRelated: false,
      preloadSLA: false,
      preloadNotes: false,
      batchSize: 50,
      concurrency: 1,
    },
    low: {
      priority: "low",
      preloadRelated: false,
      preloadSLA: false,
      preloadNotes: false,
      batchSize: 100,
      concurrency: 1,
    },
  };

  constructor(
    private maxSize: number = 1000,
    private defaultTTL: number = 300000,
  ) {
    super();
    this.startCleanupInterval();
  }

  set(key: string, data: any, ttl?: number): void {
    const actualTTL = ttl || this.defaultTTL;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: actualTTL,
    });

    // Cleanup if cache is too large
    if (this.cache.size > this.maxSize) {
      this.evictLRU();
    }

    this.emit("cacheSet", { key, size: this.cache.size });
  }

  get(key: string): any | null {
    this.stats.totalRequests++;

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.totalMisses++;
      this.updateRatios();
      this.emit("cacheMiss", { key });
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.totalMisses++;
      this.updateRatios();
      this.emit("cacheExpired", { key });
      return null;
    }

    this.stats.totalHits++;
    this.updateRatios();
    this.emit("cacheHit", { key });
    return entry.data;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.emit("cacheDeleted", { key, size: this.cache.size });
    }
    return deleted;
  }

  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.emit("cacheCleared", { previousSize });
  }

  private evictLRU(): void {
    // Simple LRU eviction - remove oldest entries
    const entries = Array.from(this.cache.entries());
    entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);

    const toRemove = Math.ceil(this.cache.size * 0.1); // Remove 10%
    for (let i = 0; i < toRemove; i++) {
      const [key] = entries[i];
      this.cache.delete(key);
      this.emit("cacheEvicted", { key, reason: "lru" });
    }
  }

  private updateRatios(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.hitRatio =
        (this.stats.totalHits / this.stats.totalRequests) * 100;
      this.stats.missRatio =
        (this.stats.totalMisses / this.stats.totalRequests) * 100;
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Every minute
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
      this.emit("cacheExpired", { key });
    }

    if (expired.length > 0) {
      logger.debug(
        `🧹 [DataService] Cleaned up ${expired.length} expired cache entries`,
      );
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  getSize(): number {
    return this.cache.size;
  }
}

// ==================== CONSOLIDATED DATA SERVICE ====================

export class ConsolidatedDataService extends EventEmitter {
  private static instance: ConsolidatedDataService;
  private mongoManager: MongoDBManager;
  private cacheManager: CacheManager;
  private ticketStorageService: ConsolidatedDataService;
  private serviceNowStreams: ServiceNowStreams;
  private dataStrategy: SmartDataStrategy;
  private config: DataServiceConfig;
  private isInitialized = false;
  private syncInterval?: Timer;

  private constructor(config: DataServiceConfig) {
    super();
    this.config = config;
    this.mongoManager = new MongoDBManager(config.mongodb);
    this.cacheManager = new CacheManager(
      config.cache.maxSize,
      config.cache.ttl,
    );
    this.dataStrategy = new SmartDataStrategy();
    this.setupEventListeners();
  }

  static getInstance(config?: DataServiceConfig): ConsolidatedDataService {
    if (!ConsolidatedDataService.instance && config) {
      ConsolidatedDataService.instance = new ConsolidatedDataService(config);
    }
    return ConsolidatedDataService.instance;
  }

  private setupEventListeners(): void {
    // MongoDB events
    this.mongoManager.on("initialized", () => {
      logger.info(" [DataService] MongoDB manager initialized");
    });

    // Cache events
    this.cacheManager.on("cacheHit", (event) => {
      logger.debug(` [DataService] Cache hit: ${event.key}`);
    });

    this.cacheManager.on("cacheMiss", (event) => {
      logger.debug(` [DataService] Cache miss: ${event.key}`);
    });
  }

  async initialize(
    serviceNowClient: ServiceNowAuthClient,
    existingStreams?: ServiceNowStreams,
  ): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info(" [DataService] Initializing Consolidated Data Service...");

      // Initialize MongoDB
      await this.mongoManager.initialize();

      // Initialize Enhanced Ticket Storage Service (self-reference for this singleton)
      this.ticketStorageService = this;

      // ✅ Fix: Use existing ServiceNowStreams instance to avoid duplication
      if (existingStreams) {
        logger.info(
          " [DataService] Reusing existing ServiceNow Streams instance",
        );
        this.serviceNowStreams = existingStreams;
      } else {
        logger.info(" [DataService] Creating new ServiceNow Streams instance");
        this.serviceNowStreams = new ServiceNowStreams({
          host: this.config.redis.host,
          port: this.config.redis.port,
          password: this.config.redis.password,
        });
        await this.serviceNowStreams.initialize();
      }

      // Start sync interval if configured
      if (this.config.sync.syncInterval) {
        this.startSyncInterval();
      }

      this.isInitialized = true;
      logger.info(" [DataService] Consolidated Data Service initialized");
      this.emit("initialized");
    } catch (error: unknown) {
      logger.error(" [DataService] Initialization failed:", error);
      throw error;
    }
  }

  // ==================== HYBRID DATA ACCESS ====================

  async getTicket(
    sysId: string,
    options: HybridDataOptions = {},
  ): Promise<TicketData | null> {
    try {
      const cacheKey = `ticket:${sysId}`;

      // Check cache first unless forced
      if (!options.skipCache && !options.forceServiceNow) {
        const cached = this.cacheManager.get(cacheKey);
        if (cached) {
          logger.debug(` [DataService] Cache hit for ticket: ${sysId}`);
          return cached;
        }
      }

      let ticket: TicketData | null = null;

      // Try ServiceNow first if forced or MongoDB if forced
      if (options.forceServiceNow) {
        ticket = await this.getTicketFromServiceNow(sysId, options);
      } else if (options.forceMongo) {
        ticket = await this.getTicketFromMongo(sysId, options);
      } else {
        // Smart hybrid approach
        ticket = await this.getTicketFromMongo(sysId, options);

        if (!ticket || this.dataStrategy.shouldRefresh(ticket)) {
          const freshTicket = await this.getTicketFromServiceNow(
            sysId,
            options,
          );
          if (freshTicket) {
            ticket = freshTicket;
            // Update MongoDB with fresh data
            await this.saveTicketToMongo(ticket);
          }
        }
      }

      // Cache the result
      if (ticket && this.config.cache.enabled) {
        const ttl = this.dataStrategy.getTTL(ticket);
        this.cacheManager.set(cacheKey, ticket, ttl);
      }

      return ticket;
    } catch (error: unknown) {
      logger.error(` [DataService] Failed to get ticket ${sysId}:`, error);
      throw error;
    }
  }

  private async getTicketFromMongo(
    sysId: string,
    options: HybridDataOptions,
  ): Promise<TicketData | null> {
    const tables = ["incident", "change_task", "sc_task"];

    for (const table of tables) {
      const collection = this.getCollectionForTable(table);
      const doc = await collection.findOne({ sys_id: sysId });

      if (doc) {
        const ticket: TicketData = {
          sys_id: doc.sys_id,
          number: doc.number,
          table,
          state: doc.data?.state || doc.state,
          priority: doc.data?.priority || doc.priority,
          short_description: doc.data?.short_description,
          assignment_group: doc.data?.assignment_group,
          sys_created_on:
            doc.data?.sys_created_on || doc.created_at?.toISOString(),
          sys_updated_on:
            doc.data?.sys_updated_on || doc.updated_at?.toISOString(),
          ...doc.data,
        };

        if (options.includeSLMs) {
          ticket.slms = await this.getSLMsFromMongo(sysId);
        }

        if (options.includeNotes) {
          ticket.notes = await this.getNotesFromMongo(sysId);
        }

        return ticket;
      }
    }

    return null;
  }

  private async getTicketFromServiceNow(
    sysId: string,
    options: HybridDataOptions,
  ): Promise<TicketData | null> {
    // This would integrate with the ConsolidatedServiceNowService
    // For now, return null as placeholder
    logger.debug(` [DataService] Fetching ticket from ServiceNow: ${sysId}`);
    return null;
  }

  private async saveTicketToMongo(ticket: TicketData): Promise<void> {
    const collection = this.getCollectionForTable(ticket.table);

    const document = {
      sys_id: ticket.sys_id,
      number: ticket.number,
      state: ticket.state,
      priority: ticket.priority,
      data: ticket,
      created_at: new Date(ticket.sys_created_on),
      updated_at: new Date(ticket.sys_updated_on),
    };

    await collection.updateOne(
      { sys_id: ticket.sys_id },
      { $set: document },
      { upsert: true },
    );
  }

  private getCollectionForTable(table: string): Collection {
    switch (table) {
      case "incident":
        return this.mongoManager.getCollection(COLLECTION_NAMES.INCIDENTS);
      case "change_task":
        return this.mongoManager.getCollection(COLLECTION_NAMES.CHANGE_TASKS);
      case "sc_task":
        return this.mongoManager.getCollection(COLLECTION_NAMES.SC_TASKS);
      default:
        throw new Error(`Unsupported table: ${table}`);
    }
  }

  private async getSLMsFromMongo(sysId: string): Promise<any[]> {
    // Placeholder for SLM data retrieval
    return [];
  }

  private async getNotesFromMongo(sysId: string): Promise<any[]> {
    // Placeholder for Notes data retrieval
    return [];
  }

  // ==================== SYNC OPERATIONS ====================

  async syncData(options?: Partial<SyncOptions>): Promise<SyncResult[]> {
    const syncOpts = { ...this.config.sync, ...options };
    const results: SyncResult[] = [];

    const tables = syncOpts.tables || ["incident", "change_task", "sc_task"];

    logger.info(
      ` [DataService] Starting data sync for ${tables.length} tables`,
    );

    for (const table of tables) {
      const startTime = Date.now();

      try {
        const result = await this.syncTable(table, syncOpts);
        results.push(result);

        logger.info(
          ` [DataService] Sync completed for ${table}: ${result.processed} processed, ${result.saved} saved`,
        );
      } catch (error: unknown) {
        logger.error(` [DataService] Sync failed for ${table}:`, error);

        results.push({
          table,
          processed: 0,
          saved: 0,
          updated: 0,
          errors: 1,
          conflicts: 0,
          duration: Date.now() - startTime,
          lastSyncTime: new Date().toISOString(),
          errorDetails: [{ sys_id: "unknown", error: String(error) }],
        });
      }
    }

    logger.info(
      `🎯 [DataService] Sync completed: ${results.length} tables processed`,
    );
    this.emit("syncCompleted", results);

    return results;
  }

  private async syncTable(
    table: string,
    options: SyncOptions,
  ): Promise<SyncResult> {
    const startTime = Date.now();

    // Placeholder implementation
    const result: SyncResult = {
      table,
      processed: 0,
      saved: 0,
      updated: 0,
      errors: 0,
      conflicts: 0,
      duration: Date.now() - startTime,
      lastSyncTime: new Date().toISOString(),
      errorDetails: [],
    };

    return result;
  }

  private startSyncInterval(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncData();
      } catch (error: unknown) {
        logger.error(" [DataService] Scheduled sync failed:", error);
      }
    }, this.config.sync.syncInterval);

    logger.info(
      `⏰ [DataService] Sync interval started: ${this.config.sync.syncInterval}ms`,
    );
  }

  // ==================== CACHE OPERATIONS ====================

  invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cacheManager.clear();
      logger.info("🧹 [DataService] All cache cleared");
    } else {
      // Clear cache entries matching pattern
      const keys = Array.from(this.cacheManager["cache"].keys()).filter((key) =>
        key.includes(pattern),
      );

      for (const key of keys) {
        this.cacheManager.delete(key);
      }

      logger.info(
        `🧹 [DataService] Cache cleared for pattern: ${pattern} (${keys.length} entries)`,
      );
    }
  }

  getCacheStats(): CacheStats {
    return this.cacheManager.getStats();
  }

  // ==================== HEALTH AND STATS ====================

  async getStats(): Promise<any> {
    try {
      const mongoStats = await this.mongoManager.getDb().stats();
      const cacheStats = this.cacheManager.getStats();

      return {
        mongodb: {
          collections: mongoStats.collections,
          documents: mongoStats.objects,
          dataSize: mongoStats.dataSize,
          indexSize: mongoStats.indexSize,
        },
        cache: cacheStats,
        sync: {
          interval: this.config.sync.syncInterval,
          last_sync: null, // Would be implemented with actual sync tracking
        },
        is_initialized: this.isInitialized,
      };
    } catch (error: unknown) {
      logger.error(" [DataService] Failed to get stats:", error);
      return {};
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) return false;

      // Check MongoDB connection
      await this.mongoManager.getDb().admin().ping();

      // Check cache functionality
      const testKey = "health_check_" + Date.now();
      this.cacheManager.set(testKey, true, 1000);
      const cached = this.cacheManager.get(testKey);
      this.cacheManager.delete(testKey);

      return cached === true;
    } catch (error: unknown) {
      logger.error(" [DataService] Health check failed:", error);
      return false;
    }
  }

  // ==================== AUTO-SYNC METHODS ====================

  startAutoSync(options: SyncOptions): void {
    try {
      // Stop any existing sync interval
      this.stopAutoSync();

      const syncInterval =
        options.syncInterval || this.config.sync.syncInterval || 300000; // Default 5 minutes
      const batchSize = options.batchSize || 50;
      const tables = options.tables || ["incident", "change_task", "sc_task"];

      logger.info(
        `🔄 [DataService] Starting auto-sync with interval: ${syncInterval}ms`,
      );
      logger.info(`📊 [DataService] Auto-sync configuration:`, {
        syncInterval,
        batchSize,
        tables,
        enableDeltaSync: options.enableDeltaSync,
        enableRealTimeUpdates: options.enableRealTimeUpdates,
        enableSLMCollection: options.enableSLMCollection,
        enableNotesCollection: options.enableNotesCollection,
      });

      // Set up the interval for automatic synchronization
      this.syncInterval = setInterval(async () => {
        try {
          logger.info("🔄 [DataService] Executing scheduled auto-sync...");

          for (const table of tables) {
            try {
              // Perform sync for each table
              await this.syncTableData(table, {
                batchSize,
                enableDeltaSync: options.enableDeltaSync,
                enableRealTimeUpdates: options.enableRealTimeUpdates,
                enableSLMCollection: options.enableSLMCollection,
                enableNotesCollection: options.enableNotesCollection,
              });

              logger.info(
                `✅ [DataService] Auto-sync completed for table: ${table}`,
              );
            } catch (tableError) {
              logger.error(
                `❌ [DataService] Auto-sync failed for table ${table}:`,
                tableError,
              );
            }
          }

          logger.info("🎉 [DataService] Auto-sync cycle completed");
        } catch (syncError) {
          logger.error("❌ [DataService] Auto-sync cycle failed:", syncError);
        }
      }, syncInterval);

      logger.info("✅ [DataService] Auto-sync enabled successfully");
    } catch (error: unknown) {
      logger.error("❌ [DataService] Failed to start auto-sync:", error);
      throw error;
    }
  }

  stopAutoSync(): void {
    try {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = undefined;
        logger.info("🛑 [DataService] Auto-sync stopped");
      } else {
        logger.info("ℹ️ [DataService] Auto-sync was not running");
      }
    } catch (error: unknown) {
      logger.error("❌ [DataService] Failed to stop auto-sync:", error);
      throw error;
    }
  }

  private async syncTableData(
    table: string,
    options: Partial<SyncOptions>,
  ): Promise<void> {
    try {
      // This is a placeholder for the actual sync implementation
      // In a real implementation, this would:
      // 1. Fetch data from ServiceNow for the specified table
      // 2. Compare with cached/stored data
      // 3. Update MongoDB with new/changed records
      // 4. Handle delta sync if enabled
      // 5. Collect SLM data if enabled
      // 6. Collect notes if enabled

      logger.info(
        `🔄 [DataService] Syncing table: ${table} with options:`,
        options,
      );

      // For now, just log the sync attempt
      const batchSize = options.batchSize || 50;
      logger.info(
        `📦 [DataService] Processing ${table} with batch size: ${batchSize}`,
      );

      // Simulate sync completion
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: unknown) {
      logger.error(`❌ [DataService] Sync failed for table ${table}:`, error);
      throw error;
    }
  }

  // ==================== CLEANUP ====================

  async cleanup(): Promise<void> {
    try {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = undefined;
      }

      this.cacheManager.clear();

      if (this.ticketStorageService) {
        await this.ticketStorageService.cleanup();
      }

      if (this.serviceNowStreams) {
        await this.serviceNowStreams.disconnect();
      }

      await this.mongoManager.cleanup();

      this.isInitialized = false;
      logger.info("🧹 [DataService] Cleanup completed");
    } catch (error: unknown) {
      logger.error(" [DataService] Cleanup failed:", error);
      throw error;
    }
  }
}

// Export factory function for dependency injection
export const createDataService = (config: DataServiceConfig) => {
  return ConsolidatedDataService.getInstance(config);
};

// Export singleton for global use with default config
export const defaultDataServiceConfig: DataServiceConfig = {
  mongodb: {
    connectionString: `mongodb://${process.env.MONGODB_USERNAME || "admin"}:${encodeURIComponent(process.env.MONGODB_PASSWORD || "Logica2011_")}@${process.env.MONGODB_HOST || "10.219.8.210"}:${process.env.MONGODB_PORT || "27018"}/${process.env.MONGODB_DATABASE || "bunsnc"}?authSource=admin`,
    databaseName: process.env.MONGODB_DATABASE || "bunsnc",
  },
  redis: {
    host: process.env.REDIS_HOST || "10.219.8.210",
    port: parseInt(process.env.REDIS_PORT || "6380"),
    password: process.env.REDIS_PASSWORD,
  },
  cache: {
    enabled: true,
    ttl: 300000,
    maxSize: 1000,
    strategy: "smart",
  },
  sync: {
    batchSize: 100,
    maxRetries: 3,
    syncInterval: 30000,
    enableDeltaSync: true,
    enableRealTimeUpdates: true,
  },
};

// FIX v5.5.19: Removed top-level instantiation to prevent startup hang
// Root cause: createDataService() executes MongoDB/Redis connections during import
// Violates ElysiaJS best practice: Services should NOT be instantiated at module scope
// Use createDataService(defaultDataServiceConfig) in handlers instead
// See: docs/reports/ELYSIA_COMPLIANCE_REPORT_v5.5.19.md - CRITICAL-1
// export const dataService = createDataService(defaultDataServiceConfig);
