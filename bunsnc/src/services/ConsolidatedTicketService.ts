/**
 * Consolidated Ticket Service - Unified ticket operations
 * Consolidates TicketService + HybridTicketService + TicketIntegrationService + TicketCollectionService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from 'elysia';
import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { mongoCollectionManager, IncidentDocument, ChangeTaskDocument, SCTaskDocument } from '../config/mongodb-collections';
import { GroupService } from './GroupService';
import { enhancedTicketStorageService } from './EnhancedTicketStorageService';
import { logger } from '../utils/Logger';
import type { TicketData } from '../types/TicketTypes';

// Unified interfaces
export interface HybridQueryParams {
  table: string;
  group: string;
  state: string;
  page: number;
  limit: number;
}

export interface HybridQueryResult {
  data: any[];
  hasMore: boolean;
  total: number;
  currentPage: number;
  totalPages: number;
  source: 'mongodb' | 'servicenow' | 'hybrid';
  cached?: boolean;
}

export interface TicketSyncResult {
  success: boolean;
  stats: {
    incidents: { synced: number; errors: number };
    change_tasks: { synced: number; errors: number };
    sc_tasks: { synced: number; errors: number };
    groups: { synced: number; errors: number };
  };
}

export interface TicketCollectionStats {
  incidents: number;
  changeTasks: number;
  scTasks: number;
  groups: number;
  lastSync: string;
}

export class ConsolidatedTicketService {
  private serviceNowClient: ServiceNowAuthClient;
  private groupService: GroupService;
  private client: any = null;
  private db: any = null;
  private isConnected = false;
  private initPromise: Promise<void> | null = null;

  constructor(serviceNowClient: ServiceNowAuthClient) {
    this.serviceNowClient = serviceNowClient;
    this.groupService = new GroupService(enhancedTicketStorageService.getClient(), 'bunsnc');
    this.initPromise = this.initialize();
  }

  /**
   * Initialize the consolidated service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize MongoDB connection
      await this.initializeMongoDB();
      
      // Initialize group service
      await this.groupService.initialize();
      
      logger.info('✅ [CONSOLIDATED] ConsolidatedTicketService initialized successfully');
    } catch (error) {
      logger.error('❌ [CONSOLIDATED] Failed to initialize ConsolidatedTicketService:', error);
      throw error;
    }
  }

  /**
   * Initialize MongoDB connection (from TicketCollectionService)
   */
  private async initializeMongoDB(): Promise<void> {
    try {
      const { MongoClient } = await import('mongodb');
      
      const connectionString = process.env.MONGODB_URL || 
        `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}?authSource=${process.env.MONGODB_AUTH_SOURCE}`;
      
      this.client = new MongoClient(connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        family: 4,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        readPreference: 'primary',
        readConcern: { level: 'majority' }
      });

      await this.client.connect();
      this.db = this.client.db('bunsnc');
      this.isConnected = true;
      
      logger.info('✅ [CONSOLIDATED] MongoDB connection established');
    } catch (error) {
      logger.error('❌ [CONSOLIDATED] MongoDB connection failed:', error);
      throw error;
    }
  }

  /**
   * Create Elysia service instance (from TicketService)
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

  /**
   * Get ticket details (Enhanced from TicketService)
   */
  async getTicketDetails(sysId: string, table: string): Promise<TicketData> {
    try {
      logger.info(`[CONSOLIDATED] Fetching ticket details: ${sysId} from ${table}`);
      
      // Try MongoDB first (hybrid strategy)
      const mongoResult = await this.getTicketFromMongoDB(sysId, table);
      if (mongoResult) {
        logger.info(`[CONSOLIDATED] Ticket found in MongoDB: ${sysId}`);
        return mongoResult;
      }

      // Fallback to ServiceNow
      const ticketResponse = await this.serviceNowClient.makeRequestFullFields(
        table,
        `sys_id=${sysId}`,
        1
      );
      
      const ticket = ticketResponse?.result?.[0];
      
      if (!ticket) {
        throw new Error(`Ticket not found: ${sysId}`);
      }
      
      const processedTicket = this.processTicketData(ticket);
      
      // Store in MongoDB for future queries
      await this.storeTicketInMongoDB(processedTicket, table);
      
      return processedTicket;
      
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error fetching ticket details:`, error);
      throw new Error(`Failed to load ticket: ${error.message}`);
    }
  }

  /**
   * Hybrid query with MongoDB-first strategy (from HybridTicketService)
   */
  async hybridQuery(params: HybridQueryParams): Promise<HybridQueryResult> {
    try {
      logger.info(`[CONSOLIDATED] Executing hybrid query:`, params);
      
      // Try MongoDB first
      const mongoResult = await this.queryFromMongoDB(params);
      if (mongoResult && mongoResult.data.length > 0) {
        logger.info(`[CONSOLIDATED] Query satisfied by MongoDB: ${mongoResult.data.length} records`);
        return mongoResult;
      }

      // Fallback to ServiceNow
      const serviceNowResult = await this.queryFromServiceNow(params);
      if (serviceNowResult && serviceNowResult.data.length > 0) {
        logger.info(`[CONSOLIDATED] Query satisfied by ServiceNow: ${serviceNowResult.data.length} records`);
        
        // Cache results in MongoDB
        await this.cacheServiceNowResults(serviceNowResult.data, params.table);
        
        return serviceNowResult;
      }

      // Return empty result
      return {
        data: [],
        hasMore: false,
        total: 0,
        currentPage: params.page,
        totalPages: 0,
        source: 'hybrid'
      };

    } catch (error) {
      logger.error(`[CONSOLIDATED] Error in hybrid query:`, error);
      throw error;
    }
  }

  /**
   * Sync current month tickets (from TicketIntegrationService)
   */
  async syncCurrentMonthTickets(): Promise<TicketSyncResult> {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const startDate = `${currentMonth}-01`;
      const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
      
      logger.info(`[CONSOLIDATED] Starting sync for tickets from ${startDate} to ${endDate}`);
      
      const stats = {
        incidents: { synced: 0, errors: 0 },
        change_tasks: { synced: 0, errors: 0 },
        sc_tasks: { synced: 0, errors: 0 },
        groups: { synced: 0, errors: 0 }
      };

      // Sync all ticket types
      await Promise.all([
        this.syncTicketsOfType('incident', startDate, endDate, stats.incidents),
        this.syncTicketsOfType('change_task', startDate, endDate, stats.change_tasks),
        this.syncTicketsOfType('sc_task', startDate, endDate, stats.sc_tasks)
      ]);
      
      // Sync groups
      await this.syncGroups(stats.groups);
      
      logger.info(`[CONSOLIDATED] Sync completed:`, stats);
      
      return { success: true, stats };
      
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error during ticket sync:`, error);
      return { success: false, stats: null };
    }
  }

  /**
   * Get collection statistics (from TicketCollectionService)
   */
  async getStats(): Promise<TicketCollectionStats> {
    await this.ensureConnected();
    
    try {
      const [incidentCount, changeTaskCount, scTaskCount, groupCount] = await Promise.all([
        this.db.collection('incidents').countDocuments(),
        this.db.collection('change_tasks').countDocuments(),
        this.db.collection('sc_tasks').countDocuments(),
        this.db.collection('sys_user_groups').countDocuments()
      ]);

      return {
        incidents: incidentCount,
        changeTasks: changeTaskCount,
        scTasks: scTaskCount,
        groups: groupCount,
        lastSync: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error getting collection stats:`, error);
      return {
        incidents: 0,
        changeTasks: 0,
        scTasks: 0,
        groups: 0,
        lastSync: new Date().toISOString()
      };
    }
  }

  // Private helper methods

  private async ensureConnected(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async getTicketFromMongoDB(sysId: string, table: string): Promise<TicketData | null> {
    await this.ensureConnected();
    
    try {
      let collection;
      switch (table) {
        case 'incident':
          collection = mongoCollectionManager.getIncidentsCollection();
          break;
        case 'change_task':
          collection = mongoCollectionManager.getChangeTasksCollection();
          break;
        case 'sc_task':
          collection = mongoCollectionManager.getSCTasksCollection();
          break;
        default:
          return null;
      }

      const document = await collection.findOne({ 'raw_data.sys_id': sysId });
      if (!document) return null;

      return this.convertMongoDocumentToTicketData(document, table);
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error fetching from MongoDB:`, error);
      return null;
    }
  }

  private async storeTicketInMongoDB(ticket: TicketData, table: string): Promise<void> {
    await this.ensureConnected();
    
    try {
      let collection;
      switch (table) {
        case 'incident':
          collection = mongoCollectionManager.getIncidentsCollection();
          break;
        case 'change_task':
          collection = mongoCollectionManager.getChangeTasksCollection();
          break;
        case 'sc_task':
          collection = mongoCollectionManager.getSCTasksCollection();
          break;
        default:
          return;
      }

      const document = {
        sys_id: ticket.sysId,
        raw_data: ticket,
        updated_at: new Date(),
        synced_at: new Date()
      };

      await collection.replaceOne(
        { sys_id: ticket.sysId },
        document,
        { upsert: true }
      );
      
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error storing ticket in MongoDB:`, error);
    }
  }

  private async queryFromMongoDB(params: HybridQueryParams): Promise<HybridQueryResult | null> {
    await this.ensureConnected();
    
    try {
      const { table, group, state, page, limit } = params;
      
      const filter: any = {};
      
      // State filter
      if (state !== 'all' && state !== 'active') {
        const stateMapping: Record<string, string> = {
          'new': '1', 'in_progress': '2', 'awaiting': '3',
          'assigned': '18', 'resolved': '6', 'closed': '10', 'cancelled': '8'
        };
        
        const serviceNowState = stateMapping[state] || state;
        filter['raw_data.state.value'] = serviceNowState;
      } else if (state === 'active') {
        filter['raw_data.state.value'] = { $in: ['1', '2', '3', '18', '-5'] };
      }

      // Group filter
      if (group !== 'all') {
        filter['raw_data.assignment_group.display_value'] = group;
      }

      // Get collection
      let collection;
      switch (table) {
        case 'incident':
          collection = mongoCollectionManager.getIncidentsCollection();
          break;
        case 'change_task':
          collection = mongoCollectionManager.getChangeTasksCollection();
          break;
        case 'sc_task':
          collection = mongoCollectionManager.getSCTasksCollection();
          break;
        default:
          return null;
      }

      const skip = (page - 1) * limit;
      const cursor = collection.find(filter)
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit);
      
      const documents = await cursor.toArray();
      const total = await collection.countDocuments(filter);
      
      if (documents.length === 0) return null;

      const convertedData = documents.map(doc => this.convertMongoDocumentToServiceNowFormat(doc, table));

      return {
        data: convertedData,
        hasMore: (skip + documents.length) < total,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        source: 'mongodb'
      };

    } catch (error) {
      logger.error(`[CONSOLIDATED] Error querying MongoDB:`, error);
      return null;
    }
  }

  private async queryFromServiceNow(params: HybridQueryParams): Promise<HybridQueryResult | null> {
    try {
      const { table, group, state, page, limit } = params;
      
      // Build ServiceNow query
      let query = '';
      
      if (state !== 'all' && state !== 'active') {
        const stateMapping: Record<string, string> = {
          'new': '1', 'in_progress': '2', 'awaiting': '3',
          'assigned': '18', 'resolved': '6', 'closed': '10', 'cancelled': '8'
        };
        const serviceNowState = stateMapping[state] || state;
        query = `state=${serviceNowState}`;
      } else if (state === 'active') {
        query = 'stateIN1,2,3,18,-5';
      }

      if (group !== 'all') {
        query += query ? `^assignment_group.name=${group}` : `assignment_group.name=${group}`;
      }

      const offset = (page - 1) * limit;
      const response = await this.serviceNowClient.makeRequestFullFields(table, query, limit, offset);

      if (!response?.result) return null;

      return {
        data: response.result,
        hasMore: response.result.length === limit,
        total: response.result.length,
        currentPage: page,
        totalPages: Math.ceil(response.result.length / limit),
        source: 'servicenow'
      };

    } catch (error) {
      logger.error(`[CONSOLIDATED] Error querying ServiceNow:`, error);
      return null;
    }
  }

  private async cacheServiceNowResults(data: any[], table: string): Promise<void> {
    try {
      await Promise.all(data.map(async (ticket) => {
        const processedTicket = this.processTicketData(ticket);
        await this.storeTicketInMongoDB(processedTicket, table);
      }));
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error caching ServiceNow results:`, error);
    }
  }

  private async syncTicketsOfType(table: string, startDate: string, endDate: string, stats: any): Promise<void> {
    try {
      const query = `sys_created_on>=${startDate}^sys_created_on<=${endDate}`;
      const response = await this.serviceNowClient.makeRequestFullFields(table, query, 1000);

      if (response?.result) {
        for (const ticket of response.result) {
          try {
            const processedTicket = this.processTicketData(ticket);
            await this.storeTicketInMongoDB(processedTicket, table);
            stats.synced++;
          } catch (error) {
            logger.error(`[CONSOLIDATED] Error syncing ${table} ticket:`, error);
            stats.errors++;
          }
        }
      }
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error syncing tickets of type ${table}:`, error);
      stats.errors++;
    }
  }

  private async syncGroups(stats: any): Promise<void> {
    try {
      const response = await this.serviceNowClient.makeRequestFullFields('sys_user_group', '', 1000);
      
      if (response?.result) {
        for (const group of response.result) {
          try {
            await this.db.collection('sys_user_groups').replaceOne(
              { sys_id: group.sys_id },
              {
                sys_id: group.sys_id,
                name: group.name,
                description: group.description,
                raw_data: group,
                updated_at: new Date()
              },
              { upsert: true }
            );
            stats.synced++;
          } catch (error) {
            logger.error(`[CONSOLIDATED] Error syncing group:`, error);
            stats.errors++;
          }
        }
      }
    } catch (error) {
      logger.error(`[CONSOLIDATED] Error syncing groups:`, error);
      stats.errors++;
    }
  }

  private convertMongoDocumentToTicketData(doc: any, table: string): TicketData {
    const rawData = doc.raw_data || doc;
    return this.processTicketData(rawData);
  }

  private convertMongoDocumentToServiceNowFormat(doc: any, table: string): any {
    return doc.raw_data || doc;
  }

  /**
   * Process raw ticket data from ServiceNow (Enhanced from TicketService)
   */
  private processTicketData(rawTicket: any): TicketData {
    const formattedCreatedOn = this.formatDate(rawTicket.sys_created_on?.display_value || rawTicket.sys_created_on || '');

    return {
      sysId: this.extractValue(rawTicket.sys_id),
      number: this.extractValue(rawTicket.number),
      shortDescription: this.extractValue(rawTicket.short_description) || 'Sem descrição',
      description: this.extractValue(rawTicket.description) || 'Sem descrição detalhada',
      state: this.extractValue(rawTicket.state) || '1',
      priority: this.extractValue(rawTicket.priority) || '3',
      assignedTo: this.extractValue(rawTicket.assigned_to) || 'Não atribuído',
      assignmentGroup: this.extractValue(rawTicket.assignment_group) || 'Não atribuído',
      caller: this.extractValue(rawTicket.caller_id) || this.extractValue(rawTicket.opened_by) || 'N/A',
      createdOn: formattedCreatedOn,
      table: this.extractValue(rawTicket.sys_class_name) || 'incident',
      slaDue: this.extractValue(rawTicket.sla_due) === 'N/A' ? null : this.extractValue(rawTicket.sla_due),
      businessStc: this.extractValue(rawTicket.business_stc) === 'N/A' ? null : this.extractValue(rawTicket.business_stc),
      resolveTime: this.extractValue(rawTicket.resolve_time) === 'N/A' ? null : this.extractValue(rawTicket.resolve_time),
      updatedOn: this.extractValue(rawTicket.sys_updated_on),
      category: this.extractValue(rawTicket.category),
      subcategory: this.extractValue(rawTicket.subcategory),
      urgency: this.extractValue(rawTicket.urgency) || '3',
      impact: this.extractValue(rawTicket.impact) || '3'
    };
  }

  /**
   * Utility methods (from TicketService)
   */
  private extractValue(field: any): string {
    if (!field) return 'N/A';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field.display_value !== undefined) 
      return String(field.display_value);
    if (typeof field === 'object' && field.value !== undefined) 
      return String(field.value);
    return String(field);
  }

  private formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (error) {
      return dateString.slice(0, 16);
    }
    
    return dateString.slice(0, 16);
  }

  /**
   * Map status codes to readable labels
   */
  getStatusLabel(state: string): string {
    const statusMap: Record<string, string> = {
      '1': 'Novo',
      '2': 'Em Progresso', 
      '6': 'Resolvido',
      '7': 'Fechado'
    };
    return statusMap[state] || 'Desconhecido';
  }

  /**
   * Map priority codes to readable labels
   */
  getPriorityLabel(priority: string): string {
    const priorityMap: Record<string, string> = {
      '1': 'Crítica',
      '2': 'Alta',
      '3': 'Moderada',
      '4': 'Baixa',
      '5': 'Planejamento'
    };
    return priorityMap[priority] || 'N/A';
  }

  /**
   * Cleanup service
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.isConnected = false;
    }
    logger.info('🧹 [CONSOLIDATED] ConsolidatedTicketService cleaned up');
  }
}

// Factory function for Elysia integration
export const createConsolidatedTicketService = (serviceNowClient: ServiceNowAuthClient) => {
  const consolidatedService = new ConsolidatedTicketService(serviceNowClient);
  return consolidatedService.createElysiaService();
};

// Export singleton for global use
export const consolidatedTicketService = new ConsolidatedTicketService(null as any);