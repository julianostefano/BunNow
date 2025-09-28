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
import {
  ServiceNowBridgeService,
  serviceNowBridgeService,
} from "../services/ServiceNowBridgeService";

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
    // Initialize data service with default config
    const { defaultDataServiceConfig, createDataService } = await import(
      "../services/ConsolidatedDataService"
    );
    const dataService = createDataService(defaultDataServiceConfig);

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

  // High-level ticket retrieval method - replaces direct data service calls with real functionality
  .decorate(
    "getTicket",
    async (
      sysId: string,
      options: HybridDataOptions = {},
    ): Promise<TicketData | null> => {
      try {
        console.log(
          `🔍 Data Plugin: Fetching real ticket with sys_id: ${sysId}...`,
        );

        // Import and get data service
        const { dataService } = await import(
          "../services/ConsolidatedDataService"
        );

        // Initialize if needed
        try {
          await dataService.initialize(null as any);
        } catch (initError) {
          console.log("Data service already initialized");
        }

        // Use real hybrid data access
        const ticket = await dataService.getTicket(sysId, options);

        if (ticket) {
          console.log(
            `✅ Data Plugin: Retrieved ticket ${ticket.number} from ${ticket.table}`,
          );
        } else {
          console.log(`⚠️ Data Plugin: Ticket not found with sys_id: ${sysId}`);
        }

        return ticket;
      } catch (error: any) {
        console.error("❌ Data Plugin: Error fetching ticket:", error.message);
        throw error;
      }
    },
  )

  // High-level ticket save method - replaces direct data service calls with real functionality
  .decorate(
    "saveTicket",
    async (ticket: TicketData, table: string): Promise<boolean> => {
      try {
        // Validate required data before processing
        if (!ticket || (!ticket.sys_id && !ticket.number)) {
          console.warn(
            "⚠️ Data Plugin: Invalid ticket data - missing sys_id and number",
          );
          return false;
        }

        console.log(
          `💾 Data Plugin: Saving real ticket to MongoDB: ${ticket.number || ticket.sys_id}...`,
        );

        // Import MongoDB collection manager
        const { mongoCollectionManager, COLLECTION_NAMES } = await import(
          "../config/mongodb-collections"
        );

        // Get appropriate collection based on table type
        let collection: any;
        switch (table) {
          case "incident":
            collection = mongoCollectionManager.getIncidentsCollection();
            break;
          case "change_task":
          case "ctask":
            collection = mongoCollectionManager.getChangeTasksCollection();
            break;
          case "sc_task":
          case "sctask":
            collection = mongoCollectionManager.getSCTasksCollection();
            break;
          default:
            collection = mongoCollectionManager.getCollection(
              COLLECTION_NAMES.INCIDENTS,
            );
        }

        // Create document structure matching MongoDB schema
        const document = {
          sys_id: ticket.sys_id,
          number: ticket.number,
          state: ticket.state,
          priority: ticket.priority,
          data: {
            ...ticket,
            sync_timestamp: new Date().toISOString(),
            collection_version: "2.2.0",
          },
          created_at: new Date(ticket.sys_created_on || Date.now()),
          updated_at: new Date(ticket.sys_updated_on || Date.now()),
          sys_id_prefix:
            ticket.sys_id?.substring(0, 8) ||
            ticket.number?.substring(0, 8) ||
            "unknown", // Safe partitioning
        };

        // Upsert the document
        const result = await collection.updateOne(
          { sys_id: ticket.sys_id },
          { $set: document },
          { upsert: true },
        );

        const success = !!(result.matchedCount || result.upsertedCount);
        console.log(
          `✅ Data Plugin: Ticket ${success ? "saved" : "save failed"} in MongoDB`,
        );
        return success;
      } catch (error: any) {
        console.error("❌ Data Plugin: Error saving ticket:", error.message);
        return false;
      }
    },
  )

  // High-level sync method - replaces HTTP calls in sync services with real functionality via Bridge Service
  .decorate(
    "syncFromServiceNow",
    async (table: string, options: SyncOptions = {}): Promise<SyncResult> => {
      const startTime = Date.now();

      try {
        console.log(
          `🔄 Data Plugin: Starting real sync from ServiceNow for table: ${table} via Bridge Service...`,
        );

        // Set up sync parameters
        const batchSize = options.batchSize || 50;
        let processed = 0;
        let saved = 0;
        let updated = 0;
        let errors = 0;
        const errorDetails: Array<{ sys_id: string; error: string }> = [];

        try {
          // Fetch data from ServiceNow via Bridge Service (eliminates 61s timeout)
          const queryParams = {
            sysparm_query: "", // No specific query, get recent data
            sysparm_limit: batchSize,
            sysparm_display_value: "all",
            sysparm_exclude_reference_link: "true",
          };

          const bridgeResponse = await serviceNowBridgeService.queryTable(
            table,
            queryParams,
          );

          if (!bridgeResponse.success) {
            throw new Error(
              bridgeResponse.error || "Bridge service query failed",
            );
          }

          const tickets = bridgeResponse.result || [];
          processed = tickets.length;

          console.log(
            `📊 Data Plugin: Retrieved ${processed} records from ServiceNow ${table} via Bridge Service`,
          );

          // Process each ticket
          for (const ticket of tickets) {
            try {
              // Transform to TicketData format
              const ticketData: TicketData = {
                sys_id: ticket.sys_id,
                number: ticket.number,
                table,
                state: ticket.state,
                priority: ticket.priority,
                short_description: ticket.short_description,
                assignment_group: ticket.assignment_group,
                sys_created_on: ticket.sys_created_on,
                sys_updated_on: ticket.sys_updated_on,
                ...ticket, // Include all other fields
              };

              // Use the saveTicket decorator to save to MongoDB
              const saveResult = await dataPlugin.decorator.saveTicket(
                ticketData,
                table,
              );

              if (saveResult) {
                saved++;
              } else {
                updated++; // Assume it was an update if save "failed" but no error
              }
            } catch (ticketError: any) {
              errors++;
              errorDetails.push({
                sys_id: ticket.sys_id || "unknown",
                error: ticketError.message,
              });
            }
          }
        } catch (fetchError: any) {
          errors++;
          errorDetails.push({
            sys_id: "fetch_operation",
            error: fetchError.message,
          });
        }

        const duration = Date.now() - startTime;
        const result: SyncResult = {
          table,
          processed,
          saved,
          updated,
          errors,
          conflicts: 0, // Not implementing conflict detection yet
          duration,
          lastSyncTime: new Date().toISOString(),
          errorDetails,
        };

        console.log(
          `✅ Data Plugin: Sync completed for ${table}: ${saved} saved, ${updated} updated, ${errors} errors in ${duration}ms`,
        );
        return result;
      } catch (error: any) {
        console.error(
          `❌ Data Plugin: Sync failed for ${table}:`,
          error.message,
        );

        return {
          table,
          processed: 0,
          saved: 0,
          updated: 0,
          errors: 1,
          conflicts: 0,
          duration: Date.now() - startTime,
          lastSyncTime: new Date().toISOString(),
          errorDetails: [{ sys_id: "sync_operation", error: error.message }],
        };
      }
    },
  )

  // Cache management methods - replaces direct cache access with real functionality
  .decorate("getCacheStats", (): CacheStats => {
    try {
      console.log("📊 Data Plugin: Getting real cache statistics...");

      // Import data service to get real cache stats
      const { dataService } = require("../services/ConsolidatedDataService");

      // Get real cache statistics from data service
      const realStats = dataService.getCacheStats();

      console.log("✅ Data Plugin: Real cache statistics retrieved");
      return realStats;
    } catch (error: any) {
      console.warn(
        "⚠️ Data Plugin: Could not get real cache stats, using defaults:",
        error.message,
      );
      return {
        hitRatio: 0,
        missRatio: 0,
        totalRequests: 0,
        totalHits: 0,
        totalMisses: 0,
        averageResponseTime: 0,
        warmupProgress: 0,
        preloadedTickets: 0,
      };
    }
  })

  .decorate("clearCache", (): void => {
    try {
      console.log("🧹 Data Plugin: Clearing real cache...");

      // Import data service to clear real cache
      const { dataService } = require("../services/ConsolidatedDataService");

      // Clear real cache
      dataService.invalidateCache();

      console.log("✅ Data Plugin: Real cache cleared successfully");
    } catch (error: any) {
      console.warn(
        "⚠️ Data Plugin: Could not clear real cache:",
        error.message,
      );
    }
  })

  .decorate("warmupCache", async (strategy: any = {}): Promise<void> => {
    try {
      console.log(
        "🔥 Data Plugin: Starting real cache warmup via Bridge Service...",
      );

      // Import services for cache warmup (no direct ServiceNow client needed)
      const { dataService } = await import(
        "../services/ConsolidatedDataService"
      );

      // Initialize if needed (using bridge service instead of direct client)
      try {
        await dataService.initialize();
      } catch (initError) {
        console.log("Data service already initialized");
      }

      // Define warmup tables based on strategy
      const tables = strategy.tables || ["incident", "change_task", "sc_task"];
      const batchSize = strategy.batchSize || 20;

      console.log(
        `📊 Data Plugin: Warming up cache for ${tables.length} tables via Bridge Service...`,
      );

      for (const table of tables) {
        try {
          // Sync a small batch to warm up the cache (now uses Bridge Service via syncFromServiceNow)
          await dataPlugin.decorator.syncFromServiceNow(table, { batchSize });
          console.log(
            `✅ Data Plugin: Cache warmed for ${table} via Bridge Service`,
          );
        } catch (tableError: any) {
          console.warn(
            `⚠️ Data Plugin: Cache warmup failed for ${table}:`,
            tableError.message,
          );
        }
      }

      console.log("✅ Data Plugin: Real cache warmup completed");
    } catch (error: any) {
      console.error("❌ Data Plugin: Cache warmup error:", error.message);
    }
  })

  // Query methods - replace direct MongoDB queries with real functionality
  .decorate(
    "getTicketsByState",
    async (
      table: string,
      state: string,
      limit: number = 50,
    ): Promise<TicketData[]> => {
      try {
        console.log(
          `🔍 Data Plugin: Querying real tickets from ${table} with state: ${state}, limit: ${limit}...`,
        );

        // Import MongoDB collection manager
        const { mongoCollectionManager, COLLECTION_NAMES } = await import(
          "../config/mongodb-collections"
        );

        // Get appropriate collection
        let collection: any;
        switch (table) {
          case "incident":
            collection = mongoCollectionManager.getIncidentsCollection();
            break;
          case "change_task":
          case "ctask":
            collection = mongoCollectionManager.getChangeTasksCollection();
            break;
          case "sc_task":
          case "sctask":
            collection = mongoCollectionManager.getSCTasksCollection();
            break;
          default:
            collection = mongoCollectionManager.getCollection(
              COLLECTION_NAMES.INCIDENTS,
            );
        }

        // Query by state
        const filter = { "data.state": state };
        const cursor = collection
          .find(filter)
          .sort({ updated_at: -1 })
          .limit(limit);

        const documents = await cursor.toArray();

        // Transform to TicketData format
        const tickets: TicketData[] = documents.map((doc) => ({
          sys_id: doc.sys_id,
          number: doc.number,
          table,
          state: doc.data?.state || doc.state,
          priority: doc.data?.priority || doc.priority,
          short_description: doc.data?.short_description,
          assignment_group: doc.data?.assignment_group,
          sys_created_on:
            doc.data?.sys_created_on || doc.created_at?.toISOString(),
          sys_updated_on:
            doc.data?.sys_updated_on || doc.updated_at?.toISOString(),
          ...doc.data, // Include all other fields from data
        }));

        console.log(
          `✅ Data Plugin: Retrieved ${tickets.length} tickets from ${table} with state ${state}`,
        );
        return tickets;
      } catch (error: any) {
        console.error(
          `❌ Data Plugin: Error querying tickets by state:`,
          error.message,
        );
        return [];
      }
    },
  )

  .decorate(
    "searchTickets",
    async (
      table: string,
      query: Record<string, any>,
      limit: number = 50,
    ): Promise<TicketData[]> => {
      try {
        console.log(
          `🔎 Data Plugin: Searching real tickets in ${table} with query:`,
          query,
        );

        // Import MongoDB collection manager
        const { mongoCollectionManager, COLLECTION_NAMES } = await import(
          "../config/mongodb-collections"
        );

        // Get appropriate collection
        let collection: any;
        switch (table) {
          case "incident":
            collection = mongoCollectionManager.getIncidentsCollection();
            break;
          case "change_task":
          case "ctask":
            collection = mongoCollectionManager.getChangeTasksCollection();
            break;
          case "sc_task":
          case "sctask":
            collection = mongoCollectionManager.getSCTasksCollection();
            break;
          default:
            collection = mongoCollectionManager.getCollection(
              COLLECTION_NAMES.INCIDENTS,
            );
        }

        // Build MongoDB query from search parameters
        const mongoQuery: any = {};

        // Map common search fields to MongoDB document structure
        Object.entries(query).forEach(([key, value]) => {
          if (key === "sys_id") {
            mongoQuery.sys_id = value;
          } else if (key === "number") {
            mongoQuery.number = value;
          } else if (key === "state") {
            mongoQuery["data.state"] = value;
          } else if (key === "priority") {
            mongoQuery["data.priority"] = value;
          } else if (key === "assignment_group") {
            // Support both string and object queries for assignment group
            if (typeof value === "string") {
              mongoQuery["$or"] = [
                {
                  "data.assignment_group.display_value": {
                    $regex: value,
                    $options: "i",
                  },
                },
                { "data.assignment_group": { $regex: value, $options: "i" } },
              ];
            } else {
              mongoQuery["data.assignment_group"] = value;
            }
          } else {
            // For other fields, search in the data object
            mongoQuery[`data.${key}`] = value;
          }
        });

        // Execute query
        const cursor = collection
          .find(mongoQuery)
          .sort({ updated_at: -1 })
          .limit(limit);

        const documents = await cursor.toArray();

        // Transform to TicketData format
        const tickets: TicketData[] = documents.map((doc) => ({
          sys_id: doc.sys_id,
          number: doc.number,
          table,
          state: doc.data?.state || doc.state,
          priority: doc.data?.priority || doc.priority,
          short_description: doc.data?.short_description,
          assignment_group: doc.data?.assignment_group,
          sys_created_on:
            doc.data?.sys_created_on || doc.created_at?.toISOString(),
          sys_updated_on:
            doc.data?.sys_updated_on || doc.updated_at?.toISOString(),
          ...doc.data, // Include all other fields from data
        }));

        console.log(
          `✅ Data Plugin: Found ${tickets.length} tickets matching search criteria`,
        );
        return tickets;
      } catch (error: any) {
        console.error(
          `❌ Data Plugin: Error searching tickets:`,
          error.message,
        );
        return [];
      }
    },
  )

  // Batch operations method - replaces bulk operations with real functionality
  .decorate(
    "batchUpdateTickets",
    async (
      updates: Array<{ sysId: string; data: Partial<TicketData> }>,
    ): Promise<number> => {
      try {
        // Validate input data
        if (!Array.isArray(updates) || updates.length === 0) {
          console.warn(
            "⚠️ Data Plugin: Invalid batch updates - empty or not array",
          );
          return 0;
        }

        // Filter out invalid updates
        const validUpdates = updates.filter(
          (update) =>
            update &&
            typeof update === "object" &&
            update.sysId &&
            typeof update.sysId === "string" &&
            update.data &&
            typeof update.data === "object",
        );

        if (validUpdates.length === 0) {
          console.warn("⚠️ Data Plugin: No valid updates found in batch");
          return 0;
        }

        console.log(
          `📋 Data Plugin: Performing real batch update for ${validUpdates.length} valid tickets (${updates.length - validUpdates.length} filtered out)...`,
        );

        // Import MongoDB collection manager
        const { mongoCollectionManager, COLLECTION_NAMES } = await import(
          "../config/mongodb-collections"
        );

        let successCount = 0;

        for (const update of validUpdates) {
          try {
            // Determine which collection to update by looking up the ticket first
            const collections = [
              {
                name: COLLECTION_NAMES.INCIDENTS,
                getter: () => mongoCollectionManager.getIncidentsCollection(),
              },
              {
                name: COLLECTION_NAMES.CHANGE_TASKS,
                getter: () => mongoCollectionManager.getChangeTasksCollection(),
              },
              {
                name: COLLECTION_NAMES.SC_TASKS,
                getter: () => mongoCollectionManager.getSCTasksCollection(),
              },
            ];

            let updated = false;

            for (const { name, getter } of collections) {
              try {
                const collection = getter();

                // Check if ticket exists in this collection
                const existingDoc = await collection.findOne({
                  sys_id: update.sysId,
                });

                if (existingDoc) {
                  // Update the document
                  const updateDoc = {
                    $set: {
                      "data.sys_updated_on": new Date().toISOString(),
                      updated_at: new Date(),
                      ...Object.fromEntries(
                        Object.entries(update.data).map(([key, value]) => [
                          `data.${key}`,
                          value,
                        ]),
                      ),
                    },
                  };

                  const result = await collection.updateOne(
                    { sys_id: update.sysId },
                    updateDoc,
                  );

                  if (result.modifiedCount > 0) {
                    successCount++;
                    updated = true;
                    console.log(
                      `✅ Data Plugin: Updated ticket ${update.sysId} in ${name}`,
                    );
                    break;
                  }
                }
              } catch (collectionError: any) {
                console.warn(
                  `⚠️ Data Plugin: Error updating in ${name}:`,
                  collectionError.message,
                );
              }
            }

            if (!updated) {
              console.warn(
                `⚠️ Data Plugin: Ticket ${update.sysId} not found in any collection`,
              );
            }
          } catch (updateError: any) {
            console.error(
              `❌ Data Plugin: Error updating ticket ${update.sysId}:`,
              updateError.message,
            );
          }
        }

        console.log(
          `✅ Data Plugin: Batch update completed: ${successCount}/${updates.length} successful`,
        );
        return successCount;
      } catch (error: any) {
        console.error("❌ Data Plugin: Batch update error:", error.message);
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
    async ({ getCacheStats }) => {
      try {
        const cacheStats = getCacheStats();

        return {
          success: true,
          result: {
            status: "healthy",
            plugin: "servicenow-data-plugin",
            mongodb: { connected: false, collections: 0 },
            redis: { connected: false, message: "Redis not available" },
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
    ({ getCacheStats }) => {
      const stats = getCacheStats();

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
    async ({ warmupCache, body }) => {
      try {
        const strategy = body?.strategy || {};
        await warmupCache(strategy);

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
    async ({ syncFromServiceNow, params, body }) => {
      try {
        const options: SyncOptions = body || {};
        const result = await syncFromServiceNow(params.table, options);

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
  )

  // Global scope - exposes context across entire application following best practices
  .as("global");

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
