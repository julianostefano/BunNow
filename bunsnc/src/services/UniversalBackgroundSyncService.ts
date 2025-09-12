/**
 * Universal Background Sync Service - Continuous ticket collection with SLMs
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './EnhancedTicketStorageService';
import { ServiceNowStreams } from '../config/redis-streams';
import { MongoClient, Db, Collection } from 'mongodb';

interface SyncConfig {
  intervalMinutes: number;
  batchSize: number;
  maxRetries: number;
  enabledTables: string[];
  enableRealTimeUpdates: boolean;
}

interface TicketWithSLM {
  sys_id: string;
  number: string;
  table: string;
  raw_data: any;
  slm_data: any[];
  notes_data?: any[];
  metadata: {
    sync_timestamp: string;
    collection_version: string;
    source: string;
    sys_id_prefix: string;
    last_update: string;
    extraction_type: 'full' | 'incremental';
  };
  created_at: Date;
  updated_at: Date;
}

export class UniversalBackgroundSyncService {
  private serviceNowClient: ServiceNowAuthClient;
  private enhancedStorage: EnhancedTicketStorageService;
  private redisStreams: ServiceNowStreams | null = null;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private db: Db | null = null;
  
  // Tipos de tickets suportados com suas coleções
  private readonly TICKET_TYPES = {
    'incident': 'incidents_complete',
    'change_task': 'change_tasks_complete', 
    'sc_task': 'sc_tasks_complete',
    'problem': 'problems_complete',
    'change_request': 'changes_complete',
    'sc_request': 'requests_complete',
    'task': 'tasks_complete',
    'incident_task': 'incident_tasks_complete',
    'problem_task': 'problem_tasks_complete'
  };

  private collections: Map<string, Collection<TicketWithSLM>> = new Map();

  private config: SyncConfig = {
    intervalMinutes: 5, // Sync a cada 5 minutos
    batchSize: 50,
    maxRetries: 3,
    enabledTables: Object.keys(this.TICKET_TYPES),
    enableRealTimeUpdates: true
  };

  constructor(
    serviceNowClient: ServiceNowAuthClient, 
    enhancedStorage: EnhancedTicketStorageService,
    redisStreams?: ServiceNowStreams
  ) {
    this.serviceNowClient = serviceNowClient;
    this.enhancedStorage = enhancedStorage;
    this.redisStreams = redisStreams || null;
  }

  async initialize(): Promise<void> {
    try {
      console.log('🔄 Initializing Universal Background Sync Service...');
      
      // Conectar ao MongoDB diretamente
      await this.connectMongoDB();
      
      // Inicializar coleções
      await this.initializeCollections();
      
      // Configurar Redis Streams se disponível
      if (this.redisStreams) {
        await this.setupRedisStreams();
      }

      console.log('✅ Universal Background Sync Service initialized');
      console.log(`📊 Monitoring ${this.config.enabledTables.length} ticket types:`);
      console.log(`   ${this.config.enabledTables.join(', ')}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Universal Background Sync Service:', error);
      throw error;
    }
  }

  private async connectMongoDB(): Promise<void> {
    const mongoUrl = process.env.MONGODB_URL || 
      `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}?authSource=${process.env.MONGODB_AUTH_SOURCE}`;
    const dbName = process.env.MONGODB_DATABASE || 'bunsnc';
    
    console.log('🍃 Connecting to MongoDB for Universal Sync...');
    const client = new MongoClient(mongoUrl);
    await client.connect();
    this.db = client.db(dbName);
  }

  private async initializeCollections(): Promise<void> {
    if (!this.db) throw new Error('MongoDB not connected');

    for (const [ticketType, collectionName] of Object.entries(this.TICKET_TYPES)) {
      const collection = this.db.collection<TicketWithSLM>(collectionName);
      this.collections.set(ticketType, collection);

      // Criar índices para performance
      await this.createCollectionIndexes(collection);
      console.log(`📊 Collection '${collectionName}' ready for ${ticketType}`);
    }
  }

  private async createCollectionIndexes(collection: Collection<TicketWithSLM>): Promise<void> {
    const indexes = [
      { key: { sys_id: 1 }, options: { unique: true } },
      { key: { number: 1 }, options: { unique: true } },
      { key: { table: 1 } },
      { key: { 'metadata.sync_timestamp': 1 } },
      { key: { 'metadata.sys_id_prefix': 1 } },
      { key: { 'raw_data.state': 1 } },
      { key: { 'raw_data.priority': 1 } },
      { key: { 'raw_data.sys_updated_on': 1 } },
      { key: { updated_at: 1 } },
      { key: { created_at: 1 } }
    ];

    for (const index of indexes) {
      try {
        await collection.createIndex(index.key, index.options);
      } catch (error) {
        // Índice pode já existir
        console.warn(`⚠️ Index creation warning:`, error.message);
      }
    }
  }

  private async setupRedisStreams(): Promise<void> {
    if (!this.redisStreams) return;
    
    console.log('📡 Setting up Redis Streams for real-time updates...');
    
    // Consumer group para tickets sincronizados
    try {
      await this.redisStreams.createConsumerGroup('ticket-sync-notifications', 'background-sync');
    } catch (error) {
      // Grupo pode já existir
    }
  }

  async startBackgroundSync(customConfig?: Partial<SyncConfig>): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Background sync is already running');
      return;
    }

    // Aplicar configuração personalizada
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    console.log('🚀 Starting Universal Background Sync...');
    console.log(`⏱️ Interval: ${this.config.intervalMinutes} minutes`);
    console.log(`📦 Batch size: ${this.config.batchSize}`);
    console.log(`🔄 Max retries: ${this.config.maxRetries}`);

    this.isRunning = true;

    // Executar sync inicial
    await this.performFullSync();

    // Agendar syncs periódicos
    this.intervalId = setInterval(async () => {
      try {
        await this.performIncrementalSync();
      } catch (error) {
        console.error('❌ Error in scheduled sync:', error);
      }
    }, this.config.intervalMinutes * 60 * 1000);

    console.log('✅ Universal Background Sync started successfully');
  }

  async stopBackgroundSync(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Universal Background Sync...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('✅ Universal Background Sync stopped');
  }

  private async performFullSync(): Promise<void> {
    console.log('🔄 Performing full sync for all ticket types...');
    
    for (const ticketType of this.config.enabledTables) {
      try {
        await this.syncTicketType(ticketType, 'full');
      } catch (error) {
        console.error(`❌ Error syncing ${ticketType}:`, error);
      }
    }
    
    console.log('✅ Full sync completed');
  }

  private async performIncrementalSync(): Promise<void> {
    console.log('📊 Performing incremental sync...');
    
    for (const ticketType of this.config.enabledTables) {
      try {
        await this.syncTicketType(ticketType, 'incremental');
      } catch (error) {
        console.error(`❌ Error in incremental sync for ${ticketType}:`, error);
      }
    }
    
    console.log('✅ Incremental sync completed');
  }

  private async syncTicketType(ticketType: string, syncType: 'full' | 'incremental'): Promise<void> {
    const collection = this.collections.get(ticketType);
    if (!collection) {
      console.warn(`⚠️ Collection not found for ticket type: ${ticketType}`);
      return;
    }

    console.log(`🔍 Syncing ${ticketType} tickets (${syncType})...`);

    try {
      // Determinar query baseada no tipo de sync
      let query = '';
      if (syncType === 'incremental') {
        // Pegar tickets atualizados nas últimas 2 horas
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().split('.')[0];
        query = `sys_updated_on>=${twoHoursAgo}^ORDERBYsys_updated_on`;
      } else {
        // Full sync - pegar tickets dos últimos 30 dias
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0];
        query = `sys_updated_on>=${thirtyDaysAgo}^ORDERBYsys_updated_on`;
      }

      // Buscar tickets do ServiceNow com TODOS os campos
      const response = await this.serviceNowClient.makeRequestFullFields(
        ticketType,
        query,
        this.config.batchSize
      );

      const tickets = response?.result || [];
      console.log(`📋 Found ${tickets.length} ${ticketType} tickets to process`);

      if (tickets.length === 0) {
        return;
      }

      // Processar tickets em lotes
      for (const ticket of tickets) {
        await this.processTicketWithSLM(ticket, ticketType, collection, syncType);
      }

      console.log(`✅ Processed ${tickets.length} ${ticketType} tickets`);

    } catch (error) {
      console.error(`❌ Error syncing ${ticketType}:`, error);
      throw error;
    }
  }

  private async processTicketWithSLM(
    ticket: any, 
    ticketType: string, 
    collection: Collection<TicketWithSLM>,
    syncType: 'full' | 'incremental'
  ): Promise<void> {
    try {
      const sysId = this.extractValue(ticket.sys_id);
      const ticketNumber = this.extractValue(ticket.number);

      // Buscar SLMs do ticket
      const slaData = await this.getSLMsForTicket(sysId);
      
      // Buscar notas se sync completo
      let notesData = null;
      if (syncType === 'full') {
        notesData = await this.getNotesForTicket(sysId);
      }

      // Criar documento completo
      const document: TicketWithSLM = {
        sys_id: sysId,
        number: ticketNumber,
        table: ticketType,
        raw_data: ticket, // TODOS os campos do ServiceNow
        slm_data: slaData,
        notes_data: notesData,
        metadata: {
          sync_timestamp: new Date().toISOString(),
          collection_version: '2.0.0',
          source: 'universal-background-sync',
          sys_id_prefix: sysId.substring(0, 2),
          last_update: this.extractValue(ticket.sys_updated_on),
          extraction_type: syncType
        },
        created_at: new Date(),
        updated_at: new Date()
      };

      // Salvar no MongoDB
      await collection.replaceOne(
        { sys_id: sysId },
        document,
        { upsert: true }
      );

      // Broadcast via Redis Streams
      if (this.config.enableRealTimeUpdates && this.redisStreams) {
        await this.broadcastTicketUpdate(ticketType, sysId, ticketNumber, syncType);
      }

    } catch (error) {
      console.error(`❌ Error processing ticket ${ticket.sys_id}:`, error);
    }
  }

  private async getSLMsForTicket(sysId: string): Promise<any[]> {
    try {
      const response = await this.serviceNowClient.makeRequestFullFields(
        'task_sla',
        `task=${sysId}`,
        100
      );
      return response?.result || [];
    } catch (error) {
      console.warn(`⚠️ Could not fetch SLMs for ${sysId}:`, error.message);
      return [];
    }
  }

  private async getNotesForTicket(sysId: string): Promise<any[]> {
    try {
      const [workNotes, comments] = await Promise.all([
        this.serviceNowClient.makeRequestFullFields(
          'sys_journal_field',
          `element_id=${sysId}^element=work_notes^ORDERBYsys_created_on`,
          500
        ),
        this.serviceNowClient.makeRequestFullFields(
          'sys_journal_field',
          `element_id=${sysId}^element=comments^ORDERBYsys_created_on`,
          500
        )
      ]);

      return [
        ...(workNotes?.result || []),
        ...(comments?.result || [])
      ];
    } catch (error) {
      console.warn(`⚠️ Could not fetch notes for ${sysId}:`, error.message);
      return [];
    }
  }

  private async broadcastTicketUpdate(
    ticketType: string, 
    sysId: string, 
    number: string, 
    syncType: string
  ): Promise<void> {
    if (!this.redisStreams) return;

    try {
      await this.redisStreams.publishChange({
        type: ticketType as any,
        action: 'updated',
        sys_id: sysId,
        data: {
          number,
          sync_type: syncType,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.warn(`⚠️ Could not broadcast update for ${sysId}:`, error.message);
    }
  }

  private extractValue(field: any): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field.display_value !== undefined) 
      return String(field.display_value);
    if (typeof field === 'object' && field.value !== undefined) 
      return String(field.value);
    return String(field);
  }

  async getStats(): Promise<any> {
    const stats: any = {
      is_running: this.isRunning,
      config: this.config,
      collections: {}
    };

    for (const [ticketType, collection] of this.collections) {
      try {
        const count = await collection.countDocuments();
        const lastSync = await collection.findOne(
          {}, 
          { sort: { 'metadata.sync_timestamp': -1 } }
        );
        
        stats.collections[ticketType] = {
          total_documents: count,
          last_sync: lastSync?.metadata.sync_timestamp || null,
          collection_name: this.TICKET_TYPES[ticketType]
        };
      } catch (error) {
        stats.collections[ticketType] = { error: error.message };
      }
    }

    return stats;
  }

  async forceSync(ticketTypes?: string[]): Promise<void> {
    const types = ticketTypes || this.config.enabledTables;
    console.log(`🔄 Force syncing ticket types: ${types.join(', ')}`);
    
    for (const ticketType of types) {
      await this.syncTicketType(ticketType, 'full');
    }
    
    console.log('✅ Force sync completed');
  }
}