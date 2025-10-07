/**
 * MongoDB TypeBox Schemas - MongoDB operations and document validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all MongoDB validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - MongoDB-specific validations
 * - Document schemas and operations
 */

import { t, type Static } from "elysia";
import { SysId, ServiceNowDateTime } from "../core/base.typebox";

// ===== MONGODB CONFIGURATION =====

/**
 * MongoDB connection configuration
 */
export const MongoDBConfig = t.Object({
  host: t.String({ minLength: 1 }),
  port: t.Integer({ minimum: 1, maximum: 65535, default: 27018 }),
  database: t.String({ minLength: 1 }),
  username: t.Optional(t.String()),
  password: t.Optional(t.String()),
  authSource: t.String({ default: "admin" }),
  ssl: t.Boolean({ default: false }),
  replicaSet: t.Optional(t.String()),
  maxPoolSize: t.Integer({ minimum: 1, default: 10 }),
  minPoolSize: t.Integer({ minimum: 0, default: 0 }),
  maxIdleTimeMS: t.Integer({ minimum: 1, default: 30000 }),
  serverSelectionTimeoutMS: t.Integer({ minimum: 1, default: 30000 }),
  socketTimeoutMS: t.Integer({ minimum: 1, default: 0 }),
  connectTimeoutMS: t.Integer({ minimum: 1, default: 30000 }),
  heartbeatFrequencyMS: t.Integer({ minimum: 1, default: 10000 }),
  retryWrites: t.Boolean({ default: true }),
});

export type MongoDBConfigType = Static<typeof MongoDBConfig>;

/**
 * MongoDB connection string validation
 */
export const MongoConnectionString = t.String({
  pattern: "^mongodb(\\+srv)?://.*",
});

export type MongoConnectionStringType = Static<typeof MongoConnectionString>;

// ===== MONGODB DOCUMENT SCHEMAS =====

/**
 * Base MongoDB document with common fields
 */
export const MongoDocument = t.Object({
  _id: t.Optional(t.Union([t.String(), t.Any()])), // ObjectId or string
  created_at: t.Date(),
  updated_at: t.Date(),
  version: t.Integer({ default: 1 }),
  metadata: t.Optional(t.Record(t.String(), t.Any())),
});

export type MongoDocumentType = Static<typeof MongoDocument>;

/**
 * ServiceNow ticket document in MongoDB
 */
export const TicketDocument = t.Composite([
  MongoDocument,
  t.Object({
    // ServiceNow fields
    sys_id: SysId,
    number: t.String(),
    table: t.Union([
      t.Literal("incident"),
      t.Literal("change_task"),
      t.Literal("sc_task"),
    ]),
    state: t.String(),
    short_description: t.String(),
    description: t.Optional(t.String()),
    priority: t.Optional(t.String()),
    assignment_group: t.Optional(t.String()),
    assigned_to: t.Optional(t.String()),
    caller_id: t.Optional(t.String()),
    opened_by: t.Optional(t.String()),
    opened_at: t.Optional(ServiceNowDateTime),

    // Cache metadata
    cache_status: t.Union([
      t.Literal("fresh"),
      t.Literal("stale"),
      t.Literal("expired"),
    ]),
    last_synced: t.Date(),
    sync_source: t.Union([
      t.Literal("servicenow"),
      t.Literal("manual"),
      t.Literal("batch"),
    ]),

    // Enhanced data
    enriched_data: t.Optional(
      t.Object({
        sla_info: t.Optional(t.Any()),
        related_tickets: t.Optional(t.Array(SysId)),
        attachment_count: t.Integer({ minimum: 0, default: 0 }),
        comment_count: t.Integer({ minimum: 0, default: 0 }),
        escalation_level: t.Integer({ minimum: 0, default: 0 }),
      }),
    ),

    // Raw ServiceNow data
    raw_servicenow_data: t.Optional(t.Record(t.String(), t.Any())),
  }),
]);

export type TicketDocumentType = Static<typeof TicketDocument>;

/**
 * SLA document schema for MongoDB
 */
export const SLADocument = t.Composite([
  MongoDocument,
  t.Object({
    task_sys_id: SysId,
    task_number: t.String(),
    sla_definition: SysId,
    sla_name: t.String(),
    start_time: t.Optional(t.Date()),
    end_time: t.Optional(t.Date()),
    pause_time: t.Integer({ minimum: 0, default: 0 }), // in seconds
    business_percentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
    has_breached: t.Boolean({ default: false }),
    breach_time: t.Optional(t.Date()),
    stage: t.Optional(t.String()),
    active: t.Boolean({ default: true }),
  }),
]);

export type SLADocumentType = Static<typeof SLADocument>;

/**
 * User activity log document
 */
export const ActivityLog = t.Composite([
  MongoDocument,
  t.Object({
    user_id: t.String(),
    session_id: t.Optional(t.String()),
    action: t.Union([
      t.Literal("view"),
      t.Literal("create"),
      t.Literal("update"),
      t.Literal("delete"),
      t.Literal("assign"),
      t.Literal("resolve"),
      t.Literal("close"),
    ]),
    resource_type: t.Union([
      t.Literal("ticket"),
      t.Literal("user"),
      t.Literal("group"),
      t.Literal("ci"),
      t.Literal("sla"),
    ]),
    resource_id: t.String(),
    details: t.Optional(t.Record(t.String(), t.Any())),
    ip_address: t.Optional(t.String()),
    user_agent: t.Optional(t.String()),
    timestamp: t.Date(),
  }),
]);

export type ActivityLogType = Static<typeof ActivityLog>;

// ===== MONGODB OPERATIONS =====

/**
 * MongoDB query options
 */
export const MongoQueryOptions = t.Object({
  filter: t.Optional(t.Record(t.String(), t.Any())),
  projection: t.Optional(
    t.Record(t.String(), t.Union([t.Literal(0), t.Literal(1)])),
  ),
  sort: t.Optional(
    t.Record(t.String(), t.Union([t.Literal(1), t.Literal(-1)])),
  ),
  limit: t.Optional(t.Integer({ minimum: 1 })),
  skip: t.Optional(t.Integer({ minimum: 0 })),
  hint: t.Optional(t.Union([t.String(), t.Record(t.String(), t.Any())])),
  maxTimeMS: t.Optional(t.Integer({ minimum: 1 })),
});

export type MongoQueryOptionsType = Static<typeof MongoQueryOptions>;

/**
 * MongoDB aggregation pipeline stage
 */
export const MongoAggregationStage = t.Union([
  t.Object({ $match: t.Record(t.String(), t.Any()) }),
  t.Object({ $group: t.Record(t.String(), t.Any()) }),
  t.Object({ $sort: t.Record(t.String(), t.Union([t.Literal(1), t.Literal(-1)])) }),
  t.Object({ $limit: t.Integer({ minimum: 1 }) }),
  t.Object({ $skip: t.Integer({ minimum: 0 }) }),
  t.Object({ $project: t.Record(t.String(), t.Any()) }),
  t.Object({
    $lookup: t.Object({
      from: t.String(),
      localField: t.String(),
      foreignField: t.String(),
      as: t.String(),
    }),
  }),
  t.Object({
    $unwind: t.Union([
      t.String(),
      t.Object({
        path: t.String(),
        preserveNullAndEmptyArrays: t.Optional(t.Boolean()),
      }),
    ]),
  }),
  t.Record(t.String(), t.Any()), // Allow other stages
]);

export type MongoAggregationStageType = Static<typeof MongoAggregationStage>;

/**
 * MongoDB bulk write operation
 */
export const MongoBulkWrite = t.Object({
  operations: t.Array(
    t.Union([
      t.Object({
        insertOne: t.Object({
          document: t.Record(t.String(), t.Any()),
        }),
      }),
      t.Object({
        updateOne: t.Object({
          filter: t.Record(t.String(), t.Any()),
          update: t.Record(t.String(), t.Any()),
          upsert: t.Optional(t.Boolean()),
        }),
      }),
      t.Object({
        updateMany: t.Object({
          filter: t.Record(t.String(), t.Any()),
          update: t.Record(t.String(), t.Any()),
          upsert: t.Optional(t.Boolean()),
        }),
      }),
      t.Object({
        deleteOne: t.Object({
          filter: t.Record(t.String(), t.Any()),
        }),
      }),
      t.Object({
        deleteMany: t.Object({
          filter: t.Record(t.String(), t.Any()),
        }),
      }),
      t.Object({
        replaceOne: t.Object({
          filter: t.Record(t.String(), t.Any()),
          replacement: t.Record(t.String(), t.Any()),
          upsert: t.Optional(t.Boolean()),
        }),
      }),
    ]),
    { minItems: 1, maxItems: 1000 },
  ),
  ordered: t.Boolean({ default: true }),
  bypassDocumentValidation: t.Boolean({ default: false }),
});

export type MongoBulkWriteType = Static<typeof MongoBulkWrite>;

// ===== MONGODB INDEXES =====

/**
 * MongoDB index specification
 */
export const MongoIndex = t.Object({
  keys: t.Record(
    t.String(),
    t.Union([
      t.Literal(1),
      t.Literal(-1),
      t.Literal("text"),
      t.Literal("2d"),
      t.Literal("2dsphere"),
    ]),
  ),
  options: t.Optional(
    t.Object({
      name: t.Optional(t.String()),
      unique: t.Optional(t.Boolean()),
      sparse: t.Optional(t.Boolean()),
      background: t.Optional(t.Boolean()),
      expireAfterSeconds: t.Optional(t.Integer({ minimum: 1 })),
      partialFilterExpression: t.Optional(t.Record(t.String(), t.Any())),
      collation: t.Optional(
        t.Object({
          locale: t.String(),
          strength: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
        }),
      ),
    }),
  ),
});

export type MongoIndexType = Static<typeof MongoIndex>;

// ===== MONGODB METRICS =====

/**
 * MongoDB performance metrics
 */
export const MongoMetrics = t.Object({
  database: t.String(),
  collection: t.String(),
  operation: t.Union([
    t.Literal("find"),
    t.Literal("insert"),
    t.Literal("update"),
    t.Literal("delete"),
    t.Literal("aggregate"),
  ]),
  execution_time_ms: t.Number({ minimum: 0 }),
  documents_examined: t.Integer({ minimum: 0 }),
  documents_returned: t.Integer({ minimum: 0 }),
  documents_modified: t.Integer({ minimum: 0 }),
  index_used: t.Optional(t.String()),
  timestamp: t.Date(),
});

export type MongoMetricsType = Static<typeof MongoMetrics>;

// ===== EXPORT SUMMARY =====

/**
 * MongoDB schemas exported:
 *
 * Configuration:
 * - MongoDBConfig: Connection and pool settings
 * - MongoConnectionString: Connection string validation
 *
 * Documents:
 * - MongoDocument: Base document with audit fields
 * - TicketDocument: ServiceNow ticket storage
 * - SLADocument: SLA tracking
 * - ActivityLog: User activity tracking
 *
 * Operations:
 * - MongoQueryOptions: Query parameters
 * - MongoAggregationStage: Aggregation pipeline stages
 * - MongoBulkWrite: Bulk operations (1-1000 ops)
 *
 * Indexes:
 * - MongoIndex: Index specification with options
 *
 * Monitoring:
 * - MongoMetrics: Performance metrics
 *
 * All schemas use TypeBox for Elysia native validation
 */
