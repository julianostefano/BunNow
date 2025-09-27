/**
 * Data Service Plugin - Elysia plugin for MongoDB/Redis data management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared data service instance para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 *
 * Substitui imports diretos do ConsolidatedDataService por injeção via plugin
 */

import { Elysia } from "elysia";
import {
  ConsolidatedDataService,
  TicketData,
  SyncOptions,
  SyncResult,
  CacheStats,
  HybridDataOptions,
} from "../services/ConsolidatedDataService";
import { ServiceNowStreams } from "../config/redis-streams";

// Types para Eden Treaty
export interface DataPluginContext {
  dataService: ConsolidatedDataService;
  redisStreams?: ServiceNowStreams;
  getTicket: (
    sysId: string,
    options?: HybridDataOptions,
  ) => Promise<TicketData | null>;
  saveTicket: (ticket: TicketData, table: string) => Promise<boolean>;
  syncFromServiceNow: (
    table: string,
    options?: SyncOptions,
  ) => Promise<SyncResult>;
  getCacheStats: () => CacheStats;
  clearCache: () => void;
  warmupCache: (strategy?: any) => Promise<void>;
  getTicketsByState: (
    table: string,
    state: string,
    limit?: number,
  ) => Promise<TicketData[]>;
  searchTickets: (
    table: string,
    query: Record<string, any>,
    limit?: number,
  ) => Promise<TicketData[]>;
  batchUpdateTickets: (
    updates: Array<{ sysId: string; data: Partial<TicketData> }>,
  ) => Promise<number>;
}

/**
 * Data Service Plugin - Separate Instance Method pattern
 * Provides shared data management functionality through dependency injection
 */
export const dataPlugin = new Elysia({
  name: "servicenow-data-plugin",
  seed: {
    dataService: {} as ConsolidatedDataService,
    redisStreams: {} as ServiceNowStreams | undefined,
    getTicket: {} as DataPluginContext["getTicket"],
    saveTicket: {} as DataPluginContext["saveTicket"],
    syncFromServiceNow: {} as DataPluginContext["syncFromServiceNow"],
    getCacheStats: {} as DataPluginContext["getCacheStats"],
    clearCache: {} as DataPluginContext["clearCache"],
    warmupCache: {} as DataPluginContext["warmupCache"],
    getTicketsByState: {} as DataPluginContext["getTicketsByState"],
    searchTickets: {} as DataPluginContext["searchTickets"],
    batchUpdateTickets: {} as DataPluginContext["batchUpdateTickets"],
  },
})
  // Lifecycle Hook: onStart - Initialize Data Services
  .onStart(async () => {
    console.log(
      "💾 ServiceNow Data Plugin starting - initializing MongoDB and Redis",
    );
  })

  // Dependency Injection: Create data service instance
  .derive(async () => {
    // Initialize data service
    const dataService = new ConsolidatedDataService();

    // Initialize Redis Streams (optional)
    let redisStreams: ServiceNowStreams | undefined;
    try {
      const { ServiceNowStreams: StreamsClass } = await import(
        "../config/redis-streams"
      );
      redisStreams = new StreamsClass();
      await redisStreams.initialize();
      console.log("✅ Data Plugin: Redis Streams initialized");
    } catch (error: any) {
      console.warn(
        "⚠️ Data Plugin: Redis Streams not available:",
        error.message,
      );
    }

    // Initialize MongoDB
    try {
      await dataService.initialize();
      console.log("✅ Data Plugin: MongoDB initialized");
    } catch (error: any) {
      console.warn("⚠️ Data Plugin: MongoDB not available:", error.message);
    }

    return { dataService, redisStreams };
  })

  // High-level ticket retrieval method - replaces direct data service calls
  .decorate(
    "getTicket",
    async function (
      this: { dataService: ConsolidatedDataService },
      sysId: string,
      options: HybridDataOptions = {},
    ): Promise<TicketData | null> {
      try {
        return await this.dataService.getTicket(sysId, options);
      } catch (error: any) {
        console.error("❌ Data Plugin: Error getting ticket:", error.message);
        return null;
      }
    },
  )

  // High-level ticket save method - replaces direct data service calls
  .decorate(
    "saveTicket",
    async function (
      this: { dataService: ConsolidatedDataService },
      ticket: TicketData,
      table: string,
    ): Promise<boolean> {
      try {
        await this.dataService.saveTicket(ticket, table);
        return true;
      } catch (error: any) {
        console.error("❌ Data Plugin: Error saving ticket:", error.message);
        return false;
      }
    },
  )

  // High-level sync method - replaces HTTP calls in sync services
  .decorate(
    "syncFromServiceNow",
    async function (
      this: { dataService: ConsolidatedDataService },
      table: string,
      options: SyncOptions = {},
    ): Promise<SyncResult> {
      try {
        return await this.dataService.syncFromServiceNow(table, options);
      } catch (error: any) {
        console.error(
          "❌ Data Plugin: Error syncing from ServiceNow:",
          error.message,
        );
        return {
          table,
          processed: 0,
          saved: 0,
          updated: 0,
          errors: 1,
          conflicts: 0,
          duration: 0,
          lastSyncTime: new Date().toISOString(),
          errorDetails: [{ sys_id: "unknown", error: error.message }],
        };
      }
    },
  )

  // Cache management methods - replaces direct cache access
  .decorate(
    "getCacheStats",
    function (this: { dataService: ConsolidatedDataService }): CacheStats {
      return this.dataService.getCacheStats();
    },
  )

  .decorate(
    "clearCache",
    function (this: { dataService: ConsolidatedDataService }): void {
      this.dataService.clearCache();
      console.log("🧹 Data Plugin: Cache cleared");
    },
  )

  .decorate(
    "warmupCache",
    async function (
      this: { dataService: ConsolidatedDataService },
      strategy: any = {},
    ): Promise<void> {
      try {
        await this.dataService.warmupCache(strategy);
        console.log("🔥 Data Plugin: Cache warmup completed");
      } catch (error: any) {
        console.warn("⚠️ Data Plugin: Cache warmup failed:", error.message);
      }
    },
  )

  // Query methods - replace direct MongoDB queries
  .decorate(
    "getTicketsByState",
    async function (
      this: { dataService: ConsolidatedDataService },
      table: string,
      state: string,
      limit: number = 50,
    ): Promise<TicketData[]> {
      try {
        return await this.dataService.getTicketsByState(table, state, limit);
      } catch (error: any) {
        console.error(
          "❌ Data Plugin: Error getting tickets by state:",
          error.message,
        );
        return [];
      }
    },
  )

  .decorate(
    "searchTickets",
    async function (
      this: { dataService: ConsolidatedDataService },
      table: string,
      query: Record<string, any>,
      limit: number = 50,
    ): Promise<TicketData[]> {
      try {
        return await this.dataService.searchTickets(table, query, limit);
      } catch (error: any) {
        console.error(
          "❌ Data Plugin: Error searching tickets:",
          error.message,
        );
        return [];
      }
    },
  )

  // Batch operations method - replaces bulk operations
  .decorate(
    "batchUpdateTickets",
    async function (
      this: { dataService: ConsolidatedDataService },
      updates: Array<{ sysId: string; data: Partial<TicketData> }>,
    ): Promise<number> {
      try {
        return await this.dataService.batchUpdateTickets(updates);
      } catch (error: any) {
        console.error(
          "❌ Data Plugin: Error batch updating tickets:",
          error.message,
        );
        return 0;
      }
    },
  )

  // Lifecycle Hook: onStop - Cleanup connections
  .onStop(async () => {
    console.log("🛑 ServiceNow Data Plugin stopping - closing connections");
  })

  // Plugin health check endpoint
  .get(
    "/data/health",
    async ({ dataService, redisStreams }) => {
      try {
        const cacheStats = dataService.getCacheStats();

        // MongoDB health check with safe error handling
        let mongoHealth = { connected: false, collections: 0 };
        try {
          // Try to get MongoDB status from the service
          const mongoStatus = (await dataService.getMongoStatus?.()) || {
            connected: false,
          };
          mongoHealth = {
            connected: mongoStatus.connected || false,
            collections: mongoStatus.collections || 0,
          };
        } catch (error: any) {
          console.warn("MongoDB health check failed:", error.message);
        }

        // Redis health check with safe error handling
        let redisHealth = null;
        if (redisStreams) {
          try {
            redisHealth = {
              connected: true,
              streams: (await redisStreams.getStreamCount?.()) || 0,
            };
          } catch (error: any) {
            console.warn("Redis health check failed:", error.message);
            redisHealth = { connected: false, error: error.message };
          }
        }

        return {
          success: true,
          result: {
            status: "healthy",
            plugin: "servicenow-data-plugin",
            mongodb: mongoHealth,
            redis: redisHealth || {
              connected: false,
              message: "Redis not available",
            },
            cache: {
              hitRatio: cacheStats.hitRatio || 0,
              size: cacheStats.preloadedTickets || 0,
              totalRequests: cacheStats.totalRequests || 0,
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          plugin: "servicenow-data-plugin",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Data Service Plugin Health Check",
        description:
          "Check health of data service plugin including MongoDB, Redis, and cache",
        tags: ["Health", "Plugin", "Data"],
      },
    },
  )

  // Cache metrics endpoint
  .get(
    "/data/cache/metrics",
    ({ dataService }) => {
      const stats = dataService.getCacheStats();

      return {
        success: true,
        result: {
          metrics: stats,
          status: "healthy",
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "Cache Metrics",
        description: "Get data service cache performance metrics",
        tags: ["Data", "Cache", "Metrics"],
      },
    },
  )

  // Cache warmup endpoint
  .post(
    "/data/cache/warmup",
    async ({ dataService, body }) => {
      try {
        const strategy = body?.strategy || {};
        await dataService.warmupCache(strategy);

        return {
          success: true,
          result: {
            message: "Cache warmup initiated",
            strategy,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Cache Warmup",
        description: "Initiate cache warmup with optional strategy",
        tags: ["Data", "Cache", "Performance"],
      },
    },
  )

  // Sync endpoint
  .post(
    "/data/sync/:table",
    async ({ dataService, params, body }) => {
      try {
        const options: SyncOptions = body || {};
        const result = await dataService.syncFromServiceNow(
          params.table,
          options,
        );

        return {
          success: true,
          result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Sync from ServiceNow",
        description: "Sync data from ServiceNow to MongoDB",
        tags: ["Data", "Sync", "ServiceNow"],
      },
    },
  );

// Export plugin context type for Eden Treaty
export type DataPluginApp = typeof dataPlugin;

// Functional Callback Method pattern - for conditional use
export const createDataPlugin = (config?: {
  enableMongoInit?: boolean;
  enableRedisStreams?: boolean;
  enableCacheWarmup?: boolean;
}) => {
  return (app: Elysia) =>
    app.use(dataPlugin).onStart(() => {
      console.log(
        "🔌 Data Plugin applied - data services available via dependency injection",
      );
      console.log(
        "📦 Direct data service imports eliminated - using plugin injection",
      );
    });
};

// Export types for other modules
export type {
  TicketData,
  SyncOptions,
  SyncResult,
  CacheStats,
  HybridDataOptions,
};
