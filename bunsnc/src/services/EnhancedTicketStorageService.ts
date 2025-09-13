/**
 * Enhanced Ticket Storage Service - Unified interface with modular architecture
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketStorageCore, TicketDocument, TicketQuery, QueryResult } from './storage/TicketStorageCore';
import { TicketQueryService } from './storage/TicketQueryService';
import { TicketPersistenceService } from './storage/TicketPersistenceService';
import type { SLMRecord } from '../types/servicenow';

// Export types for compatibility
export type {
  BaseTicketDocument,
  IncidentDocument,
  ChangeTaskDocument,
  SCTaskDocument,
  TicketDocument,
  TicketQuery,
  QueryResult
} from './storage/TicketStorageCore';

export class EnhancedTicketStorageService {
  private core: TicketStorageCore;
  private queryService: TicketQueryService;
  private persistenceService: TicketPersistenceService;

  constructor(connectionConfig?: any) {
    // Initialize all specialized services with the same config
    this.core = new TicketStorageCore(connectionConfig);
    this.queryService = new TicketQueryService(connectionConfig);
    this.persistenceService = new TicketPersistenceService(connectionConfig);

    console.log('🚀 Enhanced Ticket Storage Service initialized with modular architecture');
  }

  // === Core Methods ===
  async initialize(): Promise<void> {
    await this.core.initialize();
    // Query and persistence services share the same connection
    console.log('✅ All storage modules initialized');
  }

  async shutdown(): Promise<void> {
    await this.core.shutdown();
    console.log('📴 Enhanced Ticket Storage Service shutdown completed');
  }

  public getClient() {
    return this.core.getClient();
  }

  public getDatabase() {
    return this.core.getDatabase();
  }

  public getTicketsCollection() {
    return this.core.getTicketsCollection();
  }

  public isConnectionActive(): boolean {
    return this.core.isConnectionActive();
  }

  // === Query Methods ===
  async queryTickets(query: TicketQuery): Promise<QueryResult<TicketDocument>> {
    return this.queryService.queryTickets(query);
  }

  async getDashboardStats(groupBy?: string): Promise<any> {
    return this.queryService.getDashboardStats(groupBy);
  }

  async getHealthMetrics(): Promise<any> {
    return this.queryService.getHealthMetrics();
  }

  async getTicketsWithSLAs(query: Partial<TicketQuery> = {}): Promise<QueryResult<TicketDocument>> {
    return this.queryService.getTicketsWithSLAs(query);
  }

  async getTicketsTrends(
    period: 'day' | 'week' | 'month' = 'week',
    ticketType?: 'incident' | 'change_task' | 'sc_task'
  ): Promise<any> {
    return this.queryService.getTicketsTrends(period, ticketType);
  }

  async getTicketsByAssignmentGroup(limit: number = 20): Promise<any> {
    return this.queryService.getTicketsByAssignmentGroup(limit);
  }

  async searchTickets(
    searchText: string,
    filters?: Partial<TicketQuery>
  ): Promise<QueryResult<TicketDocument>> {
    return this.queryService.searchTickets(searchText, filters);
  }

  // === Persistence Methods ===
  async upsertTicket(
    ticketData: any,
    ticketType: 'incident' | 'change_task' | 'sc_task',
    slmData: SLMRecord[] = []
  ): Promise<boolean> {
    return this.persistenceService.upsertTicket(ticketData, ticketType, slmData);
  }

  async upsertTicketWithSLMs(
    ticketData: any,
    ticketType: 'incident' | 'change_task' | 'sc_task',
    slmData: SLMRecord[]
  ): Promise<boolean> {
    return this.persistenceService.upsertTicketWithSLMs(ticketData, ticketType, slmData);
  }

  async bulkUpsertTickets(tickets: Array<{
    ticketData: any;
    ticketType: 'incident' | 'change_task' | 'sc_task';
    slmData?: SLMRecord[];
  }>): Promise<{ successful: number; failed: number }> {
    return this.persistenceService.bulkUpsertTickets(tickets);
  }

  async deleteTicket(sysId: string): Promise<boolean> {
    return this.persistenceService.deleteTicket(sysId);
  }

  async getTicketById(sysId: string): Promise<TicketDocument | null> {
    return this.persistenceService.getTicketById(sysId);
  }

  async ping(): Promise<void> {
    return this.persistenceService.ping();
  }

  // === Legacy Compatibility Methods ===
  // These methods provide the same interface as the original service
  async save(ticketData: any, ticketType: string): Promise<boolean> {
    const type = ticketType as 'incident' | 'change_task' | 'sc_task';
    return this.upsertTicket(ticketData, type, []);
  }

  async find(query: any): Promise<any> {
    const ticketQuery: TicketQuery = {
      ticketType: query.ticketType ? [query.ticketType] : undefined,
      state: query.state ? [query.state] : undefined,
      assignment_group: query.assignment_group ? [query.assignment_group] : undefined,
      limit: query.limit || 50,
      skip: query.skip || 0
    };
    return this.queryTickets(ticketQuery);
  }

  async count(filter: any = {}): Promise<number> {
    const result = await this.queryTickets({ ...filter, limit: 0 });
    return result.total;
  }

  // Health check method for monitoring
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      await this.ping();
      const metrics = await this.getHealthMetrics();

      const isHealthy = this.isConnectionActive() && metrics.documentCount >= 0;

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        details: {
          connection: this.isConnectionActive(),
          metrics,
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
}

// Create and export singleton instance
export const enhancedTicketStorageService = new EnhancedTicketStorageService();