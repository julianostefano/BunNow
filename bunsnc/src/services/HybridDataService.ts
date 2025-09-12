/**
 * Enhanced Hybrid Data Service - Transparent Data Access + Comprehensive Sync
 * Consolidates all sync services into unified data management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './EnhancedTicketStorageService';
import { ServiceNowStreams, ServiceNowChange } from '../config/redis-streams';
import { IncidentDocument, ChangeTaskDocument, SCTaskDocument, GroupDocument, GroupData, COLLECTION_NAMES } from '../config/mongodb-collections';
import { ServiceNowNotesService, ServiceNowNote } from './ServiceNowNotesService';
import { TicketSchema } from '../schemas/TicketSchemas';
import { Collection } from 'mongodb';

// === INTERFACES CONSOLIDADAS ===

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
  notes?: ServiceNowNote[];
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
  conflictResolutionStrategy?: 'servicenow_wins' | 'mongodb_wins' | 'merge' | 'manual';
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

export interface SyncStatistics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  ticketsProcessed: number;
  slmsCollected: number;
  notesCollected: number;
  lastSyncTime: string;
  averageDuration: number;
  errors: string[];
}

export interface DataFreshnessStrategy {
  getTTL(ticket: TicketData): number;
  shouldRefresh(ticket: TicketData): boolean;
  getRefreshPriority(ticket: TicketData): 'high' | 'medium' | 'low';
}

export interface HybridDataOptions {
  forceServiceNow?: boolean;
  forceMongo?: boolean;
  skipCache?: boolean;
  includeSLMs?: boolean;
  includeNotes?: boolean;
}

// === ESTRATÉGIAS ===

export class SmartDataStrategy implements DataFreshnessStrategy {
  getTTL(ticket: TicketData): number {
    if (['6', '7'].includes(ticket.state)) return 3600000; // 1 hour for closed
    if (ticket.priority === '1') return 60000; // 1 minute for critical
    if (ticket.priority === '2') return 120000; // 2 minutes for high
    return 300000; // 5 minutes default
  }

  shouldRefresh(ticket: TicketData): boolean {
    const lastUpdate = new Date(ticket.sys_updated_on).getTime();
    const ttl = this.getTTL(ticket);
    return (Date.now() - lastUpdate) > ttl;
  }

  getRefreshPriority(ticket: TicketData): 'high' | 'medium' | 'low' {
    if (ticket.priority === '1') return 'high';
    if (ticket.priority === '2') return 'medium';
    if (['6', '7'].includes(ticket.state)) return 'low';
    return 'medium';
  }
}

// === SERVIÇO PRINCIPAL ===

export class HybridDataService {
  private mongoService: EnhancedTicketStorageService;
  private serviceNowService: ServiceNowAuthClient;
  private redisStreams: ServiceNowStreams;
  private dataStrategy: DataFreshnessStrategy;
  private notesService: ServiceNowNotesService;
  private groupsCollection: Collection<GroupDocument> | null = null;
  
  // Sync management properties
  private isRunning: boolean = false;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private syncStatistics: SyncStatistics;
  private syncOptions: SyncOptions;

  constructor(
    mongoService: EnhancedTicketStorageService,
    serviceNowService: ServiceNowAuthClient,
    redisStreams: ServiceNowStreams,
    dataStrategy?: DataFreshnessStrategy,
    syncOptions?: Partial<SyncOptions>
  ) {
    this.mongoService = mongoService;
    this.serviceNowService = serviceNowService;
    this.redisStreams = redisStreams;
    this.dataStrategy = dataStrategy || new SmartDataStrategy();
    this.notesService = new ServiceNowNotesService(serviceNowService);

    // Initialize sync configuration
    this.syncOptions = {
      batchSize: 50,
      maxRetries: 3,
      syncInterval: 300000, // 5 minutes
      tables: ['incident', 'change_task', 'sc_task'],
      enableDeltaSync: true,
      enableRealTimeUpdates: true,
      enableSLMCollection: true,
      enableNotesCollection: true,
      conflictResolutionStrategy: 'servicenow_wins',
      ...syncOptions
    };

    // Initialize statistics
    this.syncStatistics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      ticketsProcessed: 0,
      slmsCollected: 0,
      notesCollected: 0,
      lastSyncTime: '',
      averageDuration: 0,
      errors: []
    };

    console.log('🎯 Enhanced Hybrid Data Service initialized with comprehensive sync capabilities');
  }

  // === CORE DATA ACCESS METHODS ===

  async getTicketDetails(
    sysId: string, 
    table: string,
    options: HybridDataOptions = {}
  ): Promise<TicketData | null> {
    try {
      console.log(`🔍 Getting ticket details: ${table}/${sysId}`);

      if (options.forceServiceNow) {
        return this.fetchFromServiceNowAndSync(sysId, table, options);
      }

      if (options.forceMongo) {
        return this.fetchFromMongo(sysId, table);
      }

      const cached = await this.fetchFromMongo(sysId, table);
      
      if (cached && !this.dataStrategy.shouldRefresh(this.formatTicketData(cached, table))) {
        console.log(`⚡ Fresh data from MongoDB: ${table}/${sysId}`);
        return this.formatTicketData(cached, table);
      }

      console.log(`🔄 Refreshing data from ServiceNow: ${table}/${sysId}`);
      
      try {
        return await this.fetchFromServiceNowAndSync(sysId, table, options);
      } catch (serviceNowError) {
        console.error(`❌ ServiceNow fetch failed for ${table}/${sysId}:`, serviceNowError);
        
        if (cached) {
          console.log(`🆘 Using stale MongoDB data as fallback: ${table}/${sysId}`);
          return this.formatTicketData(cached, table);
        }
        
        return null;
      }

    } catch (error) {
      console.error(`❌ Error getting ticket details ${table}/${sysId}:`, error);
      return null;
    }
  }

  // === SYNC MANAGEMENT METHODS ===

  public startAutoSync(customOptions?: Partial<SyncOptions>): void {
    if (this.isRunning) {
      console.warn('⚠️ Auto sync already running');
      return;
    }

    this.syncOptions = { ...this.syncOptions, ...customOptions };
    this.isRunning = true;

    console.log(`🔄 Starting auto sync with interval: ${this.syncOptions.syncInterval}ms`);
    console.log(`📋 Tables to sync: ${this.syncOptions.tables?.join(', ')}`);
    console.log(`⚙️ Options: Delta=${this.syncOptions.enableDeltaSync}, SLMs=${this.syncOptions.enableSLMCollection}, Notes=${this.syncOptions.enableNotesCollection}`);

    // Initial sync
    this.performFullSync();

    // Schedule periodic syncs
    this.syncIntervalId = setInterval(() => {
      this.performIncrementalSync();
    }, this.syncOptions.syncInterval);
  }

  public stopAutoSync(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    console.log('⏹️ Auto sync stopped');
  }

  public async performFullSync(): Promise<SyncResult[]> {
    console.log('🚀 Starting full synchronization...');
    const startTime = Date.now();
    const results: SyncResult[] = [];

    for (const table of this.syncOptions.tables || []) {
      try {
        const result = await this.syncTable(table, { enableDelta: false });
        results.push(result);
        this.updateStatistics(result, true);
      } catch (error) {
        console.error(`❌ Full sync failed for table ${table}:`, error);
        const errorResult: SyncResult = {
          table,
          processed: 0,
          saved: 0,
          updated: 0,
          errors: 1,
          conflicts: 0,
          duration: 0,
          lastSyncTime: new Date().toISOString(),
          errorDetails: [{ sys_id: 'N/A', error: error.message }]
        };
        results.push(errorResult);
        this.updateStatistics(errorResult, false);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`✅ Full sync completed in ${totalDuration}ms`);
    
    return results;
  }

  public async performIncrementalSync(): Promise<SyncResult[]> {
    if (!this.syncOptions.enableDeltaSync) {
      return this.performFullSync();
    }

    console.log('⚡ Starting incremental synchronization...');
    const startTime = Date.now();
    const results: SyncResult[] = [];

    for (const table of this.syncOptions.tables || []) {
      try {
        const result = await this.syncTable(table, { enableDelta: true, deltaHours: 1 });
        results.push(result);
        this.updateStatistics(result, true);
      } catch (error) {
        console.error(`❌ Incremental sync failed for table ${table}:`, error);
        const errorResult: SyncResult = {
          table,
          processed: 0,
          saved: 0,
          updated: 0,
          errors: 1,
          conflicts: 0,
          duration: 0,
          lastSyncTime: new Date().toISOString(),
          errorDetails: [{ sys_id: 'N/A', error: error.message }]
        };
        results.push(errorResult);
        this.updateStatistics(errorResult, false);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`✅ Incremental sync completed in ${totalDuration}ms`);
    
    return results;
  }

  private async syncTable(table: string, options: { enableDelta: boolean; deltaHours?: number }): Promise<SyncResult> {
    const startTime = Date.now();
    console.log(`📊 Syncing table: ${table} (delta: ${options.enableDelta})`);

    const result: SyncResult = {
      table,
      processed: 0,
      saved: 0,
      updated: 0,
      errors: 0,
      conflicts: 0,
      duration: 0,
      lastSyncTime: new Date().toISOString(),
      errorDetails: []
    };

    try {
      // Build query for ServiceNow
      let query = '';
      if (options.enableDelta && options.deltaHours) {
        const deltaTime = new Date(Date.now() - (options.deltaHours * 60 * 60 * 1000)).toISOString();
        query = `sys_updated_on>=${deltaTime}`;
      }

      // Fetch from ServiceNow
      const tickets = await this.serviceNowService.getRecords(table, query, this.syncOptions.batchSize || 50);
      result.processed = tickets.length;

      console.log(`📥 Fetched ${tickets.length} records from ServiceNow table ${table}`);

      for (const ticket of tickets) {
        try {
          // Check if exists in MongoDB
          const existing = await this.fetchFromMongo(ticket.sys_id, table);
          
          if (existing) {
            // Update existing
            await this.updateTicketInMongo(ticket, table);
            result.updated++;
          } else {
            // Create new
            await this.saveTicketToMongo(ticket, table);
            result.saved++;
          }

          // Collect SLMs if enabled
          if (this.syncOptions.enableSLMCollection) {
            await this.collectSLMs(ticket.sys_id, table);
          }

          // Collect notes if enabled
          if (this.syncOptions.enableNotesCollection) {
            await this.collectNotes(ticket.sys_id, table);
          }

          // Send to Redis Stream if enabled
          if (this.syncOptions.enableRealTimeUpdates) {
            await this.sendToRedisStream(ticket, table, existing ? 'update' : 'create');
          }

        } catch (ticketError) {
          console.error(`❌ Error syncing ticket ${ticket.sys_id}:`, ticketError);
          result.errors++;
          result.errorDetails.push({
            sys_id: ticket.sys_id,
            error: ticketError.message
          });
        }
      }

    } catch (error) {
      console.error(`❌ Error syncing table ${table}:`, error);
      result.errors++;
      result.errorDetails.push({
        sys_id: 'TABLE_SYNC_ERROR',
        error: error.message
      });
    }

    result.duration = Date.now() - startTime;
    console.log(`✅ Table sync completed: ${table} - ${result.saved} saved, ${result.updated} updated, ${result.errors} errors (${result.duration}ms)`);

    return result;
  }

  // === HELPER METHODS ===

  private async fetchFromMongo(sysId: string, table: string): Promise<any> {
    try {
      let document;
      
      switch (table) {
        case 'incident':
          document = await this.mongoService.findIncidentBySysId(sysId);
          break;
        case 'change_task':
          document = await this.mongoService.findChangeTaskBySysId(sysId);
          break;
        case 'sc_task':
          document = await this.mongoService.findSCTaskBySysId(sysId);
          break;
        default:
          throw new Error(`Unsupported table: ${table}`);
      }
      
      return document;
    } catch (error) {
      console.error(`❌ Error fetching from MongoDB ${table}/${sysId}:`, error);
      return null;
    }
  }

  private async fetchFromServiceNowAndSync(sysId: string, table: string, options: HybridDataOptions): Promise<TicketData | null> {
    try {
      const record = await this.serviceNowService.getRecord(table, sysId);
      if (!record) return null;

      await this.saveTicketToMongo(record, table);

      if (options.includeSLMs) {
        await this.collectSLMs(sysId, table);
      }

      if (options.includeNotes) {
        await this.collectNotes(sysId, table);
      }

      return this.formatTicketData(record, table);
    } catch (error) {
      console.error(`❌ Error fetching from ServiceNow ${table}/${sysId}:`, error);
      throw error;
    }
  }

  private async saveTicketToMongo(ticket: any, table: string): Promise<void> {
    switch (table) {
      case 'incident':
        await this.mongoService.saveIncident(ticket);
        break;
      case 'change_task':
        await this.mongoService.saveChangeTask(ticket);
        break;
      case 'sc_task':
        await this.mongoService.saveSCTask(ticket);
        break;
    }
  }

  private async updateTicketInMongo(ticket: any, table: string): Promise<void> {
    switch (table) {
      case 'incident':
        await this.mongoService.updateIncident(ticket.sys_id, ticket);
        break;
      case 'change_task':
        await this.mongoService.updateChangeTask(ticket.sys_id, ticket);
        break;
      case 'sc_task':
        await this.mongoService.updateSCTask(ticket.sys_id, ticket);
        break;
    }
  }

  private formatTicketData(document: any, table: string): TicketData {
    return {
      sys_id: document.sys_id,
      number: document.number,
      table: table,
      state: document.state,
      priority: document.priority,
      short_description: document.short_description,
      assignment_group: document.assignment_group,
      sys_created_on: document.sys_created_on,
      sys_updated_on: document.sys_updated_on,
      slms: document.slms,
      notes: document.notes,
      ...document
    };
  }

  private async collectSLMs(sysId: string, table: string): Promise<void> {
    try {
      const slms = await this.serviceNowService.getRecords('sys_slm_instance', `task=${sysId}`, 100);
      if (slms.length > 0) {
        await this.mongoService.saveSLMs(sysId, slms);
        this.syncStatistics.slmsCollected += slms.length;
      }
    } catch (error) {
      console.error(`❌ Error collecting SLMs for ${sysId}:`, error);
    }
  }

  private async collectNotes(sysId: string, table: string): Promise<void> {
    try {
      const notes = await this.notesService.getIncidentNotes(sysId);
      if (notes.length > 0) {
        await this.mongoService.saveNotes(sysId, notes);
        this.syncStatistics.notesCollected += notes.length;
      }
    } catch (error) {
      console.error(`❌ Error collecting notes for ${sysId}:`, error);
    }
  }

  private async sendToRedisStream(ticket: any, table: string, action: 'create' | 'update'): Promise<void> {
    try {
      const change: ServiceNowChange = {
        action,
        table,
        sys_id: ticket.sys_id,
        number: ticket.number,
        state: ticket.state,
        priority: ticket.priority,
        timestamp: new Date().toISOString()
      };
      
      await this.redisStreams.addMessage('tickets', change);
    } catch (error) {
      console.error(`❌ Error sending to Redis stream:`, error);
    }
  }

  private updateStatistics(result: SyncResult, success: boolean): void {
    this.syncStatistics.totalSyncs++;
    this.syncStatistics.lastSyncTime = result.lastSyncTime;
    
    if (success) {
      this.syncStatistics.successfulSyncs++;
      this.syncStatistics.ticketsProcessed += result.processed;
    } else {
      this.syncStatistics.failedSyncs++;
      this.syncStatistics.errors.push(...result.errorDetails.map(e => e.error));
    }
    
    // Calculate average duration
    const totalDuration = this.syncStatistics.averageDuration * (this.syncStatistics.totalSyncs - 1) + result.duration;
    this.syncStatistics.averageDuration = totalDuration / this.syncStatistics.totalSyncs;
  }

  // === PUBLIC API METHODS ===

  public getSyncStatistics(): SyncStatistics {
    return { ...this.syncStatistics };
  }

  public getSyncOptions(): SyncOptions {
    return { ...this.syncOptions };
  }

  public updateSyncOptions(options: Partial<SyncOptions>): void {
    this.syncOptions = { ...this.syncOptions, ...options };
    console.log('⚙️ Sync options updated:', options);
  }

  public isAutoSyncRunning(): boolean {
    return this.isRunning;
  }

  public async manualSync(table: string): Promise<SyncResult> {
    console.log(`🔧 Manual sync triggered for table: ${table}`);
    return await this.syncTable(table, { enableDelta: false });
  }

  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'error';
    isRunning: boolean;
    lastSync: string;
    statistics: SyncStatistics;
  }> {
    const recentErrors = this.syncStatistics.errors.length;
    const failureRate = this.syncStatistics.totalSyncs > 0 
      ? this.syncStatistics.failedSyncs / this.syncStatistics.totalSyncs 
      : 0;
    
    let status: 'healthy' | 'degraded' | 'error' = 'healthy';
    
    if (recentErrors > 10 || failureRate > 0.5) {
      status = 'error';
    } else if (recentErrors > 5 || failureRate > 0.2) {
      status = 'degraded';
    }

    return {
      status,
      isRunning: this.isRunning,
      lastSync: this.syncStatistics.lastSyncTime,
      statistics: this.getSyncStatistics()
    };
  }
}