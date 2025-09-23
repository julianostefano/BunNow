/**
 * Ticket Repository - MongoDB Operations with Validation and Indexing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  MongoClient,
  Db,
  Collection,
  CreateIndexesOptions,
  IndexSpecification,
} from "mongodb";
import {
  TicketSchema,
  IncidentSchema,
  ChangeTaskSchema,
  ServiceRequestTaskSchema,
  TicketAuditLog,
  TicketCollections,
  TicketValidation,
} from "../schemas/TicketSchemas";

export class TicketRepository {
  private db: Db;
  private client: MongoClient | null;

  constructor(db: Db, dbName: string = "bunsnc_tickets") {
    this.client = null; // Not needed when passed Database directly
    this.db = db;
  }

  /**
   * Initialize collections and indexes
   */
  async initialize(): Promise<void> {
    console.log(
      " Initializing TicketRepository with collections and indexes...",
    );

    await this.createCollections();
    await this.createIndexes();
    await this.createValidationRules();

    console.log(" TicketRepository initialized successfully");
  }

  /**
   * Create collections if they don't exist
   */
  private async createCollections(): Promise<void> {
    const collections = Object.values(TicketCollections);

    for (const collectionName of collections) {
      const exists = await this.db
        .listCollections({ name: collectionName })
        .hasNext();
      if (!exists) {
        await this.db.createCollection(collectionName);
        console.log(`📦 Created collection: ${collectionName}`);
      }
    }
  }

  /**
   * Create indexes for optimal performance
   */
  private async createIndexes(): Promise<void> {
    const indexSpecs = this.getIndexSpecifications();

    for (const [collectionName, indexes] of Object.entries(indexSpecs)) {
      const collection = this.db.collection(collectionName);

      for (const index of indexes) {
        try {
          await collection.createIndex(index.spec, index.options);
          console.log(
            ` Created index on ${collectionName}: ${JSON.stringify(index.spec)}`,
          );
        } catch (error: unknown) {
          console.warn(` Failed to create index on ${collectionName}:`, error);
        }
      }
    }
  }

  /**
   * Get index specifications for all collections
   */
  private getIndexSpecifications(): Record<
    string,
    Array<{ spec: IndexSpecification; options?: CreateIndexesOptions }>
  > {
    const commonIndexes = [
      { spec: { sys_id: 1 }, options: { unique: true } },
      { spec: { number: 1 }, options: { unique: true } },
      { spec: { state: 1 } },
      { spec: { priority: 1 } },
      { spec: { assignment_group: 1 } },
      { spec: { assigned_to: 1 } },
      { spec: { opened_at: -1 } },
      { spec: { sys_updated_on: -1 } },
      { spec: { last_synced: -1 } },
      { spec: { sync_status: 1 } },
      // Compound indexes for common queries
      { spec: { state: 1, assignment_group: 1 } },
      { spec: { state: 1, priority: 1 } },
      { spec: { assignment_group: 1, state: 1, opened_at: -1 } },
      // Text search index
      {
        spec: {
          short_description: "text",
          description: "text",
          work_notes: "text",
        },
      },
    ];

    return {
      [TicketCollections.INCIDENTS]: [
        ...commonIndexes,
        { spec: { caller_id: 1 } },
        { spec: { problem_id: 1 } },
        { spec: { category: 1, subcategory: 1 } },
      ],
      [TicketCollections.CHANGE_TASKS]: [
        ...commonIndexes,
        { spec: { change_request: 1 } },
        { spec: { change_request_number: 1 } },
        { spec: { planned_start_date: 1 } },
        { spec: { planned_end_date: 1 } },
      ],
      [TicketCollections.SERVICE_REQUESTS]: [
        ...commonIndexes,
        { spec: { request: 1 } },
        { spec: { request_number: 1 } },
        { spec: { requested_for: 1 } },
        { spec: { catalog_item: 1 } },
      ],
      [TicketCollections.AUDIT_LOG]: [
        { spec: { ticket_sys_id: 1, performed_at: -1 } },
        { spec: { ticket_table: 1, action: 1, performed_at: -1 } },
        { spec: { performed_at: -1 } },
        { spec: { performed_by: 1, performed_at: -1 } },
      ],
    };
  }

  /**
   * Create validation rules for collections
   */
  private async createValidationRules(): Promise<void> {
    // MongoDB schema validation rules
    const validationRules = {
      [TicketCollections.INCIDENTS]: {
        $jsonSchema: {
          bsonType: "object",
          required: [
            "sys_id",
            "number",
            "table",
            "state",
            "short_description",
            "priority",
            "opened_at",
            "caller_id",
          ],
          properties: {
            sys_id: { bsonType: "string", minLength: 1 },
            number: { bsonType: "string", minLength: 1 },
            table: { enum: ["incident"] },
            state: { enum: TicketValidation.states.incident },
            priority: { enum: TicketValidation.priorities },
            sync_status: { enum: TicketValidation.syncStatuses },
          },
        },
      },
    };

    for (const [collectionName, validation] of Object.entries(
      validationRules,
    )) {
      try {
        await this.db.command({
          collMod: collectionName,
          validator: validation,
        });
        console.log(` Applied validation rules to ${collectionName}`);
      } catch (error: unknown) {
        console.warn(
          ` Failed to apply validation to ${collectionName}:`,
          error,
        );
      }
    }
  }

  /**
   * Save ticket with validation
   */
  async saveTicket(ticket: TicketSchema): Promise<void> {
    this.validateTicket(ticket);

    const collection = this.getCollectionForTable(ticket.table);
    const now = new Date();

    const ticketData = {
      ...ticket,
      last_synced: now,
      sync_status: "synced" as const,
    };

    await collection.replaceOne({ sys_id: ticket.sys_id }, ticketData, {
      upsert: true,
    });

    console.log(`💾 Saved ${ticket.table}/${ticket.sys_id} to MongoDB`);
  }

  /**
   * Get ticket by sys_id and table
   */
  async getTicket(sysId: string, table: string): Promise<TicketSchema | null> {
    const collection = this.getCollectionForTable(table);
    return (await collection.findOne({ sys_id: sysId })) as TicketSchema | null;
  }

  /**
   * Get tickets by query with pagination
   */
  async getTickets(
    table: string,
    filter: any = {},
    options: { skip?: number; limit?: number; sort?: any } = {},
  ): Promise<TicketSchema[]> {
    const collection = this.getCollectionForTable(table);

    const query = collection.find(filter);

    if (options.sort) query.sort(options.sort);
    if (options.skip) query.skip(options.skip);
    if (options.limit) query.limit(options.limit);

    return (await query.toArray()) as TicketSchema[];
  }

  /**
   * Update ticket with audit logging
   */
  async updateTicket(
    sysId: string,
    table: string,
    updates: Partial<TicketSchema>,
    performedBy: string = "system",
  ): Promise<void> {
    const collection = this.getCollectionForTable(table);
    const existingTicket = await this.getTicket(sysId, table);

    if (!existingTicket) {
      throw new Error(`Ticket ${table}/${sysId} not found`);
    }

    const updatedData = {
      ...updates,
      sys_updated_on: new Date(),
      last_synced: new Date(),
      sync_status: "synced" as const,
    };

    await collection.updateOne({ sys_id: sysId }, { $set: updatedData });

    // Log changes to audit collection
    await this.logAudit({
      ticket_sys_id: sysId,
      ticket_table: table,
      ticket_number: existingTicket.number,
      action: "updated",
      changes: this.getChanges(existingTicket, updatedData),
      performed_by: performedBy,
      performed_at: new Date(),
      source: "bunsnc",
    });

    console.log(`✏️ Updated ${table}/${sysId} in MongoDB`);
  }

  /**
   * Search tickets with text search
   */
  async searchTickets(
    table: string,
    searchText: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<TicketSchema[]> {
    const collection = this.getCollectionForTable(table);

    const query = collection
      .find(
        {
          $text: { $search: searchText },
        },
        {
          score: { $meta: "textScore" },
        },
      )
      .sort({
        score: { $meta: "textScore" },
      });

    if (options.skip) query.skip(options.skip);
    if (options.limit) query.limit(options.limit);

    return (await query.toArray()) as TicketSchema[];
  }

  /**
   * Get tickets needing sync
   */
  async getTicketsNeedingSync(table: string): Promise<TicketSchema[]> {
    const collection = this.getCollectionForTable(table);
    return (await collection
      .find({
        sync_status: { $in: ["pending", "error"] },
      })
      .toArray()) as TicketSchema[];
  }

  /**
   * Mark ticket sync status
   */
  async markSyncStatus(
    sysId: string,
    table: string,
    status: "synced" | "pending" | "error",
    error?: string,
  ): Promise<void> {
    const collection = this.getCollectionForTable(table);

    const update: any = {
      sync_status: status,
      last_synced: new Date(),
    };

    if (error) {
      update.sync_error = error;
    } else {
      update.$unset = { sync_error: 1 };
    }

    await collection.updateOne({ sys_id: sysId }, { $set: update });
  }

  /**
   * Log audit entry
   */
  async logAudit(auditEntry: TicketAuditLog): Promise<void> {
    const auditCollection = this.db.collection(TicketCollections.AUDIT_LOG);
    await auditCollection.insertOne(auditEntry);
  }

  /**
   * Get audit history for ticket
   */
  async getAuditHistory(sysId: string): Promise<TicketAuditLog[]> {
    const auditCollection = this.db.collection(TicketCollections.AUDIT_LOG);
    return (await auditCollection
      .find({ ticket_sys_id: sysId })
      .sort({ performed_at: -1 })
      .toArray()) as TicketAuditLog[];
  }

  /**
   * Get collection for table type
   */
  private getCollectionForTable(table: string): Collection<TicketSchema> {
    const collectionMap: Record<string, string> = {
      incident: TicketCollections.INCIDENTS,
      change_task: TicketCollections.CHANGE_TASKS,
      sc_task: TicketCollections.SERVICE_REQUESTS,
    };

    const collectionName = collectionMap[table];
    if (!collectionName) {
      throw new Error(`Unsupported table type: ${table}`);
    }

    return this.db.collection(collectionName);
  }

  /**
   * Validate ticket data
   */
  private validateTicket(ticket: TicketSchema): void {
    const requiredFields = [
      ...TicketValidation.required.all,
      ...(TicketValidation.required[
        ticket.table as keyof typeof TicketValidation.required
      ] || []),
    ];

    for (const field of requiredFields) {
      if (!ticket[field as keyof TicketSchema]) {
        throw new Error(
          `Missing required field: ${field} for table ${ticket.table}`,
        );
      }
    }

    // Validate state
    const validStates =
      TicketValidation.states[
        ticket.table as keyof typeof TicketValidation.states
      ];
    if (validStates && !validStates.includes(ticket.state)) {
      throw new Error(
        `Invalid state '${ticket.state}' for table ${ticket.table}. Valid states: ${validStates.join(", ")}`,
      );
    }

    // Validate priority
    if (!TicketValidation.priorities.includes(ticket.priority)) {
      throw new Error(
        `Invalid priority '${ticket.priority}'. Valid priorities: ${TicketValidation.priorities.join(", ")}`,
      );
    }
  }

  /**
   * Get changes between old and new ticket data
   */
  private getChanges(
    oldData: any,
    newData: any,
  ): Record<string, { old_value?: any; new_value: any }> {
    const changes: Record<string, { old_value?: any; new_value: any }> = {};

    for (const [key, newValue] of Object.entries(newData)) {
      const oldValue = oldData[key];
      if (oldValue !== newValue) {
        changes[key] = { old_value: oldValue, new_value: newValue };
      }
    }

    return changes;
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    for (const [key, collectionName] of Object.entries(TicketCollections)) {
      const collection = this.db.collection(collectionName);
      const count = await collection.countDocuments();
      const syncPending = await collection.countDocuments({
        sync_status: "pending",
      });
      const syncError = await collection.countDocuments({
        sync_status: "error",
      });

      stats[key.toLowerCase()] = {
        total: count,
        sync_pending: syncPending,
        sync_error: syncError,
        collection: collectionName,
      };
    }

    return stats;
  }
}

// Export singleton instance (initialized when needed)
import { mongoClient } from "../config/mongodb";

// Create a lazy-loaded repository that connects to MongoDB when first used
export const ticketRepository = {
  _instance: null as TicketRepository | null,

  async getInstance(): Promise<TicketRepository> {
    if (!this._instance) {
      // Ensure MongoDB is connected
      if (!mongoClient.getDatabase) {
        await mongoClient.connect();
      }

      // Create repository with the connected MongoDB database
      this._instance = new TicketRepository(mongoClient.getDatabase());
    }
    return this._instance;
  },
};
