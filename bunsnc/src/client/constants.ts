/**
 * Constants and configuration for BunSNC Client SDK
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { ClientConfig } from './types';

/**
 * Default client configuration
 */
export const DEFAULT_CLIENT_CONFIG: Required<Omit<ClientConfig, 'auth'>> & { auth?: ClientConfig['auth'] } = {
  baseUrl: 'http://localhost:3008',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'BunSNC-Client/1.0.0',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
  },
};

/**
 * Task polling intervals in milliseconds
 */
export const TASK_POLLING_INTERVALS = {
  FAST: 1000,
  NORMAL: 2000,
  SLOW: 5000,
  VERY_SLOW: 10000,
} as const;

/**
 * API endpoints mapping
 */
export const API_ENDPOINTS = {
  // Health and Info
  HEALTH: '/health',
  INFO: '/info',
  
  // Incidents API
  INCIDENTS: '/api/incidents',
  INCIDENT_BY_ID: (id: string) => `/api/incidents/${id}`,
  INCIDENT_STATS: '/api/incidents/stats/summary',
  INCIDENT_TRENDS: '/api/incidents/trends/hourly',
  INCIDENT_EXPORT: '/api/incidents/export/parquet',
  
  // Tasks API
  TASKS: '/api/v1/tasks',
  TASK_BY_ID: (id: string) => `/api/v1/tasks/${id}`,
  TASK_CANCEL: (id: string) => `/api/v1/tasks/${id}/cancel`,
  TASK_STATS_QUEUE: '/api/v1/tasks/stats/queue',
  TASK_STATS_SYSTEM: '/api/v1/tasks/stats/system',
  TASK_HISTORY: '/api/v1/tasks/history',
  TASK_HEALTH: '/api/v1/tasks/health',
  
  // Scheduled Tasks API
  SCHEDULED_TASKS: '/api/v1/tasks/scheduled',
  SCHEDULED_TASK_BY_ID: (id: string) => `/api/v1/tasks/scheduled/${id}`,
  SCHEDULED_TASK_TRIGGER: (id: string) => `/api/v1/tasks/scheduled/${id}/trigger`,
  SCHEDULED_TASK_ENABLE: (id: string) => `/api/v1/tasks/scheduled/${id}/enable`,
  
  // High-level Operations API
  EXPORT_PARQUET: '/api/v1/tasks/export/parquet',
  EXECUTE_PIPELINE: '/api/v1/tasks/pipeline/execute',
  SYNC_DATA: '/api/v1/tasks/sync/data',
  REFRESH_CACHE: '/api/v1/tasks/cache/refresh',
  MOCK_TASKS: '/api/v1/tasks/mock',
  
  // Analytics API
  ANALYTICS_DASHBOARD: '/api/v1/analytics/dashboard',
  ANALYTICS_PERFORMANCE: '/api/v1/analytics/performance',
  ANALYTICS_TRENDS: (type: string) => `/api/v1/analytics/trends/${type}`,
  
  // WebSocket and SSE
  WEBSOCKET: '/ws/control',
  SSE_STREAM: '/events/stream',
} as const;

/**
 * Error codes mapping
 */
export const ERROR_CODES = {
  // Client Errors (4xx)
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  
  // Server Errors (5xx)
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  
  // Custom Application Errors
  TASK_MANAGER_NOT_INITIALIZED: 1001,
  TASK_NOT_FOUND: 1002,
  INVALID_TASK_TYPE: 1003,
  INVALID_TASK_STATUS: 1004,
  TASK_EXECUTION_FAILED: 1005,
  SCHEDULE_VALIDATION_FAILED: 1006,
  REDIS_CONNECTION_FAILED: 1007,
  SERVICENOW_CONNECTION_FAILED: 1008,
  PARQUET_EXPORT_FAILED: 1009,
  PIPELINE_EXECUTION_FAILED: 1010,
} as const;

/**
 * Task type descriptions
 */
export const TASK_TYPE_DESCRIPTIONS = {
  PARQUET_EXPORT: 'Export ServiceNow data to Parquet format for analytics',
  DATA_SYNC: 'Synchronize data between ServiceNow and external systems',
  PIPELINE_EXECUTION: 'Execute data processing pipeline with multiple stages',
  REPORT_GENERATION: 'Generate reports and analytics summaries',
  CACHE_REFRESH: 'Refresh cached data and clear expired entries',
  INDEX_OPTIMIZATION: 'Optimize OpenSearch indices for better performance',
  HDFS_CLEANUP: 'Clean up old files and optimize HDFS storage',
} as const;

/**
 * Task priority levels with weights
 */
export const TASK_PRIORITY_WEIGHTS = {
  low: 1,
  normal: 5,
  high: 10,
  critical: 20,
} as const;

/**
 * Maximum values for various operations
 */
export const LIMITS = {
  MAX_TASKS_PER_REQUEST: 1000,
  MAX_RETRY_COUNT: 10,
  MAX_TIMEOUT_MS: 3600000, // 1 hour
  MAX_CONCURRENT_OPERATIONS: 50,
  MAX_BATCH_SIZE: 100,
  MAX_POLL_ATTEMPTS: 300, // 10 minutes at 2s intervals
  MAX_FILE_SIZE_MB: 100,
  MAX_QUERY_LENGTH: 10000,
} as const;

/**
 * Default timeouts for different operations
 */
export const DEFAULT_TIMEOUTS = {
  QUICK_OPERATION: 5000,   // 5 seconds
  STANDARD_OPERATION: 30000, // 30 seconds
  LONG_OPERATION: 300000,  // 5 minutes
  BATCH_OPERATION: 600000, // 10 minutes
  EXPORT_OPERATION: 1800000, // 30 minutes
} as const;

/**
 * HTTP status code messages
 */
export const HTTP_STATUS_MESSAGES = {
  [ERROR_CODES.BAD_REQUEST]: 'Bad Request',
  [ERROR_CODES.UNAUTHORIZED]: 'Unauthorized',
  [ERROR_CODES.FORBIDDEN]: 'Forbidden',
  [ERROR_CODES.NOT_FOUND]: 'Not Found',
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [ERROR_CODES.CONFLICT]: 'Conflict',
  [ERROR_CODES.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [ERROR_CODES.RATE_LIMITED]: 'Too Many Requests',
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [ERROR_CODES.NOT_IMPLEMENTED]: 'Not Implemented',
  [ERROR_CODES.BAD_GATEWAY]: 'Bad Gateway',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [ERROR_CODES.GATEWAY_TIMEOUT]: 'Gateway Timeout',
} as const;

/**
 * Service status indicators
 */
export const SERVICE_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
} as const;

/**
 * Cache keys for client-side caching
 */
export const CACHE_KEYS = {
  TASK_STATS: 'bunsnc:stats:tasks',
  SYSTEM_STATS: 'bunsnc:stats:system',
  INCIDENT_STATS: 'bunsnc:stats:incidents',
  HEALTH_CHECK: 'bunsnc:health',
  SERVER_INFO: 'bunsnc:info',
} as const;

/**
 * Cache TTL values in milliseconds
 */
export const CACHE_TTL = {
  SHORT: 30000,    // 30 seconds
  MEDIUM: 300000,  // 5 minutes
  LONG: 3600000,   // 1 hour
  VERY_LONG: 86400000, // 24 hours
} as const;

/**
 * Event types for real-time updates
 */
export const EVENT_TYPES = {
  TASK_CREATED: 'task.created',
  TASK_STARTED: 'task.started',
  TASK_PROGRESS: 'task.progress',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_CANCELLED: 'task.cancelled',
  SYSTEM_HEALTH: 'system.health',
  STATS_UPDATED: 'stats.updated',
} as const;

/**
 * WebSocket message types
 */
export const WS_MESSAGE_TYPES = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  DATA: 'data',
} as const;

/**
 * Compression algorithms supported
 */
export const COMPRESSION_ALGORITHMS = {
  SNAPPY: 'snappy',
  GZIP: 'gzip',
  LZ4: 'lz4',
  NONE: 'none',
} as const;

/**
 * File formats supported for export
 */
export const EXPORT_FORMATS = {
  PARQUET: 'parquet',
  JSON: 'json',
  CSV: 'csv',
  AVRO: 'avro',
} as const;

/**
 * Regular expressions for validation
 */
export const REGEX_PATTERNS = {
  TASK_ID: /^[a-zA-Z0-9_-]+$/,
  CRON_EXPRESSION: /^(\*|(?:[0-5]?\d(?:(?:-[0-5]?\d)|(?:,[0-5]?\d)*)?)) (\*|(?:(?:[01]?\d)|(?:2[0-3])(?:(?:-(?:(?:[01]?\d)|(?:2[0-3])))|(?:,(?:(?:[01]?\d)|(?:2[0-3])))*)?)) (\*|(?:(?:0?[1-9])|(?:[12]\d)|(?:3[01])(?:(?:-(?:(?:0?[1-9])|(?:[12]\d)|(?:3[01])))|(?:,(?:(?:0?[1-9])|(?:[12]\d)|(?:3[01])))*)?)) (\*|(?:(?:0?[1-9])|(?:1[012])(?:(?:-(?:(?:0?[1-9])|(?:1[012])))|(?:,(?:(?:0?[1-9])|(?:1[012])))*)?)) (\*|(?:[0-6](?:(?:-[0-6])|(?:,[0-6])*)?))$/,
  URL: /^https?:\/\/(?:[-\w.])+(?::[0-9]+)?(?:\/(?:[\w/_.])*)?(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SERVICENOW_INSTANCE: /^https:\/\/[a-zA-Z0-9-]+\.service-now\.com$/,
} as const;

/**
 * Color codes for console output
 */
export const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
} as const;

/**
 * Log levels
 */
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const;