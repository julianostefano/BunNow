/**
 * PerformanceMonitor - Advanced Performance Monitoring for BunSNC
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { logger } from "./Logger";

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "bytes" | "count" | "percentage" | "requests_per_second";
  timestamp: number;
  tags?: Record<string, string>;
  context?: string;
}

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

export interface PerformanceReport {
  period: {
    start: number;
    end: number;
    duration: number;
  };
  metrics: {
    summary: Record<
      string,
      {
        min: number;
        max: number;
        avg: number;
        count: number;
        latest: number;
      }
    >;
    detailed: PerformanceMetric[];
  };
  thresholds: {
    violations: Array<{
      metric: string;
      value: number;
      threshold: number;
      level: "warning" | "critical";
      timestamp: number;
    }>;
  };
  recommendations: string[];
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private thresholds: Map<string, PerformanceThreshold> = new Map();
  private timers: Map<string, { start: number; context?: string }> = new Map();
  private enabled: boolean = true;
  private maxMetrics: number = 10000;
  private cleanupInterval: number = 300000; // 5 minutes
  private cleanupTimer?: number;

  private constructor() {
    this.setupDefaultThresholds();
    this.startCleanupTimer();

    logger.debug("PerformanceMonitor initialized", "PerformanceMonitor", {
      maxMetrics: this.maxMetrics,
      cleanupInterval: this.cleanupInterval,
    });
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(
      `Performance monitoring ${enabled ? "enabled" : "disabled"}`,
      "PerformanceMonitor",
    );
  }

  /**
   * Start timing an operation
   */
  startTimer(name: string, context?: string): void {
    if (!this.enabled) return;

    this.timers.set(name, {
      start: performance.now(),
      context,
    });
  }

  /**
   * Stop timing an operation and record the metric
   */
  endTimer(name: string, tags?: Record<string, string>): number {
    if (!this.enabled) return 0;

    const timer = this.timers.get(name);
    if (!timer) {
      // Changed from warning to debug level to reduce noise for missing timers
      // This can happen in error scenarios where startTimer wasn't reached
      logger.debug(
        `Timer '${name}' not found - likely due to error before timer start`,
        "PerformanceMonitor",
      );
      return 0;
    }

    const duration = performance.now() - timer.start;
    this.timers.delete(name);

    this.recordMetric({
      name,
      value: duration,
      unit: "ms",
      timestamp: Date.now(),
      tags,
      context: timer.context,
    });

    return duration;
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.enabled) return;

    this.metrics.push(metric);

    // Check thresholds
    this.checkThresholds(metric);

    // Prevent memory leaks by limiting stored metrics
    if (this.metrics.length > this.maxMetrics) {
      const removeCount = Math.floor(this.maxMetrics * 0.1); // Remove 10%
      this.metrics.splice(0, removeCount);
    }

    logger.debug(`Metric recorded: ${metric.name}`, "PerformanceMonitor", {
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags,
    });
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(context?: string): void {
    if (!this.enabled) return;

    // In Node.js environment
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memory = process.memoryUsage();

      this.recordMetric({
        name: "memory_heap_used",
        value: memory.heapUsed,
        unit: "bytes",
        timestamp: Date.now(),
        context,
      });

      this.recordMetric({
        name: "memory_heap_total",
        value: memory.heapTotal,
        unit: "bytes",
        timestamp: Date.now(),
        context,
      });

      this.recordMetric({
        name: "memory_external",
        value: memory.external,
        unit: "bytes",
        timestamp: Date.now(),
        context,
      });
    }
  }

  /**
   * Record request rate
   */
  recordRequestRate(
    requests: number,
    timeWindow: number,
    context?: string,
  ): void {
    if (!this.enabled) return;

    const rate = requests / (timeWindow / 1000); // requests per second

    this.recordMetric({
      name: "request_rate",
      value: rate,
      unit: "requests_per_second",
      timestamp: Date.now(),
      context,
    });
  }

  /**
   * Record cache hit ratio
   */
  recordCacheHitRatio(hits: number, total: number, context?: string): void {
    if (!this.enabled) return;

    const ratio = total > 0 ? (hits / total) * 100 : 0;

    this.recordMetric({
      name: "cache_hit_ratio",
      value: ratio,
      unit: "percentage",
      timestamp: Date.now(),
      context,
    });
  }

  /**
   * Record error rate
   */
  recordErrorRate(errors: number, total: number, context?: string): void {
    if (!this.enabled) return;

    const rate = total > 0 ? (errors / total) * 100 : 0;

    this.recordMetric({
      name: "error_rate",
      value: rate,
      unit: "percentage",
      timestamp: Date.now(),
      context,
    });
  }

  /**
   * Set performance threshold
   */
  setThreshold(
    metric: string,
    warning: number,
    critical: number,
    unit: string,
  ): void {
    this.thresholds.set(metric, {
      metric,
      warning,
      critical,
      unit,
    });

    logger.debug(`Threshold set for ${metric}`, "PerformanceMonitor", {
      warning,
      critical,
      unit,
    });
  }

  /**
   * Get performance report for a time period
   */
  getReport(periodMinutes: number = 60): PerformanceReport {
    const now = Date.now();
    const periodStart = now - periodMinutes * 60 * 1000;

    const periodMetrics = this.metrics.filter(
      (m) => m.timestamp >= periodStart,
    );

    // Calculate summary statistics
    const summary: Record<string, any> = {};
    const metricsByName = new Map<string, PerformanceMetric[]>();

    periodMetrics.forEach((metric) => {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    });

    metricsByName.forEach((metrics, name) => {
      const values = metrics.map((m) => m.value);
      summary[name] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, val) => sum + val, 0) / values.length,
        count: values.length,
        latest: values[values.length - 1] || 0,
      };
    });

    // Find threshold violations
    const violations: any[] = [];
    periodMetrics.forEach((metric) => {
      const threshold = this.thresholds.get(metric.name);
      if (threshold) {
        if (metric.value >= threshold.critical) {
          violations.push({
            metric: metric.name,
            value: metric.value,
            threshold: threshold.critical,
            level: "critical",
            timestamp: metric.timestamp,
          });
        } else if (metric.value >= threshold.warning) {
          violations.push({
            metric: metric.name,
            value: metric.value,
            threshold: threshold.warning,
            level: "warning",
            timestamp: metric.timestamp,
          });
        }
      }
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, violations);

    return {
      period: {
        start: periodStart,
        end: now,
        duration: now - periodStart,
      },
      metrics: {
        summary,
        detailed: periodMetrics,
      },
      thresholds: {
        violations,
      },
      recommendations,
    };
  }

  /**
   * Get real-time metrics
   */
  getRealTimeMetrics(metricNames?: string[]): PerformanceMetric[] {
    const now = Date.now();
    const recentMetrics = this.metrics.filter((m) => now - m.timestamp < 60000); // Last minute

    if (metricNames) {
      return recentMetrics.filter((m) => metricNames.includes(m.name));
    }

    return recentMetrics;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.timers.clear();
    logger.info("Performance metrics cleared", "PerformanceMonitor");
  }

  /**
   * Get current performance snapshot
   */
  getSnapshot(): any {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(
      (m) => now - m.timestamp < 300000,
    ); // Last 5 minutes

    return {
      timestamp: now,
      totalMetrics: this.metrics.length,
      recentMetrics: recentMetrics.length,
      activeTimers: this.timers.size,
      enabled: this.enabled,
      thresholds: Array.from(this.thresholds.values()),
    };
  }

  private setupDefaultThresholds(): void {
    // Default performance thresholds
    this.setThreshold("response_time", 1000, 3000, "ms");
    this.setThreshold(
      "memory_heap_used",
      100 * 1024 * 1024,
      500 * 1024 * 1024,
      "bytes",
    );
    this.setThreshold("cache_hit_ratio", 70, 50, "percentage");
    this.setThreshold("error_rate", 5, 10, "percentage");
    this.setThreshold("request_rate", 50, 100, "requests_per_second");
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    if (metric.value >= threshold.critical) {
      logger.critical(
        `Critical threshold exceeded for ${metric.name}`,
        undefined,
        "PerformanceMonitor",
        {
          value: metric.value,
          threshold: threshold.critical,
          unit: metric.unit,
          tags: metric.tags,
          context: metric.context,
        },
      );
    } else if (metric.value >= threshold.warning) {
      logger.warn(
        `Warning threshold exceeded for ${metric.name}`,
        "PerformanceMonitor",
        {
          value: metric.value,
          threshold: threshold.warning,
          unit: metric.unit,
          tags: metric.tags,
          context: metric.context,
        },
      );
    }
  }

  private generateRecommendations(
    summary: Record<string, any>,
    violations: any[],
  ): string[] {
    const recommendations: string[] = [];

    // Response time recommendations
    if (summary.response_time && summary.response_time.avg > 2000) {
      recommendations.push(
        "Consider optimizing database queries or adding caching to improve response times",
      );
    }

    // Memory recommendations
    if (
      summary.memory_heap_used &&
      summary.memory_heap_used.max > 200 * 1024 * 1024
    ) {
      recommendations.push(
        "High memory usage detected. Consider implementing memory management strategies",
      );
    }

    // Cache recommendations
    if (summary.cache_hit_ratio && summary.cache_hit_ratio.avg < 80) {
      recommendations.push(
        "Low cache hit ratio. Review caching strategy and TTL settings",
      );
    }

    // Error rate recommendations
    if (summary.error_rate && summary.error_rate.avg > 3) {
      recommendations.push(
        "Elevated error rate detected. Review error logs and implement better error handling",
      );
    }

    // Critical violations
    const criticalViolations = violations.filter((v) => v.level === "critical");
    if (criticalViolations.length > 0) {
      recommendations.push(
        `Address ${criticalViolations.length} critical performance issues immediately`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Performance metrics are within acceptable ranges");
    }

    return recommendations;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval) as any;
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000; // Keep metrics for 24 hours

    const originalLength = this.metrics.length;
    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff);

    const removed = originalLength - this.metrics.length;
    if (removed > 0) {
      logger.debug(
        `Cleaned up ${removed} old performance metrics`,
        "PerformanceMonitor",
      );
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clearMetrics();
    logger.debug("PerformanceMonitor destroyed", "PerformanceMonitor");
  }
}

// Global performance monitor instance
export const performanceMonitor = PerformanceMonitor.getInstance();
export default performanceMonitor;
