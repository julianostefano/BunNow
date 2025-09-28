/**
 * System Metrics Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  SystemMetricsCollector,
  createSystemMetricsCollector,
  systemMetricsCollector,
} from "../../utils/SystemMetrics";

describe("SystemMetricsCollector", () => {
  let collector: SystemMetricsCollector;

  beforeEach(() => {
    collector = createSystemMetricsCollector();
  });

  afterEach(() => {
    collector.destroy();
  });

  describe("System Information", () => {
    it("should provide comprehensive system information", () => {
      const systemInfo = collector.getSystemInfo();

      expect(systemInfo).toHaveProperty("platform");
      expect(systemInfo).toHaveProperty("arch");
      expect(systemInfo).toHaveProperty("nodeVersion");
      expect(systemInfo).toHaveProperty("cpuCount");
      expect(systemInfo).toHaveProperty("totalMemory");
      expect(systemInfo).toHaveProperty("uptime");

      expect(typeof systemInfo.platform).toBe("string");
      expect(typeof systemInfo.arch).toBe("string");
      expect(typeof systemInfo.nodeVersion).toBe("string");
      expect(typeof systemInfo.cpuCount).toBe("number");
      expect(typeof systemInfo.totalMemory).toBe("number");
      expect(typeof systemInfo.uptime).toBe("number");

      expect(systemInfo.cpuCount).toBeGreaterThan(0);
      expect(systemInfo.totalMemory).toBeGreaterThan(0);
      expect(systemInfo.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should detect Bun runtime when available", () => {
      const systemInfo = collector.getSystemInfo();

      if (process.versions.bun) {
        expect(systemInfo.bunVersion).toBeDefined();
        expect(typeof systemInfo.bunVersion).toBe("string");
      }
    });
  });

  describe("CPU Usage Monitoring", () => {
    it("should return initial zero CPU usage on first call", () => {
      const cpuUsage = collector.getCPUUsage();

      expect(cpuUsage).toHaveProperty("user");
      expect(cpuUsage).toHaveProperty("system");
      expect(cpuUsage).toHaveProperty("total");
      expect(cpuUsage).toHaveProperty("percentage");

      expect(cpuUsage.user).toBe(0);
      expect(cpuUsage.system).toBe(0);
      expect(cpuUsage.total).toBe(0);
      expect(cpuUsage.percentage).toBe(0);
    });

    it("should calculate CPU usage difference on subsequent calls", async () => {
      // First call (baseline)
      collector.getCPUUsage();

      // Do some CPU work
      await new Promise((resolve) => {
        const start = Date.now();
        while (Date.now() - start < 50) {
          Math.random() * Math.random();
        }
        resolve(undefined);
      });

      // Second call (should show usage)
      const cpuUsage = collector.getCPUUsage();

      expect(typeof cpuUsage.user).toBe("number");
      expect(typeof cpuUsage.system).toBe("number");
      expect(typeof cpuUsage.total).toBe("number");
      expect(typeof cpuUsage.percentage).toBe("number");

      expect(cpuUsage.user).toBeGreaterThanOrEqual(0);
      expect(cpuUsage.system).toBeGreaterThanOrEqual(0);
      expect(cpuUsage.total).toBeGreaterThanOrEqual(0);
      expect(cpuUsage.percentage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe("Load Average", () => {
    it("should return load average array", () => {
      const loadAverage = collector.getLoadAverage();

      expect(Array.isArray(loadAverage)).toBe(true);
      expect(loadAverage).toHaveLength(3);

      loadAverage.forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThanOrEqual(0);
      });
    });

    it("should return zeros on unsupported platforms", () => {
      // On platforms that don't support load average, should return [0, 0, 0]
      const loadAverage = collector.getLoadAverage();

      if (process.platform === "win32") {
        expect(loadAverage).toEqual([0, 0, 0]);
      } else {
        // On Unix-like systems, should have actual values
        expect(loadAverage.some((value) => value >= 0)).toBe(true);
      }
    });
  });

  describe("Event Loop Metrics", () => {
    it("should return event loop metrics", () => {
      const eventLoopMetrics = collector.getEventLoopMetrics();

      expect(eventLoopMetrics).toHaveProperty("delay");
      expect(eventLoopMetrics).toHaveProperty("utilization");
      expect(eventLoopMetrics).toHaveProperty("min");
      expect(eventLoopMetrics).toHaveProperty("max");
      expect(eventLoopMetrics).toHaveProperty("mean");
      expect(eventLoopMetrics).toHaveProperty("stddev");

      // All values should be numbers
      Object.values(eventLoopMetrics).forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThanOrEqual(0);
      });

      // Utilization should be percentage (0-100)
      expect(eventLoopMetrics.utilization).toBeLessThanOrEqual(100);
    });

    it("should handle unavailable event loop monitoring", () => {
      // Even if monitoring is unavailable, should return valid structure
      const metrics = collector.getEventLoopMetrics();

      expect(metrics.delay).toBeGreaterThanOrEqual(0);
      expect(metrics.utilization).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Garbage Collection Statistics", () => {
    it("should return GC statistics", () => {
      const gcStats = collector.getGCStats();

      expect(gcStats).toHaveProperty("collections");
      expect(gcStats).toHaveProperty("duration");
      expect(gcStats).toHaveProperty("reclaimedSpace");
      expect(gcStats).toHaveProperty("heapSizeAfter");

      expect(typeof gcStats.collections).toBe("number");
      expect(typeof gcStats.duration).toBe("number");
      expect(typeof gcStats.reclaimedSpace).toBe("number");
      expect(typeof gcStats.heapSizeAfter).toBe("number");

      expect(gcStats.collections).toBeGreaterThanOrEqual(0);
      expect(gcStats.duration).toBeGreaterThanOrEqual(0);
      expect(gcStats.reclaimedSpace).toBeGreaterThanOrEqual(0);
      expect(gcStats.heapSizeAfter).toBeGreaterThanOrEqual(0);
    });

    it("should reset GC statistics", () => {
      // Get initial stats
      const initialStats = collector.getGCStats();

      // Reset stats
      collector.resetGCStats();

      // Get stats after reset
      const resetStats = collector.getGCStats();

      expect(resetStats.collections).toBe(0);
      expect(resetStats.duration).toBe(0);
      expect(resetStats.reclaimedSpace).toBe(0);
      expect(resetStats.heapSizeAfter).toBe(0);
    });
  });

  describe("Memory Monitoring", () => {
    it("should calculate memory pressure", () => {
      const memoryPressure = collector.getMemoryPressure();

      expect(typeof memoryPressure).toBe("number");
      expect(memoryPressure).toBeGreaterThanOrEqual(0);
      expect(memoryPressure).toBeLessThanOrEqual(100);
    });

    it("should provide detailed memory usage", () => {
      const memoryUsage = collector.getDetailedMemoryUsage();

      expect(memoryUsage).toHaveProperty("process");
      expect(memoryUsage).toHaveProperty("system");
      expect(memoryUsage).toHaveProperty("heap");

      // Process memory
      expect(memoryUsage.process).toHaveProperty("rss");
      expect(memoryUsage.process).toHaveProperty("heapTotal");
      expect(memoryUsage.process).toHaveProperty("heapUsed");
      expect(memoryUsage.process).toHaveProperty("external");
      expect(memoryUsage.process).toHaveProperty("arrayBuffers");

      // System memory
      expect(memoryUsage.system).toHaveProperty("total");
      expect(memoryUsage.system).toHaveProperty("free");
      expect(memoryUsage.system).toHaveProperty("used");
      expect(memoryUsage.system).toHaveProperty("processPercentage");

      // Heap metrics
      expect(memoryUsage.heap).toHaveProperty("utilization");
      expect(memoryUsage.heap).toHaveProperty("fragmentation");

      // Validate ranges
      expect(memoryUsage.heap.utilization).toBeGreaterThanOrEqual(0);
      expect(memoryUsage.heap.utilization).toBeLessThanOrEqual(100);
      expect(memoryUsage.heap.fragmentation).toBeGreaterThanOrEqual(0);
      expect(memoryUsage.heap.fragmentation).toBeLessThanOrEqual(100);
    });
  });

  describe("Performance Snapshots", () => {
    it("should create comprehensive performance snapshots", () => {
      const snapshot = collector.createPerformanceSnapshot();

      expect(snapshot).toHaveProperty("timestamp");
      expect(snapshot).toHaveProperty("cpu");
      expect(snapshot).toHaveProperty("memory");
      expect(snapshot).toHaveProperty("eventLoop");
      expect(snapshot).toHaveProperty("gc");

      expect(typeof snapshot.timestamp).toBe("number");
      expect(snapshot.timestamp).toBeCloseTo(Date.now(), -2); // Within ~100ms

      // CPU metrics
      expect(snapshot.cpu).toHaveProperty("usage");
      expect(snapshot.cpu).toHaveProperty("loadAverage");
      expect(snapshot.cpu).toHaveProperty("user");
      expect(snapshot.cpu).toHaveProperty("system");

      // Memory metrics
      expect(snapshot.memory).toHaveProperty("used");
      expect(snapshot.memory).toHaveProperty("total");
      expect(snapshot.memory).toHaveProperty("heap");
      expect(snapshot.memory).toHaveProperty("external");
      expect(snapshot.memory).toHaveProperty("pressure");

      // Event loop metrics
      expect(snapshot.eventLoop).toHaveProperty("delay");
      expect(snapshot.eventLoop).toHaveProperty("utilization");

      // GC metrics
      expect(snapshot.gc).toHaveProperty("collections");
      expect(snapshot.gc).toHaveProperty("duration");
    });

    it("should create multiple snapshots with different timestamps", async () => {
      const snapshot1 = collector.createPerformanceSnapshot();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const snapshot2 = collector.createPerformanceSnapshot();

      expect(snapshot2.timestamp).toBeGreaterThan(snapshot1.timestamp);
    });
  });

  describe("Network Statistics", () => {
    it("should handle network stats gracefully", async () => {
      const networkStats = await collector.getNetworkStats();

      if (process.platform === "linux") {
        // On Linux, might return network interface data
        if (networkStats) {
          expect(typeof networkStats).toBe("object");
        }
      } else {
        // On other platforms, should return null
        expect(networkStats).toBeNull();
      }
    });
  });

  describe("File Descriptor Monitoring", () => {
    it("should get file descriptor count on supported platforms", async () => {
      const fdCount = await collector.getFileDescriptorCount();

      expect(typeof fdCount).toBe("number");
      expect(fdCount).toBeGreaterThanOrEqual(0);

      if (process.platform === "linux") {
        // On Linux, should have actual FD count
        expect(fdCount).toBeGreaterThan(0);
      }
    });
  });

  describe("Resource Management", () => {
    it("should clean up resources on destroy", () => {
      const testCollector = createSystemMetricsCollector();

      expect(() => {
        testCollector.destroy();
      }).not.toThrow();

      // Should be safe to call destroy multiple times
      expect(() => {
        testCollector.destroy();
      }).not.toThrow();
    });
  });

  describe("Singleton Instance", () => {
    it("should provide singleton instance", () => {
      expect(systemMetricsCollector).toBeDefined();
      expect(systemMetricsCollector).toBeInstanceOf(SystemMetricsCollector);

      // Should return same instance
      const info1 = systemMetricsCollector.getSystemInfo();
      const info2 = systemMetricsCollector.getSystemInfo();

      expect(info1.platform).toBe(info2.platform);
      expect(info1.arch).toBe(info2.arch);
    });
  });

  describe("Error Handling", () => {
    it("should handle monitoring initialization errors gracefully", () => {
      // Create collector in environment where monitoring might fail
      const testCollector = createSystemMetricsCollector();

      // Should still provide basic functionality
      expect(() => {
        testCollector.getSystemInfo();
      }).not.toThrow();

      expect(() => {
        testCollector.getCPUUsage();
      }).not.toThrow();

      expect(() => {
        testCollector.getEventLoopMetrics();
      }).not.toThrow();

      testCollector.destroy();
    });

    it("should provide safe defaults when metrics unavailable", () => {
      const eventLoopMetrics = collector.getEventLoopMetrics();
      const gcStats = collector.getGCStats();

      // Should always return valid structure with safe defaults
      expect(eventLoopMetrics.delay).toBeGreaterThanOrEqual(0);
      expect(gcStats.collections).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Performance Impact", () => {
    it("should have minimal performance impact", () => {
      const iterations = 1000;
      const start = process.hrtime.bigint();

      // Run many metric collections
      for (let i = 0; i < iterations; i++) {
        collector.getCPUUsage();
        collector.getEventLoopMetrics();
        collector.getGCStats();
      }

      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      // Should complete 1000 iterations in reasonable time (< 100ms)
      expect(durationMs).toBeLessThan(100);
    });
  });
});
