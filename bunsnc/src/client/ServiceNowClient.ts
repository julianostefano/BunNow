/**
 * ServiceNowClient - Complete ServiceNow integration client with full PySNC compatibility
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { GlideRecord } from "../record/GlideRecord";
import { TableAPI } from "../api/TableAPI";
import { AttachmentAPI } from "../api/AttachmentAPI";
import { BatchAPI } from "../api/BatchAPI";
import { ConsolidatedServiceNowService as ServiceNowService } from "../services";
import { handleServiceNowError } from "../exceptions";
import { logger } from "../utils/Logger";
import { cache } from "../utils/Cache";
import { performanceMonitor } from "../utils/PerformanceMonitor";
import { transactionManager } from "../utils/TransactionManager";
import type { ServiceNowRecord, QueryOptions } from "../types/servicenow";

export interface IServiceNowClient {
  // Core properties
  instance: string;
  auth: string;

  // API instances
  table: TableAPI;
  attachment: AttachmentAPI;
  batch: BatchAPI;
  serviceNow: ServiceNowService;

  // Factory methods
  GlideRecord(
    table: string,
    batchSize?: number,
    rewindable?: boolean,
  ): GlideRecord;

  // Direct API methods
  query(options: QueryOptions): Promise<ServiceNowRecord[]>;
  create(table: string, data: ServiceNowRecord): Promise<ServiceNowRecord>;
  read(table: string, sysId: string): Promise<ServiceNowRecord | null>;
  update(
    table: string,
    sysId: string,
    data: Partial<ServiceNowRecord>,
  ): Promise<ServiceNowRecord>;
  delete(table: string, sysId: string): Promise<boolean>;

  // Batch operations
  createBatch(options?: {
    maxRetries?: number;
    retryDelay?: number;
    concurrencyLimit?: number;
  }): BatchAPI;

  // Attachment operations
  uploadAttachment(
    fileName: string,
    table: string,
    tableSysId: string,
    file: File | Buffer | Blob,
    contentType?: string,
  ): Promise<string>;
  downloadAttachment(sysId: string): Promise<Response>;
  listAttachments(
    table: string,
    tableSysId: string,
  ): Promise<ServiceNowRecord[]>;
  deleteAttachment(sysId: string): Promise<boolean>;

  // Utility methods
  testConnection(): Promise<boolean>;
  getStats(): Promise<{ status: string; instance: string; version?: string }>;

  // Cache and Performance
  enableCache(enabled: boolean): void;
  clearCache(): void;
  getCacheStats(): any;

  // Logging
  setLogLevel(level: string): void;
  getLogs(): any[];

  // Performance Monitoring
  getPerformanceReport(periodMinutes?: number): any;
  getPerformanceMetrics(): any;
  resetPerformanceStats(): void;

  // Transaction Management
  beginTransaction(options?: any): any;

  // System Health
  getSystemHealth(): any;
}

export class ServiceNowClient implements IServiceNowClient {
  public readonly instance: string;
  public readonly auth: string;
  public readonly table: TableAPI;
  public readonly attachment: AttachmentAPI;
  public readonly batch: BatchAPI;
  public readonly serviceNow: ServiceNowService;

  private cacheEnabled: boolean = true;
  private clientId: string;

  constructor(
    instanceUrl: string,
    authToken: string,
    options: {
      validateConnection?: boolean;
      enableCache?: boolean;
    } = {},
  ) {
    // Generate unique client ID for logging
    this.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Normalize instance URL
    this.instance = instanceUrl.endsWith("/")
      ? instanceUrl.slice(0, -1)
      : instanceUrl;

    this.auth = authToken;
    this.cacheEnabled = options.enableCache ?? true;

    // Initialize API instances
    this.table = new TableAPI(this.instance, this.auth);
    this.attachment = new AttachmentAPI(this.instance, this.auth);
    this.batch = new BatchAPI(this.table, this.attachment);
    this.serviceNow = new ServiceNowService({
      instanceUrl: this.instance,
      authToken: this.auth,
    });

    // Log client initialization
    logger.info("ServiceNow client initialized", "ServiceNowClient", {
      clientId: this.clientId,
      instance: this.instance,
      cacheEnabled: this.cacheEnabled,
    });

    // Start performance monitoring for this client
    performanceMonitor.recordMetric({
      name: "client_initialized",
      value: 1,
      unit: "count",
      timestamp: Date.now(),
      context: "ServiceNowClient",
      tags: { clientId: this.clientId, instance: this.instance },
    });

    // Validate connection if requested
    if (options.validateConnection) {
      this.testConnection().catch((error) => {
        logger.warn("Connection validation failed", "ServiceNowClient", {
          clientId: this.clientId,
          error: error.message,
        });

        performanceMonitor.recordMetric({
          name: "connection_validation_failed",
          value: 1,
          unit: "count",
          timestamp: Date.now(),
          context: "ServiceNowClient",
          tags: { clientId: this.clientId },
        });
      });
    }
  }

  /**
   * Factory method to create GlideRecord instances
   */
  GlideRecord(
    table: string,
    batchSize: number = 500,
    rewindable: boolean = true,
  ): GlideRecord {
    return new GlideRecord(this, table, batchSize, rewindable);
  }

  /**
   * Query records with advanced options
   */
  async query(options: QueryOptions): Promise<ServiceNowRecord[]> {
    performanceMonitor.startTimer(`query_${options.table}`, "ServiceNowClient");

    const operation = logger.operation("query", options.table, undefined, {
      clientId: this.clientId,
      query: options.query,
      limit: options.limit,
      offset: options.offset,
    });

    try {
      // Check cache first
      if (this.cacheEnabled && options.query) {
        const cached = cache.getCachedQuery(options.table, options.query);
        if (cached) {
          performanceMonitor.endTimer(`query_${options.table}`);

          performanceMonitor.recordMetric({
            name: "cache_hit",
            value: 1,
            unit: "count",
            timestamp: Date.now(),
            context: "ServiceNowClient",
            tags: {
              type: "query",
              table: options.table,
              clientId: this.clientId,
            },
          });

          operation.success("Query result retrieved from cache");
          return cached;
        }
      }

      const results = await this.table.query(options);

      // Cache the results
      if (this.cacheEnabled && options.query && results.length > 0) {
        cache.cacheQuery(options.table, options.query, results);
      }

      const queryDuration = performanceMonitor.endTimer(
        `query_${options.table}`,
      );

      performanceMonitor.recordMetric({
        name: "query_response_time",
        value: queryDuration,
        unit: "ms",
        timestamp: Date.now(),
        context: "ServiceNowClient",
        tags: {
          table: options.table,
          cached: "false",
          clientId: this.clientId,
        },
      });

      performanceMonitor.recordMetric({
        name: "query_result_count",
        value: results.length,
        unit: "count",
        timestamp: Date.now(),
        context: "ServiceNowClient",
        tags: { table: options.table, clientId: this.clientId },
      });

      operation.success(`Query completed: ${results.length} records`, {
        recordCount: results.length,
        cached: false,
        duration: queryDuration,
      });

      return results;
    } catch (error) {
      operation.error("Query failed", error);
      handleServiceNowError(error, "query records");
    }
  }

  /**
   * Create a new record
   */
  async create(
    table: string,
    data: ServiceNowRecord,
  ): Promise<ServiceNowRecord> {
    const operation = logger.operation("create", table, undefined, {
      clientId: this.clientId,
      dataSize: Object.keys(data).length,
    });

    try {
      const result = await this.table.create(table, data);

      // Cache the new record
      if (this.cacheEnabled && result.sys_id) {
        cache.cacheRecord(table, result.sys_id, result);

        // Invalidate table queries as data changed
        cache.invalidateTable(table);
      }

      operation.success("Record created", {
        sysId: result.sys_id,
      });

      return result;
    } catch (error) {
      operation.error("Record creation failed", error);
      handleServiceNowError(error, "create record");
    }
  }

  /**
   * Read a single record by sys_id
   */
  async read(table: string, sysId: string): Promise<ServiceNowRecord | null> {
    const operation = logger.operation("read", table, sysId, {
      clientId: this.clientId,
    });

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = cache.getCachedRecord(table, sysId);
        if (cached) {
          operation.success("Record retrieved from cache");
          return cached;
        }
      }

      const result = await this.table.get(table, sysId);

      // Cache the result
      if (this.cacheEnabled && result) {
        cache.cacheRecord(table, sysId, result);
      }

      operation.success(`Record retrieved`, {
        cached: false,
        found: !!result,
      });

      return result;
    } catch (error) {
      operation.error("Record read failed", error);
      handleServiceNowError(error, "read record");
    }
  }

  /**
   * Update an existing record
   */
  async update(
    table: string,
    sysId: string,
    data: Partial<ServiceNowRecord>,
  ): Promise<ServiceNowRecord> {
    const operation = logger.operation("update", table, sysId, {
      clientId: this.clientId,
      updateFields: Object.keys(data).length,
    });

    try {
      const result = await this.table.update(table, sysId, data);

      // Update cache
      if (this.cacheEnabled && result.sys_id) {
        cache.cacheRecord(table, result.sys_id, result);

        // Invalidate table queries as data changed
        cache.invalidateTable(table);
      }

      operation.success("Record updated", {
        sysId: result.sys_id,
        fieldsUpdated: Object.keys(data).length,
      });

      return result;
    } catch (error) {
      operation.error("Record update failed", error);
      handleServiceNowError(error, "update record");
    }
  }

  /**
   * Delete a record
   */
  async delete(table: string, sysId: string): Promise<boolean> {
    const operation = logger.operation("delete", table, sysId, {
      clientId: this.clientId,
    });

    try {
      const result = await this.table.delete(table, sysId);

      // Remove from cache and invalidate related data
      if (this.cacheEnabled) {
        cache.invalidateRecord(table, sysId);
      }

      operation.success(`Record deleted`, {
        deleted: result,
      });

      return result;
    } catch (error) {
      operation.error("Record delete failed", error);
      handleServiceNowError(error, "delete record");
    }
  }

  /**
   * Create a new batch instance
   */
  createBatch(
    options: {
      maxRetries?: number;
      retryDelay?: number;
      concurrencyLimit?: number;
    } = {},
  ): BatchAPI {
    return new BatchAPI(this.table, this.attachment, options);
  }

  /**
   * Upload an attachment
   */
  async uploadAttachment(
    fileName: string,
    table: string,
    tableSysId: string,
    file: File | Buffer | Blob,
    contentType?: string,
  ): Promise<string> {
    const operation = logger.operation("upload_attachment", table, tableSysId, {
      clientId: this.clientId,
      fileName,
      contentType,
      fileSize:
        file instanceof Buffer
          ? file.length
          : file instanceof Blob
            ? file.size
            : "unknown",
    });

    try {
      const result = await this.attachment.upload(
        fileName,
        table,
        tableSysId,
        file,
        contentType,
      );

      operation.success("Attachment uploaded", {
        attachmentId: result,
        fileName,
      });

      return result;
    } catch (error) {
      operation.error("Attachment upload failed", error);
      handleServiceNowError(error, "upload attachment");
    }
  }

  /**
   * Download an attachment
   */
  async downloadAttachment(sysId: string): Promise<Response> {
    const operation = logger.operation(
      "download_attachment",
      undefined,
      sysId,
      {
        clientId: this.clientId,
      },
    );

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = cache.getCachedAttachment(sysId);
        if (cached) {
          operation.success("Attachment retrieved from cache");
          // Convert cached data to Response-like object if needed
          return new Response(cached instanceof Buffer ? cached : cached);
        }
      }

      const result = await this.attachment.download(sysId);

      operation.success("Attachment downloaded", {
        size: result.headers.get("content-length") || "unknown",
      });

      return result;
    } catch (error) {
      operation.error("Attachment download failed", error);
      handleServiceNowError(error, "download attachment");
    }
  }

  /**
   * List attachments for a record
   */
  async listAttachments(
    table: string,
    tableSysId: string,
  ): Promise<ServiceNowRecord[]> {
    const operation = logger.operation("list_attachments", table, tableSysId, {
      clientId: this.clientId,
    });

    try {
      const result = await this.attachment.list(table, tableSysId);

      operation.success("Attachments listed", {
        attachmentCount: result.length,
      });

      return result;
    } catch (error) {
      operation.error("List attachments failed", error);
      handleServiceNowError(error, "list attachments");
    }
  }

  /**
   * Delete an attachment
   */
  async deleteAttachment(sysId: string): Promise<boolean> {
    const operation = logger.operation("delete_attachment", undefined, sysId, {
      clientId: this.clientId,
    });

    try {
      const result = await this.attachment.delete(sysId);

      // Remove from cache
      if (this.cacheEnabled) {
        cache.delete(`attachment:${sysId}`);
      }

      operation.success("Attachment deleted", {
        deleted: result,
      });

      return result;
    } catch (error) {
      operation.error("Attachment delete failed", error);
      handleServiceNowError(error, "delete attachment");
    }
  }

  /**
   * Test connection to ServiceNow instance
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.instance}/api/now/table/sys_properties?sysparm_limit=1`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: this.auth.startsWith("Bearer ")
              ? this.auth
              : `Bearer ${this.auth}`,
          },
        },
      );

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get instance statistics and health information
   */
  async getStats(): Promise<{
    status: string;
    instance: string;
    version?: string;
  }> {
    try {
      return await this.table.getStats();
    } catch (error) {
      return { status: "error", instance: this.instance };
    }
  }

  /**
   * Get total record count for a table with optional query
   */
  async getCount(table: string, query?: string): Promise<number> {
    const operation = logger.operation("get_count", table, undefined, {
      clientId: this.clientId,
      query: query || "none",
    });

    try {
      const result = await this.table.getCount(table, query);

      operation.success("Record count retrieved", {
        count: result,
        table,
        hasQuery: !!query,
      });

      return result;
    } catch (error) {
      operation.error("Get record count failed", error);
      handleServiceNowError(error, "get record count");
    }
  }

  /**
   * Execute multiple operations in sequence
   */
  async executeSequence(
    operations: Array<{
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      table: string;
      sysId?: string;
      data?: ServiceNowRecord;
    }>,
  ): Promise<ServiceNowRecord[]> {
    const operation = logger.operation("execute_sequence", "batch", undefined, {
      clientId: this.clientId,
      operationCount: operations.length,
      operations: operations.map((op) => ({
        method: op.method,
        table: op.table,
      })),
    });

    try {
      const results = await this.table.batch(operations);

      // Invalidate cache for affected tables
      if (this.cacheEnabled) {
        const affectedTables = new Set(operations.map((op) => op.table));
        for (const table of affectedTables) {
          cache.invalidateTable(table);
        }
      }

      operation.success("Batch operations completed", {
        operationCount: operations.length,
        resultCount: results.length,
        affectedTables: Array.from(new Set(operations.map((op) => op.table))),
      });

      return results;
    } catch (error) {
      operation.error("Batch execution failed", error);
      handleServiceNowError(error, "execute sequence");
    }
  }

  /**
   * Get attachment file content as text
   */
  async getAttachmentAsText(
    sysId: string,
    encoding: string = "utf-8",
  ): Promise<string> {
    const operation = logger.operation(
      "get_attachment_text",
      undefined,
      sysId,
      {
        clientId: this.clientId,
        encoding,
      },
    );

    try {
      const result = await this.attachment.getFileAsText(sysId, encoding);

      operation.success("Attachment content retrieved as text", {
        contentLength: result.length,
        encoding,
      });

      return result;
    } catch (error) {
      operation.error("Get attachment as text failed", error);
      handleServiceNowError(error, "get attachment as text");
    }
  }

  /**
   * Get attachment file content as Blob
   */
  async getAttachmentAsBlob(sysId: string): Promise<Blob> {
    const operation = logger.operation(
      "get_attachment_blob",
      undefined,
      sysId,
      {
        clientId: this.clientId,
      },
    );

    try {
      const result = await this.attachment.getFileAsBlob(sysId);

      operation.success("Attachment content retrieved as blob", {
        size: result.size,
        type: result.type,
      });

      return result;
    } catch (error) {
      operation.error("Get attachment as blob failed", error);
      handleServiceNowError(error, "get attachment as blob");
    }
  }

  /**
   * Get attachment metadata with file stats
   */
  async getAttachmentWithStats(
    sysId: string,
  ): Promise<ServiceNowRecord & { fileExists: boolean; accessible: boolean }> {
    const operation = logger.operation(
      "get_attachment_stats",
      undefined,
      sysId,
      {
        clientId: this.clientId,
      },
    );

    try {
      const result = await this.attachment.getWithStats(sysId);

      operation.success("Attachment stats retrieved", {
        fileExists: result.fileExists,
        accessible: result.accessible,
        fileName: result.file_name,
      });

      return result;
    } catch (error) {
      operation.error("Get attachment stats failed", error);
      handleServiceNowError(error, "get attachment with stats");
    }
  }

  /**
   * Bulk delete attachments
   */
  async bulkDeleteAttachments(sysIds: string[]): Promise<{
    deleted: number;
    errors: Array<{ sysId: string; error: string }>;
  }> {
    const operation = logger.operation(
      "bulk_delete_attachments",
      undefined,
      undefined,
      {
        clientId: this.clientId,
        attachmentCount: sysIds.length,
      },
    );

    try {
      const result = await this.attachment.bulkDelete(sysIds);

      // Remove from cache
      if (this.cacheEnabled) {
        sysIds.forEach((sysId) => {
          cache.delete(`attachment:${sysId}`);
        });
      }

      operation.success("Bulk delete attachments completed", {
        totalRequested: sysIds.length,
        deleted: result.deleted,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      operation.error("Bulk delete attachments failed", error);
      handleServiceNowError(error, "bulk delete attachments");
    }
  }

  /**
   * Static factory method for creating client instances
   */
  static create(
    instanceUrl: string,
    authToken: string,
    options: {
      validateConnection?: boolean;
    } = {},
  ): ServiceNowClient {
    return new ServiceNowClient(instanceUrl, authToken, options);
  }

  /**
   * Static method to create client from environment variables
   */
  static fromEnv(
    options: {
      validateConnection?: boolean;
    } = {},
  ): ServiceNowClient {
    const instanceUrl = process.env.SERVICENOW_INSTANCE;
    const authToken = process.env.SERVICENOW_TOKEN;

    if (!instanceUrl) {
      throw new Error("SERVICENOW_INSTANCE environment variable is required");
    }

    if (!authToken) {
      throw new Error("SERVICENOW_TOKEN environment variable is required");
    }

    return new ServiceNowClient(instanceUrl, authToken, options);
  }

  /**
   * Create client with basic auth
   */
  static createWithBasicAuth(
    instanceUrl: string,
    username: string,
    password: string,
    options: {
      validateConnection?: boolean;
    } = {},
  ): ServiceNowClient {
    const credentials = Buffer.from(`${username}:${password}`).toString(
      "base64",
    );
    const authToken = `Basic ${credentials}`;

    return new ServiceNowClient(instanceUrl, authToken, options);
  }

  /**
   * Create client with OAuth token
   */
  static createWithOAuth(
    instanceUrl: string,
    accessToken: string,
    options: {
      validateConnection?: boolean;
    } = {},
  ): ServiceNowClient {
    const authToken = `Bearer ${accessToken}`;
    return new ServiceNowClient(instanceUrl, authToken, options);
  }

  /**
   * Cache and Performance Methods
   */
  enableCache(enabled: boolean): void {
    this.cacheEnabled = enabled;
    logger.info(
      `Cache ${enabled ? "enabled" : "disabled"}`,
      "ServiceNowClient",
      {
        clientId: this.clientId,
      },
    );
  }

  clearCache(): void {
    cache.clear();
    logger.info("Cache cleared", "ServiceNowClient", {
      clientId: this.clientId,
    });
  }

  getCacheStats(): any {
    const stats = cache.getStats();
    logger.debug("Cache stats requested", "ServiceNowClient", {
      clientId: this.clientId,
      ...stats,
    });
    return stats;
  }

  /**
   * Logging Methods
   */
  setLogLevel(level: string): void {
    const logLevelMap: Record<string, number> = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      CRITICAL: 4,
    };

    const numericLevel = logLevelMap[level.toUpperCase()];
    if (numericLevel !== undefined) {
      (logger as any).config.level = numericLevel;
      logger.info(`Log level set to ${level}`, "ServiceNowClient", {
        clientId: this.clientId,
      });
    } else {
      logger.warn(`Invalid log level: ${level}`, "ServiceNowClient", {
        clientId: this.clientId,
        validLevels: Object.keys(logLevelMap),
      });
    }
  }

  getLogs(): any[] {
    const logs = logger.getLogs();
    logger.debug("Logs requested", "ServiceNowClient", {
      clientId: this.clientId,
      logCount: logs.length,
    });
    return logs;
  }

  /**
   * Performance Monitoring Methods
   */
  getPerformanceReport(periodMinutes: number = 60): any {
    const report = performanceMonitor.getReport(periodMinutes);
    logger.debug("Performance report requested", "ServiceNowClient", {
      clientId: this.clientId,
      periodMinutes,
      metricsCount: report.metrics.detailed.length,
    });
    return report;
  }

  getPerformanceMetrics(): any {
    const metrics = performanceMonitor.getRealTimeMetrics();
    const snapshot = performanceMonitor.getSnapshot();

    return {
      realTime: metrics,
      snapshot,
      clientId: this.clientId,
    };
  }

  resetPerformanceStats(): void {
    performanceMonitor.clearMetrics();
    logger.info("Performance statistics reset", "ServiceNowClient", {
      clientId: this.clientId,
    });
  }

  /**
   * Transaction Management Methods
   */
  beginTransaction(options: any = {}): any {
    const transaction = transactionManager.begin(this, {
      name: `client_${this.clientId}_transaction`,
      ...options,
    });

    logger.info("Transaction began", "ServiceNowClient", {
      clientId: this.clientId,
      transactionId: transaction.id,
    });

    return transaction;
  }

  /**
   * System Health Methods
   */
  getSystemHealth(): any {
    const cacheStats = this.getCacheStats();
    const performanceSnapshot = performanceMonitor.getSnapshot();
    const transactionStats = transactionManager.getStats();

    // Calculate health metrics
    const now = Date.now();
    const recentMetrics = performanceMonitor.getRealTimeMetrics();

    const avgResponseTime =
      recentMetrics
        .filter(
          (m) =>
            m.name.includes("response_time") || m.name.includes("duration"),
        )
        .reduce((sum, m) => sum + m.value, 0) /
      Math.max(1, recentMetrics.length);

    const errorRate =
      recentMetrics
        .filter((m) => m.name.includes("error"))
        .reduce((sum, m) => sum + m.value, 0) /
      Math.max(1, recentMetrics.length);

    const healthScore = this.calculateHealthScore(
      avgResponseTime,
      errorRate,
      cacheStats.hitRate,
    );

    return {
      timestamp: now,
      clientId: this.clientId,
      instance: this.instance,
      healthScore,
      status:
        healthScore >= 0.8
          ? "healthy"
          : healthScore >= 0.6
            ? "warning"
            : "critical",
      metrics: {
        avgResponseTime: avgResponseTime || 0,
        errorRate: errorRate || 0,
        cacheHitRate: cacheStats.hitRate * 100,
      },
      cache: {
        enabled: this.cacheEnabled,
        size: cacheStats.size,
        hitRate: cacheStats.hitRate,
        memoryUsage: cacheStats.memoryUsage,
      },
      performance: {
        enabled: performanceSnapshot.enabled,
        totalMetrics: performanceSnapshot.totalMetrics,
        recentMetrics: performanceSnapshot.recentMetrics,
      },
      transactions: {
        enabled: transactionStats.total > 0,
        active: transactionStats.active,
        completed: transactionStats.completed,
        rolledBack: transactionStats.rolledBack,
      },
    };
  }

  private calculateHealthScore(
    avgResponseTime: number,
    errorRate: number,
    cacheHitRate: number,
  ): number {
    let score = 1.0;

    // Response time impact (0-40% of score)
    if (avgResponseTime > 3000) score -= 0.4;
    else if (avgResponseTime > 1000) score -= 0.2;
    else if (avgResponseTime > 500) score -= 0.1;

    // Error rate impact (0-40% of score)
    if (errorRate > 0.1) score -= 0.4;
    else if (errorRate > 0.05) score -= 0.2;
    else if (errorRate > 0.02) score -= 0.1;

    // Cache hit rate impact (0-20% of score)
    if (cacheHitRate < 0.5) score -= 0.2;
    else if (cacheHitRate < 0.7) score -= 0.1;
    else if (cacheHitRate < 0.9) score -= 0.05;

    return Math.max(0, Math.min(1, score));
  }
}

// Default export for library usage
export default ServiceNowClient;
