/**
 * Data Synchronization Service - Background MongoDB-ServiceNow Sync
 * Orchestrates synchronization with modular components
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './EnhancedTicketStorageService';
import { ServiceNowStreams, ServiceNowChange } from '../config/redis-streams';
import { SyncManager, SyncResult } from './sync/SyncManager';
import { ConflictResolver, ConflictData, ConflictResolutionStrategy } from './sync/ConflictResolver';
import { StreamHandler } from './sync/StreamHandler';
import cron from 'node-cron';

export interface SyncOptions {
  batchSize: number;
  maxRetries: number;
  syncIntervalMinutes: number;
  enableDeltaSync: boolean;
  conflictResolutionStrategy: ConflictResolutionStrategy;
}

export { SyncResult, ConflictData };

export class DataSynchronizationService {
  private syncManager: SyncManager;
  private conflictResolver: ConflictResolver;
  private streamHandler: StreamHandler;
  private redisStreams: ServiceNowStreams;
  private syncOptions: SyncOptions;
  private syncStats: Map<string, SyncResult> = new Map();
  private isRunning = false;
  private cronJob: any = null;

  constructor(
    mongoService: EnhancedTicketStorageService,
    serviceNowService: ServiceNowAuthClient,
    redisStreams: ServiceNowStreams,
    options?: Partial<SyncOptions>
  ) {
    this.redisStreams = redisStreams;

    this.syncOptions = {
      batchSize: 50,
      maxRetries: 3,
      syncIntervalMinutes: 15,
      enableDeltaSync: true,
      conflictResolutionStrategy: 'newest_wins',
      ...options
    };

    // Initialize modular components
    this.conflictResolver = new ConflictResolver(this.syncOptions.conflictResolutionStrategy);
    this.syncManager = new SyncManager(mongoService, serviceNowService, this.conflictResolver);
    this.streamHandler = new StreamHandler(serviceNowService, this.syncManager);

    console.log('🔄 DataSynchronizationService initialized');
    console.log(`📋 Sync interval: ${this.syncOptions.syncIntervalMinutes} minutes`);
    console.log(`📊 Batch size: ${this.syncOptions.batchSize}`);
    console.log(`⚔️ Conflict resolution: ${this.syncOptions.conflictResolutionStrategy}`);
  }

  /**
   * Start background synchronization
   */
  async startBackgroundSync(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Background sync is already running');
      return;
    }

    console.log('🚀 Starting background synchronization service...');
    
    // Schedule periodic sync using cron
    const cronExpression = `*/${this.syncOptions.syncIntervalMinutes} * * * *`;
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      if (!this.isRunning) {
        await this.performFullSync();
      }
    }, {
      scheduled: false
    });

    this.cronJob.start();
    console.log(`⏰ Background sync scheduled: every ${this.syncOptions.syncIntervalMinutes} minutes`);

    // Register Redis Streams consumer for real-time updates
    this.redisStreams.registerConsumer(
      ['incident:updated', 'change_task:updated', 'sc_task:updated'],
      this.streamHandler.getStreamChangeHandler()
    );

    // Perform initial sync
    await this.performFullSync();
  }

  /**
   * Stop background synchronization
   */
  stopBackgroundSync(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('🛑 Background synchronization stopped');
  }

  /**
   * Perform full synchronization for all tables
   */
  async performFullSync(): Promise<Map<string, SyncResult>> {
    if (this.isRunning) {
      console.log('⚠️ Sync already in progress, skipping');
      return this.syncStats;
    }

    this.isRunning = true;
    console.log('🔄 Starting full synchronization...');

    const tables = ['incident', 'change_task', 'sc_task'];
    const results = new Map<string, SyncResult>();

    try {
      const syncOptions = {
        batchSize: this.syncOptions.batchSize,
        enableDeltaSync: this.syncOptions.enableDeltaSync,
        deltaHours: 24
      };

      // Process tables sequentially to avoid overwhelming the API
      for (const table of tables) {
        const result = await this.syncManager.syncTable(table, syncOptions);
        results.set(table, result);
        this.syncStats.set(table, result);

        // Small delay between table syncs
        await this.delay(1000);
      }

      // Clean up resolved conflicts
      this.conflictResolver.clearResolvedConflicts();

      const totalProcessed = Array.from(results.values()).reduce((sum, r) => sum + r.processed, 0);
      const totalErrors = Array.from(results.values()).reduce((sum, r) => sum + r.errors, 0);
      
      console.log(`✅ Full synchronization completed: ${totalProcessed} processed, ${totalErrors} errors`);
      
    } catch (error) {
      console.error('❌ Full synchronization failed:', error);
    } finally {
      this.isRunning = false;
    }

    return results;
  }













  /**
   * Get synchronization statistics
   */
  getSyncStats(): Map<string, SyncResult> {
    return new Map(this.syncStats);
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts(): ConflictData[] {
    return this.conflictResolver.getPendingConflicts();
  }

  /**
   * Force sync for specific ticket
   */
  async forceSyncTicket(sysId: string, table: string): Promise<boolean> {
    return this.syncManager.forceSyncTicket(sysId, table);
  }

  /**
   * Health check for synchronization service
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    isRunning: boolean;
    lastSyncTimes: Record<string, string>;
    pendingConflicts: number;
    errorRate: number;
  }> {
    const lastSyncTimes: Record<string, string> = {};
    let totalErrors = 0;
    let totalProcessed = 0;

    for (const [table, stats] of this.syncStats) {
      lastSyncTimes[table] = stats.lastSyncTime;
      totalErrors += stats.errors;
      totalProcessed += stats.processed;
    }

    const errorRate = totalProcessed > 0 ? totalErrors / totalProcessed : 0;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (errorRate < 0.1) {
      status = 'healthy';
    } else if (errorRate < 0.3) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      isRunning: this.isRunning,
      lastSyncTimes,
      pendingConflicts: this.conflictResolver.getPendingConflicts().length,
      errorRate
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}