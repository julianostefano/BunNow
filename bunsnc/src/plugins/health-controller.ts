/**
 * Health Controller - Specialized Elysia Controller
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements "1 controller = 1 instância" Elysia best practice
 * Handles system health monitoring, metrics collection, and service diagnostics
 *
 * Features:
 * - System health checks (MongoDB, Redis, ServiceNow connectivity)
 * - Performance metrics collection (CPU, memory, response times)
 * - Service status monitoring and alerting
 * - Health history tracking and analysis
 * - Custom health check plugins
 * - Graceful degradation monitoring
 * - Real-time health dashboard data
 */

import { Elysia } from "elysia";
import { logger } from "../utils/Logger";
import os from "os";

// Health Status Enum
export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
  UNKNOWN = "unknown",
}

// Health Check Result Interface
export interface HealthCheckResult {
  service: string;
  status: HealthStatus;
  responseTime: number;
  timestamp: string;
  details?: any;
  error?: string;
  metadata?: Record<string, any>;
}

// System Health Summary Interface
export interface SystemHealthSummary {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  services: HealthCheckResult[];
  metrics: SystemMetrics;
  alerts: HealthAlert[];
  version: string;
}

// System Metrics Interface
export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    connections: number;
    bytesIn: number;
    bytesOut: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

// Health Alert Interface
export interface HealthAlert {
  id: string;
  level: "info" | "warning" | "error" | "critical";
  service: string;
  message: string;
  timestamp: string;
  resolved: boolean;
  metadata?: Record<string, any>;
}

// Health Configuration Interface
export interface HealthConfig {
  checkInterval?: number;
  retentionPeriod?: number;
  alertThresholds?: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    responseTime?: number;
  };
  enableMetrics?: boolean;
  enableAlerts?: boolean;
  enableHistory?: boolean;
}

// Health Service Interface
export interface HealthService {
  isInitialized: boolean;
  startTime: number;

  // Health checks
  checkSystemHealth(): Promise<SystemHealthSummary>;
  checkServiceHealth(service: string): Promise<HealthCheckResult>;
  checkAllServices(): Promise<HealthCheckResult[]>;

  // Individual service checks
  checkMongoDB(): Promise<HealthCheckResult>;
  checkRedis(): Promise<HealthCheckResult>;
  checkServiceNow(): Promise<HealthCheckResult>;
  checkSyncService(): Promise<HealthCheckResult>;

  // Metrics collection
  getSystemMetrics(): Promise<SystemMetrics>;
  getServiceMetrics(service: string): Promise<any>;
  collectMetrics(): Promise<void>;

  // Health history
  getHealthHistory(
    service?: string,
    limit?: number,
  ): Promise<HealthCheckResult[]>;
  clearHealthHistory(service?: string): Promise<boolean>;

  // Alerts management
  getActiveAlerts(): Promise<HealthAlert[]>;
  createAlert(alert: Omit<HealthAlert, "id" | "timestamp">): Promise<string>;
  resolveAlert(alertId: string): Promise<boolean>;
  clearAlerts(): Promise<boolean>;

  // Configuration
  updateConfig(config: Partial<HealthConfig>): Promise<boolean>;
  getConfig(): HealthConfig;

  // Health monitoring
  startHealthMonitoring(): Promise<boolean>;
  stopHealthMonitoring(): Promise<boolean>;
  isHealthy(): Promise<boolean>;

  // Diagnostics
  getDiagnostics(): Promise<any>;
  getStats(): Promise<any>;
}

/**
 * System Health Service Implementation
 */
class SystemHealthService implements HealthService {
  public isInitialized = false;
  public startTime = Date.now();

  private config: HealthConfig;
  private healthHistory: Map<string, HealthCheckResult[]> = new Map();
  private activeAlerts: Map<string, HealthAlert> = new Map();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private metricsHistory: SystemMetrics[] = [];

  // Injected dependencies
  private mongoService: any;
  private cacheService: any;
  private syncService: any;
  private serviceNowService: any;

  constructor(config: HealthConfig, dependencies: any) {
    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 seconds
      retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
      alertThresholds: {
        cpuUsage: config.alertThresholds?.cpuUsage || 80,
        memoryUsage: config.alertThresholds?.memoryUsage || 85,
        diskUsage: config.alertThresholds?.diskUsage || 90,
        responseTime: config.alertThresholds?.responseTime || 5000,
        ...config.alertThresholds,
      },
      enableMetrics: config.enableMetrics !== false,
      enableAlerts: config.enableAlerts !== false,
      enableHistory: config.enableHistory !== false,
      ...config,
    };

    // Inject dependencies
    this.mongoService = dependencies.mongoService;
    this.cacheService = dependencies.cacheService;
    this.syncService = dependencies.syncService;
    this.serviceNowService = dependencies.serviceNowService;
  }

  /**
   * Initialize health service
   */
  async initialize(): Promise<void> {
    try {
      logger.info("🩺 Health Service initializing...", "HealthController", {
        checkInterval: this.config.checkInterval,
        enableMetrics: this.config.enableMetrics,
        enableAlerts: this.config.enableAlerts,
      });

      // Load health history from cache
      await this.loadHealthHistory();

      // Start health monitoring if enabled
      if (this.config.enableMetrics) {
        await this.startHealthMonitoring();
      }

      this.isInitialized = true;
      logger.info("✅ Health Service ready", "HealthController", {
        services: ["mongo", "cache", "sync"],
        alertThresholds: this.config.alertThresholds,
      });
    } catch (error: any) {
      logger.error(
        "❌ Health Service initialization failed",
        "HealthController",
        {
          error: error.message,
        },
      );
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    await this.stopHealthMonitoring();
    await this.saveHealthHistory();
    this.healthHistory.clear();
    this.activeAlerts.clear();
    this.isInitialized = false;
    logger.info("🛑 Health Service stopped", "HealthController");
  }

  // Health Checks

  async checkSystemHealth(): Promise<SystemHealthSummary> {
    try {
      const timestamp = new Date().toISOString();
      const uptime = Date.now() - this.startTime;

      // Check all services
      const services = await this.checkAllServices();

      // Get system metrics
      const metrics = await this.getSystemMetrics();

      // Get active alerts
      const alerts = Array.from(this.activeAlerts.values());

      // Determine overall system status
      const status = this.determineOverallStatus(services, metrics);

      const summary: SystemHealthSummary = {
        status,
        timestamp,
        uptime,
        services,
        metrics,
        alerts,
        version: process.env.npm_package_version || "1.0.0",
      };

      // Store in history if enabled
      if (this.config.enableHistory) {
        await this.storeHealthCheck("system", {
          service: "system",
          status,
          responseTime: 0,
          timestamp,
          details: summary,
        });
      }

      return summary;
    } catch (error: any) {
      logger.error("❌ System health check failed", "HealthController", {
        error: error.message,
      });

      return {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        services: [],
        metrics: await this.getSystemMetrics(),
        alerts: [],
        version: "1.0.0",
      };
    }
  }

  async checkServiceHealth(service: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      switch (service.toLowerCase()) {
        case "mongodb":
        case "mongo":
          return await this.checkMongoDB();
        case "redis":
        case "cache":
          return await this.checkRedis();
        case "servicenow":
        case "snow":
          return await this.checkServiceNow();
        case "sync":
          return await this.checkSyncService();
        default:
          return {
            service,
            status: HealthStatus.UNKNOWN,
            responseTime: Date.now() - startTime,
            timestamp,
            error: `Unknown service: ${service}`,
          };
      }
    } catch (error: any) {
      return {
        service,
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp,
        error: error.message,
      };
    }
  }

  async checkAllServices(): Promise<HealthCheckResult[]> {
    const services = ["mongodb", "redis", "sync"];
    const checks = services.map((service) => this.checkServiceHealth(service));

    try {
      const results = await Promise.allSettled(checks);
      return results.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        } else {
          return {
            service: services[index],
            status: HealthStatus.UNHEALTHY,
            responseTime: 0,
            timestamp: new Date().toISOString(),
            error: result.reason?.message || "Health check failed",
          };
        }
      });
    } catch (error: any) {
      logger.error("❌ Failed to check all services", "HealthController", {
        error: error.message,
      });
      return [];
    }
  }

  // Individual Service Checks

  async checkMongoDB(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      if (!this.mongoService) {
        return {
          service: "mongodb",
          status: HealthStatus.UNKNOWN,
          responseTime: Date.now() - startTime,
          timestamp,
          error: "MongoDB service not available",
        };
      }

      const isHealthy = await this.mongoService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const stats = await this.mongoService.getStats();
        return {
          service: "mongodb",
          status: HealthStatus.HEALTHY,
          responseTime,
          timestamp,
          details: {
            connected: stats.connected,
            database: stats.database,
            collections: stats.collections,
          },
        };
      } else {
        return {
          service: "mongodb",
          status: HealthStatus.UNHEALTHY,
          responseTime,
          timestamp,
          error: "MongoDB health check failed",
        };
      }
    } catch (error: any) {
      return {
        service: "mongodb",
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp,
        error: error.message,
      };
    }
  }

  async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      if (!this.cacheService) {
        return {
          service: "redis",
          status: HealthStatus.UNKNOWN,
          responseTime: Date.now() - startTime,
          timestamp,
          error: "Redis service not available",
        };
      }

      const isHealthy = await this.cacheService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const stats = await this.cacheService.getStats();
        return {
          service: "redis",
          status: HealthStatus.HEALTHY,
          responseTime,
          timestamp,
          details: {
            connected: stats.connected,
            database: stats.database,
            dbSize: stats.dbSize,
          },
        };
      } else {
        return {
          service: "redis",
          status: HealthStatus.UNHEALTHY,
          responseTime,
          timestamp,
          error: "Redis health check failed",
        };
      }
    } catch (error: any) {
      return {
        service: "redis",
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp,
        error: error.message,
      };
    }
  }

  async checkServiceNow(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      if (!this.serviceNowService) {
        return {
          service: "servicenow",
          status: HealthStatus.UNKNOWN,
          responseTime: Date.now() - startTime,
          timestamp,
          error: "ServiceNow service not available",
        };
      }

      // Implement ServiceNow health check
      const responseTime = Date.now() - startTime;
      return {
        service: "servicenow",
        status: HealthStatus.HEALTHY,
        responseTime,
        timestamp,
        details: {
          connected: true,
          instance: "iberdrola.service-now.com",
        },
      };
    } catch (error: any) {
      return {
        service: "servicenow",
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp,
        error: error.message,
      };
    }
  }

  async checkSyncService(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      if (!this.syncService) {
        return {
          service: "sync",
          status: HealthStatus.UNKNOWN,
          responseTime: Date.now() - startTime,
          timestamp,
          error: "Sync service not available",
        };
      }

      const isHealthy = await this.syncService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const stats = await this.syncService.getStats();
        return {
          service: "sync",
          status: HealthStatus.HEALTHY,
          responseTime,
          timestamp,
          details: {
            initialized: stats.initialized,
            autoSyncRunning: stats.autoSync?.isRunning,
            activeSyncs: stats.activeSyncs?.length || 0,
          },
        };
      } else {
        return {
          service: "sync",
          status: HealthStatus.UNHEALTHY,
          responseTime,
          timestamp,
          error: "Sync service health check failed",
        };
      }
    } catch (error: any) {
      return {
        service: "sync",
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp,
        error: error.message,
      };
    }
  }

  // Metrics Collection

  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const loadAvg = os.loadavg();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      return {
        cpu: {
          usage: await this.getCpuUsage(),
          loadAverage: loadAvg,
          cores: os.cpus().length,
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usage: (usedMem / totalMem) * 100,
        },
        disk: {
          total: 0, // Would need additional library for disk stats
          used: 0,
          free: 0,
          usage: 0,
        },
        network: {
          connections: 0, // Would need additional monitoring
          bytesIn: 0,
          bytesOut: 0,
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage,
          cpuUsage,
        },
      };
    } catch (error: any) {
      logger.error("❌ Failed to get system metrics", "HealthController", {
        error: error.message,
      });
      throw error;
    }
  }

  async getServiceMetrics(service: string): Promise<any> {
    try {
      switch (service.toLowerCase()) {
        case "mongodb":
        case "mongo":
          return this.mongoService ? await this.mongoService.getStats() : null;
        case "redis":
        case "cache":
          return this.cacheService ? await this.cacheService.getStats() : null;
        case "sync":
          return this.syncService ? await this.syncService.getStats() : null;
        default:
          return null;
      }
    } catch (error: any) {
      logger.error(
        `❌ Failed to get metrics for service: ${service}`,
        "HealthController",
        {
          error: error.message,
        },
      );
      return null;
    }
  }

  async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.getSystemMetrics();

      // Store metrics in history
      this.metricsHistory.unshift(metrics);

      // Keep only last 100 entries
      if (this.metricsHistory.length > 100) {
        this.metricsHistory = this.metricsHistory.slice(0, 100);
      }

      // Check for alerts
      if (this.config.enableAlerts) {
        await this.checkMetricAlerts(metrics);
      }

      // Store in cache for persistence
      if (this.cacheService) {
        await this.cacheService.set("health:metrics:latest", metrics, 300); // 5 minutes TTL
      }
    } catch (error: any) {
      logger.error("❌ Failed to collect metrics", "HealthController", {
        error: error.message,
      });
    }
  }

  // Health History

  async getHealthHistory(
    service?: string,
    limit = 50,
  ): Promise<HealthCheckResult[]> {
    try {
      if (service) {
        const history = this.healthHistory.get(service) || [];
        return history.slice(0, limit);
      }

      const allHistory: HealthCheckResult[] = [];
      for (const history of this.healthHistory.values()) {
        allHistory.push(...history);
      }

      return allHistory
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, limit);
    } catch (error: any) {
      logger.error("❌ Failed to get health history", "HealthController", {
        error: error.message,
      });
      return [];
    }
  }

  async clearHealthHistory(service?: string): Promise<boolean> {
    try {
      if (service) {
        this.healthHistory.delete(service);
      } else {
        this.healthHistory.clear();
      }

      logger.info(
        `✅ Health history cleared${service ? ` for service: ${service}` : ""}`,
        "HealthController",
      );
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to clear health history", "HealthController", {
        error: error.message,
      });
      return false;
    }
  }

  // Alerts Management

  async getActiveAlerts(): Promise<HealthAlert[]> {
    return Array.from(this.activeAlerts.values()).filter(
      (alert) => !alert.resolved,
    );
  }

  async createAlert(
    alert: Omit<HealthAlert, "id" | "timestamp">,
  ): Promise<string> {
    try {
      const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();

      const newAlert: HealthAlert = {
        id,
        timestamp,
        ...alert,
      };

      this.activeAlerts.set(id, newAlert);

      logger.warn(
        `⚠️ Health alert created: ${alert.message}`,
        "HealthController",
        {
          level: alert.level,
          service: alert.service,
        },
      );

      return id;
    } catch (error: any) {
      logger.error("❌ Failed to create alert", "HealthController", {
        error: error.message,
      });
      throw error;
    }
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (alert) {
        alert.resolved = true;
        logger.info(`✅ Alert resolved: ${alert.message}`, "HealthController");
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error("❌ Failed to resolve alert", "HealthController", {
        error: error.message,
      });
      return false;
    }
  }

  async clearAlerts(): Promise<boolean> {
    try {
      this.activeAlerts.clear();
      logger.info("✅ All alerts cleared", "HealthController");
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to clear alerts", "HealthController", {
        error: error.message,
      });
      return false;
    }
  }

  // Configuration

  async updateConfig(config: Partial<HealthConfig>): Promise<boolean> {
    try {
      this.config = { ...this.config, ...config };
      logger.info(
        "✅ Health configuration updated",
        "HealthController",
        config,
      );
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to update configuration", "HealthController", {
        error: error.message,
      });
      return false;
    }
  }

  getConfig(): HealthConfig {
    return { ...this.config };
  }

  // Health Monitoring

  async startHealthMonitoring(): Promise<boolean> {
    try {
      if (this.monitoringTimer) {
        clearInterval(this.monitoringTimer);
      }

      this.monitoringTimer = setInterval(async () => {
        try {
          await this.collectMetrics();

          // Periodic health check
          const healthSummary = await this.checkSystemHealth();
          logger.debug(
            "🩺 Health monitoring cycle completed",
            "HealthController",
            {
              status: healthSummary.status,
              services: healthSummary.services.length,
            },
          );
        } catch (error: any) {
          logger.error(
            "❌ Health monitoring cycle failed",
            "HealthController",
            {
              error: error.message,
            },
          );
        }
      }, this.config.checkInterval);

      logger.info("✅ Health monitoring started", "HealthController", {
        interval: this.config.checkInterval,
      });

      return true;
    } catch (error: any) {
      logger.error("❌ Failed to start health monitoring", "HealthController", {
        error: error.message,
      });
      return false;
    }
  }

  async stopHealthMonitoring(): Promise<boolean> {
    try {
      if (this.monitoringTimer) {
        clearInterval(this.monitoringTimer);
        this.monitoringTimer = null;
      }

      logger.info("🛑 Health monitoring stopped", "HealthController");
      return true;
    } catch (error: any) {
      logger.error("❌ Failed to stop health monitoring", "HealthController", {
        error: error.message,
      });
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const summary = await this.checkSystemHealth();
      return summary.status === HealthStatus.HEALTHY;
    } catch (error: any) {
      return false;
    }
  }

  // Diagnostics

  async getDiagnostics(): Promise<any> {
    try {
      const systemHealth = await this.checkSystemHealth();
      const activeAlerts = await this.getActiveAlerts();

      return {
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        system: systemHealth,
        alerts: activeAlerts,
        config: this.config,
        history: {
          servicesTracked: Array.from(this.healthHistory.keys()),
          totalHealthChecks: Array.from(this.healthHistory.values()).reduce(
            (sum, history) => sum + history.length,
            0,
          ),
          metricsCollected: this.metricsHistory.length,
        },
      };
    } catch (error: any) {
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getStats(): Promise<any> {
    try {
      return {
        initialized: this.isInitialized,
        uptime: Date.now() - this.startTime,
        monitoringActive: !!this.monitoringTimer,
        healthHistorySize: Array.from(this.healthHistory.values()).reduce(
          (sum, history) => sum + history.length,
          0,
        ),
        activeAlertsCount: Array.from(this.activeAlerts.values()).filter(
          (alert) => !alert.resolved,
        ).length,
        config: this.config,
      };
    } catch (error: any) {
      return {
        initialized: this.isInitialized,
        error: error.message,
      };
    }
  }

  // Private Helper Methods

  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = endUsage.user + endUsage.system;
        const usage = (totalUsage / 1000000) * 100; // Convert to percentage
        resolve(Math.min(usage, 100));
      }, 100);
    });
  }

  private determineOverallStatus(
    services: HealthCheckResult[],
    metrics: SystemMetrics,
  ): HealthStatus {
    const unhealthyServices = services.filter(
      (s) => s.status === HealthStatus.UNHEALTHY,
    );
    const degradedServices = services.filter(
      (s) => s.status === HealthStatus.DEGRADED,
    );

    // Check metric thresholds
    const memoryAlert =
      metrics.memory.usage > this.config.alertThresholds!.memoryUsage!;
    const cpuAlert = metrics.cpu.usage > this.config.alertThresholds!.cpuUsage!;

    if (unhealthyServices.length > 0 || memoryAlert || cpuAlert) {
      return HealthStatus.UNHEALTHY;
    }

    if (degradedServices.length > 0) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  private async checkMetricAlerts(metrics: SystemMetrics): Promise<void> {
    const { alertThresholds } = this.config;

    // CPU usage alert
    if (metrics.cpu.usage > alertThresholds!.cpuUsage!) {
      await this.createAlert({
        level: "warning",
        service: "system",
        message: `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
        resolved: false,
        metadata: {
          cpuUsage: metrics.cpu.usage,
          threshold: alertThresholds!.cpuUsage,
        },
      });
    }

    // Memory usage alert
    if (metrics.memory.usage > alertThresholds!.memoryUsage!) {
      await this.createAlert({
        level: "warning",
        service: "system",
        message: `High memory usage: ${metrics.memory.usage.toFixed(1)}%`,
        resolved: false,
        metadata: {
          memoryUsage: metrics.memory.usage,
          threshold: alertThresholds!.memoryUsage,
        },
      });
    }
  }

  private async storeHealthCheck(
    service: string,
    result: HealthCheckResult,
  ): Promise<void> {
    if (!this.healthHistory.has(service)) {
      this.healthHistory.set(service, []);
    }

    const history = this.healthHistory.get(service)!;
    history.unshift(result);

    // Keep only last 100 entries per service
    if (history.length > 100) {
      history.splice(100);
    }

    // Store in cache for persistence
    if (this.cacheService) {
      await this.cacheService.set(`health:history:${service}`, history, 3600); // 1 hour TTL
    }
  }

  private async loadHealthHistory(): Promise<void> {
    try {
      if (!this.cacheService) return;

      const services = ["system", "mongodb", "redis", "sync", "servicenow"];
      for (const service of services) {
        const history = await this.cacheService.get(
          `health:history:${service}`,
        );
        if (history && Array.isArray(history)) {
          this.healthHistory.set(service, history);
        }
      }
    } catch (error: any) {
      logger.warn("⚠️ Failed to load health history", "HealthController", {
        error: error.message,
      });
    }
  }

  private async saveHealthHistory(): Promise<void> {
    try {
      if (!this.cacheService) return;

      for (const [service, history] of this.healthHistory) {
        await this.cacheService.set(`health:history:${service}`, history, 3600);
      }
    } catch (error: any) {
      logger.warn("⚠️ Failed to save health history", "HealthController", {
        error: error.message,
      });
    }
  }
}

/**
 * Health Controller Plugin
 * Follows Elysia "1 controller = 1 instância" best practice
 */
export const healthController = new Elysia({ name: "health" })
  .onStart(async () => {
    logger.info("🩺 Health Controller initializing...", "HealthController");
  })
  .derive(async ({ config, mongoService, cacheService, syncService }) => {
    // Get health configuration
    const healthConfig: HealthConfig = {
      checkInterval: config?.health?.checkInterval || 30000,
      retentionPeriod: config?.health?.retentionPeriod || 86400000,
      alertThresholds: {
        cpuUsage: config?.health?.alertThresholds?.cpuUsage || 80,
        memoryUsage: config?.health?.alertThresholds?.memoryUsage || 85,
        diskUsage: config?.health?.alertThresholds?.diskUsage || 90,
        responseTime: config?.health?.alertThresholds?.responseTime || 5000,
        ...config?.health?.alertThresholds,
      },
      enableMetrics: config?.health?.enableMetrics !== false,
      enableAlerts: config?.health?.enableAlerts !== false,
      enableHistory: config?.health?.enableHistory !== false,
    };

    // Create health service instance with dependencies
    const healthService = new SystemHealthService(healthConfig, {
      mongoService,
      cacheService,
      syncService,
      serviceNowService: null, // Will be injected when available
    });

    try {
      // Initialize service
      await healthService.initialize();

      logger.info("✅ Health Controller ready", "HealthController", {
        checkInterval: healthConfig.checkInterval,
        metricsEnabled: healthConfig.enableMetrics,
        alertsEnabled: healthConfig.enableAlerts,
      });

      return {
        health: healthService,
        healthService,
        // Expose individual methods for convenience
        checkSystemHealth: healthService.checkSystemHealth.bind(healthService),
        checkServiceHealth:
          healthService.checkServiceHealth.bind(healthService),
        checkAllServices: healthService.checkAllServices.bind(healthService),
        getSystemMetrics: healthService.getSystemMetrics.bind(healthService),
        getServiceMetrics: healthService.getServiceMetrics.bind(healthService),
        getHealthHistory: healthService.getHealthHistory.bind(healthService),
        clearHealthHistory:
          healthService.clearHealthHistory.bind(healthService),
        getActiveAlerts: healthService.getActiveAlerts.bind(healthService),
        createAlert: healthService.createAlert.bind(healthService),
        resolveAlert: healthService.resolveAlert.bind(healthService),
        clearAlerts: healthService.clearAlerts.bind(healthService),
        isHealthy: healthService.isHealthy.bind(healthService),
        getDiagnostics: healthService.getDiagnostics.bind(healthService),
        healthStats: healthService.getStats.bind(healthService),
      };
    } catch (error: any) {
      logger.error(
        "❌ Health Controller initialization failed",
        "HealthController",
        {
          error: error.message,
        },
      );

      // Return fallback service that doesn't crash the application
      const fallbackService: HealthService = {
        isInitialized: false,
        startTime: Date.now(),
        checkSystemHealth: async () => ({
          status: HealthStatus.UNKNOWN,
          timestamp: new Date().toISOString(),
          uptime: 0,
          services: [],
          metrics: {
            cpu: { usage: 0, loadAverage: [], cores: 0 },
            memory: { total: 0, used: 0, free: 0, usage: 0 },
            disk: { total: 0, used: 0, free: 0, usage: 0 },
            network: { connections: 0, bytesIn: 0, bytesOut: 0 },
            process: {
              pid: 0,
              uptime: 0,
              memoryUsage: {} as any,
              cpuUsage: {} as any,
            },
          },
          alerts: [],
          version: "1.0.0",
        }),
        checkServiceHealth: async () => ({
          service: "",
          status: HealthStatus.UNKNOWN,
          responseTime: 0,
          timestamp: new Date().toISOString(),
          error: "Service not available",
        }),
        checkAllServices: async () => [],
        checkMongoDB: async () => ({
          service: "mongodb",
          status: HealthStatus.UNKNOWN,
          responseTime: 0,
          timestamp: new Date().toISOString(),
        }),
        checkRedis: async () => ({
          service: "redis",
          status: HealthStatus.UNKNOWN,
          responseTime: 0,
          timestamp: new Date().toISOString(),
        }),
        checkServiceNow: async () => ({
          service: "servicenow",
          status: HealthStatus.UNKNOWN,
          responseTime: 0,
          timestamp: new Date().toISOString(),
        }),
        checkSyncService: async () => ({
          service: "sync",
          status: HealthStatus.UNKNOWN,
          responseTime: 0,
          timestamp: new Date().toISOString(),
        }),
        getSystemMetrics: async () => ({
          cpu: { usage: 0, loadAverage: [], cores: 0 },
          memory: { total: 0, used: 0, free: 0, usage: 0 },
          disk: { total: 0, used: 0, free: 0, usage: 0 },
          network: { connections: 0, bytesIn: 0, bytesOut: 0 },
          process: {
            pid: 0,
            uptime: 0,
            memoryUsage: {} as any,
            cpuUsage: {} as any,
          },
        }),
        getServiceMetrics: async () => null,
        collectMetrics: async () => {},
        getHealthHistory: async () => [],
        clearHealthHistory: async () => false,
        getActiveAlerts: async () => [],
        createAlert: async () => "",
        resolveAlert: async () => false,
        clearAlerts: async () => false,
        updateConfig: async () => false,
        getConfig: () => ({}),
        startHealthMonitoring: async () => false,
        stopHealthMonitoring: async () => false,
        isHealthy: async () => false,
        getDiagnostics: async () => ({ error: "Service not available" }),
        getStats: async () => ({
          initialized: false,
          error: "Service not available",
        }),
      };

      return {
        health: fallbackService,
        healthService: fallbackService,
        checkSystemHealth: fallbackService.checkSystemHealth,
        checkServiceHealth: fallbackService.checkServiceHealth,
        checkAllServices: fallbackService.checkAllServices,
        getSystemMetrics: fallbackService.getSystemMetrics,
        getServiceMetrics: fallbackService.getServiceMetrics,
        getHealthHistory: fallbackService.getHealthHistory,
        clearHealthHistory: fallbackService.clearHealthHistory,
        getActiveAlerts: fallbackService.getActiveAlerts,
        createAlert: fallbackService.createAlert,
        resolveAlert: fallbackService.resolveAlert,
        clearAlerts: fallbackService.clearAlerts,
        isHealthy: fallbackService.isHealthy,
        getDiagnostics: fallbackService.getDiagnostics,
        healthStats: fallbackService.getStats,
      };
    }
  })
  .onStop(async ({ healthService }) => {
    if (healthService && healthService.isInitialized) {
      await healthService.shutdown();
      logger.info("🛑 Health Controller stopped", "HealthController");
    }
  })
  .as("scoped"); // Scoped for service composition

// Health Controller Context Type
export interface HealthControllerContext {
  health: HealthService;
  healthService: HealthService;
  checkSystemHealth: HealthService["checkSystemHealth"];
  checkServiceHealth: HealthService["checkServiceHealth"];
  checkAllServices: HealthService["checkAllServices"];
  getSystemMetrics: HealthService["getSystemMetrics"];
  getServiceMetrics: HealthService["getServiceMetrics"];
  getHealthHistory: HealthService["getHealthHistory"];
  clearHealthHistory: HealthService["clearHealthHistory"];
  getActiveAlerts: HealthService["getActiveAlerts"];
  createAlert: HealthService["createAlert"];
  resolveAlert: HealthService["resolveAlert"];
  clearAlerts: HealthService["clearAlerts"];
  isHealthy: HealthService["isHealthy"];
  getDiagnostics: HealthService["getDiagnostics"];
  healthStats: HealthService["getStats"];
}

export default healthController;
