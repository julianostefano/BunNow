/**
 * System Metrics Utilities - Real system performance monitoring
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements real system metrics collection:
 * - CPU usage tracking
 * - Memory monitoring
 * - Event loop metrics
 * - Load average
 * - GC statistics
 * - System information
 */

import { performance, PerformanceObserver } from "perf_hooks";
import { readFile } from "fs/promises";
import { logger } from "./Logger";

export interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  bunVersion?: string;
  cpuCount: number;
  totalMemory: number;
  uptime: number;
}

export interface CPUUsage {
  user: number;
  system: number;
  total: number;
  percentage: number;
}

export interface EventLoopMetrics {
  delay: number;
  utilization: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
}

export interface GCStats {
  collections: number;
  duration: number;
  reclaimedSpace: number;
  heapSizeAfter: number;
}

export class SystemMetricsCollector {
  private previousCpuUsage: NodeJS.CpuUsage | null = null;
  private previousTimestamp: number = 0;
  private eventLoopDelayHistogram: any = null;
  private gcStats: GCStats = {
    collections: 0,
    duration: 0,
    reclaimedSpace: 0,
    heapSizeAfter: 0,
  };
  private performanceObserver: PerformanceObserver | null = null;

  constructor() {
    this.initializeEventLoopMonitoring();
    this.initializeGCMonitoring();
  }

  /**
   * Initialize event loop delay monitoring
   */
  private initializeEventLoopMonitoring(): void {
    try {
      // Try to use perf_hooks for event loop monitoring
      const { monitorEventLoopDelay } = require("perf_hooks");
      this.eventLoopDelayHistogram = monitorEventLoopDelay({ resolution: 10 });
      this.eventLoopDelayHistogram.enable();
      logger.info("✅ Event loop monitoring initialized", "SystemMetrics");
    } catch (error) {
      logger.warn("⚠️ Event loop monitoring not available", "SystemMetrics");
    }
  }

  /**
   * Initialize GC monitoring
   */
  private initializeGCMonitoring(): void {
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === "gc") {
            this.gcStats.collections++;
            this.gcStats.duration += entry.duration;

            // Extract additional GC details if available
            const detail = entry.detail as any;
            if (detail) {
              this.gcStats.reclaimedSpace +=
                detail.usedJSHeapSizeBefore - detail.usedJSHeapSizeAfter || 0;
              this.gcStats.heapSizeAfter = detail.usedJSHeapSizeAfter || 0;
            }
          }
        }
      });

      this.performanceObserver.observe({ entryTypes: ["gc"] });
      logger.info("✅ GC monitoring initialized", "SystemMetrics");
    } catch (error) {
      logger.warn("⚠️ GC monitoring not available", "SystemMetrics");
    }
  }

  /**
   * Get comprehensive system information
   */
  getSystemInfo(): SystemInfo {
    const os = require("os");

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      bunVersion: process.versions.bun || undefined,
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      uptime: os.uptime(),
    };
  }

  /**
   * Get real CPU usage metrics
   */
  getCPUUsage(): CPUUsage {
    const currentUsage = process.cpuUsage();
    const currentTimestamp = Date.now();

    if (this.previousCpuUsage && this.previousTimestamp) {
      const timeDiff = currentTimestamp - this.previousTimestamp;
      const userDiff = currentUsage.user - this.previousCpuUsage.user;
      const systemDiff = currentUsage.system - this.previousCpuUsage.system;
      const totalDiff = userDiff + systemDiff;

      // Convert microseconds to milliseconds and calculate percentage
      const totalTime = timeDiff * 1000; // Convert to microseconds
      const percentage = totalTime > 0 ? (totalDiff / totalTime) * 100 : 0;

      this.previousCpuUsage = currentUsage;
      this.previousTimestamp = currentTimestamp;

      return {
        user: userDiff / 1000, // Convert to milliseconds
        system: systemDiff / 1000,
        total: totalDiff / 1000,
        percentage: Math.min(100, Math.max(0, percentage)),
      };
    } else {
      // First call - store values and return zero
      this.previousCpuUsage = currentUsage;
      this.previousTimestamp = currentTimestamp;

      return {
        user: 0,
        system: 0,
        total: 0,
        percentage: 0,
      };
    }
  }

  /**
   * Get load average (Linux/macOS only)
   */
  getLoadAverage(): number[] {
    try {
      const os = require("os");
      return os.loadavg();
    } catch (error) {
      // Fallback for Windows or other platforms
      return [0, 0, 0];
    }
  }

  /**
   * Get event loop metrics
   */
  getEventLoopMetrics(): EventLoopMetrics {
    if (this.eventLoopDelayHistogram) {
      const delay = this.eventLoopDelayHistogram.mean / 1000000; // Convert to milliseconds
      const min = this.eventLoopDelayHistogram.min / 1000000;
      const max = this.eventLoopDelayHistogram.max / 1000000;
      const stddev = this.eventLoopDelayHistogram.stddev / 1000000;

      // Calculate utilization estimate
      const utilization = Math.min(100, delay * 10); // Rough estimation

      return {
        delay,
        utilization,
        min,
        max,
        mean: delay,
        stddev,
      };
    }

    return {
      delay: 0,
      utilization: 0,
      min: 0,
      max: 0,
      mean: 0,
      stddev: 0,
    };
  }

  /**
   * Get garbage collection statistics
   */
  getGCStats(): GCStats {
    return { ...this.gcStats };
  }

  /**
   * Reset GC statistics
   */
  resetGCStats(): void {
    this.gcStats = {
      collections: 0,
      duration: 0,
      reclaimedSpace: 0,
      heapSizeAfter: 0,
    };
  }

  /**
   * Get memory pressure indicator
   */
  getMemoryPressure(): number {
    const memUsage = process.memoryUsage();
    const systemInfo = this.getSystemInfo();

    if (systemInfo.totalMemory > 0) {
      return (memUsage.rss / systemInfo.totalMemory) * 100;
    }

    return 0;
  }

  /**
   * Get detailed memory breakdown
   */
  getDetailedMemoryUsage(): any {
    const memUsage = process.memoryUsage();
    const systemInfo = this.getSystemInfo();

    return {
      process: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      system: {
        total: systemInfo.totalMemory,
        free: this.getFreeMemory(),
        used: systemInfo.totalMemory - this.getFreeMemory(),
        processPercentage: (memUsage.rss / systemInfo.totalMemory) * 100,
      },
      heap: {
        utilization: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        fragmentation: this.calculateHeapFragmentation(),
      },
    };
  }

  /**
   * Get free memory
   */
  private getFreeMemory(): number {
    try {
      const os = require("os");
      return os.freemem();
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate heap fragmentation estimate
   */
  private calculateHeapFragmentation(): number {
    const memUsage = process.memoryUsage();
    if (memUsage.heapTotal > 0) {
      const wastedSpace = memUsage.heapTotal - memUsage.heapUsed;
      return (wastedSpace / memUsage.heapTotal) * 100;
    }
    return 0;
  }

  /**
   * Get network interface statistics (Linux only)
   */
  async getNetworkStats(): Promise<any> {
    try {
      if (process.platform === "linux") {
        const netStats = await readFile("/proc/net/dev", "utf-8");
        return this.parseNetworkStats(netStats);
      }
    } catch (error) {
      logger.warn("⚠️ Network stats not available", "SystemMetrics");
    }
    return null;
  }

  /**
   * Parse network statistics from /proc/net/dev
   */
  private parseNetworkStats(netStats: string): any {
    const lines = netStats.split("\n").slice(2); // Skip header lines
    const interfaces: any = {};

    for (const line of lines) {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        const interfaceName = parts[0].replace(":", "");

        interfaces[interfaceName] = {
          rxBytes: parseInt(parts[1]) || 0,
          rxPackets: parseInt(parts[2]) || 0,
          rxErrors: parseInt(parts[3]) || 0,
          rxDropped: parseInt(parts[4]) || 0,
          txBytes: parseInt(parts[9]) || 0,
          txPackets: parseInt(parts[10]) || 0,
          txErrors: parseInt(parts[11]) || 0,
          txDropped: parseInt(parts[12]) || 0,
        };
      }
    }

    return interfaces;
  }

  /**
   * Get file descriptor count (Linux/macOS)
   */
  async getFileDescriptorCount(): Promise<number> {
    try {
      if (process.platform === "linux") {
        const fdStats = await readFile(`/proc/${process.pid}/stat`, "utf-8");
        const parts = fdStats.split(" ");
        return parseInt(parts[17]) || 0; // File descriptor count is at index 17
      }
    } catch (error) {
      logger.warn("⚠️ File descriptor count not available", "SystemMetrics");
    }
    return 0;
  }

  /**
   * Create performance snapshot with real data
   */
  createPerformanceSnapshot(): any {
    const cpuUsage = this.getCPUUsage();
    const eventLoopMetrics = this.getEventLoopMetrics();
    const memoryUsage = this.getDetailedMemoryUsage();
    const gcStats = this.getGCStats();
    const loadAverage = this.getLoadAverage();

    return {
      timestamp: Date.now(),
      cpu: {
        usage: cpuUsage.percentage,
        loadAverage,
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      memory: {
        used: memoryUsage.process.rss,
        total: memoryUsage.system.total,
        heap: {
          used: memoryUsage.process.heapUsed,
          total: memoryUsage.process.heapTotal,
          utilization: memoryUsage.heap.utilization,
        },
        external: memoryUsage.process.external,
        pressure: this.getMemoryPressure(),
      },
      eventLoop: {
        delay: eventLoopMetrics.delay,
        utilization: eventLoopMetrics.utilization,
        min: eventLoopMetrics.min,
        max: eventLoopMetrics.max,
      },
      gc: {
        collections: gcStats.collections,
        duration: gcStats.duration,
        reclaimedSpace: gcStats.reclaimedSpace,
      },
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.eventLoopDelayHistogram) {
      this.eventLoopDelayHistogram.disable();
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    logger.info("🧹 System metrics collector cleaned up", "SystemMetrics");
  }
}

// Export singleton instance
export const systemMetricsCollector = new SystemMetricsCollector();

// Export factory function
export const createSystemMetricsCollector = () => {
  return new SystemMetricsCollector();
};
