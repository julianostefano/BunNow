/**
 * MongoDB Schemas - MongoDB operations and document validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - MongoDB-specific validations
 * - Document schemas and operations
 */

import { z } from "zod";
import { SysIdSchema, ServiceNowDateTimeSchema } from "../core/base.schemas";

// ===== MONGODB CONFIGURATION =====

/**
 * MongoDB connection configuration
 */
export const MongoDBConfigSchema = z.object({
  host: z.string().min(1, "MongoDB host is required"),
  port: z.number().int().min(1).max(65535).default(27018),
  database: z.string().min(1, "Database name is required"),
  username: z.string().optional(),
  password: z.string().optional(),
  authSource: z.string().default("admin"),
  ssl: z.boolean().default(false),
  replicaSet: z.string().optional(),
  maxPoolSize: z.number().int().positive().default(10),
  minPoolSize: z.number().int().min(0).default(0),
  maxIdleTimeMS: z.number().int().positive().default(30000),
  serverSelectionTimeoutMS: z.number().int().positive().default(30000),
  socketTimeoutMS: z.number().int().positive().default(0),
  connectTimeoutMS: z.number().int().positive().default(30000),
  heartbeatFrequencyMS: z.number().int().positive().default(10000),
  retryWrites: z.boolean().default(true),
});

/**
 * MongoDB connection string builder
 */
export const MongoConnectionStringSchema = z.string().refine((url) => {
  try {
    return url.startsWith("mongodb://") || url.startsWith("mongodb+srv://");
  } catch {
    return false;
  }
}, "Invalid MongoDB connection string format");

// ===== MONGODB DOCUMENT SCHEMAS =====

/**
 * Base MongoDB document with common fields
 */
export const MongoDocumentSchema = z.object({
  _id: z.union([z.string(), z.any()]).optional(), // ObjectId or string
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
  version: z.number().int().default(1),
  metadata: z.record(z.any()).optional(),
});

/**
 * ServiceNow ticket document in MongoDB
 */
export const TicketDocumentSchema = MongoDocumentSchema.extend({
  // ServiceNow fields
  sys_id: SysIdSchema,
  number: z.string(),
  table: z.enum(["incident", "change_task", "sc_task"]),
  state: z.string(),
  short_description: z.string(),
  description: z.string().optional(),
  priority: z.string().optional(),
  assignment_group: z.string().optional(),
  assigned_to: z.string().optional(),
  caller_id: z.string().optional(),
  opened_by: z.string().optional(),
  opened_at: ServiceNowDateTimeSchema.optional(),

  // Cache metadata
  cache_status: z.enum(["fresh", "stale", "expired"]).default("fresh"),
  last_synced: z.date().default(() => new Date()),
  sync_source: z.enum(["servicenow", "manual", "batch"]).default("servicenow"),

  // Enhanced data
  enriched_data: z
    .object({
      sla_info: z.any().optional(),
      related_tickets: z.array(SysIdSchema).optional(),
      attachment_count: z.number().int().min(0).default(0),
      comment_count: z.number().int().min(0).default(0),
      escalation_level: z.number().int().min(0).default(0),
    })
    .optional(),

  // Raw ServiceNow data
  raw_servicenow_data: z.record(z.any()).optional(),
});

/**
 * SLA document schema for MongoDB
 */
export const SLADocumentSchema = MongoDocumentSchema.extend({
  task_sys_id: SysIdSchema,
  task_number: z.string(),
  sla_definition: SysIdSchema,
  sla_name: z.string(),
  start_time: z.date().optional(),
  end_time: z.date().optional(),
  pause_time: z.number().int().min(0).default(0), // in seconds
  business_percentage: z.number().min(0).max(100).optional(),
  has_breached: z.boolean().default(false),
  breach_time: z.date().optional(),
  stage: z.string().optional(),
  active: z.boolean().default(true),
});

/**
 * User activity log document
 */
export const ActivityLogSchema = MongoDocumentSchema.extend({
  user_id: z.string(),
  session_id: z.string().optional(),
  action: z.enum([
    "view",
    "create",
    "update",
    "delete",
    "assign",
    "resolve",
    "close",
  ]),
  resource_type: z.enum(["ticket", "user", "group", "ci", "sla"]),
  resource_id: z.string(),
  details: z.record(z.any()).optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  timestamp: z.date().default(() => new Date()),
});

// ===== MONGODB OPERATIONS =====

/**
 * MongoDB query options
 */
export const MongoQueryOptionsSchema = z.object({
  filter: z.record(z.any()).optional(),
  projection: z.record(z.union([z.literal(0), z.literal(1)])).optional(),
  sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
  limit: z.number().int().positive().optional(),
  skip: z.number().int().min(0).optional(),
  hint: z.union([z.string(), z.record(z.any())]).optional(),
  maxTimeMS: z.number().int().positive().optional(),
});

/**
 * MongoDB aggregation pipeline stage
 */
export const MongoAggregationStageSchema = z.union([
  z.object({ $match: z.record(z.any()) }),
  z.object({ $group: z.record(z.any()) }),
  z.object({ $sort: z.record(z.union([z.literal(1), z.literal(-1)])) }),
  z.object({ $limit: z.number().int().positive() }),
  z.object({ $skip: z.number().int().min(0) }),
  z.object({ $project: z.record(z.any()) }),
  z.object({
    $lookup: z.object({
      from: z.string(),
      localField: z.string(),
      foreignField: z.string(),
      as: z.string(),
    }),
  }),
  z.object({
    $unwind: z.union([
      z.string(),
      z.object({
        path: z.string(),
        preserveNullAndEmptyArrays: z.boolean().optional(),
      }),
    ]),
  }),
  z.record(z.any()), // Allow other stages
]);

/**
 * MongoDB bulk write operation
 */
export const MongoBulkWriteSchema = z.object({
  operations: z
    .array(
      z.union([
        z.object({
          insertOne: z.object({
            document: z.record(z.any()),
          }),
        }),
        z.object({
          updateOne: z.object({
            filter: z.record(z.any()),
            update: z.record(z.any()),
            upsert: z.boolean().optional(),
          }),
        }),
        z.object({
          updateMany: z.object({
            filter: z.record(z.any()),
            update: z.record(z.any()),
            upsert: z.boolean().optional(),
          }),
        }),
        z.object({
          deleteOne: z.object({
            filter: z.record(z.any()),
          }),
        }),
        z.object({
          deleteMany: z.object({
            filter: z.record(z.any()),
          }),
        }),
        z.object({
          replaceOne: z.object({
            filter: z.record(z.any()),
            replacement: z.record(z.any()),
            upsert: z.boolean().optional(),
          }),
        }),
      ]),
    )
    .min(1, "At least one operation is required")
    .max(1000, "Maximum 1000 operations per batch"),
  ordered: z.boolean().default(true),
  bypassDocumentValidation: z.boolean().default(false),
});

// ===== MONGODB INDEXES =====

/**
 * MongoDB index specification
 */
export const MongoIndexSchema = z.object({
  keys: z.record(
    z.union([
      z.literal(1),
      z.literal(-1),
      z.literal("text"),
      z.literal("2d"),
      z.literal("2dsphere"),
    ]),
  ),
  options: z
    .object({
      name: z.string().optional(),
      unique: z.boolean().optional(),
      sparse: z.boolean().optional(),
      background: z.boolean().optional(),
      expireAfterSeconds: z.number().int().positive().optional(),
      partialFilterExpression: z.record(z.any()).optional(),
      collation: z
        .object({
          locale: z.string(),
          strength: z.number().int().min(1).max(5).optional(),
        })
        .optional(),
    })
    .optional(),
});

// ===== MONGODB METRICS =====

/**
 * MongoDB performance metrics
 */
export const MongoMetricsSchema = z.object({
  database: z.string(),
  collection: z.string(),
  operation: z.enum(["find", "insert", "update", "delete", "aggregate"]),
  execution_time_ms: z.number().positive(),
  documents_examined: z.number().int().min(0),
  documents_returned: z.number().int().min(0),
  documents_modified: z.number().int().min(0),
  index_used: z.string().optional(),
  timestamp: z.date().default(() => new Date()),
});

// ===== TYPE EXPORTS =====

export type MongoDBConfig = z.infer<typeof MongoDBConfigSchema>;
export type MongoDocument = z.infer<typeof MongoDocumentSchema>;
export type TicketDocument = z.infer<typeof TicketDocumentSchema>;
export type SLADocument = z.infer<typeof SLADocumentSchema>;
export type ActivityLog = z.infer<typeof ActivityLogSchema>;
export type MongoQueryOptions = z.infer<typeof MongoQueryOptionsSchema>;
export type MongoAggregationStage = z.infer<typeof MongoAggregationStageSchema>;
export type MongoBulkWrite = z.infer<typeof MongoBulkWriteSchema>;
export type MongoIndex = z.infer<typeof MongoIndexSchema>;
export type MongoMetrics = z.infer<typeof MongoMetricsSchema>;
