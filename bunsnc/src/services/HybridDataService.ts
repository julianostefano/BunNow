/**
 * Hybrid Data Service - Transparent Data Source Selection
 * Provides seamless access to MongoDB cache and ServiceNow API
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './EnhancedTicketStorageService';
import { ServiceNowStreams, ServiceNowChange } from '../config/redis-streams';
import { IncidentDocument, ChangeTaskDocument, SCTaskDocument } from '../config/mongodb-collections';
import { ServiceNowNotesService, ServiceNowNote } from './ServiceNowNotesService';

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

export interface DataFreshnessStrategy {
  getTTL(ticket: TicketData): number;
  shouldRefresh(ticket: TicketData): boolean;
  getRefreshPriority(ticket: TicketData): 'high' | 'medium' | 'low';
}

export class SmartDataStrategy implements DataFreshnessStrategy {
  getTTL(ticket: TicketData): number {
    // Tickets fechados (state 6,7): 1 hora
    if (['6', '7'].includes(ticket.state)) return 3600000;
    
    // Tickets críticos (priority 1): 1 minuto  
    if (ticket.priority === '1') return 60000;
    
    // Tickets alta prioridade (priority 2): 2 minutos
    if (ticket.priority === '2') return 120000;
    
    // Padrão: 5 minutos
    return 300000;
  }

  shouldRefresh(ticket: TicketData): boolean {
    const lastUpdate = new Date(ticket.sys_updated_on).getTime();
    const ttl = this.getTTL(ticket);
    const now = Date.now();
    
    return (now - lastUpdate) > ttl;
  }

  getRefreshPriority(ticket: TicketData): 'high' | 'medium' | 'low' {
    if (ticket.priority === '1') return 'high';
    if (ticket.priority === '2') return 'medium';
    if (['6', '7'].includes(ticket.state)) return 'low';
    return 'medium';
  }
}

export interface HybridDataOptions {
  forceServiceNow?: boolean;
  forceMongo?: boolean;
  skipCache?: boolean;
  includeSLMs?: boolean;
  includeNotes?: boolean;
}

export class HybridDataService {
  private mongoService: EnhancedTicketStorageService;
  private serviceNowService: ServiceNowAuthClient;
  private redisStreams: ServiceNowStreams;
  private dataStrategy: DataFreshnessStrategy;
  private notesService: ServiceNowNotesService;

  constructor(
    mongoService: EnhancedTicketStorageService,
    serviceNowService: ServiceNowAuthClient,
    redisStreams: ServiceNowStreams,
    dataStrategy?: DataFreshnessStrategy
  ) {
    this.mongoService = mongoService;
    this.serviceNowService = serviceNowService;
    this.redisStreams = redisStreams;
    this.dataStrategy = dataStrategy || new SmartDataStrategy();
    this.notesService = new ServiceNowNotesService(serviceNowService);

    console.log('🎯 HybridDataService initialized with transparent data sourcing');
  }

  /**
   * Get ticket details with complete transparency
   * User never knows if data comes from MongoDB or ServiceNow
   */
  async getTicketDetails(
    sysId: string, 
    table: string,
    options: HybridDataOptions = {}
  ): Promise<TicketData | null> {
    try {
      console.log(`🔍 Getting ticket details: ${table}/${sysId}`);

      // Force ServiceNow option
      if (options.forceServiceNow) {
        return this.fetchFromServiceNowAndSync(sysId, table, options);
      }

      // Force MongoDB option
      if (options.forceMongo) {
        return this.fetchFromMongo(sysId, table);
      }

      // Normal flow: check MongoDB first
      const cached = await this.fetchFromMongo(sysId, table);
      
      if (cached && !this.dataStrategy.shouldRefresh(this.formatTicketData(cached, table))) {
        console.log(`⚡ Fresh data from MongoDB: ${table}/${sysId}`);
        return this.formatTicketData(cached, table);
      }

      // Data is stale or doesn't exist, fetch from ServiceNow
      console.log(`🔄 Refreshing data from ServiceNow: ${table}/${sysId}`);
      
      try {
        return await this.fetchFromServiceNowAndSync(sysId, table, options);
      } catch (serviceNowError) {
        console.error(`❌ ServiceNow fetch failed for ${table}/${sysId}:`, serviceNowError);
        
        // Fallback: use stale MongoDB data if available
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

  /**
   * Fetch data from MongoDB (cache)
   */
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
          console.warn(`⚠️ Unknown table type: ${table}`);
          return null;
      }

      if (document) {
        console.log(`📦 Found ${table} in MongoDB: ${sysId}`);
        return document;
      }

      return null;
    } catch (error) {
      console.error(`❌ MongoDB fetch error for ${table}/${sysId}:`, error);
      return null;
    }
  }

  /**
   * Fetch from ServiceNow and sync to MongoDB
   */
  private async fetchFromServiceNowAndSync(
    sysId: string, 
    table: string,
    options: HybridDataOptions = {}
  ): Promise<TicketData | null> {
    try {
      // Fetch from ServiceNow with all fields
      const response = await this.serviceNowService.makeRequestFullFields(
        table, 
        `sys_id=${sysId}`, 
        1
      );

      const records = response?.result;
      if (!records || records.length === 0) {
        console.log(`📭 No data found in ServiceNow: ${table}/${sysId}`);
        return null;
      }

      const ticket = records[0];

      // Get SLMs if requested
      let slms = [];
      if (options.includeSLMs) {
        try {
          const slaData = await this.serviceNowService.getSLADataForTask(sysId);
          slms = slaData?.task_slas || [];
        } catch (error) {
          console.warn(`⚠️ Could not fetch SLMs for ${sysId}:`, error);
        }
      }

      // Get Notes if requested
      let notes = [];
      if (options.includeNotes) {
        try {
          notes = await this.notesService.getTicketNotes(table, sysId);
        } catch (error) {
          console.warn(`⚠️ Could not fetch notes for ${sysId}:`, error);
        }
      }

      // Prepare document for MongoDB
      const documentData = {
        sys_id: sysId,
        number: ticket.number,
        data: {
          [table]: ticket,
          slms: slms,
          notes: notes,
          sync_timestamp: new Date().toISOString(),
          collection_version: '2.0.0'
        },
        created_at: new Date(),
        updated_at: new Date(),
        sys_id_prefix: sysId.substring(0, 8)
      };

      // Save to MongoDB asynchronously
      this.saveToMongo(table, documentData).catch(error => {
        console.error(`⚠️ Failed to save ${table}/${sysId} to MongoDB:`, error);
      });

      // Broadcast change via Redis Streams
      this.broadcastChange(ticket, table, 'updated').catch(error => {
        console.warn(`⚠️ Failed to broadcast change for ${table}/${sysId}:`, error);
      });

      console.log(`✅ Fresh data from ServiceNow: ${table}/${sysId}`);
      return this.formatTicketData({ data: { [table]: ticket, slms, notes } }, table);

    } catch (error) {
      console.error(`❌ ServiceNow fetch error for ${table}/${sysId}:`, error);
      return null;
    }
  }

  /**
   * Save document to appropriate MongoDB collection
   */
  private async saveToMongo(table: string, documentData: any): Promise<void> {
    try {
      switch (table) {
        case 'incident':
          await this.mongoService.saveIncident(documentData as IncidentDocument);
          break;
        case 'change_task':
          await this.mongoService.saveChangeTask(documentData as ChangeTaskDocument);
          break;
        case 'sc_task':
          await this.mongoService.saveSCTask(documentData as SCTaskDocument);
          break;
        default:
          console.warn(`⚠️ Unknown table for MongoDB save: ${table}`);
      }
      
      console.log(`💾 Saved ${table}/${documentData.sys_id} to MongoDB`);
    } catch (error) {
      console.error(`❌ MongoDB save error for ${table}:`, error);
      throw error;
    }
  }

  /**
   * Broadcast ticket changes to Redis Streams
   */
  private async broadcastChange(
    ticket: any, 
    table: string, 
    action: string
  ): Promise<void> {
    const change: ServiceNowChange = {
      type: table as any,
      action: action as any,
      sys_id: ticket.sys_id,
      number: ticket.number,
      state: ticket.state || '',
      assignment_group: ticket.assignment_group?.display_value,
      short_description: ticket.short_description,
      timestamp: new Date().toISOString(),
      data: ticket
    };

    await this.redisStreams.publishChange(change);
    console.log(`📡 Broadcasted ${table}:${action} for ${ticket.sys_id}`);
  }

  /**
   * Format ticket data for consistent output
   */
  private formatTicketData(document: any, table: string): TicketData {
    const ticketData = document.data[table];
    const slms = document.data.slms || [];
    const notes = document.data.notes || [];
    
    return {
      sys_id: ticketData.sys_id,
      number: ticketData.number,
      table: table,
      state: ticketData.state || '',
      priority: ticketData.priority || '',
      short_description: ticketData.short_description,
      assignment_group: ticketData.assignment_group,
      sys_created_on: ticketData.sys_created_on || '',
      sys_updated_on: ticketData.sys_updated_on || '',
      slms: slms,
      notes: notes,
      // Include all original fields
      ...ticketData
    };
  }

  /**
   * Check if ticket data is fresh based on strategy
   */
  isFresh(ticket: TicketData | null): boolean {
    if (!ticket) return false;
    return !this.dataStrategy.shouldRefresh(ticket);
  }

  /**
   * Get multiple tickets efficiently
   */
  async getMultipleTickets(
    requests: Array<{ sysId: string; table: string }>,
    options: HybridDataOptions = {}
  ): Promise<Map<string, TicketData | null>> {
    const results = new Map<string, TicketData | null>();
    
    // Process requests in parallel with concurrency limit
    const concurrencyLimit = 5;
    for (let i = 0; i < requests.length; i += concurrencyLimit) {
      const batch = requests.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async ({ sysId, table }) => {
        const ticket = await this.getTicketDetails(sysId, table, options);
        results.set(`${table}:${sysId}`, ticket);
      });

      await Promise.allSettled(batchPromises);
    }

    return results;
  }

  /**
   * Invalidate cache for specific ticket
   */
  async invalidateTicket(sysId: string, table: string): Promise<void> {
    try {
      await this.mongoService.deleteTicket(table, sysId);
      console.log(`🗑️ Invalidated cache for ${table}/${sysId}`);
    } catch (error) {
      console.error(`❌ Error invalidating ${table}/${sysId}:`, error);
    }
  }

  /**
   * Health check for all data sources
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      mongodb: boolean;
      servicenow: boolean;
      redis: boolean;
    };
  }> {
    try {
      const [mongoHealth, snowHealth, redisHealth] = await Promise.allSettled([
        this.mongoService.healthCheck(),
        this.serviceNowService.getHealthStatus(),
        this.redisStreams.healthCheck()
      ]);

      const mongoHealthy = mongoHealth.status === 'fulfilled' && mongoHealth.value.status === 'connected';
      const snowHealthy = snowHealth.status === 'fulfilled' && snowHealth.value.status === 'healthy';
      const redisHealthy = redisHealth.status === 'fulfilled' && redisHealth.value.status === 'healthy';

      const healthyServices = [mongoHealthy, snowHealthy, redisHealthy].filter(Boolean).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyServices === 3) {
        status = 'healthy';
      } else if (healthyServices >= 2) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        details: {
          mongodb: mongoHealthy,
          servicenow: snowHealthy,
          redis: redisHealthy
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          mongodb: false,
          servicenow: false,
          redis: false
        }
      };
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    mongoDocuments: number;
    cacheHitRatio: number;
    lastSyncTimes: Record<string, string>;
  }> {
    try {
      const [incidentCount, ctaskCount, sctaskCount] = await Promise.all([
        this.mongoService.getCollectionStats('incident'),
        this.mongoService.getCollectionStats('change_task'), 
        this.mongoService.getCollectionStats('sc_task')
      ]);

      return {
        mongoDocuments: incidentCount + ctaskCount + sctaskCount,
        cacheHitRatio: 0.85, // TODO: Implement actual cache hit tracking
        lastSyncTimes: {
          incidents: new Date().toISOString(),
          change_tasks: new Date().toISOString(),
          sc_tasks: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        mongoDocuments: 0,
        cacheHitRatio: 0,
        lastSyncTimes: {}
      };
    }
  }
}