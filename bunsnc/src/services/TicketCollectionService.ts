/**
 * ServiceNow Ticket Collection Service - MongoDB Integration
 * Based on Python collectors for incidents, change_tasks, and sc_tasks
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { 
  IncidentDocument, 
  ChangeTaskDocument, 
  SCTaskDocument, 
  GroupDocument,
  SLMData,
  COLLECTION_NAMES,
  CollectionName
} from '../config/mongodb-collections';

class TicketCollectionService {
  private client: any = null;
  private db: any = null;
  private isConnected = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  async ensureConnected(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import for MongoDB client (will be installed separately)
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
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true }
      });

      await this.client.connect();
      this.db = this.client.db('bunsnc');
      this.isConnected = true;
      
      console.log(`🍃 TicketCollectionService connected to MongoDB`);
      
      // Create indexes for performance
      await this.createIndexes();
      
    } catch (error) {
      console.error('❌ TicketCollectionService connection failed:', error);
      this.isConnected = false;
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      const collections = [
        COLLECTION_NAMES.INCIDENTS,
        COLLECTION_NAMES.CHANGE_TASKS,
        COLLECTION_NAMES.SC_TASKS
      ];

      for (const collectionName of collections) {
        const collection = this.db.collection(collectionName);
        
        // Indexes seguindo o padrão dos scripts Python
        await collection.createIndex({ sys_id: 1 }, { unique: true });
        await collection.createIndex({ number: 1 });
        await collection.createIndex({ sys_id_prefix: 1 });
        await collection.createIndex({ created_at: 1 });
        await collection.createIndex({ updated_at: 1 });
        
        // Indexes para queries nos dados aninhados (como nos scripts Python)
        await collection.createIndex({ "data.incident.state": 1 });
        await collection.createIndex({ "data.incident.assignment_group": 1 });
        await collection.createIndex({ "data.incident.sys_updated_on": 1 });
        
        await collection.createIndex({ "data.change_task.state": 1 });
        await collection.createIndex({ "data.change_task.assignment_group": 1 });
        await collection.createIndex({ "data.change_task.sys_updated_on": 1 });
        
        await collection.createIndex({ "data.sc_task.state": 1 });
        await collection.createIndex({ "data.sc_task.assignment_group": 1 });
        await collection.createIndex({ "data.sc_task.sys_updated_on": 1 });
      }

      // Groups collection indexes
      const groupsCollection = this.db.collection(COLLECTION_NAMES.GROUPS);
      await groupsCollection.createIndex({ nome: 1 }, { unique: true });
      await groupsCollection.createIndex({ "data.sys_id": 1 });
      
      console.log('🔍 TicketCollectionService indexes created successfully');
    } catch (error) {
      console.warn('⚠️ TicketCollectionService indexes creation warning:', error);
    }
  }

  // Get SLMs for a ticket (following Python pattern)
  async getTicketSLMs(ticketNumber: string, ticketType: 'incident' | 'change_task' | 'sc_task'): Promise<SLMData[]> {
    if (!this.isConnected) return [];

    try {
      // This would normally query the ServiceNow SLA table
      // For now, return empty array - will be populated by actual ServiceNow data
      return [];
    } catch (error) {
      console.error(`❌ Error getting SLMs for ${ticketNumber}:`, error);
      return [];
    }
  }

  // Transform ServiceNow ticket data following Python collector pattern
  private transformTicketDocument<T>(ticketData: any, slms: SLMData[], ticketType: string): any {
    const now = new Date();
    const sysIdPrefix = ticketData.sys_id ? ticketData.sys_id[0].toLowerCase() : '0';

    const baseDocument = {
      sys_id: ticketData.sys_id,
      number: ticketData.number,
      created_at: now,
      updated_at: now,
      sys_id_prefix: sysIdPrefix,
      data: {
        [ticketType]: ticketData,
        slms: slms,
        sync_timestamp: now.toISOString(),
        collection_version: '1.0'
      }
    };

    return baseDocument;
  }

  // Upsert incident (following Python pattern)
  async upsertIncident(incidentData: any, slms: SLMData[]): Promise<boolean> {
    await this.ensureConnected();
    
    if (!this.isConnected) {
      console.error('❌ MongoDB not connected after initialization');
      return false;
    }

    try {
      const collection = this.db.collection(COLLECTION_NAMES.INCIDENTS);
      const document = this.transformTicketDocument<IncidentDocument>(incidentData, slms, 'incident');

      const result = await collection.replaceOne(
        { sys_id: document.sys_id },
        document,
        { upsert: true }
      );

      console.log(`🔄 ${result.upsertedCount ? 'Inserted' : 'Updated'} incident ${document.number}`);
      return true;

    } catch (error) {
      console.error(`❌ Error upserting incident ${incidentData.number}:`, error);
      console.error('Document that failed:', JSON.stringify(document, null, 2));
      throw error;
    }
  }

  // Upsert change task (following Python pattern)
  async upsertChangeTask(changeTaskData: any, slms: SLMData[]): Promise<boolean> {
    await this.ensureConnected();
    
    if (!this.isConnected) {
      console.error('❌ MongoDB not connected after initialization');
      return false;
    }

    try {
      const collection = this.db.collection(COLLECTION_NAMES.CHANGE_TASKS);
      const document = this.transformTicketDocument<ChangeTaskDocument>(changeTaskData, slms, 'change_task');

      const result = await collection.replaceOne(
        { sys_id: document.sys_id },
        document,
        { upsert: true }
      );

      console.log(`🔄 ${result.upsertedCount ? 'Inserted' : 'Updated'} change_task ${document.number}`);
      return true;

    } catch (error) {
      console.error(`❌ Error upserting change_task ${changeTaskData.number}:`, error);
      return false;
    }
  }

  // Upsert SC task (following Python pattern)
  async upsertSCTask(scTaskData: any, slms: SLMData[]): Promise<boolean> {
    await this.ensureConnected();
    
    if (!this.isConnected) {
      console.error('❌ MongoDB not connected after initialization');
      return false;
    }

    try {
      const collection = this.db.collection(COLLECTION_NAMES.SC_TASKS);
      const document = this.transformTicketDocument<SCTaskDocument>(scTaskData, slms, 'sc_task');

      const result = await collection.replaceOne(
        { sys_id: document.sys_id },
        document,
        { upsert: true }
      );

      console.log(`🔄 ${result.upsertedCount ? 'Inserted' : 'Updated'} sc_task ${document.number}`);
      return true;

    } catch (error) {
      console.error(`❌ Error upserting sc_task ${scTaskData.number}:`, error);
      return false;
    }
  }

  // Get tickets from collection (following Python query patterns)
  async getTickets(
    ticketType: 'incident' | 'change_task' | 'sc_task',
    filter: any = {},
    limit: number = 50
  ): Promise<any[]> {
    await this.ensureConnected();
    if (!this.isConnected) return [];

    try {
      const collectionMap = {
        incident: COLLECTION_NAMES.INCIDENTS,
        change_task: COLLECTION_NAMES.CHANGE_TASKS,
        sc_task: COLLECTION_NAMES.SC_TASKS
      };

      const collection = this.db.collection(collectionMap[ticketType]);
      
      // Build MongoDB filter from input
      const mongoFilter: any = {};
      
      if (filter.state) {
        mongoFilter[`data.${ticketType}.state`] = filter.state;
      }
      
      if (filter.assignment_group) {
        mongoFilter[`data.${ticketType}.assignment_group.display_value`] = { 
          $regex: filter.assignment_group, 
          $options: 'i' 
        };
      }

      const documents = await collection
        .find(mongoFilter)
        .sort({ updated_at: -1 })
        .limit(limit)
        .toArray();

      console.log(`📊 Retrieved ${documents.length} ${ticketType}s from MongoDB`);
      
      // Return the nested ticket data (following Python pattern)
      return documents.map(doc => ({
        ...doc.data[ticketType],
        slms: doc.data.slms,
        sync_timestamp: doc.data.sync_timestamp
      }));

    } catch (error) {
      console.error(`❌ Error getting ${ticketType}s:`, error);
      return [];
    }
  }

  // Get ticket count (following Python stats pattern)
  async getTicketCount(
    ticketType: 'incident' | 'change_task' | 'sc_task',
    filter: any = {}
  ): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const collectionMap = {
        incident: COLLECTION_NAMES.INCIDENTS,
        change_task: COLLECTION_NAMES.CHANGE_TASKS,
        sc_task: COLLECTION_NAMES.SC_TASKS
      };

      const collection = this.db.collection(collectionMap[ticketType]);
      
      // Build MongoDB filter
      const mongoFilter: any = {};
      
      if (filter.state) {
        mongoFilter[`data.${ticketType}.state`] = filter.state;
      }
      
      if (filter.assignment_group) {
        mongoFilter[`data.${ticketType}.assignment_group.display_value`] = { 
          $regex: filter.assignment_group, 
          $options: 'i' 
        };
      }

      return await collection.countDocuments(mongoFilter);

    } catch (error) {
      console.error(`❌ Error getting ${ticketType} count:`, error);
      return 0;
    }
  }

  // Upsert group (following Python groups pattern)
  async upsertGroup(groupData: any): Promise<boolean> {
    await this.ensureConnected();
    
    if (!this.isConnected) {
      console.error('❌ MongoDB not connected after initialization');
      return false;
    }

    try {
      const collection = this.db.collection(COLLECTION_NAMES.GROUPS);
      
      const document: GroupDocument = {
        nome: groupData.name || groupData.display_value || groupData.nome,
        data: {
          sys_id: groupData.sys_id,
          name: groupData.name || groupData.display_value,
          description: groupData.description,
          active: groupData.active === 'true' || groupData.active === true,
          sync_timestamp: new Date().toISOString()
        },
        created_at: new Date(),
        updated_at: new Date()
      };

      await collection.replaceOne(
        { nome: document.nome },
        document,
        { upsert: true }
      );

      return true;

    } catch (error) {
      console.error(`❌ Error upserting group ${groupData.name}:`, error);
      return false;
    }
  }

  // Get groups (following Python load_target_groups pattern)
  async getTargetGroups(): Promise<string[]> {
    if (!this.isConnected) return [];

    try {
      const collection = this.db.collection(COLLECTION_NAMES.GROUPS);
      const groups = await collection
        .find({ 'data.active': true })
        .sort({ nome: 1 })
        .toArray();

      return groups.map(group => group.nome);

    } catch (error) {
      console.error(`❌ Error getting target groups:`, error);
      return [];
    }
  }

  // Collection stats (following Python get_collection_stats pattern)
  async getCollectionStats(): Promise<any> {
    if (!this.isConnected) return {};

    try {
      const stats: any = {};

      // Get stats for each ticket type
      const ticketTypes = ['incident', 'change_task', 'sc_task'];
      const collections = [
        COLLECTION_NAMES.INCIDENTS,
        COLLECTION_NAMES.CHANGE_TASKS,
        COLLECTION_NAMES.SC_TASKS
      ];

      for (let i = 0; i < ticketTypes.length; i++) {
        const ticketType = ticketTypes[i];
        const collectionName = collections[i];
        const collection = this.db.collection(collectionName);

        // Total count
        const total = await collection.countDocuments();
        
        // By state
        const stateStats = await collection.aggregate([
          {
            $group: {
              _id: `$data.${ticketType}.state`,
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray();

        // By assignment group  
        const groupStats = await collection.aggregate([
          {
            $group: {
              _id: `$data.${ticketType}.assignment_group.display_value`,
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).toArray();

        stats[ticketType] = {
          total,
          by_state: Object.fromEntries(stateStats.map(s => [s._id, s.count])),
          top_groups: Object.fromEntries(groupStats.map(g => [g._id, g.count]))
        };
      }

      return stats;

    } catch (error) {
      console.error(`❌ Error getting collection stats:`, error);
      return {};
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('🍃 TicketCollectionService disconnected');
    }
  }
}

export const ticketCollectionService = new TicketCollectionService();