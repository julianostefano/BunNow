/**
 * Service Locator - Centralized Dependency Management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Implements Service Locator pattern following Elysia "1 controller = 1 instância" best practice
 * Centralizes all specialized controllers and provides unified service access
 *
 * Features:
 * - Centralized service registration and discovery
 * - Dependency injection for all specialized controllers
 * - Service composition with proper scoping
 * - Graceful degradation when services are unavailable
 * - Service health monitoring and lifecycle management
 * - Type-safe service access with full IntelliSense support
 */

import { Elysia } from "elysia";
import { logger } from "../utils/Logger";

// Import specialized controllers
import { configPlugin } from "./config-manager";
import { mongoController } from "./mongo-controller";
import { cacheController } from "./cache-controller";
import { syncController } from "./sync-controller";
import { healthController } from "./health-controller";

// Service availability tracking
export interface ServiceStatus {
  config: boolean;
  mongo: boolean;
  cache: boolean;
  sync: boolean;
  health: boolean;
}

// Service locator configuration
export interface ServiceLocatorConfig {
  enableFallbacks?: boolean;
  healthCheckInterval?: number;
  startupTimeout?: number;
  gracefulShutdown?: boolean;
}

/**
 * Service Locator Implementation
 * Centralizes all service dependencies following Elysia best practices
 */
export class ServiceRegistry {
  private services: Map<string, any> = new Map();
  private serviceStatus: ServiceStatus = {
    config: false,
    mongo: false,
    cache: false,
    sync: false,
    health: false
  };
  private startTime = Date.now();

  /**
   * Register a service in the registry
   */
  register(name: string, service: any): void {
    this.services.set(name, service);
    this.updateServiceStatus(name, true);
    logger.info(`✅ Service registered: ${name}`, "ServiceLocator");
  }

  /**
   * Get a service from the registry
   */
  get<T = any>(name: string): T | null {
    return this.services.get(name) || null;
  }

  /**
   * Check if a service is available
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered services
   */
  getAll(): Map<string, any> {
    return new Map(this.services);
  }

  /**
   * Get service availability status
   */
  getServiceStatus(): ServiceStatus {
    return { ...this.serviceStatus };
  }

  /**
   * Get service locator statistics
   */
  getStats(): any {
    return {
      registeredServices: Array.from(this.services.keys()),
      serviceStatus: this.serviceStatus,
      uptime: Date.now() - this.startTime,
      totalServices: this.services.size
    };
  }

  /**
   * Clear all services (for shutdown)
   */
  clear(): void {
    this.services.clear();
    this.serviceStatus = {
      config: false,
      mongo: false,
      cache: false,
      sync: false,
      health: false
    };
  }

  private updateServiceStatus(serviceName: string, available: boolean): void {
    if (serviceName in this.serviceStatus) {
      (this.serviceStatus as any)[serviceName] = available;
    }
  }
}

/**
 * Global Service Registry Instance
 */
export const globalServiceRegistry = new ServiceRegistry();

/**
 * Service Locator Plugin
 * Composes all specialized controllers into a unified service interface
 *
 * Architecture:
 * 1. configPlugin (scoped) - Configuration management
 * 2. mongoController (global) - Database operations
 * 3. cacheController (global) - Redis cache and streams
 * 4. syncController (scoped) - ServiceNow synchronization
 * 5. healthController (scoped) - System monitoring
 */
export const serviceLocator = new Elysia({ name: "service-locator" })
  .onStart(async () => {
    logger.info("🏗️ Service Locator initializing - composing specialized controllers", "ServiceLocator");
  })
  // Phase 1: Core Infrastructure Services (Global scope)
  .use(configPlugin)        // Configuration - scoped for wide availability
  .use(mongoController)     // MongoDB - global for database access
  .use(cacheController)     // Redis Cache - global for caching

  // Phase 2: Business Logic Services (Scoped scope)
  .use(syncController)      // ServiceNow Sync - scoped for composition
  .use(healthController)    // Health Monitoring - scoped for monitoring

  // Phase 3: Service Registration and Context Creation
  .derive(async ({
    config,
    mongoService,
    cacheService,
    syncService,
    healthService
  }) => {
    try {
      logger.info("🔗 Service Locator composing services...", "ServiceLocator");

      // Register all services in the global registry
      if (config) {
        globalServiceRegistry.register('config', config);
      }
      if (mongoService) {
        globalServiceRegistry.register('mongo', mongoService);
      }
      if (cacheService) {
        globalServiceRegistry.register('cache', cacheService);
      }
      if (syncService) {
        globalServiceRegistry.register('sync', syncService);
      }
      if (healthService) {
        globalServiceRegistry.register('health', healthService);
      }

      // Get service availability status
      const serviceStatus = globalServiceRegistry.getServiceStatus();
      const availableServices = Object.entries(serviceStatus)
        .filter(([_, available]) => available)
        .map(([name]) => name);

      logger.info("✅ Service Locator ready", "ServiceLocator", {
        availableServices,
        totalServices: availableServices.length,
        serviceStatus
      });

      // Return unified service interface following Elysia patterns
      return {
        // Service Registry Access
        services: globalServiceRegistry,
        serviceRegistry: globalServiceRegistry,
        serviceStatus,

        // Direct Service Access (with null safety)
        config: config || null,
        mongo: mongoService || null,
        cache: cacheService || null,
        sync: syncService || null,
        health: healthService || null,

        // Convenience Methods - Configuration
        getConfig: config?.getConfig || (() => ({})),
        getSection: config?.getSection || (() => null),
        updateSection: config?.updateSection || (async () => false),

        // Convenience Methods - Database
        findOne: mongoService?.findOne || (async () => null),
        find: mongoService?.find || (async () => []),
        insertOne: mongoService?.insertOne || (async () => ({ insertedId: "fallback" })),
        updateOne: mongoService?.updateOne || (async () => ({ modifiedCount: 0 })),
        deleteOne: mongoService?.deleteOne || (async () => ({ deletedCount: 0 })),
        upsert: mongoService?.upsert || (async () => ({ modifiedCount: 0 })),

        // Convenience Methods - Cache
        cacheGet: cacheService?.get || (async () => null),
        cacheSet: cacheService?.set || (async () => false),
        cacheDel: cacheService?.del || (async () => false),
        cacheHget: cacheService?.hget || (async () => null),
        cacheHset: cacheService?.hset || (async () => false),
        cacheXadd: cacheService?.xadd || (async () => "0-0"),
        cachePublish: cacheService?.publish || (async () => 0),

        // Convenience Methods - Sync
        syncTable: syncService?.syncTable || (async () => ({
          table: '',
          success: false,
          processed: 0,
          inserted: 0,
          updated: 0,
          deleted: 0,
          errors: ['Service not available'],
          duration: 0,
          timestamp: new Date().toISOString(),
          strategy: 'fallback',
          batchSize: 0
        })),
        startAutoSync: syncService?.startAutoSync || (async () => false),
        stopAutoSync: syncService?.stopAutoSync || (async () => false),
        getSyncStats: syncService?.getSyncStats || (async () => []),

        // Convenience Methods - Health
        checkSystemHealth: healthService?.checkSystemHealth || (async () => ({
          status: 'unknown' as any,
          timestamp: new Date().toISOString(),
          uptime: 0,
          services: [],
          metrics: {} as any,
          alerts: [],
          version: '1.0.0'
        })),
        checkServiceHealth: healthService?.checkServiceHealth || (async () => ({
          service: '',
          status: 'unknown' as any,
          responseTime: 0,
          timestamp: new Date().toISOString(),
          error: 'Service not available'
        })),
        isHealthy: healthService?.isHealthy || (async () => false),
        getSystemMetrics: healthService?.getSystemMetrics || (async () => ({} as any)),

        // Health Check - Service Locator Level
        healthCheck: async (): Promise<boolean> => {
          try {
            const status = globalServiceRegistry.getServiceStatus();
            const criticalServices = ['config', 'mongo', 'cache'];

            // Check if critical services are available
            const criticalAvailable = criticalServices.every(service => status[service as keyof ServiceStatus]);

            // Additional health checks for available services
            const mongoHealthy = mongoService ? await mongoService.healthCheck() : true;
            const cacheHealthy = cacheService ? await cacheService.healthCheck() : true;
            const syncHealthy = syncService ? await syncService.healthCheck() : true;
            const healthHealthy = healthService ? await healthService.isHealthy() : true;

            return criticalAvailable && mongoHealthy && cacheHealthy && syncHealthy && healthHealthy;
          } catch (error: any) {
            logger.error("❌ Service Locator health check failed", "ServiceLocator", {
              error: error.message
            });
            return false;
          }
        },

        // Statistics and Diagnostics
        getStats: async (): Promise<any> => {
          try {
            const registryStats = globalServiceRegistry.getStats();
            const mongoStats = mongoService ? await mongoService.getStats() : null;
            const cacheStats = cacheService ? await cacheService.getStats() : null;
            const syncStats = syncService ? await syncService.getStats() : null;
            const healthStats = healthService ? await healthService.getStats() : null;

            return {
              serviceLocator: registryStats,
              services: {
                mongo: mongoStats,
                cache: cacheStats,
                sync: syncStats,
                health: healthStats
              }
            };
          } catch (error: any) {
            return {
              error: error.message,
              serviceLocator: globalServiceRegistry.getStats()
            };
          }
        }
      };

    } catch (error: any) {
      logger.error("❌ Service Locator composition failed", "ServiceLocator", {
        error: error.message
      });

      // Return minimal fallback interface
      return {
        services: globalServiceRegistry,
        serviceRegistry: globalServiceRegistry,
        serviceStatus: {
          config: false,
          mongo: false,
          cache: false,
          sync: false,
          health: false
        },
        config: null,
        mongo: null,
        cache: null,
        sync: null,
        health: null,
        healthCheck: async () => false,
        getStats: async () => ({ error: "Service composition failed" })
      };
    }
  })
  .onStop(async () => {
    logger.info("🛑 Service Locator stopping - clearing service registry", "ServiceLocator");
    globalServiceRegistry.clear();
  })
  .as('global'); // Global scope to make services available everywhere

// Service Locator Context Type
export interface ServiceLocatorContext {
  // Service Registry
  services: ServiceRegistry;
  serviceRegistry: ServiceRegistry;
  serviceStatus: ServiceStatus;

  // Direct Service Access
  config: any;
  mongo: any;
  cache: any;
  sync: any;
  health: any;

  // Configuration Methods
  getConfig: () => any;
  getSection: (section: string) => any;
  updateSection: (section: string, updates: any) => Promise<boolean>;

  // Database Methods
  findOne: (table: string, query: any) => Promise<any>;
  find: (table: string, query?: any, options?: any) => Promise<any[]>;
  insertOne: (table: string, document: any) => Promise<{ insertedId: string }>;
  updateOne: (table: string, filter: any, update: any) => Promise<{ modifiedCount: number }>;
  deleteOne: (table: string, filter: any) => Promise<{ deletedCount: number }>;
  upsert: (table: string, filter: any, document: any) => Promise<{ upsertedId?: string; modifiedCount: number }>;

  // Cache Methods
  cacheGet: (key: string) => Promise<any>;
  cacheSet: (key: string, value: any, ttl?: number) => Promise<boolean>;
  cacheDel: (key: string) => Promise<boolean>;
  cacheHget: (key: string, field: string) => Promise<any>;
  cacheHset: (key: string, field: string, value: any) => Promise<boolean>;
  cacheXadd: (stream: string, fields: Record<string, any>) => Promise<string>;
  cachePublish: (channel: string, message: any) => Promise<number>;

  // Sync Methods
  syncTable: (table: string, options?: any) => Promise<any>;
  startAutoSync: (config: any) => Promise<boolean>;
  stopAutoSync: () => Promise<boolean>;
  getSyncStats: (table?: string) => Promise<any[]>;

  // Health Methods
  checkSystemHealth: () => Promise<any>;
  checkServiceHealth: (service: string) => Promise<any>;
  isHealthy: () => Promise<boolean>;
  getSystemMetrics: () => Promise<any>;

  // Service Locator Methods
  healthCheck: () => Promise<boolean>;
  getStats: () => Promise<any>;
}

/**
 * Convenience function to get a service from the global registry
 */
export function getService<T = any>(name: string): T | null {
  return globalServiceRegistry.get<T>(name);
}

/**
 * Convenience function to check service availability
 */
export function hasService(name: string): boolean {
  return globalServiceRegistry.has(name);
}

/**
 * Convenience function to get all service statuses
 */
export function getServiceStatus(): ServiceStatus {
  return globalServiceRegistry.getServiceStatus();
}

export default serviceLocator;