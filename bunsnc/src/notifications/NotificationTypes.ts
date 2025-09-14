/**
 * Notification System Types and Interfaces
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface BaseNotification {
  id: string;
  type: NotificationType;
  timestamp: Date;
  source: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  metadata?: Record<string, any>;
}

export enum NotificationType {
  // Task-related notifications
  TASK_CREATED = 'task.created',
  TASK_STARTED = 'task.started', 
  TASK_PROGRESS = 'task.progress',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_CANCELLED = 'task.cancelled',
  
  // System notifications
  SYSTEM_HEALTH = 'system.health',
  SYSTEM_ERROR = 'system.error',
  SYSTEM_WARNING = 'system.warning',
  SYSTEM_INFO = 'system.info',
  
  // ServiceNow notifications
  SERVICENOW_INCIDENT = 'servicenow.incident',
  SERVICENOW_PROBLEM = 'servicenow.problem',
  SERVICENOW_CHANGE = 'servicenow.change',
  SERVICENOW_CONNECTION = 'servicenow.connection',
  
  // Data processing notifications
  DATA_EXPORT_START = 'data.export.start',
  DATA_EXPORT_COMPLETE = 'data.export.complete',
  DATA_SYNC_START = 'data.sync.start',
  DATA_SYNC_COMPLETE = 'data.sync.complete',
  DATA_PIPELINE_START = 'data.pipeline.start',
  DATA_PIPELINE_COMPLETE = 'data.pipeline.complete',
  
  // Performance notifications
  PERFORMANCE_ALERT = 'performance.alert',
  PERFORMANCE_DEGRADATION = 'performance.degradation',
  PERFORMANCE_RECOVERY = 'performance.recovery',
  
  // Security notifications
  SECURITY_ALERT = 'security.alert',
  AUTH_SUCCESS = 'auth.success',
  AUTH_FAILURE = 'auth.failure',
  ACCESS_DENIED = 'access.denied'
}

export enum NotificationPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}

export enum NotificationChannel {
  WEBSOCKET = 'websocket',
  SSE = 'sse',
  PUSH = 'push',
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  DATABASE = 'database'
}

// Specific notification types
export interface TaskNotification extends BaseNotification {
  type: NotificationType.TASK_CREATED | NotificationType.TASK_STARTED | 
        NotificationType.TASK_PROGRESS | NotificationType.TASK_COMPLETED |
        NotificationType.TASK_FAILED | NotificationType.TASK_CANCELLED;
  data: {
    taskId: string;
    taskType: string;
    status: string;
    progress?: number;
    result?: Record<string, unknown>;
    error?: string;
    estimatedCompletion?: Date;
    duration?: number;
  };
}

export interface SystemNotification extends BaseNotification {
  type: NotificationType.SYSTEM_HEALTH | NotificationType.SYSTEM_ERROR |
        NotificationType.SYSTEM_WARNING | NotificationType.SYSTEM_INFO;
  data: {
    component: string;
    message: string;
    details?: Record<string, unknown>;
    metrics?: {
      cpu: number;
      memory: number;
      disk: number;
      network: number;
    };
    healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
  };
}

export interface ServiceNowNotification extends BaseNotification {
  type: NotificationType.SERVICENOW_INCIDENT | NotificationType.SERVICENOW_PROBLEM |
        NotificationType.SERVICENOW_CHANGE | NotificationType.SERVICENOW_CONNECTION;
  data: {
    recordId?: string;
    recordNumber?: string;
    tableName: string;
    action: 'created' | 'updated' | 'deleted' | 'connected' | 'disconnected';
    recordData?: Record<string, unknown>;
    connectionStatus?: 'connected' | 'disconnected' | 'error';
    instance?: string;
  };
}

export interface DataProcessingNotification extends BaseNotification {
  type: NotificationType.DATA_EXPORT_START | NotificationType.DATA_EXPORT_COMPLETE |
        NotificationType.DATA_SYNC_START | NotificationType.DATA_SYNC_COMPLETE |
        NotificationType.DATA_PIPELINE_START | NotificationType.DATA_PIPELINE_COMPLETE;
  data: {
    processId: string;
    processType: string;
    tableName?: string;
    recordCount?: number;
    filePath?: string;
    fileSize?: number;
    duration?: number;
    status: 'started' | 'completed' | 'failed';
    error?: string;
  };
}

export interface PerformanceNotification extends BaseNotification {
  type: NotificationType.PERFORMANCE_ALERT | NotificationType.PERFORMANCE_DEGRADATION |
        NotificationType.PERFORMANCE_RECOVERY;
  data: {
    metric: string;
    currentValue: number;
    threshold: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    impact: 'low' | 'medium' | 'high' | 'critical';
    recommendedAction?: string;
  };
}

export interface SecurityNotification extends BaseNotification {
  type: NotificationType.SECURITY_ALERT | NotificationType.AUTH_SUCCESS |
        NotificationType.AUTH_FAILURE | NotificationType.ACCESS_DENIED;
  data: {
    userId?: string;
    clientIp?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
    reason?: string;
    riskScore?: number;
    countryCode?: string;
  };
}

// Union type for all notifications
export type Notification = 
  | TaskNotification 
  | SystemNotification 
  | ServiceNowNotification 
  | DataProcessingNotification 
  | PerformanceNotification 
  | SecurityNotification;

// WebSocket message types
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'notification' | 'error';
  channel?: string;
  channels?: string[];
  data?: Record<string, unknown>;
  timestamp?: Date;
  clientId?: string;
}

export interface WebSocketSubscription {
  clientId: string;
  channels: Set<string>;
  filters?: {
    priority?: NotificationPriority[];
    types?: NotificationType[];
    sources?: string[];
  };
  lastSeen: Date;
  userAgent?: string;
  ip?: string;
}

// SSE (Server-Sent Events) types
export interface SSEStream {
  id: string;
  clientId: string;
  channels: Set<string>;
  controller: ReadableStreamDefaultController;
  filters?: {
    priority?: NotificationPriority[];
    types?: NotificationType[];
    sources?: string[];
  };
  startTime: Date;
  lastMessageTime: Date;
}

// Push notification types
export interface PushSubscription {
  clientId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  channels: string[];
  enabled: boolean;
  createdAt: Date;
}

// Notification queue item
export interface NotificationQueueItem {
  id: string;
  notification: Notification;
  channels: NotificationChannel[];
  retryCount: number;
  maxRetries: number;
  scheduledAt: Date;
  attempts: Array<{
    timestamp: Date;
    channel: NotificationChannel;
    success: boolean;
    error?: string;
  }>;
}

// Configuration interfaces
export interface NotificationConfig {
  websocket: {
    enabled: boolean;
    maxConnections: number;
    heartbeatInterval: number;
    idleTimeout: number;
    maxMessageSize: number;
  };
  sse: {
    enabled: boolean;
    maxStreams: number;
    heartbeatInterval: number;
    maxEventSize: number;
  };
  push: {
    enabled: boolean;
    vapidKeys: {
      publicKey: string;
      privateKey: string;
    };
    maxSubscriptions: number;
  };
  queue: {
    maxSize: number;
    retryDelays: number[];
    maxRetries: number;
    cleanupInterval: number;
  };
  channels: {
    [key: string]: {
      enabled: boolean;
      rateLimits?: {
        maxPerMinute: number;
        maxPerHour: number;
      };
    };
  };
}

// Notification statistics
export interface NotificationStats {
  total: {
    sent: number;
    failed: number;
    pending: number;
  };
  byChannel: {
    [channel: string]: {
      sent: number;
      failed: number;
      avgDeliveryTime: number;
    };
  };
  byType: {
    [type: string]: {
      count: number;
      avgFrequency: number;
    };
  };
  byPriority: {
    [priority: string]: number;
  };
  connections: {
    websocket: number;
    sse: number;
    push: number;
  };
  performance: {
    avgProcessingTime: number;
    queueSize: number;
    errorRate: number;
  };
}