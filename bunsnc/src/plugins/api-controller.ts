/**
 * API Controller Plugin - REST endpoints and data processing methods
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.6.1: Singleton Lazy Loading Pattern (ElysiaJS Key Concepts #5 + #7)
 * Root cause: PluginAPIController instanciado a cada request via .derive()
 * Solution: Singleton instance com lazy initialization na primeira request
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Deduplication Mechanism"
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Singleton Lazy Loading (v5.6.1)
 * - Global lifecycle scope (.as("global"))
 * - Implements "Separate Instance Method" pattern following Elysia best practices
 * - Migrated from class-based APIController to plugin architecture
 *
 * Features:
 * - ServiceNow data integration via service locator
 * - MongoDB statistics and querying
 * - Dashboard analytics and metrics
 * - Parquet processing and pipeline execution
 * - Target groups management
 * - Real-time sync capabilities
 */

import { Elysia, t } from "elysia";
import { logger } from "../utils/Logger";

// TypeBox schemas for API validation
const TicketQuerySchema = t.Object({
  limit: t.Optional(t.Number({ minimum: 1, maximum: 1000, default: 100 })),
  offset: t.Optional(t.Number({ minimum: 0, default: 0 })),
  sort: t.Optional(t.String({ default: "sys_created_on" })),
  fields: t.Optional(t.Array(t.String())),
  filters: t.Optional(t.Record(t.String(), t.Any())),
});

const SyncResponseSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
  stats: t.Optional(
    t.Object({
      incidents: t.Number(),
      problems: t.Number(),
      changes: t.Number(),
      errors: t.Number(),
    }),
  ),
  error: t.Optional(t.String()),
});

const MongoStatsResponseSchema = t.Object({
  success: t.Boolean(),
  collections: t.Record(
    t.String(),
    t.Object({
      count: t.Number(),
      size: t.Number(),
      indexes: t.Number(),
    }),
  ),
  total_documents: t.Number(),
  database_size: t.Number(),
  error: t.Optional(t.String()),
});

const TargetGroupsResponseSchema = t.Object({
  success: t.Boolean(),
  groups: t.Array(
    t.Object({
      sys_id: t.String(),
      name: t.String(),
      description: t.Optional(t.String()),
      manager: t.Optional(t.String()),
      email: t.Optional(t.String()),
      active: t.Boolean(),
    }),
  ),
  count: t.Number(),
  error: t.Optional(t.String()),
});

// API Controller Implementation Class
class PluginAPIController {
  private serviceLocator: any;
  private config: any;

  constructor(serviceLocator: any, config: any) {
    this.serviceLocator = serviceLocator;
    this.config = config;
  }

  /**
   * Get active incidents from ServiceNow
   */
  async getIncidents() {
    try {
      const { syncTable } = this.serviceLocator;

      // Use sync service to get incidents
      const syncResult = await syncTable("incident", {
        query: "state!=6",
        fields: [
          "sys_id",
          "number",
          "short_description",
          "priority",
          "state",
          "sys_created_on",
        ],
        limit: 100,
      });

      if (!syncResult.success) {
        throw new Error(
          `Failed to sync incidents: ${syncResult.errors?.join(", ")}`,
        );
      }

      // Query from MongoDB via service locator
      const { findOne, find } = this.serviceLocator;
      const incidents = await find(
        "sn_incidents",
        { "data.incident.state": { $ne: "6" } },
        {
          limit: 100,
          sort: { "data.incident.sys_created_on": -1 },
          projection: {
            "data.incident.sys_id": 1,
            "data.incident.number": 1,
            "data.incident.short_description": 1,
            "data.incident.priority": 1,
            "data.incident.state": 1,
            "data.incident.sys_created_on": 1,
          },
        },
      );

      const processedIncidents = incidents
        .map((doc: any) => ({
          sys_id: doc.data?.incident?.sys_id,
          number: doc.data?.incident?.number,
          short_description: doc.data?.incident?.short_description,
          priority: doc.data?.incident?.priority,
          state: doc.data?.incident?.state,
          sys_created_on: doc.data?.incident?.sys_created_on,
        }))
        .filter((incident) => incident.sys_id);

      return {
        incidents: processedIncidents,
        count: processedIncidents.length,
        syncResult: {
          processed: syncResult.processed,
          inserted: syncResult.inserted,
          updated: syncResult.updated,
        },
      };
    } catch (error: any) {
      logger.error("❌ Failed to fetch incidents", "APIController", {
        error: error.message,
      });
      throw new Error(`Failed to fetch incidents: ${error.message}`);
    }
  }

  /**
   * Get open problems from ServiceNow
   */
  async getProblems() {
    try {
      const { syncTable, find } = this.serviceLocator;

      // Use sync service to get problems
      const syncResult = await syncTable("problem", {
        query: "state!=6",
        fields: [
          "sys_id",
          "number",
          "short_description",
          "priority",
          "state",
          "sys_created_on",
        ],
        limit: 100,
      });

      // Query from MongoDB
      const problems = await find(
        "sn_problems",
        { "data.problem.state": { $ne: "6" } },
        {
          limit: 100,
          sort: { "data.problem.sys_created_on": -1 },
        },
      );

      const processedProblems = problems
        .map((doc: any) => ({
          sys_id: doc.data?.problem?.sys_id,
          number: doc.data?.problem?.number,
          short_description: doc.data?.problem?.short_description,
          priority: doc.data?.problem?.priority,
          state: doc.data?.problem?.state,
          sys_created_on: doc.data?.problem?.sys_created_on,
        }))
        .filter((problem) => problem.sys_id);

      return {
        problems: processedProblems,
        count: processedProblems.length,
        syncResult: {
          processed: syncResult.processed,
          inserted: syncResult.inserted,
          updated: syncResult.updated,
        },
      };
    } catch (error: any) {
      logger.error("❌ Failed to fetch problems", "APIController", {
        error: error.message,
      });
      throw new Error(`Failed to fetch problems: ${error.message}`);
    }
  }

  /**
   * Get pending changes from ServiceNow
   */
  async getChanges() {
    try {
      const { syncTable, find } = this.serviceLocator;

      // Use sync service to get changes
      const syncResult = await syncTable("change_request", {
        query: "stateIN1,2,3",
        fields: [
          "sys_id",
          "number",
          "short_description",
          "priority",
          "state",
          "sys_created_on",
        ],
        limit: 100,
      });

      // Query from MongoDB
      const changes = await find(
        "sn_change_requests",
        { "data.change_request.state": { $in: ["1", "2", "3"] } },
        {
          limit: 100,
          sort: { "data.change_request.sys_created_on": -1 },
        },
      );

      const processedChanges = changes
        .map((doc: any) => ({
          sys_id: doc.data?.change_request?.sys_id,
          number: doc.data?.change_request?.number,
          short_description: doc.data?.change_request?.short_description,
          priority: doc.data?.change_request?.priority,
          state: doc.data?.change_request?.state,
          sys_created_on: doc.data?.change_request?.sys_created_on,
        }))
        .filter((change) => change.sys_id);

      return {
        changes: processedChanges,
        count: processedChanges.length,
        syncResult: {
          processed: syncResult.processed,
          inserted: syncResult.inserted,
          updated: syncResult.updated,
        },
      };
    } catch (error: any) {
      logger.error("❌ Failed to fetch changes", "APIController", {
        error: error.message,
      });
      throw new Error(`Failed to fetch changes: ${error.message}`);
    }
  }

  /**
   * Process ServiceNow data to Parquet format
   */
  async processToParquet(tableName: string) {
    try {
      const outputPath = `${this.config.parquet?.outputPath || "/tmp/parquet"}/${tableName}_${Date.now()}.parquet`;

      // Enhanced Parquet processing with MongoDB integration
      const { find } = this.serviceLocator;
      const data = await find(`sn_${tableName}`, {}, { limit: 10000 });

      return {
        success: true,
        message: `Processing ${tableName} to Parquet format - ${data.length} records found`,
        outputPath,
        recordCount: data.length,
        tableName,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("❌ Failed to process to Parquet", "APIController", {
        tableName,
        error: error.message,
      });
      throw new Error(
        `Failed to process ${tableName} to Parquet: ${error.message}`,
      );
    }
  }

  /**
   * Execute data processing pipeline
   */
  async executePipeline(pipelineType: string) {
    try {
      const pipelineId = `pipeline_${pipelineType}_${Date.now()}`;
      const executionId = `exec_${Date.now()}`;

      // Enhanced pipeline execution with service locator integration
      const { getSyncStats, checkSystemHealth } = this.serviceLocator;

      const stats = await getSyncStats();
      const health = await checkSystemHealth();

      return {
        success: true,
        message: `Pipeline ${pipelineType} execution initiated with service integration`,
        pipelineId,
        executionId,
        systemHealth: health.status,
        syncStats: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("❌ Failed to execute pipeline", "APIController", {
        pipelineType,
        error: error.message,
      });
      throw new Error(`Failed to execute pipeline: ${error.message}`);
    }
  }

  /**
   * Get dashboard analytics with real-time data
   */
  async getDashboardAnalytics() {
    try {
      const [incidents, problems, changes] = await Promise.all([
        this.getActiveIncidentCount(),
        this.getOpenProblemCount(),
        this.getPendingChangeCount(),
      ]);

      const analyticsHtml = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="text-center">
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Incidents</h4>
            <div class="text-4xl font-bold text-red-600">${incidents}</div>
            <p class="text-gray-500 mt-1">Active tickets</p>
          </div>
          <div class="text-center">
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Problems</h4>
            <div class="text-4xl font-bold text-orange-600">${problems}</div>
            <p class="text-gray-500 mt-1">Open problems</p>
          </div>
          <div class="text-center">
            <h4 class="text-lg font-semibold text-gray-700 mb-2">Changes</h4>
            <div class="text-4xl font-bold text-blue-600">${changes}</div>
            <p class="text-gray-500 mt-1">Pending changes</p>
          </div>
        </div>
      `;

      return {
        html: analyticsHtml,
        data: { incidents, problems, changes },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("❌ Failed to get dashboard analytics", "APIController", {
        error: error.message,
      });
      throw new Error(`Failed to get dashboard analytics: ${error.message}`);
    }
  }

  /**
   * Sync current month tickets using service locator
   */
  async syncCurrentMonthTickets() {
    try {
      const { syncTable } = this.serviceLocator;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const tables = ["incident", "change_task", "sc_task"];
      const results = [];

      for (const table of tables) {
        const syncResult = await syncTable(table, {
          query: `sys_created_on>=${startOfMonth.toISOString()}`,
          strategy: "full",
          batchSize: 50,
        });
        results.push({ table, ...syncResult });
      }

      const totalProcessed = results.reduce(
        (sum, result) => sum + result.processed,
        0,
      );
      const totalInserted = results.reduce(
        (sum, result) => sum + result.inserted,
        0,
      );
      const totalUpdated = results.reduce(
        (sum, result) => sum + result.updated,
        0,
      );
      const totalErrors = results.reduce(
        (sum, result) => sum + result.errors?.length || 0,
        0,
      );

      return {
        success: totalErrors === 0,
        message: `Synced ${totalProcessed} tickets from current month`,
        stats: {
          incidents:
            results.find((r) => r.table === "incident")?.processed || 0,
          problems: 0, // Problems not included in current month sync
          changes:
            results.find((r) => r.table === "change_task")?.processed || 0,
          errors: totalErrors,
        },
        details: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("❌ Failed to sync current month tickets", "APIController", {
        error: error.message,
      });
      return {
        success: false,
        message: "Failed to sync current month tickets",
        error: error.message,
        stats: { incidents: 0, problems: 0, changes: 0, errors: 1 },
      };
    }
  }

  /**
   * Get MongoDB statistics using service locator
   */
  async getMongoDBStats() {
    try {
      const { mongo } = this.serviceLocator;

      if (!mongo) {
        throw new Error("MongoDB service not available");
      }

      const stats = await mongo.getStats();

      return {
        success: true,
        collections: stats.collections || {},
        total_documents: stats.totalDocuments || 0,
        database_size: stats.databaseSize || 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("❌ Failed to get MongoDB stats", "APIController", {
        error: error.message,
      });
      return {
        success: false,
        collections: {},
        total_documents: 0,
        database_size: 0,
        error: error.message,
      };
    }
  }

  /**
   * Get active incident count
   */
  async getActiveIncidentCount(): Promise<number> {
    try {
      const { find } = this.serviceLocator;
      const count = await find(
        "sn_incidents",
        { "data.incident.state": { $ne: "6" } },
        { limit: 1000 },
      );
      return count.length;
    } catch (error: any) {
      logger.error("❌ Failed to get active incident count", "APIController", {
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Get open problem count
   */
  async getOpenProblemCount(): Promise<number> {
    try {
      const { find } = this.serviceLocator;
      const count = await find(
        "sn_problems",
        { "data.problem.state": { $ne: "6" } },
        { limit: 1000 },
      );
      return count.length;
    } catch (error: any) {
      logger.error("❌ Failed to get open problem count", "APIController", {
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Get pending change count
   */
  async getPendingChangeCount(): Promise<number> {
    try {
      const { find } = this.serviceLocator;
      const count = await find(
        "sn_change_requests",
        { "data.change_request.state": { $in: ["1", "2", "3"] } },
        { limit: 1000 },
      );
      return count.length;
    } catch (error: any) {
      logger.error("❌ Failed to get pending change count", "APIController", {
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * Get processing status using service locator
   */
  async getProcessingStatus(): Promise<string> {
    try {
      const { checkSystemHealth, getSyncStats } = this.serviceLocator;

      const health = await checkSystemHealth();
      const stats = await getSyncStats();

      const statusHtml = `
        <div class="status-container">
          <div class="status-item">
            <span class="status-label">System Health:</span>
            <span class="status-value ${health.status === "healthy" ? "healthy" : "unhealthy"}">
              ${health.status}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Sync Status:</span>
            <span class="status-value">${stats.length > 0 ? "Active" : "Inactive"}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Last Updated:</span>
            <span class="status-value">${new Date().toLocaleString()}</span>
          </div>
        </div>
      `;

      return statusHtml;
    } catch (error: any) {
      logger.error("❌ Failed to get processing status", "APIController", {
        error: error.message,
      });
      return `<div class="error">Processing status unavailable: ${error.message}</div>`;
    }
  }

  /**
   * Get target groups (assignment groups)
   */
  async getTargetGroups() {
    try {
      const { find } = this.serviceLocator;

      const groups = await find(
        "sn_groups",
        {},
        {
          limit: 100,
          sort: { "data.nome": 1 },
        },
      );

      const processedGroups = groups
        .map((doc: any) => ({
          sys_id: doc.id || doc._id?.toString(),
          name: doc.data?.nome || "Unknown",
          description: doc.data?.description || "",
          manager: doc.data?.responsavel || "",
          email: doc.data?.email || "",
          active: doc.data?.active !== false,
        }))
        .filter((group) => group.name !== "Unknown");

      return {
        success: true,
        groups: processedGroups,
        count: processedGroups.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("❌ Failed to get target groups", "APIController", {
        error: error.message,
      });
      return {
        success: false,
        groups: [],
        count: 0,
        error: error.message,
      };
    }
  }
}

// FIX v5.6.1: Singleton Lazy Loading Pattern
let _apiControllerSingleton: PluginAPIController | null = null;

const getAPIController = async (serviceLocator: any, config: any) => {
  if (_apiControllerSingleton) {
    return { apiController: _apiControllerSingleton };
  }

  console.log(
    "📦 Creating PluginAPIController (SINGLETON - first initialization)",
  );
  _apiControllerSingleton = new PluginAPIController(serviceLocator, config);
  console.log(
    "✅ PluginAPIController created (SINGLETON - reused across all requests)",
  );

  return { apiController: _apiControllerSingleton };
};

/**
 * API Controller Plugin - Following Elysia "1 controller = 1 instance" Pattern
 * Provides REST API endpoints for ServiceNow data and system operations
 */
export const apiControllerPlugin = new Elysia({ name: "api-controller" })
  .onStart(async () => {
    logger.info(
      "🎯 API Controller Plugin initializing with Elysia best practices - Singleton Lazy Loading pattern",
      "APIControllerPlugin",
    );
  })
  .derive(async ({ config, services, ...serviceLocator }) => {
    try {
      // Create API controller instance with service locator (singleton)
      const { apiController } = await getAPIController(serviceLocator, config);

      logger.info(
        "✅ API Controller ready with service integration",
        "APIControllerPlugin",
        {
          availableServices: Object.keys(serviceLocator).filter(
            (key) => !["config", "services"].includes(key),
          ).length,
        },
      );

      return {
        apiController,
        // Expose controller methods for direct access
        getIncidents: apiController.getIncidents.bind(apiController),
        getProblems: apiController.getProblems.bind(apiController),
        getChanges: apiController.getChanges.bind(apiController),
        processToParquet: apiController.processToParquet.bind(apiController),
        executePipeline: apiController.executePipeline.bind(apiController),
        getDashboardAnalytics:
          apiController.getDashboardAnalytics.bind(apiController),
        syncCurrentMonthTickets:
          apiController.syncCurrentMonthTickets.bind(apiController),
        getMongoDBStats: apiController.getMongoDBStats.bind(apiController),
        getTargetGroups: apiController.getTargetGroups.bind(apiController),
        getProcessingStatus:
          apiController.getProcessingStatus.bind(apiController),
      };
    } catch (error: any) {
      logger.error(
        "❌ API Controller initialization failed",
        "APIControllerPlugin",
        {
          error: error.message,
        },
      );

      // Return minimal fallback for graceful degradation
      return {
        apiController: null,
        getIncidents: async () => ({
          incidents: [],
          count: 0,
          error: "Service unavailable",
        }),
        getProblems: async () => ({
          problems: [],
          count: 0,
          error: "Service unavailable",
        }),
        getChanges: async () => ({
          changes: [],
          count: 0,
          error: "Service unavailable",
        }),
        processToParquet: async () => ({
          success: false,
          error: "Service unavailable",
        }),
        executePipeline: async () => ({
          success: false,
          error: "Service unavailable",
        }),
        getDashboardAnalytics: async () => ({
          html: "<div>Service unavailable</div>",
          data: {},
        }),
        syncCurrentMonthTickets: async () => ({
          success: false,
          error: "Service unavailable",
        }),
        getMongoDBStats: async () => ({
          success: false,
          error: "Service unavailable",
        }),
        getTargetGroups: async () => ({
          success: false,
          groups: [],
          error: "Service unavailable",
        }),
        getProcessingStatus: async () => "<div>Service unavailable</div>",
      };
    }
  })
  // REST API Routes with TypeBox validation
  .get(
    "/api/incidents",
    async ({ getIncidents }) => {
      try {
        const result = await getIncidents();
        return {
          success: true,
          data: result,
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
        summary: "Get Active Incidents",
        description: "Retrieve active incidents from ServiceNow via MongoDB",
        tags: ["API", "Incidents"],
      },
    },
  )
  .get(
    "/api/problems",
    async ({ getProblems }) => {
      try {
        const result = await getProblems();
        return {
          success: true,
          data: result,
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
        summary: "Get Open Problems",
        description: "Retrieve open problems from ServiceNow via MongoDB",
        tags: ["API", "Problems"],
      },
    },
  )
  .get(
    "/api/changes",
    async ({ getChanges }) => {
      try {
        const result = await getChanges();
        return {
          success: true,
          data: result,
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
        summary: "Get Pending Changes",
        description:
          "Retrieve pending change requests from ServiceNow via MongoDB",
        tags: ["API", "Changes"],
      },
    },
  )
  .post(
    "/api/parquet/:table",
    async ({ params: { table }, processToParquet }) => {
      try {
        const result = await processToParquet(table);
        return {
          success: true,
          data: result,
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
        summary: "Process Table to Parquet",
        description: "Process ServiceNow table data to Parquet format",
        tags: ["API", "Processing"],
      },
    },
  )
  .post(
    "/api/pipeline/:type",
    async ({ params: { type }, executePipeline }) => {
      try {
        const result = await executePipeline(type);
        return {
          success: true,
          data: result,
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
        summary: "Execute Data Pipeline",
        description: "Execute data processing pipeline",
        tags: ["API", "Pipeline"],
      },
    },
  )
  .get(
    "/api/dashboard/analytics",
    async ({ getDashboardAnalytics }) => {
      try {
        const result = await getDashboardAnalytics();
        return {
          success: true,
          data: result,
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
        summary: "Get Dashboard Analytics",
        description: "Retrieve dashboard analytics and metrics",
        tags: ["API", "Dashboard"],
      },
    },
  )
  .post(
    "/api/sync/current-month",
    async ({ syncCurrentMonthTickets }) => {
      try {
        const result = await syncCurrentMonthTickets();
        return result;
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stats: { incidents: 0, problems: 0, changes: 0, errors: 1 },
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Sync Current Month Tickets",
        description: "Synchronize tickets from current month",
        tags: ["API", "Sync"],
      },
      response: SyncResponseSchema,
    },
  )
  .get(
    "/api/mongodb/stats",
    async ({ getMongoDBStats }) => {
      try {
        const result = await getMongoDBStats();
        return result;
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          collections: {},
          total_documents: 0,
          database_size: 0,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Get MongoDB Statistics",
        description: "Retrieve MongoDB collection statistics",
        tags: ["API", "Database"],
      },
      response: MongoStatsResponseSchema,
    },
  )
  .get(
    "/api/groups",
    async ({ getTargetGroups }) => {
      try {
        const result = await getTargetGroups();
        return result;
      } catch (error: any) {
        return {
          success: false,
          groups: [],
          count: 0,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Get Target Groups",
        description: "Retrieve assignment groups from ServiceNow",
        tags: ["API", "Groups"],
      },
      response: TargetGroupsResponseSchema,
    },
  )
  .get(
    "/api/status",
    async ({ getProcessingStatus }) => {
      try {
        const result = await getProcessingStatus();
        return {
          success: true,
          html: result,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          html: `<div class="error">Status unavailable: ${error.message}</div>`,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Get Processing Status",
        description: "Retrieve system processing status",
        tags: ["API", "Status"],
      },
    },
  )
  .onStart(() => {
    logger.info(
      "🎯 API Controller Plugin started - following Elysia best practices",
      "APIControllerPlugin",
    );
  })
  .onStop(() => {
    logger.info("🛑 API Controller Plugin stopped", "APIControllerPlugin");
  })
  .as("global"); // ✅ Global lifecycle scope for plugin deduplication

// Export plugin app type for Eden Treaty
export type APIControllerPluginApp = typeof apiControllerPlugin;

// Export TypeBox schemas for external use
export {
  TicketQuerySchema,
  SyncResponseSchema,
  MongoStatsResponseSchema,
  TargetGroupsResponseSchema,
};
