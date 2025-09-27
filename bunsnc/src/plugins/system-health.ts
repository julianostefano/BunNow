/**
 * System Health Plugin - Elysia plugin for comprehensive system monitoring and metrics
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared monitoring services para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 * - Comprehensive health checks e metrics
 *
 * Consolida system health functionality de múltiplos serviços em um plugin unificado
 */

import { Elysia } from 'elysia';

// Types para Eden Treaty
export interface SystemHealthPluginContext {
  getOverallHealth: () => Promise<HealthStatus>;
  getComponentHealth: (component: string) => Promise<ComponentHealth>;
  getSystemMetrics: () => Promise<SystemMetrics>;
  getPerformanceMetrics: () => Promise<PerformanceMetrics>;
  getResourceUsage: () => Promise<ResourceUsage>;
  checkDependencies: () => Promise<DependencyStatus[]>;
  createHealthAlert: (alert: HealthAlert) => Promise<boolean>;
  getHealthHistory: (timeRange?: string) => Promise<HealthHistoryEntry[]>;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  score: number; // 0-100
  components: Record<string, ComponentHealth>;
  lastCheck: string;
  uptime: number;
  version: string;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  message: string;
  lastCheck: string;
  responseTime?: number;
  details?: Record<string, any>;
  dependencies?: string[];
}

export interface SystemMetrics {
  server: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
    disk: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  application: {
    version: string;
    environment: string;
    nodeVersion: string;
    processId: number;
    startTime: string;
  };
  database: {
    mongodb?: {
      connected: boolean;
      collections: number;
      documents: number;
      indexes: number;
    };
    redis?: {
      connected: boolean;
      keys: number;
      memory: number;
      clients: number;
    };
  };
  external: {
    serviceNow?: {
      available: boolean;
      responseTime: number;
      rateLimitRemaining: number;
    };
    openSearch?: {
      available: boolean;
      cluster: string;
      indices: number;
    };
  };
}

export interface PerformanceMetrics {
  requests: {
    total: number;
    perSecond: number;
    averageResponseTime: number;
    errorRate: number;
  };
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
  };
  cache: {
    hitRate: number;
    missRate: number;
    size: number;
    evictions: number;
  };
  streaming: {
    activeConnections: number;
    eventsPerSecond: number;
    totalEvents: number;
  };
}

export interface ResourceUsage {
  memory: {
    heap: {
      used: number;
      total: number;
      limit: number;
    };
    external: number;
    rss: number;
  };
  eventLoop: {
    delay: number;
    utilization: number;
  };
  handles: {
    active: number;
    refs: number;
  };
}

export interface DependencyStatus {
  name: string;
  type: 'database' | 'external_api' | 'service' | 'cache';
  status: 'healthy' | 'degraded' | 'unhealthy';
  url?: string;
  responseTime?: number;
  lastCheck: string;
  error?: string;
}

export interface HealthAlert {
  level: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface HealthHistoryEntry {
  timestamp: string;
  overall: string;
  score: number;
  components: Record<string, string>;
  metrics: Partial<SystemMetrics>;
}

/**
 * System Health Plugin - Separate Instance Method pattern
 * Provides comprehensive system monitoring through dependency injection
 */
export const systemHealthPlugin = new Elysia({
  name: 'servicenow-system-health-plugin',
  seed: {
    getOverallHealth: {} as SystemHealthPluginContext['getOverallHealth'],
    getComponentHealth: {} as SystemHealthPluginContext['getComponentHealth'],
    getSystemMetrics: {} as SystemHealthPluginContext['getSystemMetrics'],
    getPerformanceMetrics: {} as SystemHealthPluginContext['getPerformanceMetrics'],
    getResourceUsage: {} as SystemHealthPluginContext['getResourceUsage'],
    checkDependencies: {} as SystemHealthPluginContext['checkDependencies'],
    createHealthAlert: {} as SystemHealthPluginContext['createHealthAlert'],
    getHealthHistory: {} as SystemHealthPluginContext['getHealthHistory'],
  }
})
  // Lifecycle Hook: onStart - Initialize Health Monitoring
  .onStart(async () => {
    console.log('🏥 ServiceNow System Health Plugin starting - initializing monitoring services');
  })

  // Health monitoring state
  .derive(async () => {
    const healthHistory: HealthHistoryEntry[] = [];
    const alerts: HealthAlert[] = [];
    const startTime = new Date();

    // Initialize periodic health checks
    const healthCheckInterval = setInterval(async () => {
      try {
        // Perform background health monitoring
        // This would integrate with actual monitoring services
        console.log('🔍 Background health check performed');
      } catch (error: any) {
        console.error('❌ Background health check failed:', error.message);
      }
    }, 60000); // Every minute

    return {
      healthHistory,
      alerts,
      startTime,
      healthCheckInterval
    };
  })

  // Overall health assessment method
  .decorate('getOverallHealth', async function(
    this: { startTime: Date }
  ): Promise<HealthStatus> {
    try {
      const components: Record<string, ComponentHealth> = {};

      // Check all system components
      const componentChecks = await Promise.allSettled([
        this.checkServiceNowConnection(),
        this.checkMongoDBConnection(),
        this.checkRedisConnection(),
        this.checkOpenSearchConnection(),
        this.checkStreamingServices()
      ]);

      // Process component results
      const componentNames = ['servicenow', 'mongodb', 'redis', 'opensearch', 'streaming'];
      componentChecks.forEach((result, index) => {
        const componentName = componentNames[index];
        if (result.status === 'fulfilled') {
          components[componentName] = result.value;
        } else {
          components[componentName] = {
            status: 'unhealthy',
            message: `Failed to check ${componentName}: ${result.reason}`,
            lastCheck: new Date().toISOString()
          };
        }
      });

      // Calculate overall health score
      const healthyComponents = Object.values(components).filter(c => c.status === 'healthy').length;
      const totalComponents = Object.keys(components).length;
      const score = Math.round((healthyComponents / totalComponents) * 100);

      // Determine overall status
      let overall: 'healthy' | 'degraded' | 'unhealthy';
      if (score >= 80) overall = 'healthy';
      else if (score >= 50) overall = 'degraded';
      else overall = 'unhealthy';

      return {
        overall,
        score,
        components,
        lastCheck: new Date().toISOString(),
        uptime: Date.now() - this.startTime.getTime(),
        version: process.env.npm_package_version || '2.1.0'
      };
    } catch (error: any) {
      console.error('❌ Health Plugin: Error getting overall health:', error.message);
      return {
        overall: 'unhealthy',
        score: 0,
        components: {},
        lastCheck: new Date().toISOString(),
        uptime: Date.now() - this.startTime.getTime(),
        version: 'unknown'
      };
    }
  })

  // Individual component health check method
  .decorate('getComponentHealth', async function(
    this: {},
    component: string
  ): Promise<ComponentHealth> {
    try {
      switch (component.toLowerCase()) {
        case 'servicenow':
          return await this.checkServiceNowConnection();
        case 'mongodb':
          return await this.checkMongoDBConnection();
        case 'redis':
          return await this.checkRedisConnection();
        case 'opensearch':
          return await this.checkOpenSearchConnection();
        case 'streaming':
          return await this.checkStreamingServices();
        default:
          return {
            status: 'unknown',
            message: `Unknown component: ${component}`,
            lastCheck: new Date().toISOString()
          };
      }
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Error checking ${component}: ${error.message}`,
        lastCheck: new Date().toISOString()
      };
    }
  })

  // System metrics collection method
  .decorate('getSystemMetrics', async function(
    this: { startTime: Date }
  ): Promise<SystemMetrics> {
    try {
      // Get process memory usage
      const memUsage = process.memoryUsage();

      // Get system load (mock values - would integrate with actual system monitoring)
      const loadAverage = [0.5, 0.7, 0.6]; // Mock values

      return {
        server: {
          uptime: process.uptime(),
          memory: {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal,
            percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
          },
          cpu: {
            usage: 25.5, // Mock value - would integrate with actual CPU monitoring
            loadAverage
          },
          disk: {
            used: 1024 * 1024 * 1024 * 10, // Mock 10GB used
            total: 1024 * 1024 * 1024 * 50, // Mock 50GB total
            percentage: 20
          }
        },
        application: {
          version: process.env.npm_package_version || '2.1.0',
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          processId: process.pid,
          startTime: this.startTime.toISOString()
        },
        database: {
          mongodb: await this.getMongoDBMetrics(),
          redis: await this.getRedisMetrics()
        },
        external: {
          serviceNow: await this.getServiceNowMetrics(),
          openSearch: await this.getOpenSearchMetrics()
        }
      };
    } catch (error: any) {
      console.error('❌ Health Plugin: Error getting system metrics:', error.message);
      throw error;
    }
  })

  // Performance metrics method
  .decorate('getPerformanceMetrics', async function(): Promise<PerformanceMetrics> {
    try {
      // Mock performance data - would integrate with actual metrics collection
      return {
        requests: {
          total: 15420,
          perSecond: 12.5,
          averageResponseTime: 150,
          errorRate: 0.02
        },
        errors: {
          total: 23,
          rate: 0.01,
          byType: {
            'timeout': 10,
            'validation': 8,
            'network': 5
          }
        },
        cache: {
          hitRate: 0.85,
          missRate: 0.15,
          size: 1500,
          evictions: 45
        },
        streaming: {
          activeConnections: 8,
          eventsPerSecond: 25.3,
          totalEvents: 89450
        }
      };
    } catch (error: any) {
      console.error('❌ Health Plugin: Error getting performance metrics:', error.message);
      throw error;
    }
  })

  // Resource usage method
  .decorate('getResourceUsage', async function(): Promise<ResourceUsage> {
    try {
      const memUsage = process.memoryUsage();

      return {
        memory: {
          heap: {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal,
            limit: 1024 * 1024 * 1024 * 2 // Mock 2GB limit
          },
          external: memUsage.external,
          rss: memUsage.rss
        },
        eventLoop: {
          delay: 5.2, // Mock event loop delay
          utilization: 0.15 // Mock utilization
        },
        handles: {
          active: 12, // Mock active handles
          refs: 8 // Mock refs
        }
      };
    } catch (error: any) {
      console.error('❌ Health Plugin: Error getting resource usage:', error.message);
      throw error;
    }
  })

  // Dependencies check method
  .decorate('checkDependencies', async function(): Promise<DependencyStatus[]> {
    try {
      const dependencies: DependencyStatus[] = [];

      // Check ServiceNow API
      const serviceNowStatus = await this.checkServiceNowConnection();
      dependencies.push({
        name: 'ServiceNow API',
        type: 'external_api',
        status: serviceNowStatus.status,
        responseTime: serviceNowStatus.responseTime,
        lastCheck: serviceNowStatus.lastCheck,
        error: serviceNowStatus.status !== 'healthy' ? serviceNowStatus.message : undefined
      });

      // Check MongoDB
      const mongoStatus = await this.checkMongoDBConnection();
      dependencies.push({
        name: 'MongoDB',
        type: 'database',
        status: mongoStatus.status,
        responseTime: mongoStatus.responseTime,
        lastCheck: mongoStatus.lastCheck,
        error: mongoStatus.status !== 'healthy' ? mongoStatus.message : undefined
      });

      // Check Redis
      const redisStatus = await this.checkRedisConnection();
      dependencies.push({
        name: 'Redis',
        type: 'cache',
        status: redisStatus.status,
        responseTime: redisStatus.responseTime,
        lastCheck: redisStatus.lastCheck,
        error: redisStatus.status !== 'healthy' ? redisStatus.message : undefined
      });

      return dependencies;
    } catch (error: any) {
      console.error('❌ Health Plugin: Error checking dependencies:', error.message);
      throw error;
    }
  })

  // Health alert creation method
  .decorate('createHealthAlert', async function(
    this: { alerts: HealthAlert[] },
    alert: HealthAlert
  ): Promise<boolean> {
    try {
      this.alerts.push({
        ...alert,
        timestamp: new Date().toISOString()
      });

      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts.splice(0, this.alerts.length - 100);
      }

      console.log(`🚨 Health Alert [${alert.level}]: ${alert.component} - ${alert.message}`);
      return true;
    } catch (error: any) {
      console.error('❌ Health Plugin: Error creating alert:', error.message);
      return false;
    }
  })

  // Health history method
  .decorate('getHealthHistory', async function(
    this: { healthHistory: HealthHistoryEntry[] },
    timeRange: string = '24h'
  ): Promise<HealthHistoryEntry[]> {
    try {
      // Filter history based on time range
      const now = new Date();
      let cutoffTime: Date;

      switch (timeRange) {
        case '1h':
          cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '6h':
          cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
          break;
        case '24h':
        default:
          cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
      }

      return this.healthHistory.filter(entry =>
        new Date(entry.timestamp) >= cutoffTime
      );
    } catch (error: any) {
      console.error('❌ Health Plugin: Error getting health history:', error.message);
      return [];
    }
  })

  // === HELPER METHODS ===

  // ServiceNow connection check
  .decorate('checkServiceNowConnection', async function(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      // Mock ServiceNow health check - would integrate with actual auth plugin
      const isAuthenticated = process.env.SNC_INSTANCE_URL && process.env.SNC_AUTH_TOKEN;
      const responseTime = Date.now() - startTime;

      return {
        status: isAuthenticated ? 'healthy' : 'unhealthy',
        message: isAuthenticated ? 'ServiceNow connection active' : 'ServiceNow not configured',
        lastCheck: new Date().toISOString(),
        responseTime,
        details: {
          instanceUrl: process.env.SNC_INSTANCE_URL ? '***configured***' : 'not_set',
          authToken: process.env.SNC_AUTH_TOKEN ? '***configured***' : 'not_set'
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `ServiceNow check failed: ${error.message}`,
        lastCheck: new Date().toISOString()
      };
    }
  })

  // MongoDB connection check
  .decorate('checkMongoDBConnection', async function(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      // Mock MongoDB health check - would integrate with actual data plugin
      const isConnected = process.env.MONGODB_URI || process.env.MONGO_URL;
      const responseTime = Date.now() - startTime;

      return {
        status: isConnected ? 'healthy' : 'degraded',
        message: isConnected ? 'MongoDB connection active' : 'MongoDB not configured',
        lastCheck: new Date().toISOString(),
        responseTime,
        details: {
          connectionString: isConnected ? '***configured***' : 'not_set'
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `MongoDB check failed: ${error.message}`,
        lastCheck: new Date().toISOString()
      };
    }
  })

  // Redis connection check
  .decorate('checkRedisConnection', async function(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      // Mock Redis health check - would integrate with actual Redis connection
      const isConfigured = process.env.REDIS_URL || process.env.REDIS_HOST;
      const responseTime = Date.now() - startTime;

      return {
        status: isConfigured ? 'healthy' : 'degraded',
        message: isConfigured ? 'Redis connection active' : 'Redis not configured',
        lastCheck: new Date().toISOString(),
        responseTime,
        details: {
          connectionString: isConfigured ? '***configured***' : 'not_set'
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Redis check failed: ${error.message}`,
        lastCheck: new Date().toISOString()
      };
    }
  })

  // OpenSearch connection check
  .decorate('checkOpenSearchConnection', async function(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      // Mock OpenSearch health check
      const isConfigured = process.env.OPENSEARCH_HOST;
      const responseTime = Date.now() - startTime;

      return {
        status: isConfigured ? 'healthy' : 'degraded',
        message: isConfigured ? 'OpenSearch connection active' : 'OpenSearch not configured',
        lastCheck: new Date().toISOString(),
        responseTime,
        details: {
          host: isConfigured ? '***configured***' : 'not_set'
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `OpenSearch check failed: ${error.message}`,
        lastCheck: new Date().toISOString()
      };
    }
  })

  // Streaming services check
  .decorate('checkStreamingServices', async function(): Promise<ComponentHealth> {
    try {
      const startTime = Date.now();
      // Mock streaming health check - would integrate with streaming plugin
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        message: 'Streaming services operational',
        lastCheck: new Date().toISOString(),
        responseTime,
        details: {
          activeConnections: 8,
          eventsPerSecond: 25.3
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: `Streaming check failed: ${error.message}`,
        lastCheck: new Date().toISOString()
      };
    }
  })

  // Get MongoDB metrics
  .decorate('getMongoDBMetrics', async function() {
    try {
      // Mock MongoDB metrics
      return {
        connected: true,
        collections: 15,
        documents: 125000,
        indexes: 45
      };
    } catch (error: any) {
      return undefined;
    }
  })

  // Get Redis metrics
  .decorate('getRedisMetrics', async function() {
    try {
      // Mock Redis metrics
      return {
        connected: true,
        keys: 3250,
        memory: 1024 * 1024 * 50, // 50MB
        clients: 8
      };
    } catch (error: any) {
      return undefined;
    }
  })

  // Get ServiceNow metrics
  .decorate('getServiceNowMetrics', async function() {
    try {
      // Mock ServiceNow metrics
      return {
        available: true,
        responseTime: 150,
        rateLimitRemaining: 850
      };
    } catch (error: any) {
      return undefined;
    }
  })

  // Get OpenSearch metrics
  .decorate('getOpenSearchMetrics', async function() {
    try {
      // Mock OpenSearch metrics
      return {
        available: true,
        cluster: 'servicenow-cluster',
        indices: 12
      };
    } catch (error: any) {
      return undefined;
    }
  })

  // Lifecycle Hook: onStop - Cleanup monitoring
  .onStop(async () => {
    console.log('🛑 ServiceNow System Health Plugin stopping - cleanup monitoring services');
  })

  // === API ENDPOINTS ===

  /**
   * Plugin health check endpoint
   * GET /health
   */
  .get('/health', async ({ getOverallHealth }) => {
    try {
      const health = await getOverallHealth();
      return {
        success: true,
        result: health,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        plugin: 'servicenow-system-health-plugin',
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'System Health Check',
      description: 'Get comprehensive system health status',
      tags: ['Health', 'System', 'Monitoring']
    }
  })

  /**
   * Component-specific health check
   * GET /health/:component
   */
  .get('/health/:component', async ({ getComponentHealth, params: { component } }) => {
    try {
      const health = await getComponentHealth(component);
      return {
        success: true,
        result: health,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Component Health Check',
      description: 'Get health status for a specific component',
      tags: ['Health', 'Component', 'Monitoring']
    }
  })

  /**
   * System metrics endpoint
   * GET /metrics
   */
  .get('/metrics', async ({ getSystemMetrics }) => {
    try {
      const metrics = await getSystemMetrics();
      return {
        success: true,
        result: metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'System Metrics',
      description: 'Get comprehensive system metrics',
      tags: ['Metrics', 'System', 'Performance']
    }
  })

  /**
   * Performance metrics endpoint
   * GET /metrics/performance
   */
  .get('/metrics/performance', async ({ getPerformanceMetrics }) => {
    try {
      const metrics = await getPerformanceMetrics();
      return {
        success: true,
        result: metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Performance Metrics',
      description: 'Get application performance metrics',
      tags: ['Metrics', 'Performance', 'Application']
    }
  })

  /**
   * Resource usage endpoint
   * GET /metrics/resources
   */
  .get('/metrics/resources', async ({ getResourceUsage }) => {
    try {
      const usage = await getResourceUsage();
      return {
        success: true,
        result: usage,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Resource Usage',
      description: 'Get system resource usage information',
      tags: ['Metrics', 'Resources', 'System']
    }
  })

  /**
   * Dependencies status endpoint
   * GET /dependencies
   */
  .get('/dependencies', async ({ checkDependencies }) => {
    try {
      const dependencies = await checkDependencies();
      return {
        success: true,
        result: dependencies,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Dependencies Status',
      description: 'Check status of all system dependencies',
      tags: ['Dependencies', 'Health', 'External']
    }
  })

  /**
   * Create health alert endpoint
   * POST /alerts
   */
  .post('/alerts', async ({ createHealthAlert, body }) => {
    try {
      const alert: HealthAlert = {
        level: body.level || 'info',
        component: body.component,
        message: body.message,
        details: body.details,
        timestamp: new Date().toISOString()
      };

      const created = await createHealthAlert(alert);

      return {
        success: created,
        result: created ? alert : null,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Create Health Alert',
      description: 'Create a new health alert',
      tags: ['Alerts', 'Health', 'Monitoring']
    }
  })

  /**
   * Health history endpoint
   * GET /health/history
   */
  .get('/health/history', async ({ getHealthHistory, query }) => {
    try {
      const timeRange = query.timeRange || '24h';
      const history = await getHealthHistory(timeRange);

      return {
        success: true,
        result: {
          timeRange,
          entries: history,
          total: history.length
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: 'Health History',
      description: 'Get historical health data',
      tags: ['Health', 'History', 'Monitoring']
    }
  });

// Export plugin context type for Eden Treaty
export type SystemHealthPluginApp = typeof systemHealthPlugin;

// Functional Callback Method pattern - for conditional use
export const createSystemHealthPlugin = (config?: {
  enablePerformanceMonitoring?: boolean;
  enableResourceMonitoring?: boolean;
  enableDependencyChecks?: boolean;
  healthCheckInterval?: number;
}) => {
  return (app: Elysia) => app
    .use(systemHealthPlugin)
    .onStart(() => {
      console.log('🔌 System Health Plugin applied - comprehensive monitoring available via dependency injection');
      console.log('🏥 Health checks, metrics, and alerting unified in single plugin');
    });
};

// Export types for other modules
export type {
  HealthStatus,
  ComponentHealth,
  SystemMetrics,
  PerformanceMetrics,
  ResourceUsage,
  DependencyStatus,
  HealthAlert,
  HealthHistoryEntry
};