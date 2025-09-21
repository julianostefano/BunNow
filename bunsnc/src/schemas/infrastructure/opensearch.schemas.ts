/**
 * OpenSearch Schemas - Search, indexing and analytics validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - OpenSearch-specific validations
 * - Search queries, indexing, and analytics
 */

import { z } from "zod";
import { SysIdSchema, ServiceNowDateTimeSchema } from "../core/base.schemas";

// ===== OPENSEARCH CONFIGURATION =====

/**
 * OpenSearch connection configuration
 */
export const OpenSearchConfigSchema = z.object({
  host: z.string().min(1, "OpenSearch host is required"),
  port: z.number().int().min(1).max(65535).default(9200),
  protocol: z.enum(["http", "https"]).default("https"),
  username: z.string().optional(),
  password: z.string().optional(),

  // Authentication
  auth: z
    .object({
      type: z.enum(["basic", "aws_iam", "api_key"]).default("basic"),
      username: z.string().optional(),
      password: z.string().optional(),
      api_key: z.string().optional(),
      region: z.string().optional(), // For AWS IAM
      service: z.string().default("es"), // AWS service
    })
    .optional(),

  // SSL/TLS options
  ssl: z
    .object({
      enabled: z.boolean().default(true),
      cert: z.string().optional(),
      key: z.string().optional(),
      ca: z.string().optional(),
      rejectUnauthorized: z.boolean().default(true),
    })
    .optional(),

  // Connection options
  requestTimeout: z.number().int().positive().default(30000),
  pingTimeout: z.number().int().positive().default(3000),
  maxRetries: z.number().int().min(0).default(3),

  // Node options
  nodes: z.array(z.string()).optional(),
  maxConnections: z.number().int().positive().default(10),
  compression: z.enum(["gzip", "none"]).default("none"),
});

/**
 * OpenSearch cluster information
 */
export const ClusterInfoSchema = z.object({
  name: z.string(),
  cluster_name: z.string(),
  cluster_uuid: z.string(),
  version: z.object({
    number: z.string(),
    build_flavor: z.string(),
    build_type: z.string(),
    build_hash: z.string(),
    build_date: z.string(),
    build_snapshot: z.boolean(),
    lucene_version: z.string(),
    minimum_wire_compatibility_version: z.string(),
    minimum_index_compatibility_version: z.string(),
  }),
  tagline: z.string(),
});

// ===== INDEX MANAGEMENT =====

/**
 * OpenSearch index mapping schema
 */
export const IndexMappingSchema = z.object({
  properties: z.record(
    z.object({
      type: z.enum([
        "text",
        "keyword",
        "long",
        "integer",
        "short",
        "byte",
        "double",
        "float",
        "half_float",
        "scaled_float",
        "date",
        "boolean",
        "binary",
        "integer_range",
        "float_range",
        "long_range",
        "double_range",
        "date_range",
        "object",
        "nested",
        "ip",
        "completion",
        "token_count",
        "murmur3",
        "percolator",
        "join",
      ]),
      analyzer: z.string().optional(),
      search_analyzer: z.string().optional(),
      index: z.boolean().optional(),
      store: z.boolean().optional(),
      doc_values: z.boolean().optional(),
      null_value: z.any().optional(),
      boost: z.number().optional(),
      format: z.string().optional(), // For date fields
      fields: z
        .record(
          z.object({
            type: z.string(),
            analyzer: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  dynamic: z.enum(["true", "false", "strict"]).optional(),
  date_detection: z.boolean().optional(),
  dynamic_date_formats: z.array(z.string()).optional(),
});

/**
 * OpenSearch index settings
 */
export const IndexSettingsSchema = z.object({
  number_of_shards: z.number().int().positive().default(1),
  number_of_replicas: z.number().int().min(0).default(1),
  refresh_interval: z.string().default("1s"),
  max_result_window: z.number().int().positive().default(10000),
  max_rescore_window: z.number().int().positive().default(10000),

  // Analysis settings
  analysis: z
    .object({
      analyzer: z
        .record(
          z.object({
            type: z.string(),
            tokenizer: z.string().optional(),
            filter: z.array(z.string()).optional(),
            char_filter: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      tokenizer: z.record(z.any()).optional(),
      filter: z.record(z.any()).optional(),
      normalizer: z.record(z.any()).optional(),
    })
    .optional(),

  // Routing
  routing: z
    .object({
      allocation: z
        .object({
          include: z.record(z.string()).optional(),
          exclude: z.record(z.string()).optional(),
          require: z.record(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Complete index configuration
 */
export const IndexConfigSchema = z.object({
  index: z.string().min(1, "Index name is required"),
  settings: IndexSettingsSchema.optional(),
  mappings: IndexMappingSchema.optional(),
  aliases: z
    .record(
      z.object({
        filter: z.record(z.any()).optional(),
        routing: z.string().optional(),
      }),
    )
    .optional(),
});

// ===== DOCUMENT SCHEMAS =====

/**
 * Base OpenSearch document
 */
export const OpenSearchDocumentSchema = z.object({
  _index: z.string(),
  _type: z.string().optional(),
  _id: z.string(),
  _version: z.number().int().positive().optional(),
  _seq_no: z.number().int().min(0).optional(),
  _primary_term: z.number().int().positive().optional(),
  _source: z.record(z.any()),
  _score: z.number().optional(),
});

/**
 * ServiceNow ticket document for OpenSearch
 */
export const TicketSearchDocumentSchema = z.object({
  // Core ticket fields
  sys_id: SysIdSchema,
  number: z.string(),
  table: z.enum(["incident", "change_task", "sc_task"]),
  state: z.string(),
  state_label: z.string(),

  // Searchable text fields
  short_description: z.string(),
  description: z.string().optional(),
  work_notes: z.string().optional(),
  close_notes: z.string().optional(),

  // Categorical fields
  priority: z.string().optional(),
  priority_label: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),

  // User fields
  caller_id: z.string().optional(),
  caller_name: z.string().optional(),
  assigned_to: z.string().optional(),
  assigned_to_name: z.string().optional(),
  assignment_group: z.string().optional(),
  assignment_group_name: z.string().optional(),
  opened_by: z.string().optional(),
  opened_by_name: z.string().optional(),

  // Timestamps
  opened_at: z.date().optional(),
  updated_at: z.date().optional(),
  resolved_at: z.date().optional(),
  closed_at: z.date().optional(),

  // Business context
  business_service: z.string().optional(),
  business_service_name: z.string().optional(),
  cmdb_ci: z.string().optional(),
  cmdb_ci_name: z.string().optional(),
  company: z.string().optional(),
  company_name: z.string().optional(),
  location: z.string().optional(),
  location_name: z.string().optional(),

  // Metrics and SLA
  business_duration: z.number().optional(), // in seconds
  calendar_duration: z.number().optional(), // in seconds
  sla_due: z.date().optional(),
  made_sla: z.boolean().optional(),

  // Text analysis fields
  full_text: z.string().optional(), // Combined searchable text
  tags: z.array(z.string()).optional(),

  // Indexing metadata
  indexed_at: z.date().default(() => new Date()),
  data_version: z.string().optional(),
});

// ===== SEARCH QUERIES =====

/**
 * OpenSearch query DSL - Match query
 */
export const MatchQuerySchema = z.object({
  match: z.record(
    z.union([
      z.string(),
      z.object({
        query: z.string(),
        operator: z.enum(["and", "or"]).optional(),
        fuzziness: z.union([z.string(), z.number()]).optional(),
        prefix_length: z.number().int().min(0).optional(),
        max_expansions: z.number().int().positive().optional(),
        analyzer: z.string().optional(),
      }),
    ]),
  ),
});

/**
 * OpenSearch query DSL - Bool query
 */
export const BoolQuerySchema = z.object({
  bool: z.object({
    must: z.array(z.any()).optional(),
    filter: z.array(z.any()).optional(),
    should: z.array(z.any()).optional(),
    must_not: z.array(z.any()).optional(),
    minimum_should_match: z.union([z.string(), z.number()]).optional(),
    boost: z.number().optional(),
  }),
});

/**
 * OpenSearch aggregation schema
 */
export const AggregationSchema = z.object({
  aggs: z.record(
    z.union([
      // Terms aggregation
      z.object({
        terms: z.object({
          field: z.string(),
          size: z.number().int().positive().optional(),
          order: z.record(z.enum(["asc", "desc"])).optional(),
          include: z.union([z.string(), z.array(z.string())]).optional(),
          exclude: z.union([z.string(), z.array(z.string())]).optional(),
        }),
      }),
      // Date histogram
      z.object({
        date_histogram: z.object({
          field: z.string(),
          calendar_interval: z
            .enum(["1m", "1h", "1d", "1w", "1M", "1q", "1y"])
            .optional(),
          fixed_interval: z.string().optional(),
          time_zone: z.string().optional(),
          min_doc_count: z.number().int().min(0).optional(),
        }),
      }),
      // Range aggregation
      z.object({
        range: z.object({
          field: z.string(),
          ranges: z.array(
            z.object({
              from: z.number().optional(),
              to: z.number().optional(),
              key: z.string().optional(),
            }),
          ),
        }),
      }),
      // Metrics aggregations
      z.object({
        avg: z.object({ field: z.string() }),
      }),
      z.object({
        sum: z.object({ field: z.string() }),
      }),
      z.object({
        min: z.object({ field: z.string() }),
      }),
      z.object({
        max: z.object({ field: z.string() }),
      }),
      // Nested aggregation
      z.object({
        aggs: z.record(z.any()),
      }),
    ]),
  ),
});

/**
 * Complete search request schema
 */
export const SearchRequestSchema = z.object({
  index: z.union([z.string(), z.array(z.string())]).optional(),
  query: z.any().optional(),
  size: z.number().int().min(0).max(10000).default(10),
  from: z.number().int().min(0).default(0),
  sort: z
    .union([
      z.string(),
      z.array(
        z.union([
          z.string(),
          z.record(
            z.union([
              z.enum(["asc", "desc"]),
              z.object({
                order: z.enum(["asc", "desc"]),
                missing: z
                  .union([z.string(), z.literal("_first"), z.literal("_last")])
                  .optional(),
              }),
            ]),
          ),
        ]),
      ),
    ])
    .optional(),
  _source: z
    .union([
      z.boolean(),
      z.string(),
      z.array(z.string()),
      z.object({
        includes: z.array(z.string()).optional(),
        excludes: z.array(z.string()).optional(),
      }),
    ])
    .optional(),
  highlight: z
    .object({
      fields: z.record(
        z
          .object({
            fragment_size: z.number().int().positive().optional(),
            number_of_fragments: z.number().int().positive().optional(),
            pre_tags: z.array(z.string()).optional(),
            post_tags: z.array(z.string()).optional(),
          })
          .optional(),
      ),
    })
    .optional(),
  aggs: z.record(z.any()).optional(),
  timeout: z.string().optional(),
});

// ===== ANALYTICS SCHEMAS =====

/**
 * Search analytics metrics
 */
export const SearchMetricsSchema = z.object({
  query: z.string(),
  index: z.string(),
  took: z.number().int().min(0), // execution time in ms
  timed_out: z.boolean(),
  total_hits: z.number().int().min(0),
  max_score: z.number().optional(),
  aggregations: z.record(z.any()).optional(),
  timestamp: z.date().default(() => new Date()),
  user_id: z.string().optional(),
  session_id: z.string().optional(),
});

/**
 * OpenSearch cluster health
 */
export const ClusterHealthSchema = z.object({
  cluster_name: z.string(),
  status: z.enum(["green", "yellow", "red"]),
  timed_out: z.boolean(),
  number_of_nodes: z.number().int().min(0),
  number_of_data_nodes: z.number().int().min(0),
  active_primary_shards: z.number().int().min(0),
  active_shards: z.number().int().min(0),
  relocating_shards: z.number().int().min(0),
  initializing_shards: z.number().int().min(0),
  unassigned_shards: z.number().int().min(0),
  delayed_unassigned_shards: z.number().int().min(0),
  number_of_pending_tasks: z.number().int().min(0),
  number_of_in_flight_fetch: z.number().int().min(0),
  task_max_waiting_in_queue_millis: z.number().int().min(0),
  active_shards_percent_as_number: z.number().min(0).max(100),
});

// ===== TYPE EXPORTS =====

export type OpenSearchConfig = z.infer<typeof OpenSearchConfigSchema>;
export type ClusterInfo = z.infer<typeof ClusterInfoSchema>;
export type IndexMapping = z.infer<typeof IndexMappingSchema>;
export type IndexSettings = z.infer<typeof IndexSettingsSchema>;
export type IndexConfig = z.infer<typeof IndexConfigSchema>;
export type OpenSearchDocument = z.infer<typeof OpenSearchDocumentSchema>;
export type TicketSearchDocument = z.infer<typeof TicketSearchDocumentSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type SearchMetrics = z.infer<typeof SearchMetricsSchema>;
export type ClusterHealth = z.infer<typeof ClusterHealthSchema>;
