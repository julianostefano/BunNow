/**
 * Background Sync Manager - Manages the lifecycle of background synchronization services
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './EnhancedTicketStorageService';
import { TicketSyncOrchestrator } from './TicketSyncOrchestrator';

interface BackgroundSyncConfig {
  enableBackgroundSync: boolean;
  syncIntervalMinutes: number;
  enabledTicketTypes: string[];
  enableRealTimeUpdates: boolean;
  enableSLMCollection: boolean;
  enableNotesCollection: boolean;
  autoStartOnServerStart: boolean;
}

export class BackgroundSyncManager {
  private static instance: BackgroundSyncManager;
  private orchestrator: TicketSyncOrchestrator | null = null;
  private isInitialized = false;
  private isRunning = false;

  private config: BackgroundSyncConfig = {
    enableBackgroundSync: process.env.ENABLE_BACKGROUND_SYNC === 'true' || true,
    syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5'),
    enabledTicketTypes: [],
    enableRealTimeUpdates: process.env.ENABLE_REALTIME_UPDATES === 'true' || true,
    enableSLMCollection: process.env.ENABLE_SLM_COLLECTION === 'true' || true,
    enableNotesCollection: process.env.ENABLE_NOTES_COLLECTION === 'true' || true,
    autoStartOnServerStart: process.env.AUTO_START_BACKGROUND_SYNC === 'true' || true
  };

  private constructor() {}

  static getInstance(): BackgroundSyncManager {
    if (!BackgroundSyncManager.instance) {
      BackgroundSyncManager.instance = new BackgroundSyncManager();
    }
    return BackgroundSyncManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ Background Sync Manager already initialized');
      return;
    }

    if (!this.config.enableBackgroundSync) {
      console.log('⚠️ Background sync is disabled in configuration');
      return;
    }

    try {
      console.log('🚀 Initializing Background Sync Manager...');
      
      // Initialize ServiceNow client
      const serviceNowClient = new ServiceNowAuthClient();
      
      // Initialize storage service
      const enhancedStorage = new EnhancedTicketStorageService();
      await enhancedStorage.initialize();
      
      // Create orchestrator
      this.orchestrator = new TicketSyncOrchestrator(
        serviceNowClient,
        enhancedStorage
      );

      // Initialize orchestrator with configuration
      await this.orchestrator.initialize({
        syncIntervalMinutes: this.config.syncIntervalMinutes,
        enabledTicketTypes: this.config.enabledTicketTypes,
        enableRealTimeUpdates: this.config.enableRealTimeUpdates,
        enableSLMCollection: this.config.enableSLMCollection,
        enableNotesCollection: this.config.enableNotesCollection,
        autoCreateIndexes: true,
        maxConcurrentSyncs: 3
      });

      this.isInitialized = true;
      console.log('✅ Background Sync Manager initialized successfully');

      // Auto-start if configured
      if (this.config.autoStartOnServerStart) {
        await this.startSync();
      }

    } catch (error) {
      console.error('❌ Failed to initialize Background Sync Manager:', error);
      throw error;
    }
  }

  async startSync(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Background Sync Manager not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      console.log('⚠️ Background sync is already running');
      return;
    }

    if (!this.orchestrator) {
      throw new Error('Orchestrator not available');
    }

    try {
      console.log('🔄 Starting background synchronization...');
      await this.orchestrator.startSynchronization();
      this.isRunning = true;
      console.log('✅ Background synchronization started successfully');

    } catch (error) {
      console.error('❌ Failed to start background synchronization:', error);
      throw error;
    }
  }

  async stopSync(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ Background sync is not running');
      return;
    }

    if (!this.orchestrator) {
      console.log('⚠️ No orchestrator available to stop');
      return;
    }

    try {
      console.log('🛑 Stopping background synchronization...');
      await this.orchestrator.stopSynchronization();
      this.isRunning = false;
      console.log('✅ Background synchronization stopped');

    } catch (error) {
      console.error('❌ Error stopping background synchronization:', error);
      throw error;
    }
  }

  async getStatus(): Promise<{
    initialized: boolean;
    running: boolean;
    config: BackgroundSyncConfig;
    orchestratorStatus?: any;
  }> {
    const status = {
      initialized: this.isInitialized,
      running: this.isRunning,
      config: this.config,
      orchestratorStatus: undefined as any
    };

    if (this.orchestrator && this.isInitialized) {
      try {
        status.orchestratorStatus = await this.orchestrator.getOrchestratorStatus();
      } catch (error) {
        console.error('❌ Error getting orchestrator status:', error);
      }
    }

    return status;
  }

  async forceSync(ticketTypes?: string[]): Promise<void> {
    if (!this.orchestrator || !this.isInitialized) {
      throw new Error('Background Sync Manager not initialized');
    }

    try {
      console.log('⚡ Forcing manual sync...');
      await this.orchestrator.forceFullSync(ticketTypes);
      console.log('✅ Manual sync completed');

    } catch (error) {
      console.error('❌ Error in manual sync:', error);
      throw error;
    }
  }

  async getDetailedStats(): Promise<any> {
    if (!this.orchestrator || !this.isInitialized) {
      throw new Error('Background Sync Manager not initialized');
    }

    return await this.orchestrator.getDetailedStats();
  }

  async troubleshoot(): Promise<any> {
    if (!this.orchestrator || !this.isInitialized) {
      return {
        error: 'Background Sync Manager not initialized',
        initialized: this.isInitialized,
        running: this.isRunning
      };
    }

    return await this.orchestrator.troubleshoot();
  }

  async optimizePerformance(): Promise<void> {
    if (!this.orchestrator || !this.isInitialized) {
      throw new Error('Background Sync Manager not initialized');
    }

    await this.orchestrator.optimizePerformance();
  }

  updateConfig(newConfig: Partial<BackgroundSyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Background sync configuration updated:', newConfig);
  }

  getConfig(): BackgroundSyncConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const backgroundSyncManager = BackgroundSyncManager.getInstance();

// Convenience functions
export const initializeBackgroundSync = () => backgroundSyncManager.initialize();
export const startBackgroundSync = () => backgroundSyncManager.startSync();
export const stopBackgroundSync = () => backgroundSyncManager.stopSync();
export const getBackgroundSyncStatus = () => backgroundSyncManager.getStatus();