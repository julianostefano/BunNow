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
import { apiControllerPlugin } from "./api-controller";
import { ticketControllerPlugin } from "./ticket-controller";
import { attachmentControllerPlugin } from "./attachment-controller";
import { knowledgeGraphControllerPlugin } from "./knowledge-graph-controller";

// Service availability tracking
export interface ServiceStatus {
  config: boolean;
  mongo: boolean;
  cache: boolean;
  sync: boolean;
  health: boolean;
  api: boolean;
  ticket: boolean;
  attachment: boolean;
  knowledgeGraph: boolean;
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
    health: false,
    api: false,
    ticket: false,
    attachment: false,
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
      totalServices: this.services.size,
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
      health: false,
      api: false,
      ticket: false,
      attachment: false,
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
 * 6. apiControllerPlugin (scoped) - REST API endpoints
 * 7. ticketControllerPlugin (scoped) - Ticket management operations
 * 8. attachmentControllerPlugin (scoped) - File attachment operations
 * 9. knowledgeGraphControllerPlugin (scoped) - Knowledge graph and analytics
 */
export const serviceLocator = new Elysia({ name: "service-locator" })
  .onStart(async () => {
    logger.info(
      "🏗️ Service Locator initializing - composing specialized controllers",
      "ServiceLocator",
    );
  })
  // Phase 1: Core Infrastructure Services (Global scope)
  .use(configPlugin) // Configuration - scoped for wide availability
  .use(mongoController) // MongoDB - global for database access
  .use(cacheController) // Redis Cache - global for caching

  // Phase 2: Business Logic Services (Scoped scope)
  .use(syncController) // ServiceNow Sync - scoped for composition
  .use(healthController) // Health Monitoring - scoped for monitoring
  .use(apiControllerPlugin) // API Controller - scoped for REST endpoints
  .use(ticketControllerPlugin) // Ticket Controller - scoped for ticket operations
  .use(attachmentControllerPlugin) // Attachment Controller - scoped for file operations
  .use(knowledgeGraphControllerPlugin) // Knowledge Graph Controller - scoped for AI analytics

  // Phase 3: Service Registration and Context Creation
  .derive(
    async ({
      config,
      mongoService,
      cacheService,
      syncService,
      healthService,
      apiController,
      ticketController,
      attachmentController,
      knowledgeGraphController,
    }) => {
      try {
        logger.info(
          "🔗 Service Locator composing services...",
          "ServiceLocator",
        );

        // Register all services in the global registry
        if (config) {
          globalServiceRegistry.register("config", config);
        }
        if (mongoService) {
          globalServiceRegistry.register("mongo", mongoService);
        }
        if (cacheService) {
          globalServiceRegistry.register("cache", cacheService);
        }
        if (syncService) {
          globalServiceRegistry.register("sync", syncService);
        }
        if (healthService) {
          globalServiceRegistry.register("health", healthService);
        }
        if (apiController) {
          globalServiceRegistry.register("api", apiController);
        }
        if (ticketController) {
          globalServiceRegistry.register("ticket", ticketController);
        }
        if (attachmentController) {
          globalServiceRegistry.register("attachment", attachmentController);
          globalServiceRegistry.register(
            "knowledgeGraph",
            knowledgeGraphController,
          );
        }

        // Get service availability status
        const serviceStatus = globalServiceRegistry.getServiceStatus();
        const availableServices = Object.entries(serviceStatus)
          .filter(([_, available]) => available)
          .map(([name]) => name);

        logger.info("✅ Service Locator ready", "ServiceLocator", {
          availableServices,
          totalServices: availableServices.length,
          serviceStatus,
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
          api: apiController || null,
          ticket: ticketController || null,
          attachment: attachmentController || null,
          knowledgeGraph: knowledgeGraphController || null,

          // Convenience Methods - Configuration
          getConfig: config?.getConfig || (() => ({})),
          getSection: config?.getSection || (() => null),
          updateSection: config?.updateSection || (async () => false),

          // Convenience Methods - Database
          findOne: mongoService?.findOne || (async () => null),
          find: mongoService?.find || (async () => []),
          insertOne:
            mongoService?.insertOne ||
            (async () => ({ insertedId: "fallback" })),
          updateOne:
            mongoService?.updateOne || (async () => ({ modifiedCount: 0 })),
          deleteOne:
            mongoService?.deleteOne || (async () => ({ deletedCount: 0 })),
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
          syncTable:
            syncService?.syncTable ||
            (async () => ({
              table: "",
              success: false,
              processed: 0,
              inserted: 0,
              updated: 0,
              deleted: 0,
              errors: ["Service not available"],
              duration: 0,
              timestamp: new Date().toISOString(),
              strategy: "fallback",
              batchSize: 0,
            })),
          startAutoSync: syncService?.startAutoSync || (async () => false),
          stopAutoSync: syncService?.stopAutoSync || (async () => false),
          getSyncStats: syncService?.getSyncStats || (async () => []),

          // Convenience Methods - Health
          checkSystemHealth:
            healthService?.checkSystemHealth ||
            (async () => ({
              status: "unknown" as any,
              timestamp: new Date().toISOString(),
              uptime: 0,
              services: [],
              metrics: {} as any,
              alerts: [],
              version: "1.0.0",
            })),
          checkServiceHealth:
            healthService?.checkServiceHealth ||
            (async () => ({
              service: "",
              status: "unknown" as any,
              responseTime: 0,
              timestamp: new Date().toISOString(),
              error: "Service not available",
            })),
          isHealthy: healthService?.isHealthy || (async () => false),
          getSystemMetrics:
            healthService?.getSystemMetrics || (async () => ({}) as any),

          // Convenience Methods - API Controller
          getIncidents:
            apiController?.getIncidents ||
            (async () => ({
              incidents: [],
              count: 0,
              error: "API service unavailable",
            })),
          getProblems:
            apiController?.getProblems ||
            (async () => ({
              problems: [],
              count: 0,
              error: "API service unavailable",
            })),
          getChanges:
            apiController?.getChanges ||
            (async () => ({
              changes: [],
              count: 0,
              error: "API service unavailable",
            })),
          processToParquet:
            apiController?.processToParquet ||
            (async () => ({
              success: false,
              error: "API service unavailable",
            })),
          executePipeline:
            apiController?.executePipeline ||
            (async () => ({
              success: false,
              error: "API service unavailable",
            })),
          getDashboardAnalytics:
            apiController?.getDashboardAnalytics ||
            (async () => ({
              html: "<div>Service unavailable</div>",
              data: {},
            })),
          syncCurrentMonthTickets:
            apiController?.syncCurrentMonthTickets ||
            (async () => ({
              success: false,
              error: "API service unavailable",
            })),
          getMongoDBStats:
            apiController?.getMongoDBStats ||
            (async () => ({
              success: false,
              error: "API service unavailable",
            })),
          getTargetGroups:
            apiController?.getTargetGroups ||
            (async () => ({
              success: false,
              groups: [],
              error: "API service unavailable",
            })),
          getProcessingStatus:
            apiController?.getProcessingStatus ||
            (async () => "<div>Service unavailable</div>"),

          // Convenience Methods - Ticket Controller
          getTicketDetails:
            ticketController?.getTicketDetails ||
            (async () => {
              throw new Error("Ticket service unavailable");
            }),
          getEnhancedModal:
            ticketController?.getEnhancedModal ||
            (async () => "<div>Ticket service unavailable</div>"),
          getLazyLoadTickets:
            ticketController?.getLazyLoadTickets || (async () => []),
          getTicketCount: ticketController?.getTicketCount || (async () => 0),
          getStatusLabel:
            ticketController?.getStatusLabel || ((state: string) => "Unknown"),
          getPriorityLabel:
            ticketController?.getPriorityLabel ||
            ((priority: string) => "Unknown"),
          ticketHealthCheck:
            ticketController?.ticketHealthCheck || (async () => false),
          getTicketStats:
            ticketController?.getTicketStats ||
            (async () => ({ error: "Service unavailable" })),

          // Convenience Methods - Attachment Controller
          uploadAttachment:
            attachmentController?.uploadAttachment ||
            (async () => ({
              success: false,
              error: "Attachment service unavailable",
              code: "SERVICE_UNAVAILABLE",
            })),
          downloadAttachment:
            attachmentController?.downloadAttachment ||
            (async () =>
              new Response("Attachment service unavailable", { status: 503 })),
          listAttachments:
            attachmentController?.listAttachments ||
            (async () => ({
              success: false,
              data: [],
              count: 0,
              error: "Attachment service unavailable",
              code: "SERVICE_UNAVAILABLE",
            })),
          deleteAttachment:
            attachmentController?.deleteAttachment ||
            (async () => ({
              success: false,
              error: "Attachment service unavailable",
              code: "SERVICE_UNAVAILABLE",
            })),
          getAttachmentInfo:
            attachmentController?.getAttachmentInfo ||
            (async () => ({
              success: false,
              error: "Attachment service unavailable",
              code: "SERVICE_UNAVAILABLE",
            })),
          getStorageStats:
            attachmentController?.getStorageStats ||
            (async () => ({
              success: false,
              error: "Attachment service unavailable",
            })),
          getOperationalStats:
            attachmentController?.getOperationalStats ||
            (() => ({
              uploads: 0,
              downloads: 0,
              deletes: 0,
              cacheHits: 0,
              totalSize: 0,
              operationCount: 0,
              error: "Service unavailable",
            })),

          // Convenience Methods - Knowledge Graph Controller
          addDocumentNode:
            knowledgeGraphController?.addDocumentNode ||
            (async () => ({
              success: false,
              error: "Knowledge Graph service unavailable",
              processing_time_ms: 0,
            })),
          queryKnowledgeGraph:
            knowledgeGraphController?.queryKnowledgeGraph ||
            (async () => ({
              success: false,
              error: "Knowledge Graph service unavailable",
              processing_time_ms: 0,
            })),
          getGraphAnalytics:
            knowledgeGraphController?.getGraphAnalytics ||
            (async () => {
              throw new Error("Knowledge Graph analytics service unavailable");
            }),

          // Health Check - Service Locator Level
          healthCheck: async (): Promise<boolean> => {
            try {
              const status = globalServiceRegistry.getServiceStatus();
              const criticalServices = ["config", "mongo", "cache"];

              // Check if critical services are available
              const criticalAvailable = criticalServices.every(
                (service) => status[service as keyof ServiceStatus],
              );

              // Additional health checks for available services
              const mongoHealthy = mongoService
                ? await mongoService.healthCheck()
                : true;
              const cacheHealthy = cacheService
                ? await cacheService.healthCheck()
                : true;
              const syncHealthy = syncService
                ? await syncService.healthCheck()
                : true;
              const healthHealthy = healthService
                ? await healthService.isHealthy()
                : true;
              const ticketHealthy = ticketController
                ? await ticketController.ticketHealthCheck()
                : true;
              const attachmentHealthy = attachmentController
                ? await attachmentController
                    .getStorageStats()
                    .then((stats) => stats.success)
                : true;
              const knowledgeGraphHealthy = knowledgeGraphController
                ? await knowledgeGraphController
                    .getGraphAnalytics()
                    .then(() => true)
                    .catch(() => false)
                : true;

              return (
                criticalAvailable &&
                mongoHealthy &&
                cacheHealthy &&
                syncHealthy &&
                healthHealthy &&
                ticketHealthy &&
                attachmentHealthy &&
                knowledgeGraphHealthy
              );
            } catch (error: any) {
              logger.error(
                "❌ Service Locator health check failed",
                "ServiceLocator",
                {
                  error: error.message,
                },
              );
              return false;
            }
          },

          // Statistics and Diagnostics
          getStats: async (): Promise<any> => {
            try {
              const registryStats = globalServiceRegistry.getStats();
              const mongoStats = mongoService
                ? await mongoService.getStats()
                : null;
              const cacheStats = cacheService
                ? await cacheService.getStats()
                : null;
              const syncStats = syncService
                ? await syncService.getStats()
                : null;
              const healthStats = healthService
                ? await healthService.getStats()
                : null;
              const ticketStats = ticketController
                ? await ticketController.getTicketStats()
                : null;
              const attachmentStats = attachmentController
                ? {
                    operational: attachmentController.getOperationalStats(),
                    storage: await attachmentController.getStorageStats(),
                  }
                : null;

              return {
                serviceLocator: registryStats,
                services: {
                  mongo: mongoStats,
                  cache: cacheStats,
                  sync: syncStats,
                  health: healthStats,
                  ticket: ticketStats,
                  attachment: attachmentStats,
                },
              };
            } catch (error: any) {
              return {
                error: error.message,
                serviceLocator: globalServiceRegistry.getStats(),
              };
            }
          },
        };
      } catch (error: any) {
        logger.error(
          "❌ Service Locator composition failed",
          "ServiceLocator",
          {
            error: error.message,
          },
        );

        // Return minimal fallback interface
        return {
          services: globalServiceRegistry,
          serviceRegistry: globalServiceRegistry,
          serviceStatus: {
            config: false,
            mongo: false,
            cache: false,
            sync: false,
            health: false,
            api: false,
            ticket: false,
            attachment: false,
            knowledgeGraph: false,
          },
          config: null,
          mongo: null,
          cache: null,
          sync: null,
          health: null,
          api: null,
          ticket: null,
          attachment: null,
          knowledgeGraph: null,
          healthCheck: async () => false,
          getStats: async () => ({ error: "Service composition failed" }),
        };
      }
    },
  )
  .onStop(async () => {
    logger.info(
      "🛑 Service Locator stopping - clearing service registry",
      "ServiceLocator",
    );
    globalServiceRegistry.clear();
  })
  .as("global"); // Global scope to make services available everywhere

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
  api: any;
  ticket: any;
  attachment: any;
  knowledgeGraph: any;

  // Configuration Methods
  getConfig: () => any;
  getSection: (section: string) => any;
  updateSection: (section: string, updates: any) => Promise<boolean>;

  // Database Methods
  findOne: (table: string, query: any) => Promise<any>;
  find: (table: string, query?: any, options?: any) => Promise<any[]>;
  insertOne: (table: string, document: any) => Promise<{ insertedId: string }>;
  updateOne: (
    table: string,
    filter: any,
    update: any,
  ) => Promise<{ modifiedCount: number }>;
  deleteOne: (table: string, filter: any) => Promise<{ deletedCount: number }>;
  upsert: (
    table: string,
    filter: any,
    document: any,
  ) => Promise<{ upsertedId?: string; modifiedCount: number }>;

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

  // API Controller Methods
  getIncidents: () => Promise<any>;
  getProblems: () => Promise<any>;
  getChanges: () => Promise<any>;
  processToParquet: (tableName: string) => Promise<any>;
  executePipeline: (pipelineType: string) => Promise<any>;
  getDashboardAnalytics: () => Promise<any>;
  syncCurrentMonthTickets: () => Promise<any>;
  getMongoDBStats: () => Promise<any>;
  getTargetGroups: () => Promise<any>;
  getProcessingStatus: () => Promise<string>;

  // Ticket Controller Methods
  getTicketDetails: (sysId: string, table: string) => Promise<any>;
  getEnhancedModal: (sysId: string, table: string) => Promise<string>;
  getLazyLoadTickets: (
    type: string,
    state: string,
    group?: string,
    page?: number,
  ) => Promise<any[]>;
  getTicketCount: (
    type: string,
    state: string,
    group?: string,
  ) => Promise<number>;
  getStatusLabel: (state: string) => string;
  getPriorityLabel: (priority: string) => string;
  ticketHealthCheck: () => Promise<boolean>;
  getTicketStats: () => Promise<any>;

  // Attachment Controller Methods
  uploadAttachment: (
    table: string,
    tableSysId: string,
    file: File,
  ) => Promise<any>;
  downloadAttachment: (attachmentId: string) => Promise<Response>;
  listAttachments: (table: string, tableSysId: string) => Promise<any>;
  deleteAttachment: (attachmentId: string) => Promise<any>;
  getAttachmentInfo: (attachmentId: string) => Promise<any>;
  getStorageStats: () => Promise<any>;
  getOperationalStats: () => any;

  // Knowledge Graph Controller Methods
  addDocumentNode: (
    documentId: string,
    metadata: any,
    relationships: any[],
  ) => Promise<any>;
  queryKnowledgeGraph: (query: any) => Promise<any>;
  getGraphAnalytics: () => Promise<any>;
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
