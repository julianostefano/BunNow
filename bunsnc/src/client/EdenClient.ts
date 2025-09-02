/**
 * Eden Treaty Type-Safe Client SDK for BunSNC API
 * Provides full type-safe access to all ServiceNow integration APIs
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { treaty } from '@elysiajs/eden';

// Client configuration interface
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

// Default configuration
const DEFAULT_CONFIG: Required<Omit<ClientConfig, 'auth'>> & { auth?: ClientConfig['auth'] } = {
  baseUrl: 'http://localhost:3008',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'BunSNC-Client/1.0.0',
  },
};

/**
 * Main BunSNC Client class providing type-safe access to all APIs
 */
export class BunSNCClient {
  private client: ReturnType<typeof treaty>;
  private config: Required<Omit<ClientConfig, 'auth'>> & { auth?: ClientConfig['auth'] };

  constructor(config: ClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize Eden Treaty client
    this.client = treaty(this.config.baseUrl, {
      fetch: {
        timeout: this.config.timeout,
        headers: {
          ...this.config.headers,
          ...(this.config.auth?.token && { Authorization: `Bearer ${this.config.auth.token}` }),
          ...(this.config.auth?.username && this.config.auth?.password && {
            Authorization: `Basic ${btoa(`${this.config.auth.username}:${this.config.auth.password}`)}`
          }),
        },
      },
    });
  }

  /**
   * Update client configuration
   */
  updateConfig(newConfig: Partial<ClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize client with new config
    this.client = treaty(this.config.baseUrl, {
      fetch: {
        timeout: this.config.timeout,
        headers: {
          ...this.config.headers,
          ...(this.config.auth?.token && { Authorization: `Bearer ${this.config.auth.token}` }),
          ...(this.config.auth?.username && this.config.auth?.password && {
            Authorization: `Basic ${btoa(`${this.config.auth.username}:${this.config.auth.password}`)}`
          }),
        },
      },
    });
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.updateConfig({ auth: { token } });
  }

  /**
   * Set basic authentication
   */
  setBasicAuth(username: string, password: string): void {
    this.updateConfig({ auth: { username, password } });
  }

  // ============================================================================
  // INCIDENT API METHODS
  // ============================================================================

  /**
   * Get incidents with optional filtering
   */
  async getIncidents(params?: {
    state?: string;
    priority?: string;
    assignment_group?: string;
    search?: string;
    limit?: string;
  }) {
    return await this.client.api.incidents.get({ query: params });
  }

  /**
   * Get specific incident by ID
   */
  async getIncident(id: string) {
    return await this.client.api.incidents({ id }).get();
  }

  /**
   * Get incident summary statistics
   */
  async getIncidentStats() {
    return await this.client.api.incidents.stats.summary.get();
  }

  /**
   * Get incident hourly trends
   */
  async getIncidentTrends(days?: string) {
    return await this.client.api.incidents.trends.hourly.get({ query: { days } });
  }

  /**
   * Export incidents to Parquet format
   */
  async exportIncidentsToParquet(options?: {
    filters?: Record<string, any>;
    format?: string;
    compression?: string;
  }) {
    return await this.client.api.incidents.export.parquet.post(options || {});
  }

  // ============================================================================
  // TASK MANAGEMENT API METHODS
  // ============================================================================

  /**
   * Get tasks with optional filtering and pagination
   */
  async getTasks(params?: {
    status?: string;
    limit?: string;
    offset?: string;
  }) {
    return await this.client.api.v1.tasks.get({ query: params });
  }

  /**
   * Create a new task
   */
  async createTask(task: {
    type: string;
    data: Record<string, any>;
    priority?: string;
    maxRetries?: number;
    tags?: string[];
    createdBy?: string;
  }) {
    return await this.client.api.v1.tasks.post(task);
  }

  /**
   * Get specific task by ID
   */
  async getTask(id: string) {
    return await this.client.api.v1.tasks({ id }).get();
  }

  /**
   * Cancel a task
   */
  async cancelTask(id: string, reason?: string) {
    return await this.client.api.v1.tasks({ id }).cancel.post({ reason });
  }

  /**
   * Get task queue statistics
   */
  async getTaskQueueStats() {
    return await this.client.api.v1.tasks.stats.queue.get();
  }

  /**
   * Get system statistics
   */
  async getSystemStats() {
    return await this.client.api.v1.tasks.stats.system.get();
  }

  /**
   * Get task history
   */
  async getTaskHistory(limit?: string) {
    return await this.client.api.v1.tasks.history.get({ query: { limit } });
  }

  /**
   * Get task manager health check
   */
  async getTaskHealthCheck() {
    return await this.client.api.v1.tasks.health.get();
  }

  // ============================================================================
  // SCHEDULED TASKS API METHODS
  // ============================================================================

  /**
   * Get all scheduled tasks
   */
  async getScheduledTasks() {
    return await this.client.api.v1.tasks.scheduled.get();
  }

  /**
   * Create a new scheduled task
   */
  async createScheduledTask(task: {
    name: string;
    description: string;
    cronExpression: string;
    taskType: string;
    taskData: Record<string, any>;
    priority?: string;
    maxRetries?: number;
    timeout?: number;
    enabled?: boolean;
    tags?: string[];
    createdBy?: string;
  }) {
    return await this.client.api.v1.tasks.scheduled.post(task);
  }

  /**
   * Delete a scheduled task
   */
  async deleteScheduledTask(id: string) {
    return await this.client.api.v1.tasks.scheduled({ id }).delete();
  }

  /**
   * Trigger a scheduled task manually
   */
  async triggerScheduledTask(id: string) {
    return await this.client.api.v1.tasks.scheduled({ id }).trigger.post();
  }

  /**
   * Enable or disable a scheduled task
   */
  async setScheduledTaskEnabled(id: string, enabled: boolean) {
    return await this.client.api.v1.tasks.scheduled({ id }).enable.post({ enabled });
  }

  // ============================================================================
  // HIGH-LEVEL OPERATIONS API METHODS
  // ============================================================================

  /**
   * Export data to Parquet format
   */
  async exportToParquet(options: {
    table: string;
    filters?: Record<string, any>;
    compression?: string;
    priority?: string;
  }) {
    return await this.client.api.v1.tasks.export.parquet.post(options);
  }

  /**
   * Execute a data pipeline
   */
  async executePipeline(options: {
    pipelineId: string;
    tables?: string[];
    priority?: string;
  }) {
    return await this.client.api.v1.tasks.pipeline.execute.post(options);
  }

  /**
   * Sync data from ServiceNow
   */
  async syncData(options: {
    tables: string[];
    incremental?: boolean;
    priority?: string;
  }) {
    return await this.client.api.v1.tasks.sync.data.post(options);
  }

  /**
   * Refresh cache
   */
  async refreshCache(options?: {
    keys?: string[];
    priority?: string;
  }) {
    return await this.client.api.v1.tasks.cache.refresh.post(options || {});
  }

  /**
   * Get mock data for testing
   */
  async getMockTaskData() {
    return await this.client.api.v1.tasks.mock.get();
  }

  // ============================================================================
  // ANALYTICS API METHODS
  // ============================================================================

  /**
   * Get analytics dashboard HTML
   */
  async getAnalyticsDashboard() {
    return await this.client.api.v1.analytics.dashboard.get();
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics() {
    return await this.client.api.v1.analytics.performance.get();
  }

  /**
   * Get trend data for specific type
   */
  async getTrendData(type: string, days?: string) {
    return await this.client.api.v1.analytics.trends({ type }).get({ query: { days } });
  }

  // ============================================================================
  // SERVER HEALTH & INFO METHODS
  // ============================================================================

  /**
   * Get server health status
   */
  async getHealth() {
    return await this.client.health.get();
  }

  /**
   * Get server information
   */
  async getServerInfo() {
    return await this.client.info.get();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Test connection to the server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.getHealth();
      return response.data?.healthy === true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Wait for task completion
   */
  async waitForTaskCompletion(
    taskId: string, 
    options: { 
      timeout?: number; 
      pollInterval?: number; 
      onProgress?: (task: any) => void;
    } = {}
  ): Promise<any> {
    const { timeout = 300000, pollInterval = 2000, onProgress } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const response = await this.getTask(taskId);
      
      if (!response.data?.success) {
        throw new Error(`Failed to get task ${taskId}: ${response.data?.error}`);
      }

      const task = response.data.data.task;
      
      if (onProgress) {
        onProgress(task);
      }

      if (task.status === 'completed') {
        return task;
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        throw new Error(`Task ${taskId} ${task.status}: ${task.error || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Task ${taskId} timed out after ${timeout}ms`);
  }

  /**
   * Get task execution progress
   */
  async getTaskProgress(taskId: string): Promise<number> {
    const response = await this.getTask(taskId);
    
    if (!response.data?.success) {
      throw new Error(`Failed to get task ${taskId}: ${response.data?.error}`);
    }

    return response.data.data.task.progress || 0;
  }

  /**
   * Batch operations utility
   */
  async batchOperation<T>(
    operations: (() => Promise<T>)[],
    options: { concurrency?: number; failFast?: boolean } = {}
  ): Promise<T[]> {
    const { concurrency = 5, failFast = true } = options;
    const results: T[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      
      const promises = batch.map(async (operation, index) => {
        try {
          return await operation();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push(err);
          
          if (failFast) {
            throw err;
          }
          
          return null;
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter(result => result !== null));
    }

    if (errors.length > 0 && !failFast) {
      console.warn(`Batch operation completed with ${errors.length} errors:`, errors);
    }

    return results;
  }
}

/**
 * Factory function to create a new BunSNC client
 */
export function createBunSNCClient(config?: ClientConfig): BunSNCClient {
  return new BunSNCClient(config);
}

/**
 * Default client instance
 */
export const bunSNCClient = new BunSNCClient();

export default BunSNCClient;