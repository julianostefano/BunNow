/**
 * System Performance Monitor - Consolidated performance monitoring
 * Integrates functionality from SystemService
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { logger } from "../../utils/Logger";

export interface PerformanceMetric {
  timestamp: Date;
  operation: string;
  endpoint?: string;
  response_time_ms: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  database_queries?: number;
  cache_hits?: number;
  cache_misses?: number;
  redis_ops?: number;
  error_count?: number;
  request_size_kb?: number;
  response_size_kb?: number;
}

export interface PerformanceThresholds {
  response_time_warning: number;
  response_time_critical: number;
  memory_warning: number;
  memory_critical: number;
  cpu_warning: number;
  cpu_critical: number;
  error_rate_warning: number;
  error_rate_critical: number;
}

export class SystemPerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private thresholds: PerformanceThresholds;
  private isMonitoring = false;
  private monitoringInterval?: Timer;
  private config: any;
  private maxHistorySize = 1000;

  constructor(config: any) {
    super();
    this.config = config;
    this.thresholds = {
      response_time_warning:
        config.performance?.thresholds?.response_time_warning || 1000,
      response_time_critical:
        config.performance?.thresholds?.response_time_critical || 5000,
      memory_warning: config.performance?.thresholds?.memory_warning || 512,
      memory_critical: config.performance?.thresholds?.memory_critical || 1024,
      cpu_warning: 70,
      cpu_critical: 90,
      error_rate_warning: 5,
      error_rate_critical: 10,
    };
  }

  /**
   * Initialize performance monitoring
   */
  async initialize(): Promise<void> {
    try {
      logger.info(" [SystemPerformance] Initializing performance monitor...");
      // Initialize any required resources
      logger.info(" [SystemPerformance] Performance monitor initialized");
    } catch (error) {
      logger.error(" [SystemPerformance] Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Start performance monitoring
   */
  async start(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    logger.info(" [SystemPerformance] Starting performance monitoring...");

    // Monitor system metrics every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.collectSystemMetrics();
      await this.analyzePerformanceTrends();
      await this.checkThresholds();
    }, 30000);

    logger.info(" [SystemPerformance] Performance monitoring started");
  }

  /**
   * Stop performance monitoring
   */
  async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    logger.info(" [SystemPerformance] Performance monitoring stopped");
  }

  /**
   * Record a performance metric
   */
  async recordMetric(metric: Partial<PerformanceMetric>): Promise<void> {
    const completeMetric: PerformanceMetric = {
      timestamp: new Date(),
      operation: metric.operation || "unknown",
      response_time_ms: metric.response_time_ms || 0,
      endpoint: metric.endpoint,
      memory_usage_mb: metric.memory_usage_mb,
      cpu_usage_percent: metric.cpu_usage_percent,
      database_queries: metric.database_queries,
      cache_hits: metric.cache_hits,
      cache_misses: metric.cache_misses,
      redis_ops: metric.redis_ops,
      error_count: metric.error_count,
      request_size_kb: metric.request_size_kb,
      response_size_kb: metric.response_size_kb,
    };

    // Store in memory buffer
    this.metrics.push(completeMetric);

    // Keep only recent metrics in memory
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics = this.metrics.slice(-this.maxHistorySize);
    }

    // Store in MongoDB if available
    await this.persistMetric(completeMetric);

    // Check thresholds immediately for this metric
    await this.checkMetricThresholds(completeMetric);
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const memUsage = process.memoryUsage();
      const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);

      // Basic CPU usage estimation
      const cpuUsage = process.cpuUsage();
      const cpuPercent = Math.round(
        ((cpuUsage.user + cpuUsage.system) / 1000000) * 100,
      );

      await this.recordMetric({
        operation: "system_metrics",
        endpoint: "system",
        response_time_ms: 0,
        memory_usage_mb: memoryMB,
        cpu_usage_percent: Math.min(cpuPercent, 100),
      });

      logger.debug(
        `🖥️ [SystemPerformance] Memory: ${memoryMB}MB, CPU: ${Math.min(cpuPercent, 100)}%`,
      );
    } catch (error) {
      logger.error(
        " [SystemPerformance] Failed to collect system metrics:",
        error,
      );
    }
  }

  /**
   * Analyze performance trends
   */
  private async analyzePerformanceTrends(): Promise<void> {
    if (this.metrics.length < 10) return;

    const recent = this.metrics.slice(-10);
    const avgResponseTime =
      recent.reduce((sum, m) => sum + m.response_time_ms, 0) / recent.length;
    const avgMemory =
      recent
        .filter((m) => m.memory_usage_mb)
        .reduce((sum, m) => sum + (m.memory_usage_mb || 0), 0) /
      recent.filter((m) => m.memory_usage_mb).length;

    logger.debug(
      `📈 [SystemPerformance] Avg Response: ${avgResponseTime.toFixed(2)}ms, Avg Memory: ${avgMemory.toFixed(2)}MB`,
    );

    // Check for performance degradation trends
    if (avgResponseTime > this.thresholds.response_time_warning) {
      logger.warn(
        ` [SystemPerformance] Average response time: ${avgResponseTime.toFixed(2)}ms exceeds threshold: ${this.thresholds.response_time_warning}ms`,
      );
    }

    if (avgMemory > this.thresholds.memory_warning) {
      logger.warn(
        ` [SystemPerformance] Average memory usage: ${avgMemory.toFixed(2)}MB exceeds threshold: ${this.thresholds.memory_warning}MB`,
      );
    }
  }

  /**
   * Check performance thresholds
   */
  private async checkThresholds(): Promise<void> {
    if (this.metrics.length === 0) return;

    const latest = this.metrics[this.metrics.length - 1];
    await this.checkMetricThresholds(latest);
  }

  /**
   * Check thresholds for a specific metric
   */
  private async checkMetricThresholds(
    metric: PerformanceMetric,
  ): Promise<void> {
    // Response time thresholds
    if (metric.response_time_ms > this.thresholds.response_time_critical) {
      logger.error(
        `🚨 [SystemPerformance] CRITICAL - Response time: ${metric.response_time_ms}ms exceeds critical threshold: ${this.thresholds.response_time_critical}ms`,
      );
      this.emit("thresholdExceeded", {
        type: "response_time_critical",
        value: metric.response_time_ms,
        threshold: this.thresholds.response_time_critical,
        metric,
      });
    } else if (
      metric.response_time_ms > this.thresholds.response_time_warning
    ) {
      logger.warn(
        ` [SystemPerformance] WARNING - Response time: ${metric.response_time_ms}ms exceeds warning threshold: ${this.thresholds.response_time_warning}ms`,
      );
    }

    // Memory thresholds
    if (
      metric.memory_usage_mb &&
      metric.memory_usage_mb > this.thresholds.memory_critical
    ) {
      logger.error(
        `🚨 [SystemPerformance] CRITICAL - Memory usage: ${metric.memory_usage_mb}MB exceeds critical threshold: ${this.thresholds.memory_critical}MB`,
      );
      this.emit("thresholdExceeded", {
        type: "memory_critical",
        value: metric.memory_usage_mb,
        threshold: this.thresholds.memory_critical,
        metric,
      });
    } else if (
      metric.memory_usage_mb &&
      metric.memory_usage_mb > this.thresholds.memory_warning
    ) {
      logger.warn(
        ` [SystemPerformance] WARNING - Memory usage: ${metric.memory_usage_mb}MB exceeds warning threshold: ${this.thresholds.memory_warning}MB`,
      );
    }

    // CPU thresholds
    if (
      metric.cpu_usage_percent &&
      metric.cpu_usage_percent > this.thresholds.cpu_critical
    ) {
      logger.error(
        `🚨 [SystemPerformance] CRITICAL - CPU usage: ${metric.cpu_usage_percent}% exceeds critical threshold: ${this.thresholds.cpu_critical}%`,
      );
      this.emit("thresholdExceeded", {
        type: "cpu_critical",
        value: metric.cpu_usage_percent,
        threshold: this.thresholds.cpu_critical,
        metric,
      });
    } else if (
      metric.cpu_usage_percent &&
      metric.cpu_usage_percent > this.thresholds.cpu_warning
    ) {
      logger.warn(
        ` [SystemPerformance] WARNING - CPU usage: ${metric.cpu_usage_percent}% exceeds warning threshold: ${this.thresholds.cpu_warning}%`,
      );
    }
  }

  /**
   * Persist metric to MongoDB
   */
  private async persistMetric(metric: PerformanceMetric): Promise<void> {
    try {
      if (this.config.mongodb?.client) {
        const db = this.config.mongodb.client.db(this.config.mongodb.database);
        await db.collection("performance_metrics").insertOne(metric);
      }
    } catch (error) {
      logger.debug(
        " [SystemPerformance] Failed to persist metric (non-critical):",
        error,
      );
    }
  }

  /**
   * Get performance statistics
   */
  async getStats(timeRange: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
      const recentMetrics = this.metrics.filter((m) => m.timestamp >= since);

      if (recentMetrics.length === 0) {
        return {
          time_range_hours: timeRange,
          total_operations: 0,
          operations: [],
          current_memory_mb: Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024,
          ),
          monitoring_active: this.isMonitoring,
        };
      }

      // Group by operation
      const operationStats = recentMetrics.reduce((stats, metric) => {
        const op = metric.operation;
        if (!stats[op]) {
          stats[op] = {
            count: 0,
            totalResponseTime: 0,
            maxResponseTime: 0,
            minResponseTime: Number.MAX_VALUE,
            totalMemory: 0,
            memoryCount: 0,
            totalErrors: 0,
          };
        }

        const opStats = stats[op];
        opStats.count++;
        opStats.totalResponseTime += metric.response_time_ms;
        opStats.maxResponseTime = Math.max(
          opStats.maxResponseTime,
          metric.response_time_ms,
        );
        opStats.minResponseTime = Math.min(
          opStats.minResponseTime,
          metric.response_time_ms,
        );

        if (metric.memory_usage_mb) {
          opStats.totalMemory += metric.memory_usage_mb;
          opStats.memoryCount++;
        }

        if (metric.error_count) {
          opStats.totalErrors += metric.error_count;
        }

        return stats;
      }, {} as any);

      const operations = Object.keys(operationStats).map((op) => ({
        _id: op,
        count: operationStats[op].count,
        avg_response_time:
          operationStats[op].totalResponseTime / operationStats[op].count,
        max_response_time: operationStats[op].maxResponseTime,
        min_response_time:
          operationStats[op].minResponseTime === Number.MAX_VALUE
            ? 0
            : operationStats[op].minResponseTime,
        avg_memory:
          operationStats[op].memoryCount > 0
            ? operationStats[op].totalMemory / operationStats[op].memoryCount
            : null,
        total_errors: operationStats[op].totalErrors,
      }));

      return {
        time_range_hours: timeRange,
        total_operations: recentMetrics.length,
        operations,
        current_memory_mb: Math.round(
          process.memoryUsage().heapUsed / 1024 / 1024,
        ),
        monitoring_active: this.isMonitoring,
      };
    } catch (error) {
      logger.error(" [SystemPerformance] Failed to get stats:", error);
      return {};
    }
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info(
      "🎯 [SystemPerformance] Performance thresholds updated:",
      this.thresholds,
    );
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } {
    const mem = process.memoryUsage();
    return {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const memory = this.getMemoryUsage();
      return (
        memory.heapUsed < this.thresholds.memory_critical && this.isMonitoring
      );
    } catch (error) {
      logger.error(" [SystemPerformance] Health check failed:", error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();
    this.metrics = [];
    logger.info("🧹 [SystemPerformance] Cleanup completed");
  }
}
