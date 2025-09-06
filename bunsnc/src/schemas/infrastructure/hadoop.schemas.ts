/**
 * Hadoop HDFS Schemas - Big data storage and processing validation
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Hadoop/HDFS-specific validations
 * - File operations and metadata
 */

import { z } from 'zod';
import { ServiceNowDateTimeSchema } from '../core/base.schemas';

// ===== HADOOP CONFIGURATION =====

/**
 * Hadoop HDFS configuration schema
 */
export const HadoopConfigSchema = z.object({
  namenode: z.string().min(1, 'Namenode host is required'),
  port: z.number().int().min(1).max(65535).default(8020),
  protocol: z.enum(['hdfs', 'webhdfs']).default('webhdfs'),
  
  // Authentication
  auth: z.object({
    type: z.enum(['simple', 'kerberos']).default('simple'),
    username: z.string().min(1, 'Username is required'),
    principal: z.string().optional(), // For Kerberos
    keytab: z.string().optional(), // Path to keytab file
    realm: z.string().optional()
  }),
  
  // Connection options
  timeout: z.number().int().positive().default(30000),
  retries: z.number().int().min(0).default(3),
  retryInterval: z.number().int().positive().default(1000),
  
  // WebHDFS specific
  webhdfs: z.object({
    port: z.number().int().min(1).max(65535).default(9870),
    ssl: z.boolean().default(false),
    proxy_user: z.string().optional()
  }).optional(),
  
  // Performance options
  block_size: z.number().int().positive().default(134217728), // 128MB
  replication: z.number().int().min(1).max(10).default(3),
  buffer_size: z.number().int().positive().default(65536) // 64KB
});

/**
 * HDFS cluster status
 */
export const HDFSClusterStatusSchema = z.object({
  cluster_id: z.string(),
  namenode_id: z.string(),
  namenode_address: z.string(),
  state: z.enum(['ACTIVE', 'STANDBY', 'SAFEMODE']),
  
  // Capacity information
  capacity_total: z.number().int().min(0), // bytes
  capacity_used: z.number().int().min(0), // bytes
  capacity_remaining: z.number().int().min(0), // bytes
  capacity_used_non_dfs: z.number().int().min(0), // bytes
  
  // Block information
  total_blocks: z.number().int().min(0),
  missing_blocks: z.number().int().min(0),
  corrupt_blocks: z.number().int().min(0),
  under_replicated_blocks: z.number().int().min(0),
  
  // Node information
  total_nodes: z.number().int().min(0),
  live_nodes: z.number().int().min(0),
  dead_nodes: z.number().int().min(0),
  decommissioning_nodes: z.number().int().min(0),
  
  // File system information
  total_files: z.number().int().min(0),
  total_dirs: z.number().int().min(0),
  
  last_updated: z.date().default(() => new Date())
});

// ===== HDFS FILE OPERATIONS =====

/**
 * HDFS path validation
 */
export const HDFSPathSchema = z.string()
  .min(1, 'HDFS path cannot be empty')
  .regex(/^\//, 'HDFS path must start with /')
  .refine(path => !path.includes('//'), 'HDFS path cannot contain double slashes')
  .refine(path => !path.endsWith('/') || path === '/', 'HDFS path cannot end with slash except root');

/**
 * HDFS file status information
 */
export const HDFSFileStatusSchema = z.object({
  path: HDFSPathSchema,
  type: z.enum(['FILE', 'DIRECTORY', 'SYMLINK']),
  length: z.number().int().min(0), // File size in bytes
  owner: z.string(),
  group: z.string(),
  permission: z.string().regex(/^[0-7]{3,4}$/, 'Invalid permission format'),
  access_time: z.number().int().min(0), // Unix timestamp
  modification_time: z.number().int().min(0), // Unix timestamp
  block_size: z.number().int().positive(),
  replication: z.number().int().min(1),
  
  // Extended attributes
  symlink: HDFSPathSchema.optional(), // Target path for symlinks
  children_count: z.number().int().min(0).optional(), // For directories
  quota: z.number().int().min(-1).optional(), // -1 means no quota
  space_quota: z.number().int().min(-1).optional(),
  
  // Checksums
  checksum_type: z.string().optional(),
  checksum_bytes: z.string().optional() // Hex encoded checksum
});

/**
 * HDFS file upload request
 */
export const HDFSUploadRequestSchema = z.object({
  source_path: z.string().min(1, 'Source path is required'),
  destination_path: HDFSPathSchema,
  overwrite: z.boolean().default(false),
  block_size: z.number().int().positive().optional(),
  replication: z.number().int().min(1).max(10).optional(),
  permission: z.string().regex(/^[0-7]{3,4}$/).optional(),
  buffer_size: z.number().int().positive().optional(),
  
  // Metadata
  created_by: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  
  // Processing options
  compress: z.boolean().default(false),
  compression_type: z.enum(['gzip', 'snappy', 'lz4', 'bzip2']).optional(),
  validate_checksum: z.boolean().default(true)
});

/**
 * HDFS file download request
 */
export const HDFSDownloadRequestSchema = z.object({
  source_path: HDFSPathSchema,
  destination_path: z.string().min(1, 'Destination path is required'),
  offset: z.number().int().min(0).default(0),
  length: z.number().int().positive().optional(), // Download specific byte range
  buffer_size: z.number().int().positive().optional(),
  validate_checksum: z.boolean().default(true),
  preserve_attributes: z.boolean().default(false) // Preserve timestamps and permissions
});

/**
 * HDFS directory listing request
 */
export const HDFSListRequestSchema = z.object({
  path: HDFSPathSchema,
  recursive: z.boolean().default(false),
  include_hidden: z.boolean().default(false),
  max_entries: z.number().int().positive().optional(),
  filter: z.object({
    file_type: z.enum(['FILE', 'DIRECTORY', 'SYMLINK']).optional(),
    min_size: z.number().int().min(0).optional(),
    max_size: z.number().int().min(0).optional(),
    modified_after: z.date().optional(),
    modified_before: z.date().optional(),
    owner: z.string().optional(),
    group: z.string().optional(),
    permission_mask: z.string().regex(/^[0-7]{3,4}$/).optional()
  }).optional()
});

// ===== DATA PROCESSING =====

/**
 * Parquet file schema for ServiceNow data
 */
export const ParquetSchemaSchema = z.object({
  table_name: z.string().min(1, 'Table name is required'),
  fields: z.record(z.object({
    type: z.enum(['string', 'int32', 'int64', 'float', 'double', 'boolean', 'timestamp', 'date']),
    optional: z.boolean().default(true),
    repeated: z.boolean().default(false),
    description: z.string().optional()
  })),
  compression: z.enum(['uncompressed', 'snappy', 'gzip', 'lzo']).default('snappy'),
  row_group_size: z.number().int().positive().default(50000),
  page_size: z.number().int().positive().default(1024)
});

/**
 * Data processing job configuration
 */
export const ProcessingJobSchema = z.object({
  job_id: z.string().min(1, 'Job ID is required'),
  job_name: z.string().min(1, 'Job name is required'),
  job_type: z.enum(['etl', 'backup', 'archive', 'analytics', 'migration']),
  
  // Input/Output paths
  input_paths: z.array(HDFSPathSchema).min(1, 'At least one input path required'),
  output_path: HDFSPathSchema,
  
  // Processing parameters
  parameters: z.object({
    table_filters: z.array(z.string()).optional(),
    date_range: z.object({
      from: z.date(),
      to: z.date()
    }).optional(),
    batch_size: z.number().int().positive().default(1000),
    parallel_tasks: z.number().int().positive().default(1),
    memory_limit_mb: z.number().int().positive().default(1024),
    timeout_minutes: z.number().int().positive().default(60)
  }).optional(),
  
  // Scheduling
  schedule: z.object({
    type: z.enum(['once', 'hourly', 'daily', 'weekly', 'monthly', 'cron']),
    cron_expression: z.string().optional(),
    timezone: z.string().default('UTC'),
    start_date: z.date().optional(),
    end_date: z.date().optional()
  }).optional(),
  
  // Notification
  notifications: z.object({
    on_success: z.array(z.string()).optional(), // Email addresses
    on_failure: z.array(z.string()).optional(),
    webhook_url: z.string().url().optional()
  }).optional(),
  
  created_by: z.string(),
  created_at: z.date().default(() => new Date()),
  enabled: z.boolean().default(true)
});

/**
 * Job execution status
 */
export const JobExecutionSchema = z.object({
  execution_id: z.string(),
  job_id: z.string(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
  
  // Execution details
  started_at: z.date(),
  completed_at: z.date().optional(),
  duration_ms: z.number().int().min(0).optional(),
  
  // Progress information
  total_records: z.number().int().min(0).optional(),
  processed_records: z.number().int().min(0).default(0),
  failed_records: z.number().int().min(0).default(0),
  progress_percentage: z.number().min(0).max(100).default(0),
  
  // Resource usage
  memory_used_mb: z.number().min(0).optional(),
  cpu_usage_percentage: z.number().min(0).max(100).optional(),
  bytes_read: z.number().int().min(0).default(0),
  bytes_written: z.number().int().min(0).default(0),
  
  // Results
  output_files: z.array(HDFSPathSchema).optional(),
  logs: z.array(z.object({
    level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
    message: z.string(),
    timestamp: z.date()
  })).optional(),
  
  error_message: z.string().optional(),
  retry_count: z.number().int().min(0).default(0)
});

// ===== HADOOP METRICS =====

/**
 * HDFS operation metrics
 */
export const HDFSMetricsSchema = z.object({
  operation: z.enum(['create', 'read', 'write', 'delete', 'list', 'stat']),
  path: HDFSPathSchema,
  size_bytes: z.number().int().min(0).optional(),
  duration_ms: z.number().int().min(0),
  success: z.boolean(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  user: z.string(),
  timestamp: z.date().default(() => new Date()),
  
  // Performance metrics
  throughput_mbps: z.number().min(0).optional(),
  latency_ms: z.number().int().min(0).optional(),
  blocks_processed: z.number().int().min(0).optional()
});

/**
 * Storage utilization report
 */
export const StorageUtilizationSchema = z.object({
  path: HDFSPathSchema,
  total_size_bytes: z.number().int().min(0),
  file_count: z.number().int().min(0),
  directory_count: z.number().int().min(0),
  
  // Size breakdown
  by_file_type: z.record(z.object({
    count: z.number().int().min(0),
    total_size: z.number().int().min(0)
  })),
  
  by_age: z.object({
    last_24h: z.number().int().min(0),
    last_week: z.number().int().min(0),
    last_month: z.number().int().min(0),
    older: z.number().int().min(0)
  }),
  
  // Largest files
  largest_files: z.array(z.object({
    path: HDFSPathSchema,
    size_bytes: z.number().int().min(0),
    modified_time: z.date()
  })).max(10),
  
  generated_at: z.date().default(() => new Date())
});

// ===== TYPE EXPORTS =====

export type HadoopConfig = z.infer<typeof HadoopConfigSchema>;
export type HDFSClusterStatus = z.infer<typeof HDFSClusterStatusSchema>;
export type HDFSPath = z.infer<typeof HDFSPathSchema>;
export type HDFSFileStatus = z.infer<typeof HDFSFileStatusSchema>;
export type HDFSUploadRequest = z.infer<typeof HDFSUploadRequestSchema>;
export type HDFSDownloadRequest = z.infer<typeof HDFSDownloadRequestSchema>;
export type HDFSListRequest = z.infer<typeof HDFSListRequestSchema>;
export type ParquetSchema = z.infer<typeof ParquetSchemaSchema>;
export type ProcessingJob = z.infer<typeof ProcessingJobSchema>;
export type JobExecution = z.infer<typeof JobExecutionSchema>;
export type HDFSMetrics = z.infer<typeof HDFSMetricsSchema>;
export type StorageUtilization = z.infer<typeof StorageUtilizationSchema>;