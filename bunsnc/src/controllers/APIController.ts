/**
 * API Controller - REST endpoints and data processing methods
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowClient } from "../client/ServiceNowClient";
import { ticketService } from "../services";
import { WebServerConfig } from "./WebServerController";

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
    } catch (error) {
      throw new Error(`Failed to fetch incidents: ${error.message}`);
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
    } catch (error) {
      throw new Error(`Failed to fetch problems: ${error.message}`);
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
    } catch (error) {
      throw new Error(`Failed to fetch changes: ${error.message}`);
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
    } catch (error) {
      throw new Error(
        `Failed to process ${tableName} to Parquet: ${error.message}`,
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
    } catch (error) {
      throw new Error(`Failed to execute pipeline: ${error.message}`);
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
    } catch (error) {
      return `<div class="text-red-600">Error loading analytics: ${error.message}</div>`;
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
    } catch (error) {
      console.error(" Error during MongoDB sync:", error);
      return {
        success: false,
        message: `Error during sync: ${error.message}`,
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

      const tickets = await this.ticketIntegrationService.getTicketsFromMongoDB(
        ticketType as "incident" | "change_task" | "sc_task",
        filter,
        limit,
      );

      const count =
        await this.ticketIntegrationService.getTicketCountFromMongoDB(
          ticketType as "incident" | "change_task" | "sc_task",
          filter,
        );

      return {
        success: true,
        tickets,
        count,
        ticketType,
        filter,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(` Error getting ${ticketType} from MongoDB:`, error);
      return {
        success: false,
        message: `Error getting ${ticketType}: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async getMongoDBStats(): Promise<MongoStatsResponse> {
    try {
      const stats = await this.ticketIntegrationService.getCollectionStats();
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(" Error getting MongoDB stats:", error);
      return {
        success: false,
        message: `Error getting stats: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async getTargetGroups(): Promise<TargetGroupsResponse> {
    try {
      const groups = await this.ticketIntegrationService.getTargetGroups();
      return {
        success: true,
        groups,
        count: groups.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(" Error getting target groups:", error);
      return {
        success: false,
        message: `Error getting groups: ${error.message}`,
        timestamp: new Date().toISOString(),
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
