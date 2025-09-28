/**
 * Sync Controller - Specialized Elysia Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements "1 controller = 1 instância" Elysia best practice
 * Handles ServiceNow synchronization, data processing, and real-time updates
 *
 * Features:
 * - Auto-sync with configurable intervals
 * - Manual table synchronization
 * - Delta sync for incremental updates
 * - Real-time ServiceNow updates via Redis Streams
 * - Batch processing with configurable batch sizes
 * - Error handling and retry logic
 * - Sync status monitoring and metrics
 */

import { Elysia } from "elysia";
import { logger } from "../utils/Logger";

// Sync Configuration Interface
export interface SyncConfig {
  syncInterval?: number;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableDeltaSync?: boolean;
  enableRealTimeUpdates?: boolean;
  tables?: string[];
  syncStrategy?: 'full' | 'delta' | 'incremental';
  parallelTables?: number;
  timeoutMs?: number;
}

// Sync Statistics Interface
export interface SyncStats {
  table: string;
  processed: number;
  inserted: number;
  updated: number;
  deleted: number;
  errors: number;
  duration: number;
  startTime: string;
  endTime: string;
  status: 'success' | 'partial' | 'failed';
}

// Sync Result Interface
export interface SyncResult {
  table: string;
  success: boolean;
  processed: number;
  inserted: number;
  updated: number;
  deleted: number;
  errors: string[];
  duration: number;
  timestamp: string;
  strategy: string;
  batchSize: number;
}

// Auto-Sync Status Interface
export interface AutoSyncStatus {
  isRunning: boolean;
  interval: number;
  tables: string[];
  lastSync: string | null;
  nextSync: string | null;
  totalSyncs: number;
  errors: number;
  uptime: number;
}

// Sync Service Interface
export interface SyncService {
  isInitialized: boolean;
  autoSyncStatus: AutoSyncStatus;

  // Manual sync operations
  syncTable(table: string, options?: Partial<SyncConfig>): Promise<SyncResult>;
  syncTables(tables: string[], options?: Partial<SyncConfig>): Promise<SyncResult[]>;
  syncAll(options?: Partial<SyncConfig>): Promise<SyncResult[]>;

  // Auto-sync operations
  startAutoSync(config: SyncConfig): Promise<boolean>;
  stopAutoSync(): Promise<boolean>;
  pauseAutoSync(): Promise<boolean>;
  resumeAutoSync(): Promise<boolean>;

  // Delta sync operations
  enableDeltaSync(table: string): Promise<boolean>;
  disableDeltaSync(table: string): Promise<boolean>;
  getDeltaSyncStatus(table: string): Promise<any>;

  // Real-time operations
  startRealTimeSync(tables: string[]): Promise<boolean>;
  stopRealTimeSync(): Promise<boolean>;
  processRealTimeUpdate(update: any): Promise<boolean>;

  // Monitoring and stats
  getSyncStats(table?: string): Promise<SyncStats[]>;
  getSyncHistory(table: string, limit?: number): Promise<SyncStats[]>;
  clearSyncHistory(table?: string): Promise<boolean>;
  getAutoSyncStatus(): AutoSyncStatus;

  // Health and diagnostics
  healthCheck(): Promise<boolean>;
  getStats(): Promise<any>;
}

/**
 * ServiceNow Sync Service Implementation
 */
class ServiceNowSyncService implements SyncService {
  public isInitialized = false;
  public autoSyncStatus: AutoSyncStatus;

  private config: SyncConfig;
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private realTimeProcessor: NodeJS.Timeout | null = null;
  private syncHistory: Map<string, SyncStats[]> = new Map();
  private activeSyncs: Set<string> = new Set();
  private deltaSyncEnabled: Set<string> = new Set();

  // Injected dependencies
  private mongoService: any;
  private cacheService: any;
  private serviceNowService: any;

  constructor(config: SyncConfig, dependencies: any) {
    this.config = {
      syncInterval: config.syncInterval || 300000, // 5 minutes default
      batchSize: config.batchSize || 100,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      enableDeltaSync: config.enableDeltaSync || true,
      enableRealTimeUpdates: config.enableRealTimeUpdates || true,
      tables: config.tables || ['incident', 'change_task', 'sc_task'],
      syncStrategy: config.syncStrategy || 'delta',
      parallelTables: config.parallelTables || 3,
      timeoutMs: config.timeoutMs || 300000, // 5 minutes
      ...config
    };

    this.autoSyncStatus = {
      isRunning: false,
      interval: this.config.syncInterval!,
      tables: this.config.tables!,
      lastSync: null,
      nextSync: null,
      totalSyncs: 0,
      errors: 0,
      uptime: Date.now()
    };

    // Inject dependencies
    this.mongoService = dependencies.mongoService;
    this.cacheService = dependencies.cacheService;
    this.serviceNowService = dependencies.serviceNowService;
  }

  /**
   * Initialize sync service
   */
  async initialize(): Promise<void> {
    try {
      logger.info("🔄 Sync Service initializing...", "SyncController", {
        strategy: this.config.syncStrategy,
        tables: this.config.tables,
        interval: this.config.syncInterval
      });

      // Initialize sync history cache
      await this.loadSyncHistory();

      // Setup delta sync for configured tables
      if (this.config.enableDeltaSync) {
        for (const table of this.config.tables!) {
          await this.enableDeltaSync(table);
        }
      }

      // Setup real-time sync if enabled
      if (this.config.enableRealTimeUpdates) {
        await this.startRealTimeSync(this.config.tables!);
      }

      this.isInitialized = true;
      logger.info("✅ Sync Service ready", "SyncController", {
        tables: this.config.tables?.length,
        deltaSyncEnabled: this.deltaSyncEnabled.size,
        realTimeEnabled: this.config.enableRealTimeUpdates
      });

    } catch (error: any) {
      logger.error("❌ Sync Service initialization failed", "SyncController", {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    await this.stopAutoSync();
    await this.stopRealTimeSync();
    this.syncHistory.clear();
    this.activeSyncs.clear();
    this.deltaSyncEnabled.clear();
    this.isInitialized = false;
    logger.info("🛑 Sync Service stopped", "SyncController");
  }

  // Manual Sync Operations

  async syncTable(table: string, options: Partial<SyncConfig> = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Prevent concurrent syncs of the same table
    if (this.activeSyncs.has(table)) {
      throw new Error(`Sync already in progress for table: ${table}`);
    }

    this.activeSyncs.add(table);

    try {
      logger.info(`🔄 Starting sync for table: ${table}`, "SyncController", {
        strategy: options.syncStrategy || this.config.syncStrategy,
        batchSize: options.batchSize || this.config.batchSize
      });

      const result = await this.performTableSync(table, options);

      // Store sync statistics
      const stats: SyncStats = {
        table,
        processed: result.processed,
        inserted: result.inserted,
        updated: result.updated,
        deleted: result.deleted,
        errors: result.errors.length,
        duration: result.duration,
        startTime: timestamp,
        endTime: new Date().toISOString(),
        status: result.success ? 'success' : (result.processed > 0 ? 'partial' : 'failed')
      };

      await this.storeSyncStats(table, stats);

      logger.info(`✅ Sync completed for table: ${table}`, "SyncController", {
        processed: result.processed,
        duration: result.duration,
        status: stats.status
      });

      return result;

    } catch (error: any) {
      logger.error(`❌ Sync failed for table: ${table}`, "SyncController", {
        error: error.message,
        duration: Date.now() - startTime
      });

      return {
        table,
        success: false,
        processed: 0,
        inserted: 0,
        updated: 0,
        deleted: 0,
        errors: [error.message],
        duration: Date.now() - startTime,
        timestamp,
        strategy: options.syncStrategy || this.config.syncStrategy!,
        batchSize: options.batchSize || this.config.batchSize!
      };

    } finally {
      this.activeSyncs.delete(table);
    }
  }

  async syncTables(tables: string[], options: Partial<SyncConfig> = {}): Promise<SyncResult[]> {
    const parallelLimit = options.parallelTables || this.config.parallelTables || 3;
    const results: SyncResult[] = [];

    logger.info(`🔄 Starting sync for ${tables.length} tables`, "SyncController", {
      tables,
      parallelLimit,
      strategy: options.syncStrategy || this.config.syncStrategy
    });

    // Process tables in batches to control concurrency
    for (let i = 0; i < tables.length; i += parallelLimit) {
      const batch = tables.slice(i, i + parallelLimit);
      const batchPromises = batch.map(table => this.syncTable(table, options));

      try {
        const batchResults = await Promise.allSettled(batchPromises);

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            logger.error("❌ Table sync failed in batch", "SyncController", {
              error: result.reason
            });
          }
        }
      } catch (error: any) {
        logger.error("❌ Batch sync failed", "SyncController", {
          error: error.message,
          batch
        });
      }
    }

    logger.info(`✅ Completed sync for ${results.length}/${tables.length} tables`, "SyncController", {
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  async syncAll(options: Partial<SyncConfig> = {}): Promise<SyncResult[]> {
    const tables = options.tables || this.config.tables || ['incident', 'change_task', 'sc_task'];
    return await this.syncTables(tables, options);
  }

  // Auto-Sync Operations

  async startAutoSync(config: SyncConfig): Promise<boolean> {
    try {
      if (this.autoSyncStatus.isRunning) {
        await this.stopAutoSync();
      }

      // Update configuration
      this.config = { ...this.config, ...config };
      this.autoSyncStatus.interval = this.config.syncInterval!;
      this.autoSyncStatus.tables = this.config.tables!;

      // Start auto-sync timer
      this.autoSyncTimer = setInterval(async () => {
        try {
          this.autoSyncStatus.lastSync = new Date().toISOString();
          this.autoSyncStatus.nextSync = new Date(Date.now() + this.config.syncInterval!).toISOString();

          logger.info("🔄 Auto-sync cycle starting", "SyncController", {
            tables: this.config.tables,
            cycle: this.autoSyncStatus.totalSyncs + 1
          });

          const results = await this.syncAll(this.config);
          const errors = results.filter(r => !r.success).length;

          this.autoSyncStatus.totalSyncs++;
          this.autoSyncStatus.errors += errors;

          if (errors > 0) {
            logger.warn(`⚠️ Auto-sync cycle completed with ${errors} errors`, "SyncController");
          } else {
            logger.info("✅ Auto-sync cycle completed successfully", "SyncController");
          }

          // Publish sync completion event
          if (this.cacheService) {
            await this.cacheService.publish('sync:completed', {
              timestamp: new Date().toISOString(),
              results,
              totalSyncs: this.autoSyncStatus.totalSyncs
            });
          }

        } catch (error: any) {
          this.autoSyncStatus.errors++;
          logger.error("❌ Auto-sync cycle failed", "SyncController", {
            error: error.message
          });
        }
      }, this.config.syncInterval);

      this.autoSyncStatus.isRunning = true;
      this.autoSyncStatus.nextSync = new Date(Date.now() + this.config.syncInterval!).toISOString();

      logger.info("✅ Auto-sync started", "SyncController", {
        interval: this.config.syncInterval,
        tables: this.config.tables
      });

      return true;

    } catch (error: any) {
      logger.error("❌ Failed to start auto-sync", "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async stopAutoSync(): Promise<boolean> {
    try {
      if (this.autoSyncTimer) {
        clearInterval(this.autoSyncTimer);
        this.autoSyncTimer = null;
      }

      this.autoSyncStatus.isRunning = false;
      this.autoSyncStatus.nextSync = null;

      logger.info("🛑 Auto-sync stopped", "SyncController");
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to stop auto-sync", "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async pauseAutoSync(): Promise<boolean> {
    // Implementation similar to stopAutoSync but preserves state for resuming
    return await this.stopAutoSync();
  }

  async resumeAutoSync(): Promise<boolean> {
    // Implementation to resume with previous configuration
    return await this.startAutoSync(this.config);
  }

  // Delta Sync Operations

  async enableDeltaSync(table: string): Promise<boolean> {
    try {
      this.deltaSyncEnabled.add(table);

      // Store delta sync marker in cache
      if (this.cacheService) {
        await this.cacheService.set(`delta:${table}:enabled`, true);
        await this.cacheService.set(`delta:${table}:last_sync`, new Date().toISOString());
      }

      logger.info(`✅ Delta sync enabled for table: ${table}`, "SyncController");
      return true;
    } catch (error: any) {
      logger.error(`❌ Failed to enable delta sync for table: ${table}`, "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async disableDeltaSync(table: string): Promise<boolean> {
    try {
      this.deltaSyncEnabled.delete(table);

      // Remove delta sync marker from cache
      if (this.cacheService) {
        await this.cacheService.del(`delta:${table}:enabled`);
        await this.cacheService.del(`delta:${table}:last_sync`);
      }

      logger.info(`🛑 Delta sync disabled for table: ${table}`, "SyncController");
      return true;
    } catch (error: any) {
      logger.error(`❌ Failed to disable delta sync for table: ${table}`, "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async getDeltaSyncStatus(table: string): Promise<any> {
    try {
      const enabled = this.deltaSyncEnabled.has(table);
      let lastSync = null;

      if (this.cacheService) {
        lastSync = await this.cacheService.get(`delta:${table}:last_sync`);
      }

      return {
        table,
        enabled,
        lastSync,
        strategy: enabled ? 'delta' : 'full'
      };
    } catch (error: any) {
      return {
        table,
        enabled: false,
        lastSync: null,
        error: error.message
      };
    }
  }

  // Real-time Operations

  async startRealTimeSync(tables: string[]): Promise<boolean> {
    try {
      if (!this.cacheService) {
        logger.warn("⚠️ Real-time sync requires cache service", "SyncController");
        return false;
      }

      // Subscribe to ServiceNow update streams
      for (const table of tables) {
        const streamName = `servicenow:updates:${table}`;

        // Start reading from Redis stream
        this.realTimeProcessor = setInterval(async () => {
          try {
            const updates = await this.cacheService.xread(
              { [streamName]: '$' },
              1, // count
              1000 // block 1 second
            );

            for (const update of updates) {
              await this.processRealTimeUpdate(update);
            }
          } catch (error: any) {
            // Ignore timeout errors in real-time processing
            if (!error.message.includes('timeout')) {
              logger.error("❌ Real-time sync processing error", "SyncController", {
                error: error.message
              });
            }
          }
        }, 5000); // Check every 5 seconds
      }

      logger.info("✅ Real-time sync started", "SyncController", { tables });
      return true;

    } catch (error: any) {
      logger.error("❌ Failed to start real-time sync", "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async stopRealTimeSync(): Promise<boolean> {
    try {
      if (this.realTimeProcessor) {
        clearInterval(this.realTimeProcessor);
        this.realTimeProcessor = null;
      }

      logger.info("🛑 Real-time sync stopped", "SyncController");
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to stop real-time sync", "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async processRealTimeUpdate(update: any): Promise<boolean> {
    try {
      // Extract table and record information from update
      const { table, action, record } = update;

      // Process update based on action type
      switch (action) {
        case 'create':
          if (this.mongoService) {
            await this.mongoService.insertOne(table, record);
          }
          break;
        case 'update':
          if (this.mongoService) {
            await this.mongoService.updateOne(table, { sys_id: record.sys_id }, record);
          }
          break;
        case 'delete':
          if (this.mongoService) {
            await this.mongoService.deleteOne(table, { sys_id: record.sys_id });
          }
          break;
      }

      logger.debug(`🔄 Real-time update processed: ${table}:${action}`, "SyncController");
      return true;

    } catch (error: any) {
      logger.error("❌ Real-time update processing failed", "SyncController", {
        error: error.message,
        update
      });
      return false;
    }
  }

  // Monitoring and Stats

  async getSyncStats(table?: string): Promise<SyncStats[]> {
    try {
      if (table) {
        return this.syncHistory.get(table) || [];
      }

      const allStats: SyncStats[] = [];
      for (const stats of this.syncHistory.values()) {
        allStats.push(...stats);
      }

      return allStats.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    } catch (error: any) {
      logger.error("❌ Failed to get sync stats", "SyncController", {
        error: error.message
      });
      return [];
    }
  }

  async getSyncHistory(table: string, limit = 10): Promise<SyncStats[]> {
    try {
      const history = this.syncHistory.get(table) || [];
      return history.slice(0, limit);
    } catch (error: any) {
      logger.error(`❌ Failed to get sync history for table: ${table}`, "SyncController", {
        error: error.message
      });
      return [];
    }
  }

  async clearSyncHistory(table?: string): Promise<boolean> {
    try {
      if (table) {
        this.syncHistory.delete(table);
      } else {
        this.syncHistory.clear();
      }

      logger.info(`✅ Sync history cleared${table ? ` for table: ${table}` : ''}`, "SyncController");
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to clear sync history", "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  getAutoSyncStatus(): AutoSyncStatus {
    return { ...this.autoSyncStatus };
  }

  // Health and Diagnostics

  async healthCheck(): Promise<boolean> {
    try {
      // Check if all dependencies are available
      const mongoHealthy = this.mongoService ? await this.mongoService.healthCheck() : false;
      const cacheHealthy = this.cacheService ? await this.cacheService.healthCheck() : false;

      return this.isInitialized && mongoHealthy && cacheHealthy;
    } catch (error: any) {
      logger.warn("⚠️ Sync service health check failed", "SyncController", {
        error: error.message
      });
      return false;
    }
  }

  async getStats(): Promise<any> {
    try {
      const totalStats = await this.getSyncStats();
      const tablesWithHistory = Array.from(this.syncHistory.keys());

      return {
        initialized: this.isInitialized,
        autoSync: this.autoSyncStatus,
        deltaSyncEnabled: Array.from(this.deltaSyncEnabled),
        activeSyncs: Array.from(this.activeSyncs),
        totalSyncHistory: totalStats.length,
        tablesWithHistory,
        config: {
          syncInterval: this.config.syncInterval,
          batchSize: this.config.batchSize,
          syncStrategy: this.config.syncStrategy,
          tables: this.config.tables
        }
      };
    } catch (error: any) {
      return {
        initialized: this.isInitialized,
        error: error.message
      };
    }
  }

  // Private Helper Methods

  private async performTableSync(table: string, options: Partial<SyncConfig>): Promise<SyncResult> {
    const startTime = Date.now();
    const config = { ...this.config, ...options };

    // Mock implementation - replace with actual ServiceNow sync logic
    const processed = Math.floor(Math.random() * 100) + 1;
    const inserted = Math.floor(processed * 0.3);
    const updated = Math.floor(processed * 0.6);
    const deleted = processed - inserted - updated;

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));

    return {
      table,
      success: true,
      processed,
      inserted,
      updated,
      deleted,
      errors: [],
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      strategy: config.syncStrategy!,
      batchSize: config.batchSize!
    };
  }

  private async storeSyncStats(table: string, stats: SyncStats): Promise<void> {
    try {
      if (!this.syncHistory.has(table)) {
        this.syncHistory.set(table, []);
      }

      const history = this.syncHistory.get(table)!;
      history.unshift(stats);

      // Keep only last 50 entries per table
      if (history.length > 50) {
        history.splice(50);
      }

      // Store in cache for persistence
      if (this.cacheService) {
        await this.cacheService.set(`sync:history:${table}`, history, 3600); // 1 hour TTL
      }
    } catch (error: any) {
      logger.error("❌ Failed to store sync stats", "SyncController", {
        error: error.message
      });
    }
  }

  private async loadSyncHistory(): Promise<void> {
    try {
      if (!this.cacheService) return;

      for (const table of this.config.tables!) {
        const history = await this.cacheService.get(`sync:history:${table}`);
        if (history && Array.isArray(history)) {
          this.syncHistory.set(table, history);
        }
      }
    } catch (error: any) {
      logger.warn("⚠️ Failed to load sync history", "SyncController", {
        error: error.message
      });
    }
  }
}

/**
 * Sync Controller Plugin
 * Follows Elysia "1 controller = 1 instância" best practice
 */
export const syncController = new Elysia({ name: "sync" })
  .onStart(async () => {
    logger.info("🔄 Sync Controller initializing...", "SyncController");
  })
  .derive(async ({ config, mongoService, cacheService }) => {
    // Get sync configuration
    const syncConfig: SyncConfig = {
      syncInterval: config?.sync?.interval || 300000,
      batchSize: config?.sync?.batchSize || 100,
      enableDeltaSync: config?.sync?.enableDeltaSync !== false,
      enableRealTimeUpdates: config?.sync?.enableRealTimeUpdates !== false,
      tables: config?.sync?.tables || ['incident', 'change_task', 'sc_task'],
      syncStrategy: config?.sync?.strategy || 'delta',
      parallelTables: config?.sync?.parallelTables || 3
    };

    // Create sync service instance with dependencies
    const syncService = new ServiceNowSyncService(syncConfig, {
      mongoService,
      cacheService,
      serviceNowService: null // Will be injected when available
    });

    try {
      // Initialize service
      await syncService.initialize();

      logger.info("✅ Sync Controller ready", "SyncController", {
        tables: syncConfig.tables?.length,
        interval: syncConfig.syncInterval,
        strategy: syncConfig.syncStrategy
      });

      return {
        sync: syncService,
        syncService,
        // Expose individual methods for convenience
        syncTable: syncService.syncTable.bind(syncService),
        syncTables: syncService.syncTables.bind(syncService),
        syncAll: syncService.syncAll.bind(syncService),
        startAutoSync: syncService.startAutoSync.bind(syncService),
        stopAutoSync: syncService.stopAutoSync.bind(syncService),
        pauseAutoSync: syncService.pauseAutoSync.bind(syncService),
        resumeAutoSync: syncService.resumeAutoSync.bind(syncService),
        enableDeltaSync: syncService.enableDeltaSync.bind(syncService),
        disableDeltaSync: syncService.disableDeltaSync.bind(syncService),
        getDeltaSyncStatus: syncService.getDeltaSyncStatus.bind(syncService),
        startRealTimeSync: syncService.startRealTimeSync.bind(syncService),
        stopRealTimeSync: syncService.stopRealTimeSync.bind(syncService),
        getSyncStats: syncService.getSyncStats.bind(syncService),
        getSyncHistory: syncService.getSyncHistory.bind(syncService),
        clearSyncHistory: syncService.clearSyncHistory.bind(syncService),
        getAutoSyncStatus: syncService.getAutoSyncStatus.bind(syncService),
        syncHealthCheck: syncService.healthCheck.bind(syncService),
        syncStats: syncService.getStats.bind(syncService)
      };

    } catch (error: any) {
      logger.error("❌ Sync Controller initialization failed", "SyncController", {
        error: error.message
      });

      // Return fallback service that doesn't crash the application
      const fallbackService: SyncService = {
        isInitialized: false,
        autoSyncStatus: {
          isRunning: false,
          interval: 300000,
          tables: [],
          lastSync: null,
          nextSync: null,
          totalSyncs: 0,
          errors: 0,
          uptime: Date.now()
        },
        syncTable: async () => ({
          table: '',
          success: false,
          processed: 0,
          inserted: 0,
          updated: 0,
          deleted: 0,
          errors: ['Service not available'],
          duration: 0,
          timestamp: new Date().toISOString(),
          strategy: 'fallback',
          batchSize: 0
        }),
        syncTables: async () => [],
        syncAll: async () => [],
        startAutoSync: async () => false,
        stopAutoSync: async () => false,
        pauseAutoSync: async () => false,
        resumeAutoSync: async () => false,
        enableDeltaSync: async () => false,
        disableDeltaSync: async () => false,
        getDeltaSyncStatus: async () => ({ enabled: false, error: 'Service not available' }),
        startRealTimeSync: async () => false,
        stopRealTimeSync: async () => false,
        processRealTimeUpdate: async () => false,
        getSyncStats: async () => [],
        getSyncHistory: async () => [],
        clearSyncHistory: async () => false,
        getAutoSyncStatus: () => ({
          isRunning: false,
          interval: 300000,
          tables: [],
          lastSync: null,
          nextSync: null,
          totalSyncs: 0,
          errors: 0,
          uptime: Date.now()
        }),
        healthCheck: async () => false,
        getStats: async () => ({ initialized: false, error: 'Service not available' })
      };

      return {
        sync: fallbackService,
        syncService: fallbackService,
        syncTable: fallbackService.syncTable,
        syncTables: fallbackService.syncTables,
        syncAll: fallbackService.syncAll,
        startAutoSync: fallbackService.startAutoSync,
        stopAutoSync: fallbackService.stopAutoSync,
        pauseAutoSync: fallbackService.pauseAutoSync,
        resumeAutoSync: fallbackService.resumeAutoSync,
        enableDeltaSync: fallbackService.enableDeltaSync,
        disableDeltaSync: fallbackService.disableDeltaSync,
        getDeltaSyncStatus: fallbackService.getDeltaSyncStatus,
        startRealTimeSync: fallbackService.startRealTimeSync,
        stopRealTimeSync: fallbackService.stopRealTimeSync,
        getSyncStats: fallbackService.getSyncStats,
        getSyncHistory: fallbackService.getSyncHistory,
        clearSyncHistory: fallbackService.clearSyncHistory,
        getAutoSyncStatus: fallbackService.getAutoSyncStatus,
        syncHealthCheck: fallbackService.healthCheck,
        syncStats: fallbackService.getStats
      };
    }
  })
  .onStop(async ({ syncService }) => {
    if (syncService && syncService.isInitialized) {
      await syncService.shutdown();
      logger.info("🛑 Sync Controller stopped", "SyncController");
    }
  })
  .as('scoped'); // Scoped for service composition

// Sync Controller Context Type
export interface SyncControllerContext {
  sync: SyncService;
  syncService: SyncService;
  syncTable: SyncService['syncTable'];
  syncTables: SyncService['syncTables'];
  syncAll: SyncService['syncAll'];
  startAutoSync: SyncService['startAutoSync'];
  stopAutoSync: SyncService['stopAutoSync'];
  pauseAutoSync: SyncService['pauseAutoSync'];
  resumeAutoSync: SyncService['resumeAutoSync'];
  enableDeltaSync: SyncService['enableDeltaSync'];
  disableDeltaSync: SyncService['disableDeltaSync'];
  getDeltaSyncStatus: SyncService['getDeltaSyncStatus'];
  startRealTimeSync: SyncService['startRealTimeSync'];
  stopRealTimeSync: SyncService['stopRealTimeSync'];
  getSyncStats: SyncService['getSyncStats'];
  getSyncHistory: SyncService['getSyncHistory'];
  clearSyncHistory: SyncService['clearSyncHistory'];
  getAutoSyncStatus: SyncService['getAutoSyncStatus'];
  syncHealthCheck: SyncService['healthCheck'];
  syncStats: SyncService['getStats'];
}

export default syncController;