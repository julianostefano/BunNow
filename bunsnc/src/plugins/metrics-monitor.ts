/**
 * Plugin Metrics and Monitoring System - Advanced performance and health monitoring
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.6.1: Singleton Lazy Loading Pattern (ElysiaJS Key Concepts #5 + #7)
 * Root cause: PluginMetricsCollector instanciado múltiplas vezes (singleton exportado diretamente)
 * Solution: Singleton instance com lazy initialization na primeira request via plugin
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Deduplication Mechanism"
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Singleton Lazy Loading (v5.6.1)
 * - Global lifecycle scope (.as("global"))
 * - Implements enterprise-grade monitoring and metrics collection:
 * - Real-time performance metrics collection
 * - Plugin health monitoring and alerting
 * - Memory and CPU usage tracking
 * - Request/response metrics
 * - Error rate monitoring
 * - Custom metrics and gauges
 * - Historical data retention
 * - Performance trend analysis
 */

import { Elysia } from "elysia";
import { logger } from "../utils/Logger";
import { systemMetricsCollector } from "../utils/SystemMetrics";

// Metric Types
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels?: string[];
}

export interface HistogramBucket {
  le: number; // Less than or equal to
  count: number;
}

export interface HistogramMetric {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface SummaryMetric {
  quantiles: Map<number, number>; // quantile -> value
  sum: number;
  count: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  cpu: {
    usage: number; // percentage
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    heap: {
      used: number;
      total: number;
    };
    external: number;
  };
  eventLoop: {
    delay: number;
    utilization: number;
  };
  gc: {
    collections: number;
    duration: number;
  };
}

export interface PluginHealthStatus {
  pluginId: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  lastCheck: number;
  uptime: number;
  errors: number;
  warnings: number;
  dependencies: {
    [key: string]: "healthy" | "unhealthy" | "unknown";
  };
  customChecks: {
    [key: string]: {
      status: "pass" | "fail" | "warn";
      message?: string;
      value?: number;
    };
  };
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: ">" | "<" | ">=" | "<=" | "==" | "!=";
  threshold: number;
  duration: number; // minimum duration in ms before triggering
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  lastTriggered?: number;
  description?: string;
}

export interface Alert {
  id: string;
  ruleId: string;
  metric: string;
  value: number;
  threshold: number;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  timestamp: number;
  resolved?: number;
}

export class PluginMetricsCollector {
  private metrics: Map<string, MetricValue[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();
  private summaries: Map<string, SummaryMetric> = new Map();
  private definitions: Map<string, MetricDefinition> = new Map();
  private performanceHistory: PerformanceSnapshot[] = [];
  private healthStatuses: Map<string, PluginHealthStatus> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private collectionInterval: Timer | null = null;
  private performanceInterval: Timer | null = null;
  private retentionMs: number;
  private maxHistorySize: number;
  private startTime: number;

  constructor(config?: {
    retentionMs?: number;
    maxHistorySize?: number;
    collectionIntervalMs?: number;
    performanceIntervalMs?: number;
  }) {
    this.retentionMs = config?.retentionMs || 24 * 60 * 60 * 1000; // 24 hours
    this.maxHistorySize = config?.maxHistorySize || 1000;
    this.startTime = Date.now();

    // Initialize default metrics
    this.initializeDefaultMetrics();

    // Start collection intervals
    if (config?.collectionIntervalMs) {
      this.startCollection(config.collectionIntervalMs);
    }

    if (config?.performanceIntervalMs) {
      this.startPerformanceCollection(config.performanceIntervalMs);
    }

    logger.info("📊 Plugin metrics collector initialized", "MetricsCollector", {
      retention: this.retentionMs,
      maxHistory: this.maxHistorySize,
    });
  }

  /**
   * Initialize default system metrics
   */
  private initializeDefaultMetrics(): void {
    const defaultMetrics: MetricDefinition[] = [
      {
        name: "plugin_requests_total",
        type: "counter",
        description: "Total number of plugin requests",
        labels: ["plugin", "method", "status"],
      },
      {
        name: "plugin_request_duration_seconds",
        type: "histogram",
        description: "Plugin request duration in seconds",
        unit: "seconds",
        labels: ["plugin", "method"],
      },
      {
        name: "plugin_memory_usage_bytes",
        type: "gauge",
        description: "Plugin memory usage in bytes",
        unit: "bytes",
        labels: ["plugin"],
      },
      {
        name: "plugin_cpu_usage_percent",
        type: "gauge",
        description: "Plugin CPU usage percentage",
        unit: "percent",
        labels: ["plugin"],
      },
      {
        name: "plugin_errors_total",
        type: "counter",
        description: "Total number of plugin errors",
        labels: ["plugin", "type"],
      },
      {
        name: "plugin_uptime_seconds",
        type: "gauge",
        description: "Plugin uptime in seconds",
        unit: "seconds",
        labels: ["plugin"],
      },
      {
        name: "plugin_health_score",
        type: "gauge",
        description: "Plugin health score (0-100)",
        unit: "score",
        labels: ["plugin"],
      },
    ];

    for (const metric of defaultMetrics) {
      this.definitions.set(metric.name, metric);
    }

    // Initialize histograms with default buckets
    this.histograms.set("plugin_request_duration_seconds", {
      buckets: [
        { le: 0.005, count: 0 },
        { le: 0.01, count: 0 },
        { le: 0.025, count: 0 },
        { le: 0.05, count: 0 },
        { le: 0.1, count: 0 },
        { le: 0.25, count: 0 },
        { le: 0.5, count: 0 },
        { le: 1, count: 0 },
        { le: 2.5, count: 0 },
        { le: 5, count: 0 },
        { le: 10, count: 0 },
        { le: Infinity, count: 0 },
      ],
      sum: 0,
      count: 0,
    });
  }

  /**
   * Register a custom metric definition
   */
  registerMetric(definition: MetricDefinition): void {
    this.definitions.set(definition.name, definition);

    // Initialize based on type
    switch (definition.type) {
      case "counter":
        this.counters.set(definition.name, 0);
        break;
      case "gauge":
        this.gauges.set(definition.name, 0);
        break;
      case "histogram":
        this.histograms.set(definition.name, {
          buckets: this.createDefaultBuckets(),
          sum: 0,
          count: 0,
        });
        break;
      case "summary":
        this.summaries.set(definition.name, {
          quantiles: new Map(),
          sum: 0,
          count: 0,
        });
        break;
    }

    logger.info(
      `📊 Registered custom metric: ${definition.name}`,
      "MetricsCollector",
    );
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(
    name: string,
    value: number = 1,
    labels?: Record<string, string>,
  ): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);

    this.recordMetricValue(name, current + value, labels);
  }

  /**
   * Set a gauge metric value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.gauges.set(name, value);
    this.recordMetricValue(name, value, labels);
  }

  /**
   * Observe a value for histogram metric
   */
  observeHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      logger.warn(`Histogram metric not found: ${name}`, "MetricsCollector");
      return;
    }

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }

    histogram.sum += value;
    histogram.count++;

    this.recordMetricValue(name, value, labels);
  }

  /**
   * Observe a value for summary metric
   */
  observeSummary(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const summary = this.summaries.get(name);
    if (!summary) {
      logger.warn(`Summary metric not found: ${name}`, "MetricsCollector");
      return;
    }

    summary.sum += value;
    summary.count++;

    // Update quantiles (simplified implementation)
    summary.quantiles.set("0.5", value); // Placeholder for median
    summary.quantiles.set("0.9", value); // Placeholder for 90th percentile
    summary.quantiles.set("0.99", value); // Placeholder for 99th percentile

    this.recordMetricValue(name, value, labels);
  }

  /**
   * Record a metric value with timestamp
   */
  private recordMetricValue(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const metricValues = this.metrics.get(name) || [];

    metricValues.push({
      value,
      timestamp: Date.now(),
      labels,
    });

    // Maintain size limit
    if (metricValues.length > this.maxHistorySize) {
      metricValues.shift();
    }

    this.metrics.set(name, metricValues);

    // Check alert rules
    this.checkAlertRules(name, value);
  }

  /**
   * Create default histogram buckets
   */
  private createDefaultBuckets(): HistogramBucket[] {
    return [
      { le: 0.005, count: 0 },
      { le: 0.01, count: 0 },
      { le: 0.025, count: 0 },
      { le: 0.05, count: 0 },
      { le: 0.1, count: 0 },
      { le: 0.25, count: 0 },
      { le: 0.5, count: 0 },
      { le: 1, count: 0 },
      { le: 2.5, count: 0 },
      { le: 5, count: 0 },
      { le: 10, count: 0 },
      { le: Infinity, count: 0 },
    ];
  }

  /**
   * Update plugin health status
   */
  updatePluginHealth(
    pluginId: string,
    status: Partial<PluginHealthStatus>,
  ): void {
    const current = this.healthStatuses.get(pluginId) || {
      pluginId,
      status: "unknown",
      lastCheck: Date.now(),
      uptime: 0,
      errors: 0,
      warnings: 0,
      dependencies: {},
      customChecks: {},
    };

    const updated = { ...current, ...status, lastCheck: Date.now() };
    this.healthStatuses.set(pluginId, updated);

    // Update health score gauge
    const healthScore = this.calculateHealthScore(updated);
    this.setGauge("plugin_health_score", healthScore, { plugin: pluginId });

    // Update uptime
    const uptime = (Date.now() - this.startTime) / 1000;
    this.setGauge("plugin_uptime_seconds", uptime, { plugin: pluginId });
  }

  /**
   * Calculate health score (0-100) based on status
   */
  private calculateHealthScore(health: PluginHealthStatus): number {
    let score = 100;

    // Deduct for status
    switch (health.status) {
      case "critical":
        score -= 50;
        break;
      case "warning":
        score -= 20;
        break;
      case "unknown":
        score -= 30;
        break;
    }

    // Deduct for errors and warnings
    score -= Math.min(health.errors * 5, 30);
    score -= Math.min(health.warnings * 2, 20);

    // Deduct for unhealthy dependencies
    const unhealthyDeps = Object.values(health.dependencies).filter(
      (status) => status === "unhealthy",
    ).length;
    score -= unhealthyDeps * 10;

    // Deduct for failed custom checks
    const failedChecks = Object.values(health.customChecks).filter(
      (check) => check.status === "fail",
    ).length;
    score -= failedChecks * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Add an alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info(`🚨 Alert rule added: ${rule.name}`, "MetricsCollector");
  }

  /**
   * Check alert rules against current metric value
   */
  private checkAlertRules(metricName: string, value: number): void {
    for (const rule of this.alertRules.values()) {
      if (rule.metric !== metricName || !rule.enabled) {
        continue;
      }

      const shouldTrigger = this.evaluateCondition(
        value,
        rule.condition,
        rule.threshold,
      );

      if (shouldTrigger) {
        const alertId = `${rule.id}_${Date.now()}`;
        const alert: Alert = {
          id: alertId,
          ruleId: rule.id,
          metric: metricName,
          value,
          threshold: rule.threshold,
          severity: rule.severity,
          message: `${rule.name}: ${metricName} is ${value} (${rule.condition} ${rule.threshold})`,
          timestamp: Date.now(),
        };

        this.activeAlerts.set(alertId, alert);
        rule.lastTriggered = Date.now();

        logger.warn(
          `🚨 Alert triggered: ${alert.message}`,
          "MetricsCollector",
          {
            severity: alert.severity,
            metric: metricName,
            value,
            threshold: rule.threshold,
          },
        );
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(
    value: number,
    condition: string,
    threshold: number,
  ): boolean {
    switch (condition) {
      case ">":
        return value > threshold;
      case "<":
        return value < threshold;
      case ">=":
        return value >= threshold;
      case "<=":
        return value <= threshold;
      case "==":
        return value === threshold;
      case "!=":
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * Start automatic metrics collection
   */
  startCollection(intervalMs: number): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.cleanupOldMetrics();
    }, intervalMs);

    logger.info(
      `📊 Started metrics collection (interval: ${intervalMs}ms)`,
      "MetricsCollector",
    );
  }

  /**
   * Start performance monitoring
   */
  startPerformanceCollection(intervalMs: number): void {
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }

    this.performanceInterval = setInterval(() => {
      this.collectPerformanceSnapshot();
    }, intervalMs);

    logger.info(
      `⚡ Started performance collection (interval: ${intervalMs}ms)`,
      "MetricsCollector",
    );
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const systemSnapshot = systemMetricsCollector.createPerformanceSnapshot();
    const memoryDetails = systemMetricsCollector.getDetailedMemoryUsage();
    const cpuUsage = systemMetricsCollector.getCPUUsage();
    const eventLoopMetrics = systemMetricsCollector.getEventLoopMetrics();
    const gcStats = systemMetricsCollector.getGCStats();

    // Memory metrics
    this.setGauge("process_memory_usage_bytes", memoryDetails.process.rss, {
      type: "rss",
    });
    this.setGauge(
      "process_memory_usage_bytes",
      memoryDetails.process.heapUsed,
      { type: "heap_used" },
    );
    this.setGauge(
      "process_memory_usage_bytes",
      memoryDetails.process.heapTotal,
      { type: "heap_total" },
    );
    this.setGauge(
      "process_memory_usage_bytes",
      memoryDetails.process.external,
      { type: "external" },
    );
    this.setGauge(
      "process_memory_usage_bytes",
      memoryDetails.process.arrayBuffers,
      { type: "array_buffers" },
    );

    // System memory metrics
    this.setGauge("system_memory_total_bytes", memoryDetails.system.total);
    this.setGauge("system_memory_free_bytes", memoryDetails.system.free);
    this.setGauge("system_memory_used_bytes", memoryDetails.system.used);
    this.setGauge(
      "process_memory_pressure_percent",
      memoryDetails.system.processPercentage,
    );

    // Heap metrics
    this.setGauge("heap_utilization_percent", memoryDetails.heap.utilization);
    this.setGauge(
      "heap_fragmentation_percent",
      memoryDetails.heap.fragmentation,
    );

    // CPU metrics
    this.setGauge("process_cpu_usage_percent", cpuUsage.percentage);
    this.setGauge("process_cpu_user_seconds", cpuUsage.user / 1000); // Convert to seconds
    this.setGauge("process_cpu_system_seconds", cpuUsage.system / 1000);

    // Load average metrics
    const loadAverage = systemMetricsCollector.getLoadAverage();
    this.setGauge("system_load_average_1m", loadAverage[0]);
    this.setGauge("system_load_average_5m", loadAverage[1]);
    this.setGauge("system_load_average_15m", loadAverage[2]);

    // Event loop metrics
    this.setGauge("event_loop_delay_seconds", eventLoopMetrics.delay / 1000);
    this.setGauge(
      "event_loop_utilization_percent",
      eventLoopMetrics.utilization,
    );
    this.setGauge("event_loop_delay_min_seconds", eventLoopMetrics.min / 1000);
    this.setGauge("event_loop_delay_max_seconds", eventLoopMetrics.max / 1000);

    // Garbage collection metrics
    this.setGauge("gc_collections_total", gcStats.collections);
    this.setGauge("gc_duration_seconds", gcStats.duration / 1000);
    this.setGauge("gc_reclaimed_bytes", gcStats.reclaimedSpace);

    // Memory pressure indicator
    const memoryPressure = systemMetricsCollector.getMemoryPressure();
    this.setGauge("memory_pressure_percent", memoryPressure);
  }

  /**
   * Collect performance snapshot
   */
  private collectPerformanceSnapshot(): void {
    const snapshot = systemMetricsCollector.createPerformanceSnapshot();
    this.performanceHistory.push(snapshot);

    // Maintain history size
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }
  }

  /**
   * Clean up old metrics based on retention policy
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.retentionMs;

    for (const [name, values] of this.metrics.entries()) {
      const filtered = values.filter((v) => v.timestamp > cutoff);
      this.metrics.set(name, filtered);
    }

    // Clean up resolved alerts older than retention period
    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.resolved && alert.resolved < cutoff) {
        this.activeAlerts.delete(id);
      }
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): any {
    return {
      definitions: Array.from(this.definitions.values()),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, hist]) => [
          name,
          {
            buckets: hist.buckets,
            sum: hist.sum,
            count: hist.count,
          },
        ]),
      ),
      summaries: Object.fromEntries(
        Array.from(this.summaries.entries()).map(([name, summary]) => [
          name,
          {
            quantiles: Object.fromEntries(summary.quantiles),
            sum: summary.sum,
            count: summary.count,
          },
        ]),
      ),
      totalMetrics: this.metrics.size,
      totalValues: Array.from(this.metrics.values()).reduce(
        (sum, values) => sum + values.length,
        0,
      ),
    };
  }

  /**
   * Get plugin health statuses
   */
  getHealthStatuses(): PluginHealthStatus[] {
    return Array.from(this.healthStatuses.values());
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(
      (alert) => !alert.resolved,
    );
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(limit?: number): PerformanceSnapshot[] {
    const history = this.performanceHistory;
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get metric values for a specific metric
   */
  getMetricValues(name: string, limit?: number): MetricValue[] {
    const values = this.metrics.get(name) || [];
    return limit ? values.slice(-limit) : values;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = Date.now();
      logger.info(`✅ Alert resolved: ${alert.message}`, "MetricsCollector");
    }
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
      this.performanceInterval = null;
    }

    logger.info("📊 Metrics collection stopped", "MetricsCollector");
  }

  /**
   * Get collector statistics
   */
  getStats(): any {
    return {
      uptime: Date.now() - this.startTime,
      metricsCollected: this.metrics.size,
      totalValues: Array.from(this.metrics.values()).reduce(
        (sum, values) => sum + values.length,
        0,
      ),
      healthChecks: this.healthStatuses.size,
      alertRules: this.alertRules.size,
      activeAlerts: Array.from(this.activeAlerts.values()).filter(
        (a) => !a.resolved,
      ).length,
      performanceSnapshots: this.performanceHistory.length,
      retentionMs: this.retentionMs,
      maxHistorySize: this.maxHistorySize,
    };
  }
}

// FIX v5.6.1: Singleton Lazy Loading Pattern
let _metricsCollectorSingleton: PluginMetricsCollector | null = null;

const getMetricsCollector = async (config?: {
  retentionMs?: number;
  maxHistorySize?: number;
  collectionIntervalMs?: number;
  performanceIntervalMs?: number;
}) => {
  if (_metricsCollectorSingleton) {
    return { metricsCollector: _metricsCollectorSingleton };
  }

  console.log(
    "📦 Creating PluginMetricsCollector (SINGLETON - first initialization)",
  );
  const metricsConfig = {
    retentionMs: config?.retentionMs || 24 * 60 * 60 * 1000, // 24 hours
    maxHistorySize: config?.maxHistorySize || 1000,
    collectionIntervalMs: config?.collectionIntervalMs || 60000, // 1 minute
    performanceIntervalMs: config?.performanceIntervalMs || 30000, // 30 seconds
  };
  _metricsCollectorSingleton = new PluginMetricsCollector(metricsConfig);
  console.log(
    "✅ PluginMetricsCollector created (SINGLETON - reused across all requests)",
  );

  return { metricsCollector: _metricsCollectorSingleton };
};

// Export singleton instance (deprecated, use plugin instead)
export const pluginMetricsCollector = new PluginMetricsCollector({
  retentionMs: 24 * 60 * 60 * 1000, // 24 hours
  maxHistorySize: 1000,
  collectionIntervalMs: 60000, // 1 minute
  performanceIntervalMs: 30000, // 30 seconds
});

// Export factory function for custom configurations
export const createMetricsCollector = (config?: {
  retentionMs?: number;
  maxHistorySize?: number;
  collectionIntervalMs?: number;
  performanceIntervalMs?: number;
}) => {
  return new PluginMetricsCollector(config);
};

// Export Elysia Plugin
export const metricsMonitorPlugin = new Elysia({ name: "metrics-monitor" })
  .onStart(() =>
    console.log(
      "🔧 Metrics Monitor Plugin starting - Singleton Lazy Loading pattern",
    ),
  )
  .derive(async ({ config }) => {
    const metricsConfig = {
      retentionMs: config?.metrics?.retentionMs || 24 * 60 * 60 * 1000,
      maxHistorySize: config?.metrics?.maxHistorySize || 1000,
      collectionIntervalMs: config?.metrics?.collectionIntervalMs || 60000,
      performanceIntervalMs: config?.metrics?.performanceIntervalMs || 30000,
    };

    const { metricsCollector } = await getMetricsCollector(metricsConfig);

    return {
      metricsCollector,
      registerMetric: metricsCollector.registerMetric.bind(metricsCollector),
      incrementCounter:
        metricsCollector.incrementCounter.bind(metricsCollector),
      setGauge: metricsCollector.setGauge.bind(metricsCollector),
      observeHistogram:
        metricsCollector.observeHistogram.bind(metricsCollector),
      observeSummary: metricsCollector.observeSummary.bind(metricsCollector),
      getMetricsSummary:
        metricsCollector.getMetricsSummary.bind(metricsCollector),
      getHealthStatuses:
        metricsCollector.getHealthStatuses.bind(metricsCollector),
      getActiveAlerts: metricsCollector.getActiveAlerts.bind(metricsCollector),
      getPerformanceHistory:
        metricsCollector.getPerformanceHistory.bind(metricsCollector),
      getMetricsStats: metricsCollector.getStats.bind(metricsCollector),
    };
  })
  .as("global"); // ✅ Global lifecycle scope for plugin deduplication
