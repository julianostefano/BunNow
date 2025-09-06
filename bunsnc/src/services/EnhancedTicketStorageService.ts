/**
 * Enhanced Ticket Storage Service - Advanced MongoDB integration based on endpoint mapping analysis
 * Implements optimized schemas, indexing, and validation discovered from ServiceNow data analysis
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient, Collection, Db, CreateCollectionOptions } from 'mongodb';
import type { SLMRecord, TicketSLASummary } from '../types/servicenow';

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

export class EnhancedTicketStorageService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private ticketsCollection: Collection<TicketDocument> | null = null;
  private isConnected = false;
  private connectionConfig: any;

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

      console.log('✅ Enhanced Ticket Storage Service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Ticket Storage Service:', error);
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
            sys_id: {
              bsonType: "string",
              pattern: "^[a-f0-9]{32}$",
              description: "Must be a 32-character hex string"
            },
            number: {
              bsonType: "string",
              pattern: "^(INC|CTASK|SCTASK)[0-9]{7}$",
              description: "Must be a valid ServiceNow ticket number"
            },
            ticketType: {
              bsonType: "string",
              enum: ["incident", "change_task", "sc_task"],
              description: "Must be a valid ticket type"
            },
            short_description: {
              bsonType: "string",
              minLength: 1,
              maxLength: 160,
              description: "Required short description (1-160 chars)"
            },
            description: {
              bsonType: ["string", "null"],
              maxLength: 4000,
              description: "Optional detailed description"
            },
            state: {
              bsonType: "int",
              minimum: 1,
              maximum: 10,
              description: "State must be between 1-10"
            },
            priority: {
              bsonType: ["int", "null"],
              minimum: 1,
              maximum: 5,
              description: "Priority 1-5 (Critical to Planning)"
            },
            assignment_group: {
              bsonType: "string",
              minLength: 1,
              description: "Assignment group is required"
            },
            assigned_to: {
              bsonType: ["string", "null"],
              description: "Individual assignee sys_id"
            },
            caller_id: {
              bsonType: ["string", "null"],
              description: "Caller sys_id"
            },
            sys_created_on: {
              bsonType: "date",
              description: "Creation timestamp is required"
            },
            sys_updated_on: {
              bsonType: "date",
              description: "Update timestamp is required"
            },
            active: {
              bsonType: "bool",
              description: "Active flag"
            },
            _syncedAt: {
              bsonType: "date",
              description: "Sync timestamp"
            },
            _source: {
              bsonType: "string",
              enum: ["servicenow", "bunsnc"],
              description: "Data source identifier"
            }
          }
        }
      };

      const collectionOptions: CreateCollectionOptions = {
        validator: validationSchema,
        validationLevel: 'strict',
        validationAction: 'error'
      };

      await this.db.createCollection('tickets', collectionOptions);
      console.log('✅ Tickets collection created with validation schema');
    }

    // Create audit collection for change tracking
    const auditCollections = await this.db.listCollections({ name: 'ticket_audit' }).toArray();
    if (auditCollections.length === 0) {
      await this.db.createCollection('ticket_audit');
      console.log('✅ Ticket audit collection created');
    }
  }

  /**
   * Setup optimized indexes based on query patterns discovered in testing
   */
  private async setupIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const ticketsCollection = this.db.collection('tickets');
    const auditCollection = this.db.collection('ticket_audit');

    console.log('📊 Creating optimized indexes...');

    // Primary and unique indexes
    await ticketsCollection.createIndex({ "sys_id": 1 }, { unique: true, name: "idx_sys_id" });
    await ticketsCollection.createIndex({ "number": 1 }, { unique: true, name: "idx_number" });

    // Dashboard query optimization indexes
    await ticketsCollection.createIndex(
      { "ticketType": 1, "state": 1, "priority": -1 },
      { name: "idx_dashboard_type_state_priority" }
    );

    await ticketsCollection.createIndex(
      { "assignment_group": 1, "state": 1, "sys_created_on": -1 },
      { name: "idx_assignment_state_created" }
    );

    await ticketsCollection.createIndex(
      { "assigned_to": 1, "state": 1, "priority": -1 },
      { name: "idx_assignee_state_priority" }
    );

    // Time-based queries
    await ticketsCollection.createIndex(
      { "sys_created_on": -1 },
      { name: "idx_created_desc" }
    );

    await ticketsCollection.createIndex(
      { "sys_updated_on": -1 },
      { name: "idx_updated_desc" }
    );

    await ticketsCollection.createIndex(
      { "opened_at": -1 },
      { name: "idx_opened_desc" }
    );

    // SLA and performance tracking
    await ticketsCollection.createIndex(
      { "sla_due": 1, "state": 1 },
      { name: "idx_sla_monitoring", sparse: true }
    );

    // Sync and audit indexes
    await ticketsCollection.createIndex(
      { "_syncedAt": -1, "ticketType": 1 },
      { name: "idx_sync_tracking" }
    );

    await ticketsCollection.createIndex(
      { "_source": 1, "_version": 1 },
      { name: "idx_source_version" }
    );

    // Text search index
    await ticketsCollection.createIndex(
      { 
        "short_description": "text", 
        "description": "text",
        "number": "text"
      },
      { 
        name: "idx_text_search",
        weights: { "short_description": 10, "number": 5, "description": 1 }
      }
    );

    // Type-specific indexes
    await ticketsCollection.createIndex(
      { "ticketType": 1, "change_request": 1 },
      { name: "idx_change_task_parent", sparse: true }
    );

    await ticketsCollection.createIndex(
      { "ticketType": 1, "request": 1 },
      { name: "idx_sc_task_request", sparse: true }
    );

    // Caller and company tracking
    await ticketsCollection.createIndex(
      { "caller_id": 1, "sys_created_on": -1 },
      { name: "idx_caller_tracking", sparse: true }
    );

    await ticketsCollection.createIndex(
      { "company": 1, "state": 1 },
      { name: "idx_company_state", sparse: true }
    );

    // Audit collection indexes
    await auditCollection.createIndex(
      { "ticketId": 1, "changedAt": -1 },
      { name: "idx_audit_ticket_time" }
    );

    await auditCollection.createIndex(
      { "changedAt": -1 },
      { name: "idx_audit_time", expireAfterSeconds: 7776000 } // 90 days retention
    );

    console.log('✅ All indexes created successfully');
  }

  /**
   * Advanced upsert with change tracking and validation
   */
  async upsertTicket(ticketData: any, ticketType: 'incident' | 'change_task' | 'sc_task', slmData: SLMRecord[] = []): Promise<boolean> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      // Normalize and enrich the ticket data
      const normalizedTicket = this.normalizeTicketData(ticketData, ticketType);
      
      // Add SLM data following Python reference pattern
      normalizedTicket.slms = slmData;
      
      // Generate SLA summary from SLM data
      if (slmData.length > 0) {
        normalizedTicket.sla_summary = this.generateSLASummary(ticketData.number, slmData);
      }
      
      // Calculate hash for change detection (including ticket + SLM data)
      const currentHash = this.calculateDataHash(normalizedTicket);
      const currentSlmsHash = this.calculateSLMHash(slmData);
      
      // Check for existing ticket
      const existingTicket = await this.ticketsCollection.findOne({ sys_id: ticketData.sys_id });
      
      if (existingTicket) {
        // Skip if no changes detected in either ticket or SLM data
        if (existingTicket._hash === currentHash && existingTicket._slmsHash === currentSlmsHash) {
          return true; // No changes, skip update
        }
        
        // Track changes for audit
        await this.recordAuditTrail(existingTicket, normalizedTicket);
        
        // Update with incremented version
        normalizedTicket._version = (existingTicket._version || 1) + 1;
      }

      normalizedTicket._hash = currentHash;
      normalizedTicket._slmsHash = currentSlmsHash;

      // Perform upsert
      const result = await this.ticketsCollection.replaceOne(
        { sys_id: ticketData.sys_id },
        normalizedTicket,
        { upsert: true }
      );

      return result.acknowledged;

    } catch (error) {
      console.error(`❌ Error upserting ${ticketType} ticket ${ticketData.sys_id}:`, error);
      return false;
    }
  }

  /**
   * Advanced query with optimized filtering and pagination
   */
  async queryTickets(query: TicketQuery): Promise<QueryResult<TicketDocument>> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      // Build MongoDB filter
      const filter: any = {};

      if (query.ticketType && query.ticketType.length > 0) {
        filter.ticketType = { $in: query.ticketType };
      }

      if (query.state && query.state.length > 0) {
        filter.state = { $in: query.state };
      }

      if (query.assignment_group && query.assignment_group.length > 0) {
        filter.assignment_group = { $in: query.assignment_group };
      }

      if (query.priority && query.priority.length > 0) {
        filter.priority = { $in: query.priority };
      }

      if (query.dateRange) {
        const dateField = query.dateRange.field;
        const dateFilter: any = {};
        
        if (query.dateRange.start) {
          dateFilter.$gte = query.dateRange.start;
        }
        if (query.dateRange.end) {
          dateFilter.$lte = query.dateRange.end;
        }
        
        if (Object.keys(dateFilter).length > 0) {
          filter[dateField] = dateFilter;
        }
      }

      if (query.textSearch) {
        filter.$text = { $search: query.textSearch };
      }

      // Build sort
      const sort = query.sort || { sys_created_on: -1 };

      // Execute query with pagination
      const limit = Math.min(query.limit || 50, 1000); // Max 1000 results
      const skip = query.skip || 0;

      const [data, total] = await Promise.all([
        this.ticketsCollection
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.ticketsCollection.countDocuments(filter)
      ]);

      return {
        data,
        total,
        hasMore: skip + data.length < total,
        page: Math.floor(skip / limit) + 1,
        limit
      };

    } catch (error) {
      console.error('❌ Error querying tickets:', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics with optimized aggregation
   */
  async getDashboardStats(groupBy?: string): Promise<any> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const pipeline: any[] = [
        {
          $group: {
            _id: groupBy ? `$${groupBy}` : null,
            totalTickets: { $sum: 1 },
            activeTickets: {
              $sum: { $cond: [{ $ne: ["$state", 7] }, 1, 0] } // Assuming 7 is closed
            },
            byType: {
              $push: {
                ticketType: "$ticketType",
                state: "$state",
                priority: "$priority"
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            totalTickets: 1,
            activeTickets: 1,
            closedTickets: { $subtract: ["$totalTickets", "$activeTickets"] },
            incidentCount: {
              $size: {
                $filter: {
                  input: "$byType",
                  cond: { $eq: ["$$this.ticketType", "incident"] }
                }
              }
            },
            changeTaskCount: {
              $size: {
                $filter: {
                  input: "$byType",
                  cond: { $eq: ["$$this.ticketType", "change_task"] }
                }
              }
            },
            scTaskCount: {
              $size: {
                $filter: {
                  input: "$byType",
                  cond: { $eq: ["$$this.ticketType", "sc_task"] }
                }
              }
            }
          }
        }
      ];

      const results = await this.ticketsCollection.aggregate(pipeline).toArray();
      return results[0] || {
        totalTickets: 0,
        activeTickets: 0,
        closedTickets: 0,
        incidentCount: 0,
        changeTaskCount: 0,
        scTaskCount: 0
      };

    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get collection health metrics
   */
  async getHealthMetrics(): Promise<any> {
    await this.ensureConnected();
    if (!this.db || !this.ticketsCollection) throw new Error('Service not initialized');

    try {
      const [collStats, indexes, recentSyncs] = await Promise.all([
        this.db.command({ collStats: 'tickets' }),
        this.ticketsCollection.listIndexes().toArray(),
        this.ticketsCollection
          .find({ _syncedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
          .count()
      ]);

      return {
        collectionSize: collStats.size,
        documentCount: collStats.count,
        indexCount: indexes.length,
        avgDocumentSize: collStats.avgObjSize,
        recentSyncs24h: recentSyncs,
        indexes: indexes.map((idx: any) => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false
        }))
      };

    } catch (error) {
      console.error('❌ Error getting health metrics:', error);
      throw error;
    }
  }

  // Helper methods
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
    }
  }

  private normalizeTicketData(ticketData: any, ticketType: 'incident' | 'change_task' | 'sc_task'): TicketDocument {
    const baseTicket: BaseTicketDocument = {
      sys_id: ticketData.sys_id,
      number: ticketData.number,
      ticketType,
      short_description: ticketData.short_description || '',
      description: ticketData.description || null,
      state: parseInt(ticketData.state) || 1,
      priority: ticketData.priority ? parseInt(ticketData.priority) : null,
      assignment_group: ticketData.assignment_group || '',
      assigned_to: ticketData.assigned_to || null,
      caller_id: ticketData.caller_id || null,
      opened_at: ticketData.opened_at ? new Date(ticketData.opened_at) : null,
      closed_at: ticketData.closed_at ? new Date(ticketData.closed_at) : null,
      resolved_at: ticketData.resolved_at ? new Date(ticketData.resolved_at) : null,
      sys_created_on: new Date(ticketData.sys_created_on),
      sys_updated_on: new Date(ticketData.sys_updated_on),
      sys_created_by: ticketData.sys_created_by || null,
      sys_updated_by: ticketData.sys_updated_by || null,
      active: ticketData.active !== 'false' && ticketData.active !== false,
      category: ticketData.category || null,
      subcategory: ticketData.subcategory || null,
      _syncedAt: new Date(),
      _version: 1,
      _source: 'servicenow'
    };

    // Type-specific field handling
    switch (ticketType) {
      case 'incident':
        return {
          ...baseTicket,
          ticketType: 'incident',
          incident_state: ticketData.incident_state ? parseInt(ticketData.incident_state) : null,
          severity: ticketData.severity ? parseInt(ticketData.severity) : null,
          urgency: ticketData.urgency ? parseInt(ticketData.urgency) : null,
          impact: ticketData.impact ? parseInt(ticketData.impact) : null,
          problem_id: ticketData.problem_id || null,
          cmdb_ci: ticketData.cmdb_ci || null,
          business_service: ticketData.business_service || null,
          sla_due: ticketData.sla_due ? new Date(ticketData.sla_due) : null
        } as IncidentDocument;

      case 'change_task':
        return {
          ...baseTicket,
          ticketType: 'change_task',
          change_request: ticketData.change_request || '',
          planned_start_date: ticketData.planned_start_date ? new Date(ticketData.planned_start_date) : null,
          planned_end_date: ticketData.planned_end_date ? new Date(ticketData.planned_end_date) : null,
          implementation_plan: ticketData.implementation_plan || null,
          test_plan: ticketData.test_plan || null
        } as ChangeTaskDocument;

      case 'sc_task':
        return {
          ...baseTicket,
          ticketType: 'sc_task',
          request: ticketData.request || '',
          request_item: ticketData.request_item || '',
          requested_for: ticketData.requested_for || '',
          price: ticketData.price ? parseFloat(ticketData.price) : null,
          quantity: ticketData.quantity ? parseInt(ticketData.quantity) : null
        } as SCTaskDocument;

      default:
        throw new Error(`Unsupported ticket type: ${ticketType}`);
    }
  }

  private calculateDataHash(data: any): string {
    // Simple hash calculation for change detection
    const str = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Calculate hash specifically for SLM data to detect changes
   */
  private calculateSLMHash(slmData: SLMRecord[]): string {
    if (!slmData || slmData.length === 0) return '';
    
    // Sort SLMs by sys_id for consistent hashing
    const sortedSLMs = [...slmData].sort((a, b) => a.sys_id.localeCompare(b.sys_id));
    return this.calculateDataHash(sortedSLMs);
  }

  /**
   * Generate SLA summary from SLM data following Python patterns
   */
  private generateSLASummary(ticketNumber: string, slmData: SLMRecord[]): TicketSLASummary {
    const breachedSLAs = slmData.filter(slm => this.parseBoolean(slm.taskslatable_has_breached));
    const activeSLAs = slmData.filter(slm => slm.taskslatable_stage && slm.taskslatable_stage !== 'completed');
    
    // Find the worst breached SLA (highest business percentage)
    const worstSLA = breachedSLAs
      .map(slm => ({
        sla_name: slm.taskslatable_sla || 'Unknown SLA',
        has_breached: true,
        business_percentage: this.parsePercentage(slm.taskslatable_business_percentage),
        start_time: slm.taskslatable_start_time,
        end_time: slm.taskslatable_end_time,
        stage: slm.taskslatable_stage || 'unknown',
        breach_time: slm.taskslatable_end_time
      }))
      .sort((a, b) => b.business_percentage - a.business_percentage)[0] || null;

    const allSLAs = slmData.map(slm => ({
      sla_name: slm.taskslatable_sla || 'Unknown SLA',
      has_breached: this.parseBoolean(slm.taskslatable_has_breached),
      business_percentage: this.parsePercentage(slm.taskslatable_business_percentage),
      start_time: slm.taskslatable_start_time,
      end_time: slm.taskslatable_end_time,
      stage: slm.taskslatable_stage || 'unknown',
      breach_time: this.parseBoolean(slm.taskslatable_has_breached) ? slm.taskslatable_end_time : undefined
    }));

    return {
      ticket_number: ticketNumber,
      total_slas: slmData.length,
      active_slas: activeSLAs.length,
      breached_slas: breachedSLAs.length,
      breach_percentage: slmData.length > 0 ? (breachedSLAs.length / slmData.length) * 100 : 0,
      worst_sla: worstSLA,
      all_slas: allSLAs
    };
  }

  /**
   * Helper methods for SLM data processing
   */
  private parseBoolean(value: string | boolean): boolean {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }

  private parsePercentage(value: string | null): number {
    if (!value) return 0;
    const cleaned = value.replace('%', '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  private async recordAuditTrail(oldTicket: TicketDocument, newTicket: TicketDocument): Promise<void> {
    if (!this.db) return;

    try {
      const auditCollection = this.db.collection('ticket_audit');
      
      // Find changed fields
      const changes: any[] = [];
      
      for (const [key, newValue] of Object.entries(newTicket)) {
        if (key.startsWith('_')) continue; // Skip internal fields
        
        const oldValue = (oldTicket as any)[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({
            field: key,
            oldValue,
            newValue,
            type: this.getChangeType(oldValue, newValue)
          });
        }
      }

      if (changes.length > 0) {
        await auditCollection.insertOne({
          ticketId: newTicket.sys_id,
          ticketNumber: newTicket.number,
          ticketType: newTicket.ticketType,
          changes,
          changedAt: new Date(),
          syncVersion: newTicket._version,
          source: 'servicenow_sync'
        });
      }

    } catch (error) {
      console.error('❌ Error recording audit trail:', error);
      // Don't throw - audit failure shouldn't break sync
    }
  }

  private getChangeType(oldValue: any, newValue: any): string {
    if (oldValue === null || oldValue === undefined) return 'create';
    if (newValue === null || newValue === undefined) return 'delete';
    return 'update';
  }

  /**
   * Combined ticket + SLM upsert following Python reference pattern
   * Stores tickets together with SLM data in unified document structure
   */
  async upsertTicketWithSLMs(ticketData: any, ticketType: 'incident' | 'change_task' | 'sc_task', slmData: SLMRecord[]): Promise<boolean> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      console.log(`📋 Upserting ${ticketType} ${ticketData.number} with ${slmData.length} SLMs`);
      
      // Create document following Python JSONB pattern: {"incident|sctask|ctask": data, "slms": slm_data, "sync_timestamp": timestamp}
      const document = {
        sys_id: ticketData.sys_id,
        number: ticketData.number,
        ticketType: ticketType,
        
        // Primary ticket data
        [ticketType]: ticketData,
        
        // SLM data array
        slms: slmData,
        
        // Sync metadata (following Python pattern)
        sync_timestamp: new Date().toISOString(),
        collection_version: '1.0',
        
        // Enhanced fields for MongoDB optimization
        short_description: ticketData.short_description,
        state: ticketData.state,
        assignment_group: ticketData.assignment_group,
        priority: ticketData.priority,
        sys_updated_on: new Date(ticketData.sys_updated_on),
        _syncedAt: new Date(),
        _source: 'servicenow',
        active: ticketData.active !== false,
        
        // SLA summary for quick querying
        sla_summary: slmData.length > 0 ? this.generateSLASummary(ticketData.number, slmData) : null,
        
        // Hash-based change detection
        _hash: this.calculateDataHash(ticketData),
        _slmsHash: this.calculateSLMHash(slmData)
      } as any;

      // Perform upsert with MongoDB's replaceOne (same behavior as PostgreSQL upsert)
      const result = await this.ticketsCollection.replaceOne(
        { sys_id: ticketData.sys_id },
        document,
        { upsert: true }
      );

      if (result.acknowledged) {
        const action = result.upsertedId ? 'inserted' : 'updated';
        console.log(`✅ Successfully ${action} ${ticketType} ${ticketData.number} with ${slmData.length} SLMs`);
        return true;
      }

      return false;

    } catch (error) {
      console.error(`❌ Error upserting ${ticketType} ${ticketData.sys_id} with SLMs:`, error);
      return false;
    }
  }

  /**
   * Get tickets with their SLA information
   */
  async getTicketsWithSLAs(query: Partial<TicketQuery> = {}): Promise<QueryResult<TicketDocument>> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const filter: any = {};
      
      if (query.ticketType) {
        filter.ticketType = { $in: query.ticketType };
      }
      
      if (query.assignment_group) {
        filter.assignment_group = { $in: query.assignment_group };
      }

      // Only return tickets that have SLA data
      filter['sla_summary'] = { $exists: true, $ne: null };

      const cursor = this.ticketsCollection.find(filter);
      
      if (query.limit) {
        cursor.limit(query.limit);
      }
      
      if (query.skip) {
        cursor.skip(query.skip);
      }

      const tickets = await cursor.toArray();
      const total = await this.ticketsCollection.countDocuments(filter);

      return {
        data: tickets,
        total,
        hasMore: query.skip ? (query.skip + tickets.length) < total : tickets.length < total,
        page: query.skip && query.limit ? Math.floor(query.skip / query.limit) + 1 : 1,
        limit: query.limit
      };

    } catch (error) {
      console.error('Error querying tickets with SLAs:', error);
      throw error;
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('✅ Enhanced Ticket Storage Service shut down gracefully');
    }
  }
}

// Singleton instance
export const enhancedTicketStorageService = new EnhancedTicketStorageService();