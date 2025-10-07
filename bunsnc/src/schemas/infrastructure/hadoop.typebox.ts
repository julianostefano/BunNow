/**
 * Hadoop HDFS TypeBox Schemas - Big data storage and processing validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - Eliminates Zod dependency overhead
 * - Uses Elysia's native validation system
 * - Maintains all Hadoop/HDFS validation logic
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Hadoop/HDFS-specific validations
 * - File operations and metadata
 */

import { t, type Static } from "elysia";

// ===== HADOOP CONFIGURATION =====

/**
 * Hadoop HDFS configuration schema
 */
export const HadoopConfig = t.Object({
  namenode: t.String({ minLength: 1 }),
  port: t.Integer({ minimum: 1, maximum: 65535, default: 8020 }),
  protocol: t.Union([t.Literal("hdfs"), t.Literal("webhdfs")]),

  // Authentication
  auth: t.Object({
    type: t.Union([t.Literal("simple"), t.Literal("kerberos")]),
    username: t.String({ minLength: 1 }),
    principal: t.Optional(t.String()), // For Kerberos
    keytab: t.Optional(t.String()), // Path to keytab file
    realm: t.Optional(t.String()),
  }),

  // Connection options
  timeout: t.Integer({ minimum: 1, default: 30000 }),
  retries: t.Integer({ minimum: 0, default: 3 }),
  retryInterval: t.Integer({ minimum: 1, default: 1000 }),

  // WebHDFS specific
  webhdfs: t.Optional(
    t.Object({
      port: t.Integer({ minimum: 1, maximum: 65535, default: 9870 }),
      ssl: t.Boolean({ default: false }),
      proxy_user: t.Optional(t.String()),
    }),
  ),

  // Performance options
  block_size: t.Integer({ minimum: 1, default: 134217728 }), // 128MB
  replication: t.Integer({ minimum: 1, maximum: 10, default: 3 }),
  buffer_size: t.Integer({ minimum: 1, default: 65536 }), // 64KB
});

export type HadoopConfigType = Static<typeof HadoopConfig>;

/**
 * HDFS cluster status
 */
export const HDFSClusterStatus = t.Object({
  cluster_id: t.String(),
  namenode_id: t.String(),
  namenode_address: t.String(),
  state: t.Union([
    t.Literal("ACTIVE"),
    t.Literal("STANDBY"),
    t.Literal("SAFEMODE"),
  ]),

  // Capacity information
  capacity_total: t.Integer({ minimum: 0 }), // bytes
  capacity_used: t.Integer({ minimum: 0 }), // bytes
  capacity_remaining: t.Integer({ minimum: 0 }), // bytes
  capacity_used_non_dfs: t.Integer({ minimum: 0 }), // bytes

  // Block information
  total_blocks: t.Integer({ minimum: 0 }),
  missing_blocks: t.Integer({ minimum: 0 }),
  corrupt_blocks: t.Integer({ minimum: 0 }),
  under_replicated_blocks: t.Integer({ minimum: 0 }),

  // Node information
  total_nodes: t.Integer({ minimum: 0 }),
  live_nodes: t.Integer({ minimum: 0 }),
  dead_nodes: t.Integer({ minimum: 0 }),
  decommissioning_nodes: t.Integer({ minimum: 0 }),

  // File system information
  total_files: t.Integer({ minimum: 0 }),
  total_dirs: t.Integer({ minimum: 0 }),

  last_updated: t.Date(),
});

export type HDFSClusterStatusType = Static<typeof HDFSClusterStatus>;

// ===== HDFS FILE OPERATIONS =====

/**
 * HDFS path validation
 */
export const HDFSPath = t.String({
  pattern: "^/.*",
  minLength: 1,
});

export type HDFSPathType = Static<typeof HDFSPath>;

/**
 * HDFS file status information
 */
export const HDFSFileStatus = t.Object({
  path: HDFSPath,
  type: t.Union([t.Literal("FILE"), t.Literal("DIRECTORY"), t.Literal("SYMLINK")]),
  length: t.Integer({ minimum: 0 }), // File size in bytes
  owner: t.String(),
  group: t.String(),
  permission: t.String({ pattern: "^[0-7]{3,4}$" }),
  access_time: t.Integer({ minimum: 0 }), // Unix timestamp
  modification_time: t.Integer({ minimum: 0 }), // Unix timestamp
  block_size: t.Integer({ minimum: 1 }),
  replication: t.Integer({ minimum: 1 }),

  // Extended attributes
  symlink: t.Optional(HDFSPath), // Target path for symlinks
  children_count: t.Optional(t.Integer({ minimum: 0 })), // For directories
  quota: t.Optional(t.Integer({ minimum: -1 })), // -1 means no quota
  space_quota: t.Optional(t.Integer({ minimum: -1 })),

  // Checksums
  checksum_type: t.Optional(t.String()),
  checksum_bytes: t.Optional(t.String()), // Hex encoded checksum
});

export type HDFSFileStatusType = Static<typeof HDFSFileStatus>;

/**
 * HDFS file upload request
 */
export const HDFSUploadRequest = t.Object({
  source_path: t.String({ minLength: 1 }),
  destination_path: HDFSPath,
  overwrite: t.Boolean({ default: false }),
  block_size: t.Optional(t.Integer({ minimum: 1 })),
  replication: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
  permission: t.Optional(t.String({ pattern: "^[0-7]{3,4}$" })),
  buffer_size: t.Optional(t.Integer({ minimum: 1 })),

  // Metadata
  created_by: t.Optional(t.String()),
  description: t.Optional(t.String()),
  tags: t.Optional(t.Array(t.String())),

  // Processing options
  compress: t.Boolean({ default: false }),
  compression_type: t.Optional(
    t.Union([
      t.Literal("gzip"),
      t.Literal("snappy"),
      t.Literal("lz4"),
      t.Literal("bzip2"),
    ]),
  ),
  validate_checksum: t.Boolean({ default: true }),
});

export type HDFSUploadRequestType = Static<typeof HDFSUploadRequest>;

/**
 * HDFS file download request
 */
export const HDFSDownloadRequest = t.Object({
  source_path: HDFSPath,
  destination_path: t.String({ minLength: 1 }),
  offset: t.Integer({ minimum: 0, default: 0 }),
  length: t.Optional(t.Integer({ minimum: 1 })), // Download specific byte range
  buffer_size: t.Optional(t.Integer({ minimum: 1 })),
  validate_checksum: t.Boolean({ default: true }),
  preserve_attributes: t.Boolean({ default: false }), // Preserve timestamps and permissions
});

export type HDFSDownloadRequestType = Static<typeof HDFSDownloadRequest>;

/**
 * HDFS directory listing request
 */
export const HDFSListRequest = t.Object({
  path: HDFSPath,
  recursive: t.Boolean({ default: false }),
  include_hidden: t.Boolean({ default: false }),
  max_entries: t.Optional(t.Integer({ minimum: 1 })),
  filter: t.Optional(
    t.Object({
      file_type: t.Optional(
        t.Union([t.Literal("FILE"), t.Literal("DIRECTORY"), t.Literal("SYMLINK")]),
      ),
      min_size: t.Optional(t.Integer({ minimum: 0 })),
      max_size: t.Optional(t.Integer({ minimum: 0 })),
      modified_after: t.Optional(t.Date()),
      modified_before: t.Optional(t.Date()),
      owner: t.Optional(t.String()),
      group: t.Optional(t.String()),
      permission_mask: t.Optional(t.String({ pattern: "^[0-7]{3,4}$" })),
    }),
  ),
});

export type HDFSListRequestType = Static<typeof HDFSListRequest>;

// ===== DATA PROCESSING =====

/**
 * Parquet file schema for ServiceNow data
 */
export const ParquetSchema = t.Object({
  table_name: t.String({ minLength: 1 }),
  fields: t.Record(
    t.String(),
    t.Object({
      type: t.Union([
        t.Literal("string"),
        t.Literal("int32"),
        t.Literal("int64"),
        t.Literal("float"),
        t.Literal("double"),
        t.Literal("boolean"),
        t.Literal("timestamp"),
        t.Literal("date"),
      ]),
      optional: t.Boolean({ default: true }),
      repeated: t.Boolean({ default: false }),
      description: t.Optional(t.String()),
    }),
  ),
  compression: t.Union([
    t.Literal("uncompressed"),
    t.Literal("snappy"),
    t.Literal("gzip"),
    t.Literal("lzo"),
  ]),
  row_group_size: t.Integer({ minimum: 1, default: 50000 }),
  page_size: t.Integer({ minimum: 1, default: 1024 }),
});

export type ParquetSchemaType = Static<typeof ParquetSchema>;

/**
 * Data processing job configuration
 */
export const ProcessingJob = t.Object({
  job_id: t.String({ minLength: 1 }),
  job_name: t.String({ minLength: 1 }),
  job_type: t.Union([
    t.Literal("etl"),
    t.Literal("backup"),
    t.Literal("archive"),
    t.Literal("analytics"),
    t.Literal("migration"),
  ]),

  // Input/Output paths
  input_paths: t.Array(HDFSPath, { minItems: 1 }),
  output_path: HDFSPath,

  // Processing parameters
  parameters: t.Optional(
    t.Object({
      table_filters: t.Optional(t.Array(t.String())),
      date_range: t.Optional(
        t.Object({
          from: t.Date(),
          to: t.Date(),
        }),
      ),
      batch_size: t.Integer({ minimum: 1, default: 1000 }),
      parallel_tasks: t.Integer({ minimum: 1, default: 1 }),
      memory_limit_mb: t.Integer({ minimum: 1, default: 1024 }),
      timeout_minutes: t.Integer({ minimum: 1, default: 60 }),
    }),
  ),

  // Scheduling
  schedule: t.Optional(
    t.Object({
      type: t.Union([
        t.Literal("once"),
        t.Literal("hourly"),
        t.Literal("daily"),
        t.Literal("weekly"),
        t.Literal("monthly"),
        t.Literal("cron"),
      ]),
      cron_expression: t.Optional(t.String()),
      timezone: t.String({ default: "UTC" }),
      start_date: t.Optional(t.Date()),
      end_date: t.Optional(t.Date()),
    }),
  ),

  // Notification
  notifications: t.Optional(
    t.Object({
      on_success: t.Optional(t.Array(t.String())), // Email addresses
      on_failure: t.Optional(t.Array(t.String())),
      webhook_url: t.Optional(t.String({ format: "uri" })),
    }),
  ),

  created_by: t.String(),
  created_at: t.Date(),
  enabled: t.Boolean({ default: true }),
});

export type ProcessingJobType = Static<typeof ProcessingJob>;

/**
 * Job execution status
 */
export const JobExecution = t.Object({
  execution_id: t.String(),
  job_id: t.String(),
  status: t.Union([
    t.Literal("PENDING"),
    t.Literal("RUNNING"),
    t.Literal("COMPLETED"),
    t.Literal("FAILED"),
    t.Literal("CANCELLED"),
  ]),

  // Execution details
  started_at: t.Date(),
  completed_at: t.Optional(t.Date()),
  duration_ms: t.Optional(t.Integer({ minimum: 0 })),

  // Progress information
  total_records: t.Optional(t.Integer({ minimum: 0 })),
  processed_records: t.Integer({ minimum: 0, default: 0 }),
  failed_records: t.Integer({ minimum: 0, default: 0 }),
  progress_percentage: t.Number({ minimum: 0, maximum: 100, default: 0 }),

  // Resource usage
  memory_used_mb: t.Optional(t.Number({ minimum: 0 })),
  cpu_usage_percentage: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  bytes_read: t.Integer({ minimum: 0, default: 0 }),
  bytes_written: t.Integer({ minimum: 0, default: 0 }),

  // Results
  output_files: t.Optional(t.Array(HDFSPath)),
  logs: t.Optional(
    t.Array(
      t.Object({
        level: t.Union([
          t.Literal("DEBUG"),
          t.Literal("INFO"),
          t.Literal("WARN"),
          t.Literal("ERROR"),
        ]),
        message: t.String(),
        timestamp: t.Date(),
      }),
    ),
  ),

  error_message: t.Optional(t.String()),
  retry_count: t.Integer({ minimum: 0, default: 0 }),
});

export type JobExecutionType = Static<typeof JobExecution>;

// ===== HADOOP METRICS =====

/**
 * HDFS operation metrics
 */
export const HDFSMetrics = t.Object({
  operation: t.Union([
    t.Literal("create"),
    t.Literal("read"),
    t.Literal("write"),
    t.Literal("delete"),
    t.Literal("list"),
    t.Literal("stat"),
  ]),
  path: HDFSPath,
  size_bytes: t.Optional(t.Integer({ minimum: 0 })),
  duration_ms: t.Integer({ minimum: 0 }),
  success: t.Boolean(),
  error_code: t.Optional(t.String()),
  error_message: t.Optional(t.String()),
  user: t.String(),
  timestamp: t.Date(),

  // Performance metrics
  throughput_mbps: t.Optional(t.Number({ minimum: 0 })),
  latency_ms: t.Optional(t.Integer({ minimum: 0 })),
  blocks_processed: t.Optional(t.Integer({ minimum: 0 })),
});

export type HDFSMetricsType = Static<typeof HDFSMetrics>;

/**
 * Storage utilization report
 */
export const StorageUtilization = t.Object({
  path: HDFSPath,
  total_size_bytes: t.Integer({ minimum: 0 }),
  file_count: t.Integer({ minimum: 0 }),
  directory_count: t.Integer({ minimum: 0 }),

  // Size breakdown
  by_file_type: t.Record(
    t.String(),
    t.Object({
      count: t.Integer({ minimum: 0 }),
      total_size: t.Integer({ minimum: 0 }),
    }),
  ),

  by_age: t.Object({
    last_24h: t.Integer({ minimum: 0 }),
    last_week: t.Integer({ minimum: 0 }),
    last_month: t.Integer({ minimum: 0 }),
    older: t.Integer({ minimum: 0 }),
  }),

  // Largest files
  largest_files: t.Array(
    t.Object({
      path: HDFSPath,
      size_bytes: t.Integer({ minimum: 0 }),
      modified_time: t.Date(),
    }),
    { maxItems: 10 },
  ),

  generated_at: t.Date(),
});

export type StorageUtilizationType = Static<typeof StorageUtilization>;

// ===== EXPORT SUMMARY =====

/**
 * Hadoop schemas exported:
 *
 * Configuration:
 * - HadoopConfig: HDFS connection and authentication
 * - HDFSClusterStatus: Cluster health and capacity
 *
 * File Operations:
 * - HDFSPath: Path validation (must start with /)
 * - HDFSFileStatus: File metadata and attributes
 * - HDFSUploadRequest: Upload with compression options
 * - HDFSDownloadRequest: Download with byte range
 * - HDFSListRequest: Directory listing with filters
 *
 * Data Processing:
 * - ParquetSchema: Parquet file schema definition
 * - ProcessingJob: ETL/backup job configuration
 * - JobExecution: Job execution tracking
 *
 * Monitoring:
 * - HDFSMetrics: Operation performance metrics
 * - StorageUtilization: Storage analysis reports
 *
 * All schemas use TypeBox for Elysia native validation
 */
