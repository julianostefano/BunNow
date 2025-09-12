/**
 * Ticket Sync Orchestrator - Main service that coordinates all ticket synchronization
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { UniversalBackgroundSyncService } from './UniversalBackgroundSyncService';
import { TicketTypeManager } from './TicketTypeManager';
import { SLMCollector } from './SLMCollector';
import { MongoDBIndexService } from './MongoDBIndexService';
import { EnhancedTicketStorageService } from './EnhancedTicketStorageService';
import { ServiceNowStreams } from '../config/redis-streams';

interface OrchestratorConfig {
  syncIntervalMinutes: number;
  enabledTicketTypes: string[];
  enableRealTimeUpdates: boolean;
  enableSLMCollection: boolean;
  enableNotesCollection: boolean;
  autoCreateIndexes: boolean;
  maxConcurrentSyncs: number;
}

interface SyncStatistics {
  last_sync: string;
  total_syncs: number;
  successful_syncs: number;
  failed_syncs: number;
  tickets_processed: number;
  slms_collected: number;
  notes_collected: number;
  errors: string[];
}

export class TicketSyncOrchestrator {
  private serviceNowClient: ServiceNowAuthClient;
  private backgroundSyncService: UniversalBackgroundSyncService;
  private ticketTypeManager: TicketTypeManager;
  private slmCollector: SLMCollector;
  private indexService: MongoDBIndexService;
  private enhancedStorage: EnhancedTicketStorageService;
  private redisStreams: ServiceNowStreams | null = null;
  
  private isInitialized = false;
  private isRunning = false;
  private stats: SyncStatistics;

  private config: OrchestratorConfig = {
    syncIntervalMinutes: 5,
    enabledTicketTypes: [],
    enableRealTimeUpdates: true,
    enableSLMCollection: true,
    enableNotesCollection: true,
    autoCreateIndexes: true,
    maxConcurrentSyncs: 3
  };

  constructor(
    serviceNowClient: ServiceNowAuthClient,
    enhancedStorage: EnhancedTicketStorageService
  ) {
    this.serviceNowClient = serviceNowClient;
    this.enhancedStorage = enhancedStorage;
    
    // Initialize managers
    this.ticketTypeManager = TicketTypeManager.getInstance();
    this.slmCollector = new SLMCollector(serviceNowClient);
    this.indexService = new MongoDBIndexService();
    
    // Initialize background sync service
    this.backgroundSyncService = new UniversalBackgroundSyncService(
      serviceNowClient,
      enhancedStorage
    );

    // Initialize statistics
    this.stats = {
      last_sync: '',
      total_syncs: 0,
      successful_syncs: 0,
      failed_syncs: 0,
      tickets_processed: 0,
      slms_collected: 0,
      notes_collected: 0,
      errors: []
    };
  }

  async initialize(customConfig?: Partial<OrchestratorConfig>): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ Ticket Sync Orchestrator already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing Ticket Sync Orchestrator...');

      // Apply custom configuration
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }

      // Set default enabled ticket types if not specified
      if (this.config.enabledTicketTypes.length === 0) {
        this.config.enabledTicketTypes = this.ticketTypeManager.getAllTicketTypes();
      }

      console.log('📋 Configuration:');
      console.log(`   Sync Interval: ${this.config.syncIntervalMinutes} minutes`);
      console.log(`   Enabled Types: ${this.config.enabledTicketTypes.join(', ')}`);
      console.log(`   SLM Collection: ${this.config.enableSLMCollection}`);
      console.log(`   Notes Collection: ${this.config.enableNotesCollection}`);
      console.log(`   Real-time Updates: ${this.config.enableRealTimeUpdates}`);

      // Initialize Redis Streams if enabled
      if (this.config.enableRealTimeUpdates) {
        try {
          this.redisStreams = new ServiceNowStreams();
          await this.redisStreams.initialize();
          console.log('✅ Redis Streams initialized for real-time updates');
        } catch (error) {
          console.warn('⚠️ Redis Streams not available, real-time features disabled:', error.message);
          this.config.enableRealTimeUpdates = false;
        }
      }

      // Initialize MongoDB indexes if enabled
      if (this.config.autoCreateIndexes) {
        await this.indexService.initialize();
        await this.indexService.createAllIndexes();
        console.log('✅ MongoDB indexes created');
      }

      // Initialize background sync service
      await this.backgroundSyncService.initialize();

      // Pass Redis Streams to background service if available
      if (this.redisStreams) {
        // Update background service with Redis Streams
        const enhancedBackgroundService = new UniversalBackgroundSyncService(
          this.serviceNowClient,
          this.enhancedStorage,
          this.redisStreams
        );
        await enhancedBackgroundService.initialize();
        this.backgroundSyncService = enhancedBackgroundService;
      }

      this.isInitialized = true;
      console.log('✅ Ticket Sync Orchestrator initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Ticket Sync Orchestrator:', error);
      throw error;
    }
  }

  async startSynchronization(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      console.log('⚠️ Synchronization is already running');
      return;
    }

    console.log('🔄 Starting ticket synchronization orchestrator...');

    try {
      // Start background sync service
      await this.backgroundSyncService.startBackgroundSync({
        intervalMinutes: this.config.syncIntervalMinutes,
        enabledTables: this.config.enabledTicketTypes,
        enableRealTimeUpdates: this.config.enableRealTimeUpdates,
        batchSize: 50,
        maxRetries: 3
      });

      this.isRunning = true;
      console.log('✅ Ticket synchronization started successfully');

      // Setup monitoring
      this.setupMonitoring();

    } catch (error) {
      console.error('❌ Failed to start synchronization:', error);
      throw error;
    }
  }

  async stopSynchronization(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ Synchronization is not running');
      return;
    }

    console.log('🛑 Stopping ticket synchronization orchestrator...');

    try {
      await this.backgroundSyncService.stopBackgroundSync();
      this.isRunning = false;
      console.log('✅ Ticket synchronization stopped');

    } catch (error) {
      console.error('❌ Error stopping synchronization:', error);
      throw error;
    }
  }

  private setupMonitoring(): void {
    console.log('📊 Setting up monitoring...');

    // Monitor SLA breaches if SLM collection is enabled
    if (this.config.enableSLMCollection && this.redisStreams) {
      this.setupSLAMonitoring();
    }

    // Setup periodic statistics collection
    setInterval(async () => {
      await this.updateStatistics();
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('✅ Monitoring setup completed');
  }

  private async setupSLAMonitoring(): Promise<void> {
    if (!this.redisStreams) return;

    console.log('⏱️ Setting up SLA monitoring...');

    try {
      // Monitor SLA breaches every 10 minutes
      setInterval(async () => {
        await this.checkSLABreaches();
      }, 10 * 60 * 1000);

      console.log('✅ SLA monitoring active');

    } catch (error) {
      console.error('❌ Error setting up SLA monitoring:', error);
    }
  }

  private async checkSLABreaches(): Promise<void> {
    try {
      // Get recently updated SLMs
      const recentSLMs = await this.slmCollector.collectRecentSLMs(1); // Last hour
      
      for (const [sysId, slms] of Object.entries(recentSLMs)) {
        const breachedSLMs = slms.filter(slm => slm.has_breached);
        const riskSLMs = slms.filter(slm => !slm.has_breached && slm.active && slm.business_percentage > 80);

        // Broadcast SLA breach alerts
        if (breachedSLMs.length > 0 && this.redisStreams) {
          for (const slm of breachedSLMs) {
            await this.redisStreams.publishChange({
              type: 'incident' as any, // Will be determined by ticket type
              action: 'slm_updated',
              sys_id: sysId,
              number: slm.task_number,
              state: '',
              timestamp: new Date().toISOString(),
              data: {
                sla_breach: true,
                sla_name: slm.sla_name,
                business_percentage: slm.business_percentage,
                breach_time: slm.breach_time
              }
            });
          }
        }
      }

    } catch (error) {
      console.error('❌ Error checking SLA breaches:', error);
    }
  }

  private async updateStatistics(): Promise<void> {
    try {
      const bgStats = await this.backgroundSyncService.getStats();
      
      this.stats.last_sync = new Date().toISOString();
      this.stats.total_syncs++;
      
      // Update ticket counts from collections
      let totalTickets = 0;
      for (const [ticketType, collectionStats] of Object.entries(bgStats.collections)) {
        if (collectionStats.total_documents) {
          totalTickets += collectionStats.total_documents;
        }
      }
      
      this.stats.tickets_processed = totalTickets;

    } catch (error) {
      console.error('❌ Error updating statistics:', error);
      this.stats.errors.push(`Stats update error: ${error.message}`);
    }
  }

  async forceFullSync(ticketTypes?: string[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }

    const types = ticketTypes || this.config.enabledTicketTypes;
    console.log(`🔄 Forcing full sync for ticket types: ${types.join(', ')}`);

    try {
      await this.backgroundSyncService.forceSync(types);
      this.stats.successful_syncs++;
      console.log('✅ Force sync completed successfully');

    } catch (error) {
      console.error('❌ Error in force sync:', error);
      this.stats.failed_syncs++;
      this.stats.errors.push(`Force sync error: ${error.message}`);
      throw error;
    }
  }

  async getOrchestratorStatus(): Promise<{
    initialized: boolean;
    running: boolean;
    config: OrchestratorConfig;
    statistics: SyncStatistics;
    services: {
      background_sync: any;
      redis_streams: boolean;
      mongodb_indexes: boolean;
    };
  }> {
    const bgStats = await this.backgroundSyncService.getStats();
    
    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      config: this.config,
      statistics: this.stats,
      services: {
        background_sync: bgStats,
        redis_streams: this.redisStreams !== null,
        mongodb_indexes: this.config.autoCreateIndexes
      }
    };
  }

  async getDetailedStats(): Promise<any> {
    const status = await this.getOrchestratorStatus();
    const indexStats = await this.indexService.analyzeIndexUsage();
    const collectionStats = await this.indexService.getCollectionStats();
    
    return {
      orchestrator: status,
      mongodb_indexes: indexStats,
      collections: collectionStats,
      ticket_types: this.ticketTypeManager.getTypeStatistics(),
      slm_cache: this.slmCollector.getCacheStats()
    };
  }

  async optimizePerformance(): Promise<void> {
    console.log('⚡ Starting performance optimization...');

    try {
      // Optimize MongoDB indexes
      await this.indexService.optimizeIndexes();
      
      // Clear SLM cache to free memory
      this.slmCollector.clearCache();
      
      // Analyze and report unused indexes
      const unusedIndexes = await this.indexService.dropUnusedIndexes(true); // Dry run
      console.log('📊 Unused indexes analysis:', unusedIndexes);
      
      console.log('✅ Performance optimization completed');

    } catch (error) {
      console.error('❌ Error during performance optimization:', error);
    }
  }

  async troubleshoot(): Promise<any> {
    console.log('🔍 Running troubleshooting diagnostics...');

    const diagnostics = {
      timestamp: new Date().toISOString(),
      orchestrator_status: await this.getOrchestratorStatus(),
      servicenow_connection: false,
      mongodb_connection: false,
      redis_connection: false,
      issues: [] as string[]
    };

    try {
      // Test ServiceNow connection
      const testResponse = await this.serviceNowClient.makeRequestFullFields('incident', 'ORDERBYsys_created_on^LIMIT1', 1);
      diagnostics.servicenow_connection = !!testResponse?.result;
      if (!diagnostics.servicenow_connection) {
        diagnostics.issues.push('ServiceNow connection failed');
      }
    } catch (error) {
      diagnostics.issues.push(`ServiceNow error: ${error.message}`);
    }

    try {
      // Test Redis connection
      if (this.redisStreams) {
        diagnostics.redis_connection = true;
      } else {
        diagnostics.issues.push('Redis Streams not available');
      }
    } catch (error) {
      diagnostics.issues.push(`Redis error: ${error.message}`);
    }

    try {
      // Test MongoDB connection
      const stats = await this.indexService.getCollectionStats();
      diagnostics.mongodb_connection = Object.keys(stats).length > 0;
      if (!diagnostics.mongodb_connection) {
        diagnostics.issues.push('MongoDB connection failed');
      }
    } catch (error) {
      diagnostics.issues.push(`MongoDB error: ${error.message}`);
    }

    console.log(`🔍 Diagnostics completed: ${diagnostics.issues.length} issues found`);
    return diagnostics;
  }
}