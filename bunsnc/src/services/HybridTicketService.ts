/**
 * Hybrid Ticket Service - MongoDB first with ServiceNow fallback strategy
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { mongoCollectionManager, IncidentDocument, ChangeTaskDocument, SCTaskDocument } from '../config/mongodb-collections';
import { GroupService } from './GroupService';
import { enhancedTicketStorageService } from './EnhancedTicketStorageService';
import { logger } from '../utils/Logger';

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

export class HybridTicketService {
  private serviceNowClient: ServiceNowAuthClient;
  private groupService: GroupService;

  constructor(
    serviceNowClient: ServiceNowAuthClient
  ) {
    this.serviceNowClient = serviceNowClient;
    this.groupService = new GroupService(enhancedTicketStorageService.getClient(), 'bunsnc');
  }

  /**
   * Initialize the service and all dependencies
   */
  async initialize(): Promise<void> {
    try {
      await this.groupService.initialize();
      logger.info('✅ [HYBRID] HybridTicketService initialized successfully');
    } catch (error) {
      logger.error('❌ [HYBRID] Failed to initialize HybridTicketService:', error);
      throw error;
    }
  }

  /**
   * Primary query method: MongoDB first, ServiceNow fallback
   * Ordem: MongoDB → ServiceNow → Cache Redis (se necessário)
   */
  async queryTicketsPaginated(params: HybridQueryParams): Promise<HybridQueryResult> {
    const { table, group, state, page, limit } = params;
    
    logger.info(`🔄 [HYBRID] Querying ${table} - group: ${group}, state: ${state}, page: ${page}`);

    try {
      // 1. PRIMEIRO: Tentar MongoDB
      const mongoResult = await this.queryFromMongoDB(params);
      
      if (mongoResult && mongoResult.data.length > 0) {
        logger.info(`✅ [MONGODB] Found ${mongoResult.data.length} ${table} tickets in MongoDB`);
        return {
          ...mongoResult,
          source: 'mongodb'
        };
      }

      logger.info(`⚠️ [MONGODB] No data found in MongoDB for ${table}, falling back to ServiceNow`);

      // 2. SEGUNDO: Fallback para ServiceNow
      const serviceNowResult = await this.queryFromServiceNow(params);
      
      if (serviceNowResult && serviceNowResult.data.length > 0) {
        logger.info(`✅ [SERVICENOW] Found ${serviceNowResult.data.length} ${table} tickets in ServiceNow`);
        
        // Opcional: Salvar dados do ServiceNow no MongoDB para próximas consultas
        await this.syncDataToMongoDB(table, serviceNowResult.data);
        
        return {
          ...serviceNowResult,
          source: 'servicenow'
        };
      }

      // 3. Nenhuma fonte retornou dados
      logger.warn(`⚠️ [HYBRID] No data found in MongoDB or ServiceNow for ${table}`);
      return {
        data: [],
        hasMore: false,
        total: 0,
        currentPage: page,
        totalPages: 0,
        source: 'hybrid'
      };

    } catch (error) {
      logger.error(`❌ [HYBRID] Error in hybrid query:`, error);
      throw error;
    }
  }

  /**
   * Consulta MongoDB usando as coleções corretas
   */
  private async queryFromMongoDB(params: HybridQueryParams): Promise<HybridQueryResult | null> {
    try {
      const { table, group, state, page, limit } = params;
      
      // Construir filtro MongoDB usando estrutura raw_data
      const filter: any = {};
      
      // Filtro por estado (usando raw_data.state.value)
      if (state !== 'all' && state !== 'active') {
        // Mapear estados do UI para valores ServiceNow
        const stateMapping: Record<string, string> = {
          'new': '1',
          'in_progress': '2', 
          'awaiting': '3',
          'assigned': '18',
          'resolved': '6',
          'closed': '10',
          'cancelled': '8'
        };
        
        const serviceNowState = stateMapping[state] || state;
        filter['raw_data.state.value'] = serviceNowState;
      } else if (state === 'active') {
        // Estados ativos: 1 (New), 2 (In Progress), 3 (On Hold), 18 (Assigned), -5 (Pending)
        filter['raw_data.state.value'] = { $in: ['1', '2', '3', '18', '-5'] };
      }

      // Filtro por grupo (usando raw_data.assignment_group.display_value)
      if (group !== 'all') {
        filter['raw_data.assignment_group.display_value'] = group;
      }

      // Buscar na coleção apropriada
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

      // Executar query com paginação
      const skip = (page - 1) * limit;
      const cursor = collection.find(filter)
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit);
      
      const documents = await cursor.toArray();
      const total = await collection.countDocuments(filter);
      
      if (documents.length === 0) {
        return null;
      }

      // Converter formato MongoDB para formato esperado pelos dashboards
      const convertedData = documents.map(doc => this.convertMongoDocumentToServiceNowFormat(doc, table));

      return {
        data: convertedData,
        hasMore: (skip + documents.length) < total,
        total: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        source: 'mongodb'
      };

    } catch (error) {
      logger.error(`❌ [MONGODB] Error querying MongoDB:`, error);
      return null;
    }
  }

  /**
   * Consulta ServiceNow como fallback
   */
  private async queryFromServiceNow(params: HybridQueryParams): Promise<HybridQueryResult | null> {
    try {
      const { table, group, state, page, limit } = params;
      
      // Usar o método existente do ServiceNowAuthClient
      const result = await this.serviceNowClient.makeRequestPaginated(table, group, state, page, limit);
      
      if (!result || result.data.length === 0) {
        return null;
      }

      return {
        data: result.data,
        hasMore: result.hasMore,
        total: result.total,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        source: 'servicenow'
      };

    } catch (error) {
      logger.error(`❌ [SERVICENOW] Error querying ServiceNow:`, error);
      return null;
    }
  }

  /**
   * Converte formato MongoDB para formato ServiceNow esperado pelos dashboards
   */
  private convertMongoDocumentToServiceNowFormat(doc: any, table: string): any {
    // Usar dados da estrutura raw_data encontrada no MongoDB
    const rawData = doc.raw_data || {};
    
    return {
      sys_id: doc.sys_id,
      number: doc.number || rawData.number,
      state: rawData.state?.display_value || rawData.state?.value || '',
      short_description: rawData.short_description || '',
      description: rawData.description || '',
      priority: rawData.priority?.display_value || rawData.priority || '',
      assignment_group: rawData.assignment_group?.display_value || rawData.assignment_group || '',
      assigned_to: rawData.assigned_to?.display_value || rawData.assigned_to || '',
      caller_id: rawData.caller_id?.display_value || rawData.caller_id || '',
      sys_created_on: rawData.sys_created_on || '',
      sys_updated_on: rawData.sys_updated_on || '',
      category: rawData.category?.display_value || rawData.category || '',
      subcategory: rawData.subcategory?.display_value || rawData.subcategory || '',
      table_name: table,
      // Adicionar campos específicos por tipo se necessário
      ...(table === 'incident' && {
        urgency: rawData.urgency?.display_value || rawData.urgency || '',
        impact: rawData.impact?.display_value || rawData.impact || '',
        business_service: rawData.business_service?.display_value || rawData.business_service || '',
        cmdb_ci: rawData.cmdb_ci?.display_value || rawData.cmdb_ci || ''
      }),
      ...(table === 'change_task' && {
        change_request: rawData.change_request?.display_value || rawData.change_request || '',
        planned_start_date: rawData.planned_start_date || '',
        planned_end_date: rawData.planned_end_date || ''
      }),
      ...(table === 'sc_task' && {
        request: rawData.request?.display_value || rawData.request || '',
        request_item: rawData.request_item?.display_value || rawData.request_item || '',
        requested_for: rawData.requested_for?.display_value || rawData.requested_for || ''
      })
    };
  }

  /**
   * Sincroniza dados do ServiceNow para MongoDB para próximas consultas
   */
  private async syncDataToMongoDB(table: string, tickets: any[]): Promise<void> {
    try {
      logger.info(`🔄 [SYNC] Syncing ${tickets.length} ${table} tickets to MongoDB`);
      
      // Buscar coleção apropriada
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
          logger.warn(`Unknown table type: ${table}`);
          return;
      }
      
      // Converter e salvar tickets
      for (const ticket of tickets) {
        const mongoDoc = this.convertServiceNowToMongoFormat(ticket, table);
        await collection.replaceOne(
          { sys_id: mongoDoc.sys_id },
          mongoDoc,
          { upsert: true }
        );
      }
      
      logger.info(`✅ [SYNC] Successfully synced ${tickets.length} ${table} tickets to MongoDB`);
    } catch (error) {
      logger.error(`❌ [SYNC] Error syncing tickets to MongoDB:`, error);
    }
  }

  /**
   * Converte formato ServiceNow para formato MongoDB com estrutura aninhada
   */
  private convertServiceNowToMongoFormat(ticket: any, table: string): any {
    const now = new Date();
    
    // Estrutura base do documento MongoDB
    const mongoDoc = {
      sys_id: ticket.sys_id,
      number: ticket.number,
      data: {
        [table]: ticket, // Dados completos do ServiceNow
        slms: [], // SLMs serão preenchidos posteriormente
        sync_timestamp: now.toISOString(),
        collection_version: '1.0'
      },
      created_at: new Date(ticket.sys_created_on || now),
      updated_at: new Date(ticket.sys_updated_on || now),
      sys_id_prefix: ticket.sys_id.substring(0, 2) // Para particionamento
    };

    return mongoDoc;
  }

  /**
   * Operações CRUD - SEMPRE vão direto para ServiceNow
   */
  async createTicket(table: string, data: any): Promise<any> {
    logger.info(`🆕 [CRUD] Creating ${table} ticket in ServiceNow`);
    
    try {
      // Criar ticket direto no ServiceNow usando método existente
      const response = await this.serviceNowClient.createRecord(table, data);
      
      if (response) {
        // Sincronizar novo ticket para MongoDB
        await this.syncDataToMongoDB(table, [response]);
        logger.info(`✅ [CRUD] Created ${table} ticket ${response.sys_id} in ServiceNow and synced to MongoDB`);
      }
      
      return response;
    } catch (error) {
      logger.error(`❌ [CRUD] Error creating ${table} ticket:`, error);
      throw error;
    }
  }

  async updateTicket(table: string, sysId: string, data: any): Promise<any> {
    logger.info(`✏️ [CRUD] Updating ${table} ticket ${sysId} in ServiceNow`);
    
    try {
      // Atualizar ticket direto no ServiceNow
      const response = await this.serviceNowClient.updateRecord(table, sysId, data);
      
      if (response) {
        // Sincronizar ticket atualizado para MongoDB
        await this.syncDataToMongoDB(table, [response]);
        logger.info(`✅ [CRUD] Updated ${table} ticket ${sysId} in ServiceNow and synced to MongoDB`);
      }
      
      return response;
    } catch (error) {
      logger.error(`❌ [CRUD] Error updating ${table} ticket ${sysId}:`, error);
      throw error;
    }
  }

  async deleteTicket(table: string, sysId: string): Promise<any> {
    logger.info(`🗑️ [CRUD] Deleting ${table} ticket ${sysId} in ServiceNow`);
    
    try {
      // Deletar ticket direto no ServiceNow
      const response = await this.serviceNowClient.deleteRecord(table, sysId);
      
      if (response) {
        // Remover ticket do MongoDB também
        await this.mongoService.deleteTicket(sysId);
        logger.info(`✅ [CRUD] Deleted ${table} ticket ${sysId} from ServiceNow and MongoDB`);
      }
      
      return response;
    } catch (error) {
      logger.error(`❌ [CRUD] Error deleting ${table} ticket ${sysId}:`, error);
      throw error;
    }
  }

  /**
   * Operações específicas (anotar, alterar status) - SEMPRE ServiceNow
   */
  async addNote(table: string, sysId: string, note: string): Promise<any> {
    logger.info(`📝 [CRUD] Adding note to ${table} ticket ${sysId} in ServiceNow`);
    
    try {
      // Adicionar nota usando work_notes field
      const response = await this.serviceNowClient.updateRecord(table, sysId, {
        work_notes: note
      });
      
      if (response) {
        // Sincronizar ticket atualizado para MongoDB
        await this.syncDataToMongoDB(table, [response]);
        logger.info(`✅ [CRUD] Added note to ${table} ticket ${sysId} and synced to MongoDB`);
      }
      
      return response;
    } catch (error) {
      logger.error(`❌ [CRUD] Error adding note to ${table} ticket ${sysId}:`, error);
      throw error;
    }
  }

  async changeStatus(table: string, sysId: string, newState: number): Promise<any> {
    logger.info(`🔄 [CRUD] Changing ${table} ticket ${sysId} status to ${newState} in ServiceNow`);
    
    try {
      // Alterar status direto no ServiceNow
      const response = await this.serviceNowClient.updateRecord(table, sysId, {
        state: newState
      });
      
      if (response) {
        // Sincronizar ticket atualizado para MongoDB
        await this.syncDataToMongoDB(table, [response]);
        logger.info(`✅ [CRUD] Changed ${table} ticket ${sysId} status to ${newState} and synced to MongoDB`);
      }
      
      return response;
    } catch (error) {
      logger.error(`❌ [CRUD] Error changing ${table} ticket ${sysId} status:`, error);
      throw error;
    }
  }

  /**
   * Executar ações específicas no ticket (assumir, colocar em andamento, resolver, etc.)
   */
  async performAction(table: string, sysId: string, action: string, note?: string): Promise<any> {
    logger.info(`🎯 [ACTION] Performing action '${action}' on ${table} ticket ${sysId}`);
    
    try {
      let updateData: any = {};
      
      // Mapear ações para campos do ServiceNow
      switch (action) {
        case 'assign':
          // Assumir ticket - atribuir ao usuário atual
          updateData.assigned_to = 'current_user'; // Placeholder - deve ser o usuário atual
          updateData.state = 18; // Assigned
          break;
          
        case 'in_progress':
          updateData.state = 2; // In Progress
          break;
          
        case 'hold':
          updateData.state = 3; // On Hold
          break;
          
        case 'resolve':
          updateData.state = 6; // Resolved
          break;
          
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      // Adicionar nota se fornecida
      if (note) {
        updateData.work_notes = note;
      }
      
      // Executar atualização
      const response = await this.updateTicket(table, sysId, updateData);
      
      logger.info(`✅ [ACTION] Action '${action}' performed on ${table} ticket ${sysId}`);
      return response;
      
    } catch (error) {
      logger.error(`❌ [ACTION] Error performing action '${action}' on ${table} ticket ${sysId}:`, error);
      throw error;
    }
  }

  /**
   * Buscar detalhes completos de um ticket específico (MongoDB → ServiceNow fallback)
   */
  async getTicketDetails(table: string, sysId: string): Promise<any> {
    logger.info(`🔍 [DETAILS] Getting details for ${table} ticket ${sysId}`);
    
    try {
      // 1. PRIMEIRO: Tentar MongoDB
      const mongoResult = await this.getTicketFromMongoDB(table, sysId);
      
      if (mongoResult) {
        logger.info(`✅ [MONGODB] Found ${table} ticket ${sysId} in MongoDB`);
        return {
          data: this.convertMongoToServiceNowFormat(mongoResult),
          source: 'mongodb'
        };
      }

      logger.info(`⚠️ [MONGODB] Ticket ${sysId} not found in MongoDB, fetching from ServiceNow`);

      // 2. SEGUNDO: Fallback para ServiceNow
      const serviceNowResult = await this.serviceNowClient.getRecord(table, sysId);
      
      if (serviceNowResult) {
        logger.info(`✅ [SERVICENOW] Found ${table} ticket ${sysId} in ServiceNow`);
        
        // Sincronizar para MongoDB para próximas consultas
        await this.syncDataToMongoDB(table, [serviceNowResult]);
        
        return {
          data: serviceNowResult,
          source: 'servicenow'
        };
      }

      // 3. Ticket não encontrado em nenhuma fonte
      logger.warn(`⚠️ [HYBRID] Ticket ${sysId} not found in MongoDB or ServiceNow`);
      return {
        data: null,
        source: 'none'
      };

    } catch (error) {
      logger.error(`❌ [DETAILS] Error getting ticket details for ${sysId}:`, error);
      throw error;
    }
  }

  /**
   * Buscar ticket no MongoDB por sys_id
   */
  private async getTicketFromMongoDB(table: string, sysId: string): Promise<any> {
    try {
      const mongoQuery = {
        ticketType: [table as 'incident' | 'change_task' | 'sc_task'],
        limit: 1,
        skip: 0
      };

      // Buscar por sys_id específico
      const result = await this.mongoService.queryTickets({
        ...mongoQuery,
        textSearch: sysId // Usar busca por texto para sys_id
      });
      
      if (result && result.data.length > 0) {
        // Verificar se o sys_id bate exatamente
        const ticket = result.data.find(t => t.sys_id === sysId);
        return ticket || null;
      }
      
      return null;
    } catch (error) {
      logger.error(`❌ [MONGODB] Error querying ticket ${sysId}:`, error);
      return null;
    }
  }

  /**
   * Get available groups for filter dropdown
   */
  async getAvailableGroups(): Promise<Array<{value: string, label: string, emoji: string}>> {
    try {
      logger.info('📋 [GROUPS] Getting available groups for filter');
      const groups = await this.groupService.getGroupNamesForDropdown();
      logger.info(`✅ [GROUPS] Retrieved ${groups.length} available groups`);
      return groups;
    } catch (error) {
      logger.error('❌ [GROUPS] Error getting available groups:', error);
      throw error;
    }
  }

  /**
   * Get group statistics
   */
  async getGroupStats(): Promise<any> {
    try {
      logger.info('📊 [GROUPS] Getting group statistics');
      const stats = await this.groupService.getStats();
      logger.info('✅ [GROUPS] Retrieved group statistics');
      return stats;
    } catch (error) {
      logger.error('❌ [GROUPS] Error getting group statistics:', error);
      throw error;
    }
  }

  /**
   * Validate if a group exists in the system
   */
  async validateGroup(groupName: string): Promise<boolean> {
    try {
      if (groupName === 'all') return true; // Special case for "all" groups filter
      
      const group = await this.groupService.getGroupByName(groupName);
      return group !== null;
    } catch (error) {
      logger.error(`❌ [GROUPS] Error validating group ${groupName}:`, error);
      return false;
    }
  }

  /**
   * Get group details including temperature and responsible person
   */
  async getGroupDetails(groupName: string): Promise<any> {
    try {
      const group = await this.groupService.getGroupByName(groupName);
      
      if (!group) {
        return null;
      }

      return {
        id: group.id,
        nome: group.data.nome,
        descricao: group.data.descricao,
        responsavel: group.data.responsavel,
        temperatura: group.data.temperatura,
        tags: group.data.tags
      };
    } catch (error) {
      logger.error(`❌ [GROUPS] Error getting details for group ${groupName}:`, error);
      throw error;
    }
  }
}