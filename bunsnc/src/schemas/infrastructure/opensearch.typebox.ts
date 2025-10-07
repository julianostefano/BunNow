/**
 * OpenSearch TypeBox Schemas - Search, indexing and analytics validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all OpenSearch validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - OpenSearch-specific validations
 * - Search queries, indexing, and analytics
 */

import { t, type Static } from "elysia";
import { SysId } from "../core/base.typebox";

// ===== OPENSEARCH CONFIGURATION =====

/**
 * OpenSearch connection configuration
 */
export const OpenSearchConfig = t.Object({
  host: t.String({ minLength: 1 }),
  port: t.Integer({ minimum: 1, maximum: 65535, default: 9200 }),
  protocol: t.Union([t.Literal("http"), t.Literal("https")]),

  // Authentication
  auth: t.Optional(
    t.Object({
      type: t.Union([
        t.Literal("basic"),
        t.Literal("aws_iam"),
        t.Literal("api_key"),
      ]),
      username: t.Optional(t.String()),
      password: t.Optional(t.String()),
      api_key: t.Optional(t.String()),
      region: t.Optional(t.String()), // For AWS IAM
      service: t.String({ default: "es" }), // AWS service
    }),
  ),

  // SSL/TLS options
  ssl: t.Optional(
    t.Object({
      enabled: t.Boolean({ default: true }),
      cert: t.Optional(t.String()),
      key: t.Optional(t.String()),
      ca: t.Optional(t.String()),
      rejectUnauthorized: t.Boolean({ default: true }),
    }),
  ),

  // Connection options
  requestTimeout: t.Integer({ minimum: 1, default: 30000 }),
  pingTimeout: t.Integer({ minimum: 1, default: 3000 }),
  maxRetries: t.Integer({ minimum: 0, default: 3 }),

  // Node options
  nodes: t.Optional(t.Array(t.String())),
  maxConnections: t.Integer({ minimum: 1, default: 10 }),
  compression: t.Union([t.Literal("gzip"), t.Literal("none")]),
});

export type OpenSearchConfigType = Static<typeof OpenSearchConfig>;

/**
 * OpenSearch cluster information
 */
export const ClusterInfo = t.Object({
  name: t.String(),
  cluster_name: t.String(),
  cluster_uuid: t.String(),
  version: t.Object({
    number: t.String(),
    build_flavor: t.String(),
    build_type: t.String(),
    build_hash: t.String(),
    build_date: t.String(),
    build_snapshot: t.Boolean(),
    lucene_version: t.String(),
    minimum_wire_compatibility_version: t.String(),
    minimum_index_compatibility_version: t.String(),
  }),
  tagline: t.String(),
});

export type ClusterInfoType = Static<typeof ClusterInfo>;

// ===== INDEX MANAGEMENT =====

/**
 * OpenSearch index settings
 */
export const IndexSettings = t.Object({
  number_of_shards: t.Integer({ minimum: 1, default: 1 }),
  number_of_replicas: t.Integer({ minimum: 0, default: 1 }),
  refresh_interval: t.String({ default: "1s" }),
  max_result_window: t.Integer({ minimum: 1, default: 10000 }),
  max_rescore_window: t.Integer({ minimum: 1, default: 10000 }),

  // Analysis settings
  analysis: t.Optional(
    t.Object({
      analyzer: t.Optional(
        t.Record(
          t.String(),
          t.Object({
            type: t.String(),
            tokenizer: t.Optional(t.String()),
            filter: t.Optional(t.Array(t.String())),
            char_filter: t.Optional(t.Array(t.String())),
          }),
        ),
      ),
      tokenizer: t.Optional(t.Record(t.String(), t.Any())),
      filter: t.Optional(t.Record(t.String(), t.Any())),
      normalizer: t.Optional(t.Record(t.String(), t.Any())),
    }),
  ),

  // Routing
  routing: t.Optional(
    t.Object({
      allocation: t.Optional(
        t.Object({
          include: t.Optional(t.Record(t.String(), t.String())),
          exclude: t.Optional(t.Record(t.String(), t.String())),
          require: t.Optional(t.Record(t.String(), t.String())),
        }),
      ),
    }),
  ),
});

export type IndexSettingsType = Static<typeof IndexSettings>;

/**
 * Complete index configuration
 */
export const IndexConfig = t.Object({
  index: t.String({ minLength: 1 }),
  settings: t.Optional(IndexSettings),
  mappings: t.Optional(t.Any()), // Complex mapping structure
  aliases: t.Optional(
    t.Record(
      t.String(),
      t.Object({
        filter: t.Optional(t.Record(t.String(), t.Any())),
        routing: t.Optional(t.String()),
      }),
    ),
  ),
});

export type IndexConfigType = Static<typeof IndexConfig>;

// ===== DOCUMENT SCHEMAS =====

/**
 * Base OpenSearch document
 */
export const OpenSearchDocument = t.Object({
  _index: t.String(),
  _type: t.Optional(t.String()),
  _id: t.String(),
  _version: t.Optional(t.Integer({ minimum: 1 })),
  _seq_no: t.Optional(t.Integer({ minimum: 0 })),
  _primary_term: t.Optional(t.Integer({ minimum: 1 })),
  _source: t.Record(t.String(), t.Any()),
  _score: t.Optional(t.Number()),
});

export type OpenSearchDocumentType = Static<typeof OpenSearchDocument>;

/**
 * ServiceNow ticket document for OpenSearch
 */
export const TicketSearchDocument = t.Object({
  // Core ticket fields
  sys_id: SysId,
  number: t.String(),
  table: t.Union([
    t.Literal("incident"),
    t.Literal("change_task"),
    t.Literal("sc_task"),
  ]),
  state: t.String(),
  state_label: t.String(),

  // Searchable text fields
  short_description: t.String(),
  description: t.Optional(t.String()),
  work_notes: t.Optional(t.String()),
  close_notes: t.Optional(t.String()),

  // Categorical fields
  priority: t.Optional(t.String()),
  priority_label: t.Optional(t.String()),
  category: t.Optional(t.String()),
  subcategory: t.Optional(t.String()),

  // User fields
  caller_id: t.Optional(t.String()),
  caller_name: t.Optional(t.String()),
  assigned_to: t.Optional(t.String()),
  assigned_to_name: t.Optional(t.String()),
  assignment_group: t.Optional(t.String()),
  assignment_group_name: t.Optional(t.String()),
  opened_by: t.Optional(t.String()),
  opened_by_name: t.Optional(t.String()),

  // Timestamps
  opened_at: t.Optional(t.Date()),
  updated_at: t.Optional(t.Date()),
  resolved_at: t.Optional(t.Date()),
  closed_at: t.Optional(t.Date()),

  // Business context
  business_service: t.Optional(t.String()),
  business_service_name: t.Optional(t.String()),
  cmdb_ci: t.Optional(t.String()),
  cmdb_ci_name: t.Optional(t.String()),
  company: t.Optional(t.String()),
  company_name: t.Optional(t.String()),
  location: t.Optional(t.String()),
  location_name: t.Optional(t.String()),

  // Metrics and SLA
  business_duration: t.Optional(t.Number()), // in seconds
  calendar_duration: t.Optional(t.Number()), // in seconds
  sla_due: t.Optional(t.Date()),
  made_sla: t.Optional(t.Boolean()),

  // Text analysis fields
  full_text: t.Optional(t.String()), // Combined searchable text
  tags: t.Optional(t.Array(t.String())),

  // Indexing metadata
  indexed_at: t.Date(),
  data_version: t.Optional(t.String()),
});

export type TicketSearchDocumentType = Static<typeof TicketSearchDocument>;

// ===== SEARCH QUERIES =====

/**
 * Complete search request schema
 */
export const SearchRequest = t.Object({
  index: t.Optional(t.Union([t.String(), t.Array(t.String())])),
  query: t.Optional(t.Any()),
  size: t.Integer({ minimum: 0, maximum: 10000, default: 10 }),
  from: t.Integer({ minimum: 0, default: 0 }),
  sort: t.Optional(
    t.Union([
      t.String(),
      t.Array(
        t.Union([
          t.String(),
          t.Record(
            t.String(),
            t.Union([
              t.Literal("asc"),
              t.Literal("desc"),
              t.Object({
                order: t.Union([t.Literal("asc"), t.Literal("desc")]),
                missing: t.Optional(
                  t.Union([t.String(), t.Literal("_first"), t.Literal("_last")]),
                ),
              }),
            ]),
          ),
        ]),
      ),
    ]),
  ),
  _source: t.Optional(
    t.Union([
      t.Boolean(),
      t.String(),
      t.Array(t.String()),
      t.Object({
        includes: t.Optional(t.Array(t.String())),
        excludes: t.Optional(t.Array(t.String())),
      }),
    ]),
  ),
  highlight: t.Optional(
    t.Object({
      fields: t.Record(
        t.String(),
        t.Optional(
          t.Object({
            fragment_size: t.Optional(t.Integer({ minimum: 1 })),
            number_of_fragments: t.Optional(t.Integer({ minimum: 1 })),
            pre_tags: t.Optional(t.Array(t.String())),
            post_tags: t.Optional(t.Array(t.String())),
          }),
        ),
      ),
    }),
  ),
  aggs: t.Optional(t.Record(t.String(), t.Any())),
  timeout: t.Optional(t.String()),
});

export type SearchRequestType = Static<typeof SearchRequest>;

// ===== ANALYTICS SCHEMAS =====

/**
 * Search analytics metrics
 */
export const SearchMetrics = t.Object({
  query: t.String(),
  index: t.String(),
  took: t.Integer({ minimum: 0 }), // execution time in ms
  timed_out: t.Boolean(),
  total_hits: t.Integer({ minimum: 0 }),
  max_score: t.Optional(t.Number()),
  aggregations: t.Optional(t.Record(t.String(), t.Any())),
  timestamp: t.Date(),
  user_id: t.Optional(t.String()),
  session_id: t.Optional(t.String()),
});

export type SearchMetricsType = Static<typeof SearchMetrics>;

/**
 * OpenSearch cluster health
 */
export const ClusterHealth = t.Object({
  cluster_name: t.String(),
  status: t.Union([t.Literal("green"), t.Literal("yellow"), t.Literal("red")]),
  timed_out: t.Boolean(),
  number_of_nodes: t.Integer({ minimum: 0 }),
  number_of_data_nodes: t.Integer({ minimum: 0 }),
  active_primary_shards: t.Integer({ minimum: 0 }),
  active_shards: t.Integer({ minimum: 0 }),
  relocating_shards: t.Integer({ minimum: 0 }),
  initializing_shards: t.Integer({ minimum: 0 }),
  unassigned_shards: t.Integer({ minimum: 0 }),
  delayed_unassigned_shards: t.Integer({ minimum: 0 }),
  number_of_pending_tasks: t.Integer({ minimum: 0 }),
  number_of_in_flight_fetch: t.Integer({ minimum: 0 }),
  task_max_waiting_in_queue_millis: t.Integer({ minimum: 0 }),
  active_shards_percent_as_number: t.Number({ minimum: 0, maximum: 100 }),
});

export type ClusterHealthType = Static<typeof ClusterHealth>;

// ===== EXPORT SUMMARY =====

/**
 * OpenSearch schemas exported:
 *
 * Configuration:
 * - OpenSearchConfig: Connection and authentication
 * - ClusterInfo: Cluster version and details
 *
 * Index Management:
 * - IndexSettings: Shards, replicas, analysis
 * - IndexConfig: Complete index configuration
 *
 * Documents:
 * - OpenSearchDocument: Base document structure
 * - TicketSearchDocument: ServiceNow ticket indexing
 *
 * Search:
 * - SearchRequest: Full-text search with filters
 *
 * Analytics:
 * - SearchMetrics: Query performance metrics
 * - ClusterHealth: Cluster health status
 *
 * All schemas use TypeBox for Elysia native validation
 */
