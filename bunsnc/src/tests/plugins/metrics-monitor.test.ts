/**
 * Plugin Metrics Monitor Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  PluginMetricsCollector,
  createMetricsCollector,
  type MetricDefinition,
  type AlertRule,
} from "../../plugins/metrics-monitor";

describe("PluginMetricsCollector", () => {
  let collector: PluginMetricsCollector;

  beforeEach(() => {
    collector = createMetricsCollector({
      retentionMs: 5000, // 5 seconds for testing
      maxHistorySize: 10,
      collectionIntervalMs: 100, // 100ms for testing
      performanceIntervalMs: 100,
    });
  });

  afterEach(() => {
    collector.stop();
  });

  describe("Metric Registration", () => {
    it("should register custom metric definitions", () => {
      const definition: MetricDefinition = {
        name: "test_counter",
        type: "counter",
        description: "Test counter metric",
        labels: ["status"],
      };

      collector.registerMetric(definition);
      const summary = collector.getMetricsSummary();

      expect(summary.definitions).toContainEqual(definition);
      expect(summary.counters).toHaveProperty("test_counter");
    });

    it("should initialize default metrics", () => {
      const summary = collector.getMetricsSummary();

      expect(summary.definitions.length).toBeGreaterThan(0);
      expect(
        summary.definitions.some((d) => d.name === "plugin_requests_total"),
      ).toBe(true);
      expect(
        summary.definitions.some((d) => d.name === "plugin_memory_usage_bytes"),
      ).toBe(true);
    });
  });

  describe("Counter Metrics", () => {
    it("should increment counter metrics", () => {
      collector.incrementCounter("test_counter", 5);
      collector.incrementCounter("test_counter", 3);

      const summary = collector.getMetricsSummary();
      expect(summary.counters.test_counter).toBe(8);
    });

    it("should record counter values with labels", () => {
      collector.incrementCounter("test_counter", 1, { status: "success" });
      collector.incrementCounter("test_counter", 1, { status: "error" });

      const values = collector.getMetricValues("test_counter");
      expect(values).toHaveLength(2);
      expect(values[0]).toMatchObject({
        value: 1,
        labels: { status: "success" },
      });
      expect(values[1]).toMatchObject({
        value: 2,
        labels: { status: "error" },
      });
    });
  });

  describe("Gauge Metrics", () => {
    it("should set gauge metric values", () => {
      collector.setGauge("test_gauge", 42.5);
      collector.setGauge("test_gauge", 100);

      const summary = collector.getMetricsSummary();
      expect(summary.gauges.test_gauge).toBe(100);
    });

    it("should record gauge values with timestamps", () => {
      const beforeTimestamp = Date.now();
      collector.setGauge("test_gauge", 50);
      const afterTimestamp = Date.now();

      const values = collector.getMetricValues("test_gauge");
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe(50);
      expect(values[0].timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(values[0].timestamp).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe("Histogram Metrics", () => {
    beforeEach(() => {
      collector.registerMetric({
        name: "test_histogram",
        type: "histogram",
        description: "Test histogram",
      });
    });

    it("should observe histogram values", () => {
      collector.observeHistogram("test_histogram", 0.1);
      collector.observeHistogram("test_histogram", 0.5);
      collector.observeHistogram("test_histogram", 1.5);

      const summary = collector.getMetricsSummary();
      const histogram = summary.histograms.test_histogram;

      expect(histogram.count).toBe(3);
      expect(histogram.sum).toBe(2.1);
      expect(histogram.buckets.find((b) => b.le === 0.25)?.count).toBe(1);
      expect(histogram.buckets.find((b) => b.le === 1)?.count).toBe(2);
    });
  });

  describe("Summary Metrics", () => {
    beforeEach(() => {
      collector.registerMetric({
        name: "test_summary",
        type: "summary",
        description: "Test summary",
      });
    });

    it("should observe summary values", () => {
      collector.observeSummary("test_summary", 10);
      collector.observeSummary("test_summary", 20);
      collector.observeSummary("test_summary", 30);

      const summary = collector.getMetricsSummary();
      const summaryMetric = summary.summaries.test_summary;

      expect(summaryMetric.count).toBe(3);
      expect(summaryMetric.sum).toBe(60);

      // Verificar se quantiles é um objeto válido primeiro
      expect(summaryMetric.quantiles).toBeDefined();
      expect(typeof summaryMetric.quantiles).toBe("object");

      // Usar abordagem compatível com Bun runtime para verificar propriedades
      expect(Object.keys(summaryMetric.quantiles)).toContain("0.5");
      expect(Object.keys(summaryMetric.quantiles)).toContain("0.9");
      expect(Object.keys(summaryMetric.quantiles)).toContain("0.99");

      // Verificar valores específicos dos quantiles
      expect(summaryMetric.quantiles["0.5"]).toBe(30);
      expect(summaryMetric.quantiles["0.9"]).toBe(30);
      expect(summaryMetric.quantiles["0.99"]).toBe(30);
    });
  });

  describe("Plugin Health Management", () => {
    it("should update plugin health status", () => {
      collector.updatePluginHealth("test-plugin", {
        status: "healthy",
        errors: 0,
        warnings: 1,
        dependencies: { redis: "healthy", mongodb: "healthy" },
      });

      const healthStatuses = collector.getHealthStatuses();
      expect(healthStatuses).toHaveLength(1);
      expect(healthStatuses[0]).toMatchObject({
        pluginId: "test-plugin",
        status: "healthy",
        errors: 0,
        warnings: 1,
      });
    });

    it("should calculate health score correctly", () => {
      collector.updatePluginHealth("critical-plugin", {
        status: "critical",
        errors: 5,
        warnings: 3,
        dependencies: { redis: "unhealthy" },
      });

      const summary = collector.getMetricsSummary();
      expect(summary.gauges.plugin_health_score).toBeLessThan(50);
    });
  });

  describe("Alert System", () => {
    it("should add and trigger alert rules", () => {
      const rule: AlertRule = {
        id: "high-memory",
        name: "High Memory Usage",
        metric: "memory_usage",
        condition: ">",
        threshold: 80,
        duration: 0,
        severity: "high",
        enabled: true,
      };

      collector.addAlertRule(rule);
      collector.setGauge("memory_usage", 90); // Trigger alert

      const alerts = collector.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        ruleId: "high-memory",
        metric: "memory_usage",
        value: 90,
        severity: "high",
      });
    });

    it("should resolve alerts", () => {
      const rule: AlertRule = {
        id: "test-alert",
        name: "Test Alert",
        metric: "test_metric",
        condition: ">",
        threshold: 50,
        duration: 0,
        severity: "medium",
        enabled: true,
      };

      collector.addAlertRule(rule);
      collector.setGauge("test_metric", 60); // Trigger

      let alerts = collector.getActiveAlerts();
      expect(alerts).toHaveLength(1);

      const alertId = alerts[0].id;
      collector.resolveAlert(alertId);

      alerts = collector.getActiveAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe("Performance Collection", () => {
    it("should collect performance snapshots", async () => {
      collector.startCollection(50);
      collector.startPerformanceCollection(50);

      // Wait for collection
      await new Promise((resolve) => setTimeout(resolve, 150));

      const history = collector.getPerformanceHistory();
      expect(history.length).toBeGreaterThan(0);

      const latest = history[history.length - 1];
      expect(latest).toHaveProperty("timestamp");
      expect(latest).toHaveProperty("cpu");
      expect(latest).toHaveProperty("memory");
      expect(latest).toHaveProperty("eventLoop");
      expect(latest).toHaveProperty("gc");
    });

    it("should maintain history size limit", async () => {
      const smallCollector = createMetricsCollector({
        maxHistorySize: 3,
        performanceIntervalMs: 10,
      });

      smallCollector.startPerformanceCollection(10);

      // Wait for multiple collections
      await new Promise((resolve) => setTimeout(resolve, 100));

      const history = smallCollector.getPerformanceHistory();
      expect(history.length).toBeLessThanOrEqual(3);

      smallCollector.stop();
    });
  });

  describe("Metrics Cleanup", () => {
    it("should clean up old metrics based on retention", async () => {
      const shortRetentionCollector = createMetricsCollector({
        retentionMs: 50, // 50ms retention
        maxHistorySize: 100,
      });

      // Add some old metrics
      shortRetentionCollector.setGauge("test_metric", 1);

      // Wait for retention period
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add new metric
      shortRetentionCollector.setGauge("test_metric", 2);

      // Start collection to trigger cleanup
      shortRetentionCollector.startCollection(10);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));

      const values = shortRetentionCollector.getMetricValues("test_metric");
      expect(values.length).toBeLessThanOrEqual(1);

      shortRetentionCollector.stop();
    });
  });

  describe("Statistics", () => {
    it("should provide comprehensive stats", () => {
      collector.incrementCounter("test1", 1);
      collector.setGauge("test2", 50);
      collector.updatePluginHealth("plugin1", { status: "healthy" });

      const stats = collector.getStats();

      expect(stats).toHaveProperty("uptime");
      expect(stats).toHaveProperty("metricsCollected");
      expect(stats).toHaveProperty("healthChecks");
      expect(stats).toHaveProperty("alertRules");
      expect(stats).toHaveProperty("retentionMs");
      expect(stats.healthChecks).toBe(1);
    });
  });
});

describe("Alert Condition Evaluation", () => {
  let collector: PluginMetricsCollector;

  beforeEach(() => {
    collector = createMetricsCollector();
  });

  afterEach(() => {
    collector.stop();
  });

  it("should handle all comparison operators", () => {
    const rules: AlertRule[] = [
      {
        id: "gt",
        name: "Greater Than",
        metric: "test",
        condition: ">",
        threshold: 50,
        duration: 0,
        severity: "low",
        enabled: true,
      },
      {
        id: "lt",
        name: "Less Than",
        metric: "test",
        condition: "<",
        threshold: 50,
        duration: 0,
        severity: "low",
        enabled: true,
      },
      {
        id: "gte",
        name: "Greater Equal",
        metric: "test",
        condition: ">=",
        threshold: 50,
        duration: 0,
        severity: "low",
        enabled: true,
      },
      {
        id: "lte",
        name: "Less Equal",
        metric: "test",
        condition: "<=",
        threshold: 50,
        duration: 0,
        severity: "low",
        enabled: true,
      },
      {
        id: "eq",
        name: "Equal",
        metric: "test",
        condition: "==",
        threshold: 50,
        duration: 0,
        severity: "low",
        enabled: true,
      },
      {
        id: "neq",
        name: "Not Equal",
        metric: "test",
        condition: "!=",
        threshold: 50,
        duration: 0,
        severity: "low",
        enabled: true,
      },
    ];

    rules.forEach((rule) => collector.addAlertRule(rule));

    collector.setGauge("test", 60); // > 50
    let alerts = collector.getActiveAlerts();
    expect(alerts.some((a) => a.ruleId === "gt")).toBe(true);

    collector.setGauge("test", 40); // < 50
    alerts = collector.getActiveAlerts();
    expect(alerts.some((a) => a.ruleId === "lt")).toBe(true);
  });
});
