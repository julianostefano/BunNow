/**
 * Type definitions for BunSNC API Client
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T> {
  data: T & {
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      pages: number;
    };
  };
}

// ============================================================================
// INCIDENT TYPES
// ============================================================================

export interface Incident {
  sys_id: string;
  number: string;
  short_description: string;
  description: string;
  priority: string;
  priority_display?: string;
  state: string;
  state_display?: string;
  assignment_group: string;
  assignment_group_display?: string;
  assigned_to: string;
  assigned_to_display?: string;
  caller_id: string;
  caller_id_display?: string;
  category: string;
  subcategory: string;
  business_impact: string;
  urgency: string;
  sys_created_on: string;
  sys_updated_on: string;
  opened_at: string;
  resolved_at?: string;
  closed_at?: string;
  work_notes?: string;
  close_notes?: string;
  resolution_code?: string;
  location?: string;
  cmdb_ci?: string;
}

export interface IncidentFilters {
  state?: string;
  priority?: string;
  assignment_group?: string;
  search?: string;
  limit?: string;
}

export interface IncidentStats {
  active: number;
  high_priority: number;
  created_today: number;
  resolved_today: number;
  priority_distribution: Record<string, number>;
  avg_resolution_time: string;
  sla_compliance: number;
}

export interface TrendData {
  labels: string[];
  values: number[];
  period: string;
}

// ============================================================================
// TASK MANAGEMENT TYPES
// ============================================================================

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  data: Record<string, any>;
  progress: number;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: {
    tags?: string[];
    createdBy?: string;
    [key: string]: any;
  };
}

export enum TaskType {
  PARQUET_EXPORT = 'PARQUET_EXPORT',
  DATA_SYNC = 'DATA_SYNC',
  PIPELINE_EXECUTION = 'PIPELINE_EXECUTION',
  REPORT_GENERATION = 'REPORT_GENERATION',
  CACHE_REFRESH = 'CACHE_REFRESH',
  INDEX_OPTIMIZATION = 'INDEX_OPTIMIZATION',
  HDFS_CLEANUP = 'HDFS_CLEANUP',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying',
}

export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface CreateTaskRequest {
  type: TaskType;
  data: Record<string, any>;
  priority?: TaskPriority;
  maxRetries?: number;
  tags?: string[];
  createdBy?: string;
}

export interface TaskListResponse {
  tasks: Task[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    pages: number;
  };
}

export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  processing_rate: number;
  avg_execution_time: number;
  error_rate: number;
  queue_depth: number;
  workers: {
    active: number;
    idle: number;
    total: number;
  };
}

export interface SystemStats {
  queue: QueueStats;
  scheduler: SchedulerStats;
  metrics: any;
  system: {
    isRunning: boolean;
    uptime: number;
    tasksCreated: number;
    tasksCompleted: number;
    tasksFailed: number;
    successRate: number;
    averageExecutionTime: number;
  };
}

export interface HealthCheck {
  healthy: boolean;
  services: {
    queue: boolean;
    scheduler: boolean;
    redis: boolean;
  };
  timestamp: Date;
}

// ============================================================================
// SCHEDULED TASK TYPES
// ============================================================================

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  taskType: TaskType;
  taskData: Record<string, any>;
  priority: TaskPriority;
  maxRetries: number;
  timeout?: number;
  enabled: boolean;
  tags?: string[];
  createdBy: string;
  createdAt: Date;
  lastRun?: Date;
  nextRun: Date;
  runCount: number;
  failureCount: number;
}

export interface CreateScheduledTaskRequest {
  name: string;
  description: string;
  cronExpression: string;
  taskType: TaskType;
  taskData: Record<string, any>;
  priority?: TaskPriority;
  maxRetries?: number;
  timeout?: number;
  enabled?: boolean;
  tags?: string[];
  createdBy?: string;
}

export interface SchedulerStats {
  total: number;
  enabled: number;
  disabled: number;
  nextRun?: Date;
  lastRun?: Date;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}

// ============================================================================
// HIGH-LEVEL OPERATIONS TYPES
// ============================================================================

export interface ParquetExportRequest {
  table: string;
  filters?: Record<string, any>;
  compression?: string;
  priority?: TaskPriority;
}

export interface PipelineExecutionRequest {
  pipelineId: string;
  tables?: string[];
  priority?: TaskPriority;
}

export interface DataSyncRequest {
  tables: string[];
  incremental?: boolean;
  priority?: TaskPriority;
}

export interface CacheRefreshRequest {
  keys?: string[];
  priority?: TaskPriority;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface PerformanceMetrics {
  system: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    network_throughput: number;
  };
  processing: {
    records_per_second: number;
    active_streams: number;
    queue_depth: number;
    error_rate: number;
  };
  storage: {
    parquet_files: number;
    total_size_gb: number;
    compression_ratio: number;
    hdfs_health: string;
  };
  search: {
    indexed_documents: number;
    search_latency_ms: number;
    index_size_gb: number;
    query_rate: number;
  };
}

export interface TrendDataResponse {
  labels: string[];
  values: number[];
  type: string;
  period: string;
}

// ============================================================================
// CLIENT CONFIGURATION TYPES
// ============================================================================

export interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  auth?: {
    token?: string;
    username?: string;
    password?: string;
  };
}

export interface BatchOperationOptions {
  concurrency?: number;
  failFast?: boolean;
}

export interface WaitForCompletionOptions {
  timeout?: number;
  pollInterval?: number;
  onProgress?: (task: Task) => void;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class BunSNCError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'BunSNCError';
  }
}

export class TaskTimeoutError extends BunSNCError {
  constructor(taskId: string, timeout: number) {
    super(`Task ${taskId} timed out after ${timeout}ms`);
    this.name = 'TaskTimeoutError';
  }
}

export class TaskFailedError extends BunSNCError {
  constructor(taskId: string, reason: string) {
    super(`Task ${taskId} failed: ${reason}`);
    this.name = 'TaskFailedError';
  }
}

export class ConnectionError extends BunSNCError {
  constructor(message: string) {
    super(`Connection error: ${message}`);
    this.name = 'ConnectionError';
  }
}

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

export * from '../background/TaskQueue';
export * from '../background/TaskScheduler';
export * from '../background/TaskManager';