/**
 * System Service - Consolidated infrastructure and system management
 * Consolidates SystemService, TaskManager, TransactionManager, GroupService, and legacy services
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from 'events';
import { MongoClient } from 'mongodb';
import { logger } from '../utils/Logger';
import { ServiceNowAuthClient } from './ServiceNowAuthClient';
import { SystemPerformanceMonitor } from './system/SystemPerformanceMonitor';
import { SystemTaskManager } from './system/SystemTaskManager';
import { SystemGroupManager } from './system/SystemGroupManager';
import { SystemTransactionManager } from './system/SystemTransactionManager';
import { LegacyServiceBridge } from './system/LegacyServiceBridge';

export interface SystemConfig {
  mongodb: {
    client: MongoClient;
    database: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  performance: {
    monitoring: boolean;
    thresholds: {
      response_time_warning: number;
      response_time_critical: number;
      memory_warning: number;
      memory_critical: number;
    };
  };
  tasks: {
    concurrency: number;
    retryDelay: number;
    maxRetries: number;
    cleanupInterval: number;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    performance: boolean;
    tasks: boolean;
    groups: boolean;
    transactions: boolean;
    legacy: boolean;
  };
  metrics: {
    uptime: number;
    memory_usage_mb: number;
    active_tasks: number;
    total_groups: number;
    active_transactions: number;
  };
  timestamp: string;
}

// Additional interfaces for system operations
export interface PerformanceStats {
  timeRange: number;
  metrics: {
    avgResponseTime: number;
    peakResponseTime: number;
    totalRequests: number;
    errorRate: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    cpuUsage: number;
  };
  alerts: Array<{
    type: 'warning' | 'critical';
    message: string;
    timestamp: string;
  }>;
}

export interface TaskData {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  data: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
}

export interface TaskOptions {
  priority?: number;
  timeout?: number;
  retries?: number;
}

export interface TaskStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  avgExecutionTime: number;
}

export interface SystemGroup {
  id: string;
  name: string;
  description?: string;
  members: string[];
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface GroupFilters {
  name?: string;
  active?: boolean;
  permissions?: string[];
  memberCount?: {
    min?: number;
    max?: number;
  };
}

export class SystemService extends EventEmitter {
  private static instance: SystemService;
  private performanceMonitor: SystemPerformanceMonitor;
  private taskManager: SystemTaskManager;
  private groupManager: SystemGroupManager;
  private transactionManager: SystemTransactionManager;
  private legacyBridge: LegacyServiceBridge;
  private config: SystemConfig;
  private isInitialized = false;
  private isRunning = false;

  private constructor(config: SystemConfig) {
    super();
    this.config = config;
    this.initializeComponents();
  }

  static getInstance(config?: SystemConfig): SystemService {
    if (!SystemService.instance && config) {
      SystemService.instance = new SystemService(config);
    }
    return SystemService.instance;
  }

  /**
   * Initialize all system components
   */
  private initializeComponents(): void {
    // Initialize specialized components
    this.performanceMonitor = new SystemPerformanceMonitor(this.config);
    this.taskManager = new SystemTaskManager(this.config);
    this.groupManager = new SystemGroupManager(this.config.mongodb);
    this.transactionManager = new SystemTransactionManager(this.config.mongodb);
    this.legacyBridge = new LegacyServiceBridge();

    // Set up cross-component event listeners
    this.setupEventListeners();

    logger.info(' SystemService components initialized');
  }

  /**
   * Set up event listeners between components
   */
  private setupEventListeners(): void {
    // Performance monitoring events
    this.performanceMonitor.on('thresholdExceeded', (event) => {
      logger.warn(`🚨 Performance threshold exceeded: ${event.type}`);
      this.emit('performanceAlert', event);
    });

    // Task manager events
    this.taskManager.on('taskCompleted', (event) => {
      this.performanceMonitor.recordMetric({
        operation: 'task_execution',
        response_time_ms: event.duration,
        endpoint: event.taskType
      });
    });

    // Transaction events
    this.transactionManager.on('transactionFailed', (event) => {
      logger.error(`💥 Transaction failed: ${event.transactionId}`);
      this.emit('systemError', event);
    });
  }

  /**
   * Initialize the entire system service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info(' Initializing SystemService...');

      // Initialize all components in parallel
      await Promise.all([
        this.performanceMonitor.initialize(),
        this.taskManager.initialize(),
        this.groupManager.initialize(),
        this.transactionManager.initialize(),
        this.legacyBridge.initialize()
      ]);

      this.isInitialized = true;
      logger.info(' SystemService initialized successfully');

    } catch (error) {
      logger.error(' Failed to initialize SystemService:', error);
      throw error;
    }
  }

  /**
   * Start all system services
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) return;

    try {
      logger.info(' Starting SystemService...');

      // Start all components
      await Promise.all([
        this.performanceMonitor.start(),
        this.taskManager.start()
      ]);

      this.isRunning = true;
      this.emit('started');
      logger.info(' SystemService started successfully');

    } catch (error) {
      logger.error(' Failed to start SystemService:', error);
      throw error;
    }
  }

  /**
   * Stop all system services
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      logger.info(' Stopping SystemService...');

      // Stop all components
      await Promise.all([
        this.performanceMonitor.stop(),
        this.taskManager.stop()
      ]);

      this.isRunning = false;
      this.emit('stopped');
      logger.info(' SystemService stopped successfully');

    } catch (error) {
      logger.error(' Failed to stop SystemService:', error);
      throw error;
    }
  }

  // === Performance Monitoring Methods ===
  async recordPerformanceMetric(metric: {
    operation: string;
    endpoint?: string;
    response_time_ms: number;
    memory_usage_mb?: number;
    error_count?: number;
  }): Promise<void> {
    return this.performanceMonitor.recordMetric(metric);
  }

  async getPerformanceStats(timeRange: number = 24): Promise<PerformanceStats> {
    return this.performanceMonitor.getStats(timeRange);
  }

  updatePerformanceThresholds(thresholds: Partial<SystemConfig['performance']['thresholds']>): void {
    this.performanceMonitor.updateThresholds(thresholds);
  }

  getMemoryUsage(): { heapUsed: number, heapTotal: number, external: number, rss: number } {
    return this.performanceMonitor.getMemoryUsage();
  }

  // === Task Management Methods ===
  async addTask(type: string, data: Record<string, unknown>, options?: TaskOptions): Promise<string> {
    priority?: 'low' | 'normal' | 'high' | 'critical';
    maxRetries?: number;
    tags?: string[];
  }): Promise<string> {
    return this.taskManager.addTask(type, data, options);
  }

  async getTask(taskId: string): Promise<TaskData | null> {
    return this.taskManager.getTask(taskId);
  }

  async cancelTask(taskId: string, reason?: string): Promise<void> {
    return this.taskManager.cancelTask(taskId, reason);
  }

  async getTaskStats(): Promise<TaskStats> {
    return this.taskManager.getStats();
  }

  async scheduleRecurringTask(options: {
    name: string;
    cronExpression: string;
    taskType: string;
    taskData: Record<string, unknown>;
    enabled?: boolean;
  }): Promise<string> {
    return this.taskManager.scheduleTask(options);
  }

  // === Group Management Methods ===
  async getGroups(filters?: GroupFilters): Promise<SystemGroup[]> {
    return this.groupManager.getGroups(filters);
  }

  async getGroup(groupId: string): Promise<SystemGroup | null> {
    return this.groupManager.getGroup(groupId);
  }

  async createGroup(groupData: Omit<SystemGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.groupManager.createGroup(groupData);
  }

  async updateGroup(groupId: string, updates: Partial<SystemGroup>): Promise<boolean> {
    return this.groupManager.updateGroup(groupId, updates);
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    return this.groupManager.deleteGroup(groupId);
  }

  // === Transaction Management Methods ===
  async startTransaction(options?: { timeout?: number, isolation?: string }): Promise<string> {
    return this.transactionManager.startTransaction(options);
  }

  async commitTransaction(transactionId: string): Promise<void> {
    return this.transactionManager.commitTransaction(transactionId);
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    return this.transactionManager.rollbackTransaction(transactionId);
  }

  async executeInTransaction<T>(
    operation: (transactionId: string) => Promise<T>,
    options?: { timeout?: number }
  ): Promise<T> {
    return this.transactionManager.executeInTransaction(operation, options);
  }

  // === Legacy Service Bridge Methods ===
  async handleLegacyAttachment(operation: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.legacyBridge.handleAttachment(operation, data);
  }

  async handleLegacyBatch(operation: string, data: any): Promise<any> {
    return this.legacyBridge.handleBatch(operation, data);
  }

  async handleLegacyServiceNow(operation: string, data: any): Promise<any> {
    return this.legacyBridge.handleServiceNow(operation, data);
  }

  // === System Health and Monitoring ===
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const [perfHealth, taskHealth, groupHealth, transHealth, legacyHealth] = await Promise.all([
        this.performanceMonitor.healthCheck(),
        this.taskManager.healthCheck(),
        this.groupManager.healthCheck(),
        this.transactionManager.healthCheck(),
        this.legacyBridge.healthCheck()
      ]);

      const memUsage = this.getMemoryUsage();
      const taskStats = await this.getTaskStats();

      const allHealthy = perfHealth && taskHealth && groupHealth && transHealth && legacyHealth;
      const status = allHealthy ? 'healthy' : 'degraded';

      return {
        status,
        services: {
          performance: perfHealth,
          tasks: taskHealth,
          groups: groupHealth,
          transactions: transHealth,
          legacy: legacyHealth
        },
        metrics: {
          uptime: Math.floor(process.uptime()),
          memory_usage_mb: memUsage.heapUsed,
          active_tasks: taskStats.active || 0,
          total_groups: await this.groupManager.getGroupCount(),
          active_transactions: await this.transactionManager.getActiveTransactionCount()
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(' Failed to get system health:', error);
      return {
        status: 'unhealthy',
        services: {
          performance: false,
          tasks: false,
          groups: false,
          transactions: false,
          legacy: false
        },
        metrics: {
          uptime: 0,
          memory_usage_mb: 0,
          active_tasks: 0,
          total_groups: 0,
          active_transactions: 0
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get comprehensive system statistics
   */
  async getSystemStats(): Promise<{
    performance: any;
    tasks: any;
    groups: any;
    transactions: any;
    system: any;
  }> {
    return {
      performance: await this.getPerformanceStats(),
      tasks: await this.getTaskStats(),
      groups: await this.groupManager.getStats(),
      transactions: await this.transactionManager.getStats(),
      system: {
        uptime: process.uptime(),
        memory: this.getMemoryUsage(),
        isRunning: this.isRunning,
        isInitialized: this.isInitialized
      }
    };
  }

  /**
   * Cleanup all system resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.stop();

      await Promise.all([
        this.performanceMonitor.cleanup(),
        this.taskManager.cleanup(),
        this.groupManager.cleanup(),
        this.transactionManager.cleanup(),
        this.legacyBridge.cleanup()
      ]);

      logger.info('🧹 SystemService cleanup completed');
    } catch (error) {
      logger.error(' SystemService cleanup failed:', error);
      throw error;
    }
  }
}

// Export factory function for dependency injection
export const createSystemService = (config: SystemConfig) => {
  return SystemService.getInstance(config);
};

// Export singleton for global use (will be initialized by main service)
export const systemService = SystemService.getInstance();