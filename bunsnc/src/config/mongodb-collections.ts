/**
 * MongoDB Specialized Collections for ServiceNow Tickets
 * Based on Python collectors: incident_jsonb.py, sctask_jsonb.py, ctask_jsonb.py
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface SLMData {
  sys_id: string;
  inc_number?: string;
  task_number?: string;
  taskslatable_business_percentage: string;
  taskslatable_start_time: string;
  taskslatable_end_time: string;
  taskslatable_sla: string;
  taskslatable_stage: string;
  taskslatable_has_breached: string;
  assignment_group: string;
  raw_data: any;
}

export interface IncidentDocument {
  _id?: string;
  sys_id: string;
  number: string;
  data: {
    incident: any;
    slms: SLMData[];
    sync_timestamp: string;
    collection_version: string;
  };
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string; // Para particionamento
}

export interface ChangeTaskDocument {
  _id?: string;
  sys_id: string;
  number: string;
  data: {
    change_task: any;
    slms: SLMData[];
    sync_timestamp: string;
    collection_version: string;
  };
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string;
}

export interface SCTaskDocument {
  _id?: string;
  sys_id: string;
  number: string;
  data: {
    sc_task: any;
    slms: SLMData[];
    sync_timestamp: string;
    collection_version: string;
  };
  created_at: Date;
  updated_at: Date;
  sys_id_prefix: string;
}

export interface GroupData {
  nome: string;
  tags: string[];
  descricao: string;
  responsavel: string;
  temperatura: number;
}

export interface GroupDocument {
  _id?: string;
  id: number;
  data: GroupData; // Parsed JSON data
  raw_data: string; // Original JSON string
  created_at: Date;
  updated_at: Date;
}

// Collection names following Python scripts pattern
export const COLLECTION_NAMES = {
  INCIDENTS: "sn_incidents_collection",
  CHANGE_TASKS: "sn_ctasks_collection",
  SC_TASKS: "sn_sctasks_collection",
  GROUPS: "sn_groups",
} as const;

export type CollectionName =
  (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];

import { MongoClient, Db, Collection, IndexSpecification } from "mongodb";
import { dataService } from "../services/ConsolidatedDataService";

export interface CollectionConfig {
  name: string;
  indexes: IndexSpecification[];
  shardKey?: object;
  validation?: object;
}

export const COLLECTION_CONFIGS: CollectionConfig[] = [
  {
    name: COLLECTION_NAMES.INCIDENTS,
    indexes: [
      { sys_id: 1 }, // Primary lookup
      { number: 1 }, // Ticket number lookup
      { "data.incident.state": 1, updated_at: -1 }, // State-based queries
      { "data.incident.priority": 1, created_at: -1 }, // Priority sorting
      { "data.incident.assignment_group": 1 }, // Group-based queries
      { sys_id_prefix: 1, created_at: -1 }, // Partitioning support
      { updated_at: -1 }, // Time-based queries
      { "data.sync_timestamp": -1 }, // Sync tracking
      // Compound indexes for complex queries
      { "data.incident.state": 1, "data.incident.priority": 1, updated_at: -1 },
      { "data.incident.assignment_group": 1, "data.incident.state": 1 },
    ],
    shardKey: { sys_id_prefix: 1, sys_id: 1 },
    validation: {
      $jsonSchema: {
        bsonType: "object",
        required: ["sys_id", "number", "data", "created_at", "updated_at"],
        properties: {
          sys_id: { bsonType: "string", minLength: 32, maxLength: 32 },
          number: { bsonType: "string", pattern: "^INC[0-9]{7}$" },
          data: {
            bsonType: "object",
            required: ["incident", "slms", "sync_timestamp"],
            properties: {
              sync_timestamp: { bsonType: "string" },
              collection_version: { bsonType: "string" },
            },
          },
        },
      },
    },
  },
  {
    name: COLLECTION_NAMES.CHANGE_TASKS,
    indexes: [
      { sys_id: 1 },
      { number: 1 },
      { "data.change_task.state": 1, updated_at: -1 },
      { "data.change_task.priority": 1, created_at: -1 },
      { "data.change_task.assignment_group": 1 },
      { "data.change_task.change_request": 1 }, // Parent change reference
      { sys_id_prefix: 1, created_at: -1 },
      { updated_at: -1 },
      { "data.sync_timestamp": -1 },
    ],
    shardKey: { sys_id_prefix: 1, sys_id: 1 },
  },
  {
    name: COLLECTION_NAMES.SC_TASKS,
    indexes: [
      { sys_id: 1 },
      { number: 1 },
      { "data.sc_task.state": 1, updated_at: -1 },
      { "data.sc_task.priority": 1, created_at: -1 },
      { "data.sc_task.assignment_group": 1 },
      { "data.sc_task.request": 1 }, // Parent service request
      { sys_id_prefix: 1, created_at: -1 },
      { updated_at: -1 },
      { "data.sync_timestamp": -1 },
    ],
    shardKey: { sys_id_prefix: 1, sys_id: 1 },
  },
  {
    name: COLLECTION_NAMES.GROUPS,
    indexes: [
      { id: 1 }, // Primary key
      { "data.nome": 1 }, // Group name search
      { "data.tags": 1 }, // Tag-based search
      { "data.responsavel": 1 }, // Responsible person search
      { "data.temperatura": 1 }, // Temperature-based filtering
      { created_at: -1 }, // Time-based sorting
      { updated_at: -1 },
      // Compound indexes for complex queries
      { "data.nome": 1, "data.temperatura": 1 },
      { "data.responsavel": 1, created_at: -1 },
    ],
    validation: {
      $jsonSchema: {
        bsonType: "object",
        required: ["id", "data", "raw_data", "created_at", "updated_at"],
        properties: {
          id: { bsonType: "number" },
          data: {
            bsonType: "object",
            required: [
              "nome",
              "tags",
              "descricao",
              "responsavel",
              "temperatura",
            ],
            properties: {
              nome: { bsonType: "string", minLength: 1 },
              tags: { bsonType: "array", items: { bsonType: "string" } },
              descricao: { bsonType: "string" },
              responsavel: { bsonType: "string", minLength: 1 },
              temperatura: { bsonType: "number", minimum: 1, maximum: 10 },
            },
          },
          raw_data: { bsonType: "string", minLength: 1 },
        },
      },
    },
  },
  // SLA Collections
  {
    name: "slas",
    indexes: [
      { ticket_sys_id: 1 }, // Primary SLA lookup by ticket
      { sys_id: 1 },
      { ticket_table: 1, status: 1, updated_at: -1 },
      { priority: 1, breached: 1 },
      { status: 1, remaining_time_hours: 1 }, // Near breach queries
      { created_at: -1 },
      { updated_at: -1 },
      // Compound indexes for analytics
      { ticket_table: 1, priority: 1, breached: 1 },
      { created_at: 1, ticket_table: 1, priority: 1 },
    ],
  },
  // System Collections
  {
    name: "access_logs",
    indexes: [
      { timestamp: -1 },
      { user: 1, timestamp: -1 },
      { endpoint: 1, timestamp: -1 },
      { status_code: 1, timestamp: -1 },
    ],
  },
  {
    name: "error_logs",
    indexes: [
      { timestamp: -1 },
      { level: 1, timestamp: -1 },
      { service: 1, timestamp: -1 },
    ],
  },
  {
    name: "sync_status",
    indexes: [
      { table_name: 1, timestamp: -1 },
      { status: 1, timestamp: -1 },
      { timestamp: -1 },
    ],
  },
  {
    name: "performance_metrics",
    indexes: [
      { timestamp: -1 },
      { operation: 1, timestamp: -1 },
      { endpoint: 1, timestamp: -1 },
    ],
  },
];

export class MongoDBCollectionManager {
  private db: Db | null = null;

  constructor() {
    // Do not initialize database in constructor - use lazy loading
  }

  private getDatabase(): Db {
    if (!this.db) {
      try {
        // Access the MongoDB database through the mongoManager within dataService
        if (dataService && dataService.mongoManager) {
          this.db = dataService.mongoManager.getDb();
        } else {
          throw new Error("DataService or mongoManager not initialized");
        }
      } catch (error) {
        throw new Error(
          `MongoDB collections manager requires dataService.mongoManager to be initialized: ${error.message}`,
        );
      }
    }
    return this.db;
  }

  /**
   * Initialize all collections with indexes and configurations
   */
  async initializeCollections(): Promise<void> {
    console.log("📂 [MongoDB] Initializing collections and indexes...");

    for (const config of COLLECTION_CONFIGS) {
      try {
        await this.ensureCollection(config);
        console.log(` [MongoDB] Collection '${config.name}' configured`);
      } catch (error) {
        console.error(
          ` [MongoDB] Failed to configure collection '${config.name}':`,
          error,
        );
        throw error;
      }
    }

    console.log("🎯 [MongoDB] All collections initialized successfully");
  }

  /**
   * Ensure collection exists with proper configuration
   */
  private async ensureCollection(config: CollectionConfig): Promise<void> {
    const collection = this.getDatabase().collection(config.name);

    // Create collection if it doesn't exist
    try {
      await this.getDatabase().createCollection(config.name, {
        validator: config.validation,
      });
    } catch (error: any) {
      // Collection might already exist, that's fine
      if (!error.message.includes("already exists")) {
        throw error;
      }
    }

    // Create indexes with conflict resolution
    if (config.indexes && config.indexes.length > 0) {
      await this.createIndexesSafely(collection, config.indexes);
    }

    // Configure sharding if specified
    if (config.shardKey) {
      try {
        await this.getDatabase()
          .admin()
          .command({
            shardCollection: `${this.getDatabase().databaseName}.${config.name}`,
            key: config.shardKey,
          });
      } catch (error: any) {
        // Sharding might not be available or already configured
        if (!error.message.includes("already sharded")) {
          console.warn(
            ` [MongoDB] Sharding not available for ${config.name}:`,
            error.message,
          );
        }
      }
    }
  }

  /**
   * Create indexes safely with conflict resolution
   */
  private async createIndexesSafely(
    collection: Collection,
    indexSpecs: any[],
  ): Promise<void> {
    try {
      // Get existing indexes to check for conflicts
      const existingIndexes = await collection.indexInformation();

      for (const indexSpec of indexSpecs) {
        try {
          // Determine if this should be a unique index (for sys_id fields)
          const isUniqueIndex = this.shouldBeUniqueIndex(indexSpec);

          const indexOptions: any = {
            background: true,
          };

          if (isUniqueIndex) {
            indexOptions.unique = true;
          }

          // Generate index name that MongoDB would create
          const indexName = this.generateIndexName(indexSpec);

          // Check if an index with this name already exists
          if (existingIndexes[indexName]) {
            const existingIndex = existingIndexes[indexName];

            // Check if the existing index has different options (like unique)
            if (this.isIndexConflicting(existingIndex, indexOptions)) {
              console.log(
                ` [MongoDB] Dropping conflicting index '${indexName}' to recreate with correct options`,
              );
              await collection.dropIndex(indexName);
            } else {
              console.log(
                ` [MongoDB] Index '${indexName}' already exists with correct configuration`,
              );
              continue;
            }
          }

          // Create the index
          await collection.createIndex(indexSpec, indexOptions);
          console.log(
            ` [MongoDB] Created index '${indexName}'${isUniqueIndex ? " (unique)" : ""}`,
          );
        } catch (indexError: any) {
          // Handle specific MongoDB errors gracefully
          if (indexError.code === 86) {
            // IndexKeySpecsConflict
            console.warn(
              ` [MongoDB] Index conflict for ${JSON.stringify(indexSpec)}: ${indexError.message}`,
            );
          } else {
            console.warn(
              ` [MongoDB] Failed to create index ${JSON.stringify(indexSpec)}:`,
              indexError.message,
            );
          }
        }
      }
    } catch (error: any) {
      console.warn(` [MongoDB] Error during index creation:`, error.message);
    }
  }

  /**
   * Check if an index should be unique (sys_id fields)
   */
  private shouldBeUniqueIndex(indexSpec: any): boolean {
    // Check if this is a sys_id index
    if (typeof indexSpec === "object" && indexSpec.sys_id === 1) {
      return true;
    }
    return false;
  }

  /**
   * Generate index name the same way MongoDB does
   */
  private generateIndexName(indexSpec: any): string {
    if (typeof indexSpec === "object") {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(indexSpec)) {
        parts.push(`${key}_${value}`);
      }
      return parts.join("_");
    }
    return String(indexSpec);
  }

  /**
   * Check if existing index conflicts with desired options
   */
  private isIndexConflicting(existingIndex: any, desiredOptions: any): boolean {
    // Check unique constraint mismatch
    if (desiredOptions.unique && !existingIndex.unique) {
      return true;
    }
    if (!desiredOptions.unique && existingIndex.unique) {
      return true;
    }
    return false;
  }

  /**
   * Get collection by name with proper typing
   */
  getCollection<T = any>(name: CollectionName | string): Collection<T> {
    return this.getDatabase().collection<T>(name);
  }

  /**
   * Get incidents collection
   */
  getIncidentsCollection(): Collection<IncidentDocument> {
    return this.getCollection<IncidentDocument>(COLLECTION_NAMES.INCIDENTS);
  }

  /**
   * Get change tasks collection
   */
  getChangeTasksCollection(): Collection<ChangeTaskDocument> {
    return this.getCollection<ChangeTaskDocument>(
      COLLECTION_NAMES.CHANGE_TASKS,
    );
  }

  /**
   * Get service request tasks collection
   */
  getSCTasksCollection(): Collection<SCTaskDocument> {
    return this.getCollection<SCTaskDocument>(COLLECTION_NAMES.SC_TASKS);
  }

  /**
   * Get groups collection
   */
  getGroupsCollection(): Collection<GroupDocument> {
    return this.getCollection<GroupDocument>(COLLECTION_NAMES.GROUPS);
  }

  /**
   * Collection health check
   */
  async getCollectionStats(): Promise<any> {
    const stats: any = {};

    for (const config of COLLECTION_CONFIGS) {
      try {
        const collection = this.getCollection(config.name);
        const collStats = await this.getDatabase().command({
          collStats: config.name,
        });
        const indexStats = await collection.indexInformation();

        stats[config.name] = {
          documents: collStats.count,
          size: collStats.size,
          avgObjSize: collStats.avgObjSize,
          indexes: Object.keys(indexStats).length,
          indexSizes: collStats.indexSizes,
        };
      } catch (error) {
        stats[config.name] = { error: String(error) };
      }
    }

    return stats;
  }

  /**
   * Cleanup old documents based on retention policy
   */
  async cleanupOldDocuments(retentionDays: number = 90): Promise<void> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    console.log(
      `🧹 [MongoDB] Cleaning up documents older than ${retentionDays} days...`,
    );

    const loggingCollections = [
      "access_logs",
      "error_logs",
      "performance_metrics",
    ];

    for (const collectionName of loggingCollections) {
      try {
        const collection = this.getCollection(collectionName);
        const result = await collection.deleteMany({
          timestamp: { $lt: cutoffDate },
        });

        console.log(
          `🗑️ [MongoDB] Cleaned ${result.deletedCount} old documents from ${collectionName}`,
        );
      } catch (error) {
        console.error(` [MongoDB] Error cleaning ${collectionName}:`, error);
      }
    }
  }
}

export const mongoCollectionManager = new MongoDBCollectionManager();
