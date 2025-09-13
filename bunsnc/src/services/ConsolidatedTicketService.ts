/**
 * Consolidated Ticket Service - Unified ticket operations with modular architecture
 * Consolidates TicketService + HybridTicketService + TicketIntegrationService + TicketCollectionService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { TicketDataCore } from './ticket/TicketDataCore';
import { TicketQueryService, HybridQueryParams, HybridQueryResult } from './ticket/TicketQueryService';
import { TicketSyncService, TicketSyncResult } from './ticket/TicketSyncService';
import { logger } from '../utils/Logger';
import type { TicketData } from '../types/TicketTypes';

// Re-export types for compatibility
export type {
  HybridQueryParams,
  HybridQueryResult,
  TicketSyncResult
} from './ticket/TicketQueryService';

export interface TicketCollectionStats {
  incidents: number;
  changeTasks: number;
  scTasks: number;
  groups: number;
  lastSync: string;
}

export class ConsolidatedTicketService {
  private dataCore: TicketDataCore;
  private queryService: TicketQueryService;
  private syncService: TicketSyncService;
  private serviceNowClient: ServiceNowAuthClient;

  constructor(serviceNowClient: ServiceNowAuthClient) {
    this.serviceNowClient = serviceNowClient;
    // Initialize modular components
    this.dataCore = new TicketDataCore();
    this.queryService = new TicketQueryService(serviceNowClient);
    this.syncService = new TicketSyncService(serviceNowClient);

    logger.info('🚀 ConsolidatedTicketService initialized with modular architecture');
  }

  /**
   * Initialize the consolidated service
   */
  async initialize(): Promise<void> {
    try {
      // Core initialization handles all components
      await this.dataCore.initialize();
      logger.info('✅ [CONSOLIDATED] ConsolidatedTicketService initialized successfully');
    } catch (error) {
      logger.error('❌ [CONSOLIDATED] Failed to initialize ConsolidatedTicketService:', error);
      throw error;
    }
  }

  /**
   * Create Elysia service instance
   */
  createElysiaService() {
    return new Elysia({ name: 'Service.ConsolidatedTicket' })
      .derive({ as: 'scoped' }, () => ({
        TicketService: {
          getTicketDetails: this.getTicketDetails.bind(this),
          getStatusLabel: this.getStatusLabel.bind(this),
          getPriorityLabel: this.getPriorityLabel.bind(this),
          hybridQuery: this.hybridQuery.bind(this),
          syncCurrentMonthTickets: this.syncCurrentMonthTickets.bind(this),
          getCollectionStats: this.getStats.bind(this)
        }
      }))
      .macro(({ onBeforeHandle }) => ({
        requireTicket: {
          sysId: t.String({ minLength: 32, maxLength: 32 }),
          table: t.String({ minLength: 1 })
        }
      }));
  }

  // === Core Data Methods ===
  /**
   * Get collection statistics
   */
  async getStats(): Promise<TicketCollectionStats> {
    return this.dataCore.getStats();
  }

  /**
   * Map status codes to readable labels
   */
  getStatusLabel(state: string): string {
    return this.dataCore.getStatusLabel(state);
  }

  /**
   * Map priority codes to readable labels
   */
  getPriorityLabel(priority: string): string {
    return this.dataCore.getPriorityLabel(priority);
  }

  // === Query Methods ===
  /**
   * Get ticket details with hybrid strategy
   */
  async getTicketDetails(sysId: string, table: string): Promise<TicketData> {
    return this.queryService.getTicketDetails(sysId, table);
  }

  /**
   * Hybrid query with MongoDB-first strategy
   */
  async hybridQuery(params: HybridQueryParams): Promise<HybridQueryResult> {
    return this.queryService.hybridQuery(params);
  }

  // === Sync Methods ===
  /**
   * Sync current month tickets
   */
  async syncCurrentMonthTickets(): Promise<TicketSyncResult> {
    return this.syncService.syncCurrentMonthTickets();
  }

  /**
   * Sync tickets by date range
   */
  async syncTicketsByDateRange(startDate: string, endDate: string): Promise<TicketSyncResult> {
    return this.syncService.syncTicketsByDateRange(startDate, endDate);
  }

  /**
   * Sync specific ticket by sys_id
   */
  async syncTicketBySysId(sysId: string, table: string): Promise<boolean> {
    return this.syncService.syncTicketBySysId(sysId, table);
  }

  /**
   * Sync tickets by assignment group
   */
  async syncTicketsByGroup(groupName: string, maxRecords: number = 1000): Promise<{
    synced: number;
    errors: number;
  }> {
    return this.syncService.syncTicketsByGroup(groupName, maxRecords);
  }

  // === Legacy Compatibility Methods ===
  /**
   * Legacy save method for backward compatibility
   */
  async save(ticketData: any, ticketType: string): Promise<boolean> {
    try {
      const processedTicket = this.dataCore.processTicketData(ticketData);
      await this.dataCore.storeTicketInMongoDB(processedTicket, ticketType);
      return true;
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error in legacy save:`, error);
      return false;
    }
  }

  /**
   * Legacy find method for backward compatibility
   */
  async find(query: any): Promise<any> {
    const hybridParams: HybridQueryParams = {
      table: query.table || 'incident',
      group: query.group || 'all',
      state: query.state || 'all',
      page: query.page || 1,
      limit: query.limit || 50
    };
    return this.hybridQuery(hybridParams);
  }

  /**
   * Legacy count method for backward compatibility
   */
  async count(filter: any = {}): Promise<number> {
    const result = await this.find({ ...filter, limit: 0 });
    return result.total || 0;
  }

  // === Connection Management ===
  /**
   * Check if connection is active
   */
  isConnectionActive(): boolean {
    return this.dataCore.isConnectionActive();
  }

  /**
   * Get database instance
   */
  getDatabase() {
    return this.dataCore.getDatabase();
  }

  /**
   * Get client instance
   */
  getClient() {
    return this.dataCore.getClient();
  }

  /**
   * Health check method for monitoring
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const stats = await this.getStats();
      const isHealthy = this.isConnectionActive() && stats.incidents >= 0;

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        details: {
          connection: this.isConnectionActive(),
          stats,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Cleanup service and all modules
   */
  async cleanup(): Promise<void> {
    await this.dataCore.cleanup();
    logger.info('🧹 [CONSOLIDATED] ConsolidatedTicketService cleanup completed');
  }
}

// Factory function for Elysia integration
export const createConsolidatedTicketService = (serviceNowClient: ServiceNowAuthClient) => {
  const consolidatedService = new ConsolidatedTicketService(serviceNowClient);
  return consolidatedService.createElysiaService();
};

// Export singleton for global use
export const consolidatedTicketService = new ConsolidatedTicketService(null as any);