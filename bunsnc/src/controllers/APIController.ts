/**
 * API Controller - REST endpoints and data processing methods
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowClient } from "../client/ServiceNowClient";
import { ticketService } from "../services";
import { WebServerConfig } from "./WebServerController";
import { serviceNowBridgeService } from "../services/ServiceNowBridgeService";

// Response interfaces
interface SyncResponse {
  success: boolean;
  message: string;
  stats?: {
    incidents: number;
    problems: number;
    changes: number;
    errors: number;
  };
  error?: string;
}

interface MongoStatsResponse {
  success: boolean;
  collections: {
    [collectionName: string]: {
      count: number;
      size: number;
      indexes: number;
    };
  };
  total_documents: number;
  database_size: number;
  error?: string;
}

interface TargetGroupsResponse {
  success: boolean;
  groups: Array<{
    sys_id: string;
    name: string;
    description?: string;
    manager?: string;
    email?: string;
    active: boolean;
  }>;
  count: number;
  error?: string;
}

interface TicketQueryOptions {
  limit?: number;
  offset?: number;
  sort?: string;
  fields?: string[];
  filters?: Record<string, unknown>;
}

export class APIController {
  private serviceNowClient: ServiceNowClient;
  private ticketIntegrationService: typeof ticketService;
  private config: WebServerConfig;

  constructor(serviceNowClient: ServiceNowClient, config: WebServerConfig) {
    this.serviceNowClient = serviceNowClient;
    this.ticketIntegrationService = ticketService;
    this.config = config;
  }

  public async getIncidents() {
    try {
      const gr = this.serviceNowClient.getGlideRecord("incident");
      gr.addQuery("state", "!=", "6");
      gr.query();

      const incidents = [];
      while (gr.next()) {
        incidents.push({
          sys_id: gr.getValue("sys_id"),
          number: gr.getValue("number"),
          short_description: gr.getValue("short_description"),
          priority: gr.getValue("priority"),
          state: gr.getValue("state"),
          sys_created_on: gr.getValue("sys_created_on"),
        });
      }

      return { incidents, count: incidents.length };
    } catch (error: unknown) {
      throw new Error(`Failed to fetch incidents: ${(error as Error).message}`);
    }
  }

  public async getProblems() {
    try {
      const gr = this.serviceNowClient.getGlideRecord("problem");
      gr.addQuery("state", "!=", "6");
      gr.query();

      const problems = [];
      while (gr.next()) {
        problems.push({
          sys_id: gr.getValue("sys_id"),
          number: gr.getValue("number"),
          short_description: gr.getValue("short_description"),
          priority: gr.getValue("priority"),
          state: gr.getValue("state"),
          sys_created_on: gr.getValue("sys_created_on"),
        });
      }

      return { problems, count: problems.length };
    } catch (error: unknown) {
      throw new Error(`Failed to fetch problems: ${(error as Error).message}`);
    }
  }

  public async getChanges() {
    try {
      const gr = this.serviceNowClient.getGlideRecord("change_request");
      gr.addQuery("state", "IN", "1,2,3");
      gr.query();

      const changes = [];
      while (gr.next()) {
        changes.push({
          sys_id: gr.getValue("sys_id"),
          number: gr.getValue("number"),
          short_description: gr.getValue("short_description"),
          priority: gr.getValue("priority"),
          state: gr.getValue("state"),
          sys_created_on: gr.getValue("sys_created_on"),
        });
      }

      return { changes, count: changes.length };
    } catch (error: unknown) {
      throw new Error(`Failed to fetch changes: ${(error as Error).message}`);
    }
  }

  public async processToParquet(tableName: string) {
    try {
      const gr = this.serviceNowClient.getGlideRecord(tableName);
      gr.query();

      const outputPath = `${this.config.parquet.outputPath}/${tableName}_${Date.now()}.parquet`;

      return {
        success: true,
        message: `Processing ${tableName} to Parquet format - functionality temporarily disabled`,
        outputPath,
      };
    } catch (error: unknown) {
      throw new Error(
        `Failed to process ${tableName} to Parquet: ${(error as Error).message}`,
      );
    }
  }

  public async executePipeline(pipelineType: string) {
    try {
      return {
        success: true,
        message: `Pipeline ${pipelineType} execution - functionality temporarily disabled`,
        pipelineId: `pipeline_${pipelineType}_${Date.now()}`,
        executionId: `exec_${Date.now()}`,
      };
    } catch (error: unknown) {
      throw new Error(
        `Failed to execute pipeline: ${(error as Error).message}`,
      );
    }
  }

  public async getDashboardAnalytics() {
    try {
      const [incidents, problems, changes] = await Promise.all([
        this.getActiveIncidentCount(),
        this.getOpenProblemCount(),
        this.getPendingChangeCount(),
      ]);

      return `
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
        <div class="mt-8">
          <h4 class="text-lg font-semibold text-gray-700 mb-4">Processing Statistics</h4>
          <div class="bg-gray-50 rounded-md p-4">
            <div class="flex justify-between items-center mb-2">
              <span class="text-gray-600">Records Processed Today:</span>
              <span class="font-semibold">12,458</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-gray-600">Parquet Files Generated:</span>
              <span class="font-semibold">34</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-600">Storage Used:</span>
              <span class="font-semibold">2.3 GB</span>
            </div>
          </div>
        </div>
      `;
    } catch (error: unknown) {
      return `<div class="text-red-600">Error loading analytics: ${(error as Error).message}</div>`;
    }
  }

  public async syncCurrentMonthTickets(): Promise<SyncResponse> {
    try {
      console.log(" Starting sync of current month tickets to MongoDB...");
      const result =
        await this.ticketIntegrationService.syncCurrentMonthTickets();

      if (result.success) {
        console.log(" MongoDB sync completed successfully:", result.stats);
        return {
          success: true,
          message: "Current month tickets synced successfully",
          stats: result.stats,
          timestamp: new Date().toISOString(),
        };
      } else {
        console.error(" MongoDB sync failed");
        return {
          success: false,
          message: "Failed to sync tickets to MongoDB",
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error: unknown) {
      console.error(" Error during MongoDB sync:", error);
      return {
        success: false,
        message: `Error during sync: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async getTicketsFromMongoDB(
    ticketType: string,
    query: TicketQueryOptions = {},
  ): Promise<Record<string, unknown>[]> {
    try {
      if (!["incident", "change_task", "sc_task"].includes(ticketType)) {
        throw new Error(
          `Invalid ticket type: ${ticketType}. Must be incident, change_task, or sc_task`,
        );
      }

      const filter = {};
      if (query.state) filter.state = query.state;
      if (query.group) filter.assignment_group = query.group;

      const limit = parseInt(query.limit) || 50;

      // Import MongoDB directly
      const { MongoClient } = await import("mongodb");
      const mongoUrl =
        process.env.MONGODB_URL ||
        "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
      const mongoClient = new MongoClient(mongoUrl);

      try {
        await mongoClient.connect();
        const db = mongoClient.db("bunsnc");

        // Map ticket types to collection names (correct collections with data)
        const collectionMap = {
          incident: "incidents_complete",
          change_task: "change_tasks_complete",
          sc_task: "sc_tasks_complete",
        };

        const collectionName = collectionMap[ticketType];
        if (!collectionName) {
          throw new Error(`No collection found for ticket type: ${ticketType}`);
        }

        const collection = db.collection(collectionName);

        // Build MongoDB filter using correct raw_data structure
        const mongoFilter = {};
        if (query.state) {
          // Use raw_data.state.value as documented
          mongoFilter["raw_data.state.value"] = query.state.toString();
        }
        if (query.group) {
          // Use raw_data.assignment_group.display_value as documented
          mongoFilter["raw_data.assignment_group.display_value"] = {
            $regex: query.group,
            $options: "i",
          };
        }

        const tickets = await collection
          .find(mongoFilter)
          .limit(limit)
          .toArray();
        const count = await collection.countDocuments(mongoFilter);

        console.log(
          `✅ Retrieved ${tickets.length} ${ticketType} tickets from MongoDB`,
        );

        return {
          success: true,
          tickets: tickets.map((ticket) => ({
            ...ticket.raw_data, // Use raw_data as documented
            _id: ticket._id,
            sys_id: ticket.sys_id,
            number: ticket.number,
            collection_type: ticketType,
            // Include metadata for debugging
            metadata: ticket.metadata,
          })),
          ticketType,
          filter,
          timestamp: new Date().toISOString(),
        };
      } finally {
        await mongoClient.close();
      }
    } catch (error: unknown) {
      console.error(` Error getting ${ticketType} from MongoDB:`, error);
      return {
        success: false,
        message: `Error getting ${ticketType}: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get tickets directly from ServiceNow using Bridge Service
   */
  public async getTicketsFromServiceNow(
    ticketType: string,
    query: TicketQueryOptions = {},
  ): Promise<Record<string, unknown>> {
    try {
      if (!["incident", "sc_task", "change_task"].includes(ticketType)) {
        throw new Error(
          `Invalid ticket type: ${ticketType}. Must be incident, sc_task, or change_task`,
        );
      }

      // Build ServiceNow query
      let serviceNowQuery = "";
      const queryParts = [];

      if (query.state) {
        queryParts.push(`state=${query.state}`);
      }

      if (query.group) {
        queryParts.push(`assignment_group.name CONTAINS ${query.group}`);
      }

      serviceNowQuery = queryParts.join("^");

      const limit = parseInt(query.limit as string) || 50;

      console.log(
        `🔍 API Controller: Fetching ${ticketType} from ServiceNow via Bridge Service with query: ${serviceNowQuery || "(no filter)"}`,
      );

      // Build query parameters for Bridge Service
      const queryParams: Record<string, any> = {
        sysparm_limit: limit,
        sysparm_display_value: "all",
        sysparm_exclude_reference_link: "true",
      };

      if (serviceNowQuery) {
        queryParams.sysparm_query = serviceNowQuery;
      }

      // Fetch via Bridge Service
      const bridgeResponse = await serviceNowBridgeService.queryTable(
        ticketType,
        queryParams,
      );

      if (!bridgeResponse.success) {
        throw new Error(bridgeResponse.error || "Bridge Service query failed");
      }

      return {
        success: true,
        tickets: bridgeResponse.result || [],
        count: bridgeResponse.result?.length || 0,
        ticketType,
        query: serviceNowQuery,
        source: "ServiceNow Bridge Service",
        timestamp: new Date().toISOString(),
        duration: bridgeResponse.duration,
      };
    } catch (error: unknown) {
      console.error(
        `❌ API Controller: Error getting ${ticketType} from ServiceNow:`,
        error,
      );
      return {
        success: false,
        message: `Error getting ${ticketType}: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async getMongoDBStats(): Promise<MongoStatsResponse> {
    try {
      // Import MongoDB directly
      const { MongoClient } = await import("mongodb");
      const mongoUrl =
        process.env.MONGODB_URL ||
        "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
      const mongoClient = new MongoClient(mongoUrl);

      try {
        await mongoClient.connect();
        const db = mongoClient.db("bunsnc");

        // Get stats for correct collections with data
        const [incidentsStats, changeTasksStats, scTasksStats] =
          await Promise.all([
            db.collection("incidents_complete").stats(),
            db.collection("change_tasks_complete").stats(),
            db.collection("sc_tasks_complete").stats(),
          ]);

        const [incidentsCount, changeTasksCount, scTasksCount] =
          await Promise.all([
            db.collection("incidents_complete").countDocuments(),
            db.collection("change_tasks_complete").countDocuments(),
            db.collection("sc_tasks_complete").countDocuments(),
          ]);

        const collections = {
          incidents_complete: {
            count: incidentsCount,
            size: incidentsStats.size || 0,
            indexes: incidentsStats.nindexes || 0,
          },
          change_tasks_complete: {
            count: changeTasksCount,
            size: changeTasksStats.size || 0,
            indexes: changeTasksStats.nindexes || 0,
          },
          sc_tasks_complete: {
            count: scTasksCount,
            size: scTasksStats.size || 0,
            indexes: scTasksStats.nindexes || 0,
          },
        };

        const totalDocuments = incidentsCount + changeTasksCount + scTasksCount;
        const databaseSize =
          (incidentsStats.size || 0) +
          (changeTasksStats.size || 0) +
          (scTasksStats.size || 0);

        console.log(
          `✅ MongoDB stats retrieved: ${totalDocuments} total documents`,
        );

        return {
          success: true,
          collections,
          total_documents: totalDocuments,
          database_size: databaseSize,
        };
      } finally {
        await mongoClient.close();
      }
    } catch (error: unknown) {
      console.error(" Error getting MongoDB stats:", error);
      return {
        success: false,
        collections: {},
        total_documents: 0,
        database_size: 0,
        error: `Error getting stats: ${(error as Error).message}`,
      };
    }
  }

  public async getTargetGroups(): Promise<TargetGroupsResponse> {
    try {
      // Import MongoDB directly
      const { MongoClient } = await import("mongodb");
      const mongoUrl =
        process.env.MONGODB_URL ||
        "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
      const mongoClient = new MongoClient(mongoUrl);

      try {
        await mongoClient.connect();
        const db = mongoClient.db("bunsnc");

        // Get groups from sn_groups collection (as used in simple-discovery.ts)
        const groupsData = await db.collection("sn_groups").find({}).toArray();

        const groups = groupsData.map((group: any) => ({
          sys_id: group.sys_id || group._id,
          name:
            group.data?.nome || group.name || group.display_value || "Unknown",
          description: group.data?.descricao || group.description || "",
          manager: group.manager || "",
          email: group.email || "",
          active: group.active !== false,
        }));

        console.log(`✅ Retrieved ${groups.length} target groups from MongoDB`);

        return {
          success: true,
          groups,
          count: groups.length,
        };
      } finally {
        await mongoClient.close();
      }
    } catch (error: unknown) {
      console.error(" Error getting target groups:", error);
      return {
        success: false,
        groups: [],
        count: 0,
        error: `Error getting groups: ${(error as Error).message}`,
      };
    }
  }

  public getStatusConfig(ticketType: string, state: string) {
    const statusMappings = {
      incident: {
        "1": { label: "Novo", color: "text-blue-700", bgColor: "bg-blue-100" },
        "2": {
          label: "Em Andamento",
          color: "text-yellow-700",
          bgColor: "bg-yellow-100",
        },
        "18": {
          label: "Designado",
          color: "text-indigo-700",
          bgColor: "bg-indigo-100",
        },
        "3": {
          label: "Em Espera",
          color: "text-gray-700",
          bgColor: "bg-gray-100",
        },
        "6": {
          label: "Resolvido",
          color: "text-green-700",
          bgColor: "bg-green-100",
        },
        "7": {
          label: "Fechado",
          color: "text-green-800",
          bgColor: "bg-green-200",
        },
        "8": {
          label: "Cancelado",
          color: "text-red-700",
          bgColor: "bg-red-100",
        },
      },
    };

    return (
      statusMappings[ticketType]?.[state] || {
        label: `Status ${state}`,
        color: "text-gray-600",
        bgColor: "bg-gray-100",
      }
    );
  }

  // Helper methods for counts
  public async getActiveIncidentCount(): Promise<number> {
    const gr = this.serviceNowClient.getGlideRecord("incident");
    gr.addQuery("state", "!=", "6");
    gr.query();
    let count = 0;
    while (gr.next()) count++;
    return count;
  }

  public async getOpenProblemCount(): Promise<number> {
    const gr = this.serviceNowClient.getGlideRecord("problem");
    gr.addQuery("state", "!=", "6");
    gr.query();
    let count = 0;
    while (gr.next()) count++;
    return count;
  }

  public async getPendingChangeCount(): Promise<number> {
    const gr = this.serviceNowClient.getGlideRecord("change_request");
    gr.addQuery("state", "IN", "1,2,3");
    gr.query();
    let count = 0;
    while (gr.next()) count++;
    return count;
  }

  public async getProcessingStatus(): Promise<string> {
    return "Idle";
  }
}
