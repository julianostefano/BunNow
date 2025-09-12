/**
 * Performance Monitoring Service - Real-time Performance Tracking
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { mongoClient } from '../config/mongodb';
import { serviceNowStreams } from '../config/redis-streams';
import { logger } from '../utils/Logger';

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
  response_time_warning: number; // ms
  response_time_critical: number; // ms
  memory_warning: number; // MB
  memory_critical: number; // MB
  cpu_warning: number; // %
  cpu_critical: number; // %
  error_rate_warning: number; // %
  error_rate_critical: number; // %
}

export class PerformanceMonitoringService {
  private metrics: PerformanceMetric[] = [];
  private thresholds: PerformanceThresholds = {
    response_time_warning: 1000,
    response_time_critical: 5000,
    memory_warning: 512,
    memory_critical: 1024,
    cpu_warning: 70,
    cpu_critical: 90,
    error_rate_warning: 5,
    error_rate_critical: 10
  };
  private isMonitoring = false;
  private monitoringInterval?: Timer;

  async initialize(): Promise<void> {
    try {
      await this.startContinuousMonitoring();
      logger.info('📊 Performance Monitoring Service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Performance Monitoring Service:', error);
      throw error;
    }
  }

  async startContinuousMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    logger.info('🚀 Starting continuous performance monitoring...');

    // Monitor system metrics every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.collectSystemMetrics();
      await this.analyzePerformanceTrends();
      await this.checkThresholds();
    }, 30000);

    // Monitor database performance every 60 seconds
    setInterval(async () => {
      await this.collectDatabaseMetrics();
    }, 60000);

    // Clean old metrics every 5 minutes
    setInterval(async () => {
      await this.cleanOldMetrics();
    }, 300000);
  }

  async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    logger.info('🛑 Performance monitoring stopped');
  }

  async recordMetric(metric: Partial<PerformanceMetric>): Promise<void> {
    const completeMetric: PerformanceMetric = {
      timestamp: new Date(),
      operation: metric.operation || 'unknown',
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
      response_size_kb: metric.response_size_kb
    };

    // Store in memory buffer
    this.metrics.push(completeMetric);
    
    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Store in MongoDB for persistence
    try {
      const db = mongoClient.getDatabase();
      await db.collection('performance_metrics').insertOne(completeMetric);
    } catch (error) {
      logger.error('❌ Failed to store performance metric:', error);
    }

    // Publish to Redis Streams for real-time monitoring
    await this.publishPerformanceEvent(completeMetric);
  }

  private async collectSystemMetrics(): Promise<void> {
    try {
      const memUsage = process.memoryUsage();
      const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      // Basic CPU usage estimation (not precise but useful)
      const cpuUsage = process.cpuUsage();
      const cpuPercent = Math.round((cpuUsage.user + cpuUsage.system) / 1000000 * 100);

      await this.recordMetric({
        operation: 'system_metrics',
        endpoint: 'system',
        response_time_ms: 0,
        memory_usage_mb: memoryMB,
        cpu_usage_percent: Math.min(cpuPercent, 100) // Cap at 100%
      });

      logger.debug(`🖥️ System Metrics - Memory: ${memoryMB}MB, CPU: ${Math.min(cpuPercent, 100)}%`);
    } catch (error) {
      logger.error('❌ Failed to collect system metrics:', error);
    }
  }

  private async collectDatabaseMetrics(): Promise<void> {
    try {
      const db = mongoClient.getDatabase();
      const stats = await db.admin().serverStatus();
      
      const connections = stats.connections?.current || 0;
      const opcounters = stats.opcounters || {};
      const totalOps = Object.values(opcounters).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);

      await this.recordMetric({
        operation: 'database_metrics',
        endpoint: 'mongodb',
        response_time_ms: 0,
        database_queries: totalOps
      });

      logger.debug(`💾 Database Metrics - Connections: ${connections}, Total Ops: ${totalOps}`);
    } catch (error) {
      logger.error('❌ Failed to collect database metrics:', error);
    }
  }

  private async analyzePerformanceTrends(): Promise<void> {
    if (this.metrics.length < 10) return;

    const recent = this.metrics.slice(-10);
    const avgResponseTime = recent.reduce((sum, m) => sum + m.response_time_ms, 0) / recent.length;
    const avgMemory = recent.filter(m => m.memory_usage_mb).reduce((sum, m) => sum + (m.memory_usage_mb || 0), 0) / recent.filter(m => m.memory_usage_mb).length;
    
    logger.debug(`📈 Performance Trends - Avg Response: ${avgResponseTime.toFixed(2)}ms, Avg Memory: ${avgMemory.toFixed(2)}MB`);

    // Check for performance degradation
    if (avgResponseTime > this.thresholds.response_time_warning) {
      logger.warn(`⚡ Performance Warning - Average response time: ${avgResponseTime.toFixed(2)}ms exceeds threshold: ${this.thresholds.response_time_warning}ms`);
    }

    if (avgMemory > this.thresholds.memory_warning) {
      logger.warn(`🧠 Memory Warning - Average memory usage: ${avgMemory.toFixed(2)}MB exceeds threshold: ${this.thresholds.memory_warning}MB`);
    }
  }

  private async checkThresholds(): Promise<void> {
    if (this.metrics.length === 0) return;

    const latest = this.metrics[this.metrics.length - 1];
    
    // Response time thresholds
    if (latest.response_time_ms > this.thresholds.response_time_critical) {
      logger.error(`🚨 CRITICAL - Response time: ${latest.response_time_ms}ms exceeds critical threshold: ${this.thresholds.response_time_critical}ms`);
      await this.triggerAlert('response_time_critical', latest);
    } else if (latest.response_time_ms > this.thresholds.response_time_warning) {
      logger.warn(`⚠️ WARNING - Response time: ${latest.response_time_ms}ms exceeds warning threshold: ${this.thresholds.response_time_warning}ms`);
    }

    // Memory thresholds
    if (latest.memory_usage_mb && latest.memory_usage_mb > this.thresholds.memory_critical) {
      logger.error(`🚨 CRITICAL - Memory usage: ${latest.memory_usage_mb}MB exceeds critical threshold: ${this.thresholds.memory_critical}MB`);
      await this.triggerAlert('memory_critical', latest);
    } else if (latest.memory_usage_mb && latest.memory_usage_mb > this.thresholds.memory_warning) {
      logger.warn(`⚠️ WARNING - Memory usage: ${latest.memory_usage_mb}MB exceeds warning threshold: ${this.thresholds.memory_warning}MB`);
    }

    // CPU thresholds
    if (latest.cpu_usage_percent && latest.cpu_usage_percent > this.thresholds.cpu_critical) {
      logger.error(`🚨 CRITICAL - CPU usage: ${latest.cpu_usage_percent}% exceeds critical threshold: ${this.thresholds.cpu_critical}%`);
      await this.triggerAlert('cpu_critical', latest);
    } else if (latest.cpu_usage_percent && latest.cpu_usage_percent > this.thresholds.cpu_warning) {
      logger.warn(`⚠️ WARNING - CPU usage: ${latest.cpu_usage_percent}% exceeds warning threshold: ${this.thresholds.cpu_warning}%`);
    }
  }

  private async triggerAlert(alertType: string, metric: PerformanceMetric): Promise<void> {
    try {
      // Publish alert to Redis Streams
      await serviceNowStreams.publishChange({
        type: 'performance_alert' as any,
        action: 'critical_threshold_exceeded',
        sys_id: `alert_${Date.now()}`,
        data: {
          alert_type: alertType,
          timestamp: metric.timestamp,
          operation: metric.operation,
          endpoint: metric.endpoint,
          value: this.getMetricValue(metric, alertType),
          threshold: this.getThreshold(alertType)
        }
      });

      logger.error(`🚨 Performance Alert Triggered: ${alertType} for ${metric.operation}`);
    } catch (error) {
      logger.error('❌ Failed to trigger performance alert:', error);
    }
  }

  private getMetricValue(metric: PerformanceMetric, alertType: string): number {
    switch (alertType) {
      case 'response_time_critical':
      case 'response_time_warning':
        return metric.response_time_ms;
      case 'memory_critical':
      case 'memory_warning':
        return metric.memory_usage_mb || 0;
      case 'cpu_critical':
      case 'cpu_warning':
        return metric.cpu_usage_percent || 0;
      default:
        return 0;
    }
  }

  private getThreshold(alertType: string): number {
    return (this.thresholds as any)[alertType] || 0;
  }

  private async publishPerformanceEvent(metric: PerformanceMetric): Promise<void> {
    try {
      // Only publish significant events to avoid spam
      if (metric.response_time_ms > 500 || (metric.memory_usage_mb && metric.memory_usage_mb > 100)) {
        await serviceNowStreams.publishChange({
          type: 'performance_metric' as any,
          action: 'recorded',
          sys_id: `metric_${Date.now()}`,
          data: {
            operation: metric.operation,
            endpoint: metric.endpoint,
            response_time_ms: metric.response_time_ms,
            memory_usage_mb: metric.memory_usage_mb,
            timestamp: metric.timestamp
          }
        });
      }
    } catch (error) {
      logger.debug('Failed to publish performance event (non-critical):', error);
    }
  }

  private async cleanOldMetrics(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      // Clean from MongoDB (keep last 30 days)
      const db = mongoClient.getDatabase();
      await db.collection('performance_metrics').deleteMany({
        timestamp: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      });

      // Clean from memory (keep last 1000 as already done in recordMetric)
      this.metrics = this.metrics.filter(m => m.timestamp > cutoffTime);

      logger.debug('🧹 Cleaned old performance metrics');
    } catch (error) {
      logger.error('❌ Failed to clean old metrics:', error);
    }
  }

  async getPerformanceStats(timeRange: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
      const db = mongoClient.getDatabase();
      
      const pipeline = [
        { $match: { timestamp: { $gte: since } } },
        {
          $group: {
            _id: "$operation",
            count: { $sum: 1 },
            avg_response_time: { $avg: "$response_time_ms" },
            max_response_time: { $max: "$response_time_ms" },
            min_response_time: { $min: "$response_time_ms" },
            avg_memory: { $avg: "$memory_usage_mb" },
            max_memory: { $max: "$memory_usage_mb" },
            total_errors: { $sum: "$error_count" }
          }
        },
        { $sort: { count: -1 } }
      ];

      const stats = await db.collection('performance_metrics').aggregate(pipeline).toArray();
      
      return {
        time_range_hours: timeRange,
        total_operations: stats.reduce((sum, s) => sum + s.count, 0),
        operations: stats,
        current_memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        monitoring_active: this.isMonitoring
      };
    } catch (error) {
      logger.error('❌ Failed to get performance stats:', error);
      return {};
    }
  }

  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('🎯 Performance thresholds updated:', this.thresholds);
  }

  getMemoryUsage(): { heapUsed: number, heapTotal: number, external: number, rss: number } {
    const mem = process.memoryUsage();
    return {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024)
    };
  }
}

export const performanceMonitoringService = new PerformanceMonitoringService();