/**
 * PerformanceMonitor Tests - Comprehensive test suite for performance monitoring
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  PerformanceMonitor,
  PerformanceMetric,
  performanceMonitor,
} from "../../utils/PerformanceMonitor";

describe("PerformanceMonitor", () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clearMetrics();
    monitor.setEnabled(true);
  });

  afterEach(() => {
    monitor.clearMetrics();
  });

  describe("Basic Functionality", () => {
    test("should be a singleton", () => {
      const monitor1 = PerformanceMonitor.getInstance();
      const monitor2 = PerformanceMonitor.getInstance();

      expect(monitor1).toBe(monitor2);
      expect(performanceMonitor).toBe(monitor1);
    });

    test("should enable and disable monitoring", () => {
      monitor.setEnabled(false);

      monitor.recordMetric({
        name: "test_metric",
        value: 100,
        unit: "ms",
        timestamp: Date.now(),
      });

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(0);

      monitor.setEnabled(true);

      monitor.recordMetric({
        name: "test_metric",
        value: 200,
        unit: "ms",
        timestamp: Date.now(),
      });

      const enabledMetrics = monitor.getRealTimeMetrics();
      expect(enabledMetrics).toHaveLength(1);
    });

    test("should record custom metrics", () => {
      const metric: PerformanceMetric = {
        name: "custom_metric",
        value: 42,
        unit: "count",
        timestamp: Date.now(),
        tags: { component: "test" },
        context: "TestContext",
      };

      monitor.recordMetric(metric);

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual(metric);
    });
  });

  describe("Timer Operations", () => {
    test("should start and end timers", () => {
      const timerName = "test_timer";

      monitor.startTimer(timerName, "TestContext");

      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 10) {
        // Wait for at least 10ms
      }

      const duration = monitor.endTimer(timerName);

      expect(duration).toBeGreaterThan(0);

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe(timerName);
      expect(metrics[0].unit).toBe("ms");
      expect(metrics[0].value).toBe(duration);
    });

    test("should handle timer with tags", () => {
      const timerName = "tagged_timer";
      const tags = { operation: "query", table: "incident" };

      monitor.startTimer(timerName, "TestContext");

      const duration = monitor.endTimer(timerName, tags);

      expect(duration).toBeGreaterThan(0);

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics[0].tags).toEqual(tags);
    });

    test("should handle missing timer gracefully", () => {
      const duration = monitor.endTimer("non_existent_timer");

      expect(duration).toBe(0);
    });

    test("should handle multiple concurrent timers", () => {
      monitor.startTimer("timer1", "Context1");
      monitor.startTimer("timer2", "Context2");
      monitor.startTimer("timer3", "Context3");

      const duration1 = monitor.endTimer("timer1");
      const duration2 = monitor.endTimer("timer2");
      const duration3 = monitor.endTimer("timer3");

      expect(duration1).toBeGreaterThan(0);
      expect(duration2).toBeGreaterThan(0);
      expect(duration3).toBeGreaterThan(0);

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(3);
    });
  });

  describe("Specialized Metrics", () => {
    test("should record memory usage in Node.js environment", () => {
      // Mock process.memoryUsage for testing
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = () => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 50 * 1024 * 1024,
        heapUsed: 30 * 1024 * 1024,
        external: 5 * 1024 * 1024,
        arrayBuffers: 0,
      });

      monitor.recordMemoryUsage("TestContext");

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(3); // heap_used, heap_total, external

      const heapUsedMetric = metrics.find((m) => m.name === "memory_heap_used");
      expect(heapUsedMetric).toBeTruthy();
      expect(heapUsedMetric!.value).toBe(30 * 1024 * 1024);
      expect(heapUsedMetric!.unit).toBe("bytes");

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    test("should record request rate", () => {
      const requests = 100;
      const timeWindow = 5000; // 5 seconds

      monitor.recordRequestRate(requests, timeWindow, "TestContext");

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe("request_rate");
      expect(metrics[0].value).toBe(20); // 100 requests / 5 seconds = 20 RPS
      expect(metrics[0].unit).toBe("requests_per_second");
    });

    test("should record cache hit ratio", () => {
      const hits = 80;
      const total = 100;

      monitor.recordCacheHitRatio(hits, total, "TestContext");

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe("cache_hit_ratio");
      expect(metrics[0].value).toBe(80); // 80%
      expect(metrics[0].unit).toBe("percentage");
    });

    test("should record error rate", () => {
      const errors = 5;
      const total = 100;

      monitor.recordErrorRate(errors, total, "TestContext");

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe("error_rate");
      expect(metrics[0].value).toBe(5); // 5%
      expect(metrics[0].unit).toBe("percentage");
    });

    test("should handle zero values correctly", () => {
      monitor.recordCacheHitRatio(0, 0, "TestContext");
      monitor.recordErrorRate(0, 0, "TestContext");

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].value).toBe(0);
      expect(metrics[1].value).toBe(0);
    });
  });

  describe("Thresholds and Alerts", () => {
    test("should set custom thresholds", () => {
      monitor.setThreshold("response_time", 500, 1000, "ms");
      monitor.setThreshold("error_rate", 2, 5, "percentage");

      // Test that thresholds are applied (would need to check logs in real implementation)
      monitor.recordMetric({
        name: "response_time",
        value: 1500, // Exceeds critical threshold
        unit: "ms",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "error_rate",
        value: 3, // Exceeds warning threshold
        unit: "percentage",
        timestamp: Date.now(),
      });

      const metrics = monitor.getRealTimeMetrics();
      expect(metrics).toHaveLength(2);
    });
  });

  describe("Reports and Analytics", () => {
    test("should generate performance report", () => {
      // Add test metrics
      const now = Date.now();
      const metrics = [
        {
          name: "response_time",
          value: 100,
          unit: "ms",
          timestamp: now - 1000,
        },
        { name: "response_time", value: 150, unit: "ms", timestamp: now - 500 },
        { name: "response_time", value: 200, unit: "ms", timestamp: now },
        {
          name: "error_rate",
          value: 2,
          unit: "percentage",
          timestamp: now - 800,
        },
        {
          name: "error_rate",
          value: 3,
          unit: "percentage",
          timestamp: now - 200,
        },
      ];

      metrics.forEach((metric) =>
        monitor.recordMetric(metric as PerformanceMetric),
      );

      const report = monitor.getReport(1); // 1 minute period

      expect(report.period.duration).toBeGreaterThan(0);
      expect(report.metrics.summary).toBeTruthy();
      expect(report.metrics.detailed).toHaveLength(5);

      // Check response_time summary
      const responseTimeSummary = report.metrics.summary.response_time;
      expect(responseTimeSummary).toBeTruthy();
      expect(responseTimeSummary.min).toBe(100);
      expect(responseTimeSummary.max).toBe(200);
      expect(responseTimeSummary.avg).toBe(150);
      expect(responseTimeSummary.count).toBe(3);

      // Check error_rate summary
      const errorRateSummary = report.metrics.summary.error_rate;
      expect(errorRateSummary).toBeTruthy();
      expect(errorRateSummary.min).toBe(2);
      expect(errorRateSummary.max).toBe(3);
      expect(errorRateSummary.count).toBe(2);

      expect(report.recommendations).toBeTruthy();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    test("should filter report by time period", () => {
      const now = Date.now();

      // Add old metric (outside period)
      monitor.recordMetric({
        name: "old_metric",
        value: 100,
        unit: "ms",
        timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago
      });

      // Add recent metric (within period)
      monitor.recordMetric({
        name: "recent_metric",
        value: 200,
        unit: "ms",
        timestamp: now - 30 * 60 * 1000, // 30 minutes ago
      });

      const report = monitor.getReport(60); // 60 minute period

      expect(report.metrics.detailed).toHaveLength(1);
      expect(report.metrics.detailed[0].name).toBe("recent_metric");
    });

    test("should get real-time metrics with filtering", () => {
      monitor.recordMetric({
        name: "response_time",
        value: 100,
        unit: "ms",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "error_rate",
        value: 2,
        unit: "percentage",
        timestamp: Date.now(),
      });

      const allMetrics = monitor.getRealTimeMetrics();
      expect(allMetrics).toHaveLength(2);

      const responseMetrics = monitor.getRealTimeMetrics(["response_time"]);
      expect(responseMetrics).toHaveLength(1);
      expect(responseMetrics[0].name).toBe("response_time");
    });

    test("should get performance snapshot", () => {
      monitor.recordMetric({
        name: "test_metric",
        value: 100,
        unit: "ms",
        timestamp: Date.now(),
      });

      const snapshot = monitor.getSnapshot();

      expect(snapshot.timestamp).toBeTruthy();
      expect(snapshot.totalMetrics).toBe(1);
      expect(snapshot.enabled).toBe(true);
      expect(Array.isArray(snapshot.thresholds)).toBe(true);
    });
  });

  describe("Memory Management", () => {
    test("should limit stored metrics", () => {
      const maxMetrics = 100;
      monitor = new (PerformanceMonitor as any)(); // Create new instance for this test
      (monitor as any).maxMetrics = maxMetrics;

      // Add more metrics than the limit
      for (let i = 0; i < maxMetrics + 50; i++) {
        monitor.recordMetric({
          name: `metric_${i}`,
          value: i,
          unit: "count",
          timestamp: Date.now(),
        });
      }

      const metrics = (monitor as any).metrics;
      expect(metrics.length).toBeLessThanOrEqual(maxMetrics);
    });

    test("should cleanup old metrics automatically", async () => {
      const shortCleanupInterval = 50; // 50ms
      const testMonitor = new (PerformanceMonitor as any)();
      (testMonitor as any).cleanupInterval = shortCleanupInterval;
      (testMonitor as any).startCleanupTimer();

      // Add old metric
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      (testMonitor as any).metrics.push({
        name: "old_metric",
        value: 100,
        unit: "ms",
        timestamp: oldTimestamp,
      });

      // Add recent metric
      testMonitor.recordMetric({
        name: "recent_metric",
        value: 200,
        unit: "ms",
        timestamp: Date.now(),
      });

      expect((testMonitor as any).metrics).toHaveLength(2);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Old metric should be removed, recent metric should remain
      expect((testMonitor as any).metrics).toHaveLength(1);
      expect((testMonitor as any).metrics[0].name).toBe("recent_metric");

      testMonitor.destroy();
    });

    test("should clear all metrics", () => {
      monitor.recordMetric({
        name: "metric1",
        value: 100,
        unit: "ms",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "metric2",
        value: 200,
        unit: "ms",
        timestamp: Date.now(),
      });

      expect(monitor.getRealTimeMetrics()).toHaveLength(2);

      monitor.clearMetrics();

      expect(monitor.getRealTimeMetrics()).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid metric gracefully", () => {
      expect(() => {
        monitor.recordMetric({
          name: "",
          value: NaN,
          unit: "ms",
          timestamp: Date.now(),
        } as PerformanceMetric);
      }).not.toThrow();
    });

    test("should handle timer cleanup on destroy", () => {
      monitor.startTimer("cleanup_test");

      expect(() => {
        monitor.destroy();
      }).not.toThrow();
    });
  });

  describe("Recommendations Engine", () => {
    test("should generate recommendations based on metrics", () => {
      // Add metrics that should trigger recommendations
      monitor.recordMetric({
        name: "response_time",
        value: 3000, // High response time
        unit: "ms",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "memory_heap_used",
        value: 300 * 1024 * 1024, // High memory usage
        unit: "bytes",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "cache_hit_ratio",
        value: 60, // Low cache hit ratio
        unit: "percentage",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "error_rate",
        value: 5, // High error rate
        unit: "percentage",
        timestamp: Date.now(),
      });

      const report = monitor.getReport(1);

      expect(report.recommendations).toBeTruthy();
      expect(report.recommendations.length).toBeGreaterThan(0);

      // Should include specific recommendations for each issue
      const recommendationText = report.recommendations.join(" ");
      expect(recommendationText).toContain("response times");
      expect(recommendationText).toContain("memory");
      expect(recommendationText).toContain("cache");
      expect(recommendationText).toContain("error");
    });

    test("should generate positive recommendation when metrics are good", () => {
      // Add good metrics
      monitor.recordMetric({
        name: "response_time",
        value: 100,
        unit: "ms",
        timestamp: Date.now(),
      });

      monitor.recordMetric({
        name: "error_rate",
        value: 1,
        unit: "percentage",
        timestamp: Date.now(),
      });

      const report = monitor.getReport(1);

      expect(report.recommendations).toContain(
        "Performance metrics are within acceptable ranges",
      );
    });
  });
});
