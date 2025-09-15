/**
 * Ticket Storage Core - Base MongoDB configuration and types
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Collection, Db, CreateCollectionOptions } from 'mongodb';
import type { SLMRecord, TicketSLASummary } from '../../types/servicenow';

// Enhanced type definitions based on endpoint mapping analysis
export interface BaseTicketDocument {
  sys_id: string;
  number: string;
  ticketType: 'incident' | 'change_task' | 'sc_task';
  short_description: string;
  description?: string;
  state: number;
  priority?: number;
  assignment_group: string;
  assigned_to?: string;
  caller_id?: string;
  opened_at?: Date;
  closed_at?: Date;
  resolved_at?: Date;
  sys_created_on: Date;
  sys_updated_on: Date;
  sys_created_by?: string;
  sys_updated_by?: string;
  active: boolean;
  category?: string;
  subcategory?: string;
  // SLA/SLM Integration - following Python reference pattern
  slms: SLMRecord[];
  sla_summary?: TicketSLASummary;
  // Audit and sync fields  
  _syncedAt: Date;
  _version?: number;
  _source: 'servicenow' | 'bunsnc';
  _hash?: string; // For change detection
  _slmsHash?: string; // For SLM change detection
}

export interface IncidentDocument extends BaseTicketDocument {
  ticketType: 'incident';
  incident_state?: number;
  severity?: number;
  urgency?: number;
  impact?: number;
  problem_id?: string;
  caused_by?: string;
  close_code?: string;
  close_notes?: string;
  resolution_code?: string;
  resolution_notes?: string;
  cmdb_ci?: string;
  business_service?: string;
  location?: string;
  company?: string;
  contact_type?: string;
  sla_due?: Date;
  business_duration?: number;
  calendar_duration?: number;
}

export interface ChangeTaskDocument extends BaseTicketDocument {
  ticketType: 'change_task';
  change_request: string;
  change_task_type?: string;
  planned_start_date?: Date;
  planned_end_date?: Date;
  actual_start_date?: Date;
  actual_end_date?: Date;
  implementation_plan?: string;
  test_plan?: string;
  rollback_plan?: string;
  risk_impact_analysis?: string;
  approval_history?: any;
  approval_set?: string;
  change_type?: number;
  risk?: number;
  cab_required?: boolean;
  cab_recommendation?: string;
}

export interface SCTaskDocument extends BaseTicketDocument {
  ticketType: 'sc_task';
  request: string;
  request_item: string;
  catalog_item?: string;
  requested_for: string;
  price?: number;
  quantity?: number;
  delivery_plan?: string;
  delivery_task?: string;
  order?: number;
  stage?: string;
  variables?: Record<string, any>;
  delivery_address?: string;
  special_instructions?: string;
}

export type TicketDocument = IncidentDocument | ChangeTaskDocument | SCTaskDocument;

// Query interfaces for type safety
export interface TicketQuery {
  ticketType?: string[];
  state?: number[];
  assignment_group?: string[];
  priority?: number[];
  dateRange?: {
    field: 'sys_created_on' | 'opened_at' | 'closed_at';
    start?: Date;
    end?: Date;
  };
  textSearch?: string;
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  page?: number;
  limit?: number;
}

export class TicketStorageCore {
  protected client: MongoClient | null = null;
  protected db: Db | null = null;
  protected ticketsCollection: Collection<TicketDocument> | null = null;
  protected isConnected = false;
  protected connectionConfig: any;

  constructor(connectionConfig?: any) {
    this.connectionConfig = connectionConfig || {
      host: process.env.MONGODB_HOST || '10.219.8.210',
      port: parseInt(process.env.MONGODB_PORT || '27018'),
      username: process.env.MONGODB_USERNAME || 'admin',
      password: process.env.MONGODB_PASSWORD || 'Logica2011_',
      database: process.env.MONGODB_DATABASE || 'bunsnc'
    };
  }

  /**
   * Initialize connection and setup collections with optimized schemas
   */
  async initialize(): Promise<void> {
    if (this.isConnected) return;

    try {
      const connectionString = `mongodb://${this.connectionConfig.username}:${this.connectionConfig.password}@${this.connectionConfig.host}:${this.connectionConfig.port}/${this.connectionConfig.database}?authSource=admin`;
      
      this.client = new MongoClient(connectionString, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        retryReads: true,
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true, wtimeout: 5000 }
      });

      await this.client.connect();
      this.db = this.client.db(this.connectionConfig.database);
      
      // Setup optimized collections and indexes
      await this.setupCollections();
      await this.setupIndexes();
      
      this.ticketsCollection = this.db.collection<TicketDocument>('tickets');
      this.isConnected = true;

      console.log(' Enhanced Ticket Storage Service initialized successfully');
      
    } catch (error) {
      console.error(' Failed to initialize Enhanced Ticket Storage Service:', error);
      throw error;
    }
  }

  /**
   * Setup collections with validation schemas based on data mapping insights
   */
  private async setupCollections(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if tickets collection exists
    const collections = await this.db.listCollections({ name: 'tickets' }).toArray();
    
    if (collections.length === 0) {
      console.log('📋 Creating tickets collection with validation schema...');
      
      const validationSchema = {
        $jsonSchema: {
          bsonType: "object",
          required: ["sys_id", "number", "ticketType", "short_description", "state", "assignment_group", "sys_created_on"],
          properties: {
            sys_id: { bsonType: "string" },
            number: { bsonType: "string" },
            ticketType: { enum: ["incident", "change_task", "sc_task"] },
            short_description: { bsonType: "string" },
            state: { bsonType: "number" },
            assignment_group: { bsonType: "string" },
            sys_created_on: { bsonType: "date" },
            sys_updated_on: { bsonType: "date" },
            _syncedAt: { bsonType: "date" },
            _source: { enum: ["servicenow", "bunsnc"] },
            active: { bsonType: "bool" },
            priority: { bsonType: ["number", "null"] },
            slms: { bsonType: "array" }
          }
        }
      };

      const options: CreateCollectionOptions = {
        validator: validationSchema,
        validationLevel: 'moderate',
        validationAction: 'warn'
      };

      await this.db.createCollection('tickets', options);
      console.log(' Tickets collection created with validation');
    }

    // Create audit trail collection
    const auditCollections = await this.db.listCollections({ name: 'ticket_audit' }).toArray();
    if (auditCollections.length === 0) {
      await this.db.createCollection('ticket_audit');
      console.log(' Audit trail collection created');
    }
  }

  /**
   * Setup comprehensive indexes for optimal query performance
   */
  private async setupIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const collection = this.db.collection('tickets');
    
    const createIndexSafe = async (collection: any, indexSpec: any, options: any) => {
      try {
        await collection.createIndex(indexSpec, options);
        console.log(` Index created: ${JSON.stringify(indexSpec)}`);
      } catch (error: any) {
        if (error.code !== 85) { // Index already exists
          console.warn(` Index creation warning: ${error.message}`);
        }
      }
    };

    // Primary and unique indexes
    await createIndexSafe(collection, { sys_id: 1 }, { unique: true, name: 'sys_id_unique' });
    await createIndexSafe(collection, { number: 1 }, { unique: true, name: 'number_unique' });

    // Query optimization indexes based on common patterns
    await createIndexSafe(collection, { ticketType: 1, state: 1 }, { name: 'type_state' });
    await createIndexSafe(collection, { assignment_group: 1, state: 1 }, { name: 'group_state' });
    await createIndexSafe(collection, { sys_created_on: -1 }, { name: 'created_desc' });
    await createIndexSafe(collection, { sys_updated_on: -1 }, { name: 'updated_desc' });
    
    // Compound indexes for dashboard queries
    await createIndexSafe(collection, { ticketType: 1, assignment_group: 1, state: 1 }, { name: 'dashboard_compound' });
    await createIndexSafe(collection, { active: 1, sys_created_on: -1 }, { name: 'active_recent' });
    
    // Text search index for full-text search
    await createIndexSafe(collection, { 
      short_description: "text", 
      description: "text", 
      number: "text" 
    }, { name: 'text_search' });

    // SLM and audit indexes
    await createIndexSafe(collection, { "_syncedAt": -1 }, { name: 'sync_time' });
    await createIndexSafe(collection, { "slms.sla_id": 1 }, { name: 'sla_reference' });
    await createIndexSafe(collection, { "_hash": 1 }, { name: 'change_detection' });

    // Performance indexes for specific ticket types
    await createIndexSafe(collection, { 
      ticketType: 1, 
      priority: 1, 
      urgency: 1, 
      impact: 1 
    }, { 
      name: 'incident_priority', 
      partialFilterExpression: { ticketType: 'incident' } 
    });

    await createIndexSafe(collection, { 
      ticketType: 1, 
      change_request: 1, 
      planned_start_date: 1 
    }, { 
      name: 'change_task_scheduling', 
      partialFilterExpression: { ticketType: 'change_task' } 
    });

    await createIndexSafe(collection, { 
      ticketType: 1, 
      request: 1, 
      requested_for: 1 
    }, { 
      name: 'sc_task_request', 
      partialFilterExpression: { ticketType: 'sc_task' } 
    });

    console.log(' All indexes setup completed');
  }

  /**
   * Ensure connection is active
   */
  protected async ensureConnected(): Promise<void> {
    if (!this.isConnected || !this.client || !this.db || !this.ticketsCollection) {
      await this.initialize();
    }

    try {
      // Ping to verify connection is still active
      await this.client!.db('admin').command({ ping: 1 });
    } catch (error) {
      console.log(' Reconnecting to MongoDB...');
      this.isConnected = false;
      await this.initialize();
    }
  }

  /**
   * Get MongoDB client
   */
  public getClient(): MongoClient | null {
    return this.client;
  }

  /**
   * Get database instance
   */
  public getDatabase(): Db | null {
    return this.db;
  }

  /**
   * Get tickets collection
   */
  public getTicketsCollection(): Collection<TicketDocument> | null {
    return this.ticketsCollection;
  }

  /**
   * Check connection status
   */
  public isConnectionActive(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Shutdown connection gracefully
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.ticketsCollection = null;
      this.isConnected = false;
      console.log('📴 Enhanced Ticket Storage Service shutdown completed');
    }
  }
}