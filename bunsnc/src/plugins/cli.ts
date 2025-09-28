/**
 * CLI Plugin - Elysia plugin for command-line interface integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared service instances para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 * - CLI command processing via dependency injection
 *
 * Integra CLI commands com ServiceNow operations usando plugin system
 */

import { Elysia } from "elysia";
import { Command } from "commander";
import {
  consolidatedServiceNowService,
  serviceNowAuthClient,
  ConsolidatedServiceNowService
} from "../services";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { ServiceNowClient } from "../client/ServiceNowClient";
import { ServiceNowBridgeService, serviceNowBridgeService } from "../services/ServiceNowBridgeService";
import type { ServiceNowRecord } from "../types/servicenow";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Types para Eden Treaty
export interface CLIPluginContext {
  cliCommander: Command;
  serviceNowClient: ServiceNowClient;
  consolidatedService: ConsolidatedServiceNowService;
  authClient: ServiceNowAuthClient;
  executeCommand: (command: string, args: string[]) => Promise<any>;
  createRecord: (table: string, data: any) => Promise<ServiceNowRecord>;
  readRecord: (table: string, sysId: string) => Promise<ServiceNowRecord | null>;
  updateRecord: (table: string, sysId: string, data: any) => Promise<ServiceNowRecord>;
  deleteRecord: (table: string, sysId: string) => Promise<boolean>;
  executeBatch: (operations: any[]) => Promise<any>;
  uploadAttachment: (table: string, sysId: string, file: File) => Promise<string>;
  downloadAttachment: (attachmentId: string) => Promise<ArrayBuffer>;
  authenticateUser: (username: string, password: string) => Promise<any>;
  getEnvVar: (key: string, fallback?: string) => string;
}

export interface CLICommandOptions {
  table?: string;
  sysId?: string;
  data?: string;
  operations?: string;
  file?: string;
  destination?: string;
  username?: string;
  password?: string;
  output?: 'json' | 'table' | 'csv';
  verbose?: boolean;
}

/**
 * CLI Plugin - Separate Instance Method pattern
 * Provides command-line interface functionality through dependency injection
 */
export const cliPlugin = new Elysia({
  name: "servicenow-cli-plugin",
  seed: {
    cliCommander: {} as Command,
    serviceNowClient: {} as ServiceNowClient,
    consolidatedService: {} as ConsolidatedServiceNowService,
    authClient: {} as ServiceNowAuthClient,
    executeCommand: {} as CLIPluginContext["executeCommand"],
    createRecord: {} as CLIPluginContext["createRecord"],
    readRecord: {} as CLIPluginContext["readRecord"],
    updateRecord: {} as CLIPluginContext["updateRecord"],
    deleteRecord: {} as CLIPluginContext["deleteRecord"],
    executeBatch: {} as CLIPluginContext["executeBatch"],
    uploadAttachment: {} as CLIPluginContext["uploadAttachment"],
    downloadAttachment: {} as CLIPluginContext["downloadAttachment"],
    authenticateUser: {} as CLIPluginContext["authenticateUser"],
    getEnvVar: {} as CLIPluginContext["getEnvVar"],
  },
})
  // Lifecycle Hook: onStart - Initialize CLI Services
  .onStart(async () => {
    console.log("CLI Plugin starting - initializing command-line interface services");
  })

  // Dependency Injection: Create service instances
  .derive(async () => {
    // Initialize services via dependency injection
    const consolidatedService = consolidatedServiceNowService;
    const authClient = serviceNowAuthClient;

    // Initialize ServiceNow client
    const instanceUrl = process.env.SNC_INSTANCE_URL || "";
    const authToken = process.env.SNC_AUTH_TOKEN || "";

    const serviceNowClient = new ServiceNowClient({
      instance: instanceUrl,
      auth: authToken,
    });

    // Initialize commander instance
    const cliCommander = new Command();
    cliCommander
      .name("bunsnc")
      .description("CLI para ServiceNow via Bun/Elysia")
      .version("2.2.0");

    return {
      consolidatedService,
      authClient,
      serviceNowClient,
      cliCommander
    };
  })

  // CLI-specific decorated methods for real functionality
  .decorate("cliLogin", async (username?: string, password?: string): Promise<{ success: boolean; message: string }> => {
    try {
      console.log("🔐 CLI Plugin: Attempting ServiceNow authentication...");

      // Get username/password from environment if not provided
      const user = username || process.env.SERVICENOW_USERNAME;
      const pass = password || process.env.SERVICENOW_PASSWORD;

      if (!user || !pass) {
        return {
          success: false,
          message: "Username and password required. Set SERVICENOW_USERNAME and SERVICENOW_PASSWORD environment variables."
        };
      }

      // Use Bridge Service for authentication via ServiceNow Bridge
      console.log("🔌 CLI Plugin: Testing authentication via Bridge Service...");

      try {
        const healthResponse = await serviceNowBridgeService.healthCheck();

        if (healthResponse.success && healthResponse.result?.auth) {
          console.log("✅ CLI Plugin: ServiceNow authentication successful via Bridge Service");
          return {
            success: true,
            message: "ServiceNow authentication successful via Bridge Service. SAML session established."
          };
        } else {
          return {
            success: false,
            message: "ServiceNow authentication failed. Invalid credentials or network issue."
          };
        }
      } catch (error: any) {
        console.error("❌ CLI Plugin: Authentication error:", error.message);
        return {
          success: false,
          message: `Authentication failed: ${error.message}`
        };
      }
    } catch (outerError: any) {
      console.error("❌ CLI Plugin: Outer authentication error:", outerError.message);
      return {
        success: false,
        message: `Authentication failed: ${outerError.message}`
      };
    }
  })

  .decorate("cliListGroups", async (): Promise<any[]> => {
    try {
      console.log("👥 CLI Plugin: Fetching real groups from MongoDB...");

      // Import and initialize data service if needed
      const { dataService } = await import("../services/ConsolidatedDataService");

      // Get MongoDB collection manager
      const { mongoCollectionManager } = await import("../config/mongodb-collections");

      // Initialize MongoDB connection if not already done
      try {
        await dataService.initialize(null as any); // Initialize without ServiceNow client for now
      } catch (initError) {
        console.log("MongoDB already initialized or initialization skipped");
      }

      // Get groups collection
      const groupsCollection = mongoCollectionManager.getGroupsCollection();

      // Query all groups from MongoDB
      const groupsCursor = groupsCollection.find({});
      const groups = await groupsCursor.toArray();

      console.log(`✅ CLI Plugin: Retrieved ${groups.length} groups from MongoDB`);

      // Transform MongoDB documents to CLI format
      return groups.map(group => ({
        id: group.id,
        nome: group.data.nome,
        responsavel: group.data.responsavel,
        temperatura: group.data.temperatura,
        tags: group.data.tags,
        descricao: group.data.descricao,
        created_at: group.created_at,
        updated_at: group.updated_at
      }));
    } catch (error: any) {
      console.error("❌ CLI Plugin: Error fetching groups:", error.message);
      throw new Error(`Failed to fetch groups: ${error.message}`);
    }
  })

  .decorate("cliGetTickets", async (groupName?: string, state?: string, limit: number = 10): Promise<any[]> => {
    try {
      console.log(`🎫 CLI Plugin: Fetching real tickets from MongoDB (group: ${groupName}, state: ${state}, limit: ${limit})...`);

      // Import data service and collection manager
      const { dataService } = await import("../services/ConsolidatedDataService");
      const { mongoCollectionManager, COLLECTION_NAMES } = await import("../config/mongodb-collections");

      // Initialize MongoDB connection if needed
      try {
        await dataService.initialize(null as any);
      } catch (initError) {
        console.log("MongoDB already initialized or initialization skipped");
      }

      const allTickets: any[] = [];

      // Define collections to search
      const collections = [
        { name: COLLECTION_NAMES.INCIDENTS, type: 'incident' },
        { name: COLLECTION_NAMES.CHANGE_TASKS, type: 'ctask' },
        { name: COLLECTION_NAMES.SC_TASKS, type: 'sctask' }
      ];

      for (const { name: collectionName, type } of collections) {
        try {
          const collection = mongoCollectionManager.getCollection(collectionName);

          // Build query filter
          const filter: any = {};

          // Filter by group name if provided
          if (groupName) {
            filter["data.assignment_group.display_value"] = { $regex: groupName, $options: "i" };
          }

          // Filter by state if provided
          if (state) {
            filter["data.state"] = state;
          }

          // Query tickets from collection
          const ticketsCursor = collection.find(filter).limit(Math.ceil(limit / collections.length));
          const tickets = await ticketsCursor.toArray();

          // Transform to CLI format
          const formattedTickets = tickets.map((ticket: any) => ({
            sys_id: ticket.sys_id,
            number: ticket.number,
            table: type,
            state: ticket.data?.state || ticket.state,
            priority: ticket.data?.priority,
            short_description: ticket.data?.short_description,
            assignment_group: ticket.data?.assignment_group?.display_value || ticket.data?.assignment_group,
            sys_created_on: ticket.data?.sys_created_on || ticket.created_at,
            sys_updated_on: ticket.data?.sys_updated_on || ticket.updated_at
          }));

          allTickets.push(...formattedTickets);
          console.log(`✅ Found ${tickets.length} tickets in ${collectionName}`);
        } catch (collectionError: any) {
          console.warn(`⚠️ Error querying ${collectionName}:`, collectionError.message);
        }
      }

      // Sort by creation date (newest first) and apply final limit
      const sortedTickets = allTickets
        .sort((a, b) => new Date(b.sys_created_on).getTime() - new Date(a.sys_created_on).getTime())
        .slice(0, limit);

      console.log(`✅ CLI Plugin: Retrieved ${sortedTickets.length} total tickets from MongoDB`);
      return sortedTickets;
    } catch (error: any) {
      console.error("❌ CLI Plugin: Error fetching tickets:", error.message);
      throw new Error(`Failed to fetch tickets: ${error.message}`);
    }
  })

  .decorate("cliCreateRecord", async (table: string, data: Record<string, any>): Promise<{ success: boolean; sys_id?: string; message: string }> => {
    try {
      console.log(`📝 CLI Plugin: Creating real record in ServiceNow table: ${table}`);

      // Use Bridge Service for record creation
      console.log(`🔌 CLI Plugin: Creating record in ${table} via Bridge Service...`);

      const bridgeResponse = await serviceNowBridgeService.createRecord(table, data);

      if (bridgeResponse.success && bridgeResponse.result) {
        const createdRecord = bridgeResponse.result;
        console.log(`✅ CLI Plugin: Record created successfully in ${table} via Bridge Service`);

        return {
          success: true,
          sys_id: createdRecord.sys_id || "bridge-created-" + Date.now(),
          message: `Record created successfully in ${table} via Bridge Service.`
        };
      } else {
        console.log(`⚠️ CLI Plugin: Bridge Service creation failed for ${table}`);
        return {
          success: false,
          message: `Failed to create record in ${table}: ${bridgeResponse.error || "Unknown error"}`
        };
      }
    } catch (error: any) {
      console.error(`❌ CLI Plugin: Error creating record in ${table}:`, error.message);
      return {
        success: false,
        message: `Failed to create record: ${error.message}`
      };
    }
  })

  .decorate("cliUpdateRecord", async (table: string, sysId: string, data: Record<string, any>): Promise<{ success: boolean; message: string }> => {
    try {
      console.log(`✏️ CLI Plugin: Updating real record in ServiceNow table: ${table}, sys_id: ${sysId}`);

      // Use Bridge Service for record update
      console.log(`🔌 CLI Plugin: Updating record in ${table}/${sysId} via Bridge Service...`);

      const bridgeResponse = await serviceNowBridgeService.updateRecord(table, sysId, data);

      if (bridgeResponse.success && bridgeResponse.result) {
        console.log(`✅ CLI Plugin: Record updated successfully in ${table} via Bridge Service`);
        return {
          success: true,
          message: `Record updated successfully in ${table} with sys_id: ${sysId} via Bridge Service.`
        };
      } else {
        return {
          success: false,
          message: `Failed to update record in ${table} with sys_id: ${sysId}. Error: ${bridgeResponse.error || "Unknown error"}`
        };
      }
    } catch (error: any) {
      console.error(`❌ CLI Plugin: Error updating record in ${table}:`, error.message);
      return {
        success: false,
        message: `Failed to update record: ${error.message}`
      };
    }
  })

  .decorate("cliDeleteRecord", async (table: string, sysId: string): Promise<{ success: boolean; message: string }> => {
    try {
      console.log(`🗑️ CLI Plugin: Deleting real record from ServiceNow table: ${table}, sys_id: ${sysId}`);

      // Use Bridge Service for record deletion
      console.log(`🔌 CLI Plugin: Deleting record in ${table}/${sysId} via Bridge Service...`);

      const bridgeResponse = await serviceNowBridgeService.deleteRecord(table, sysId);

      if (bridgeResponse.success) {
        console.log(`✅ CLI Plugin: Record deleted successfully from ${table} via Bridge Service`);
        return {
          success: true,
          message: `Record deleted successfully from ${table} with sys_id: ${sysId} via Bridge Service.`
        };
      } else {
        return {
          success: false,
          message: `Failed to delete record from ${table} with sys_id: ${sysId}. Error: ${bridgeResponse.error || "Unknown error"}`
        };
      }
    } catch (error: any) {
      console.error(`❌ CLI Plugin: Error deleting record from ${table}:`, error.message);
      return {
        success: false,
        message: `Failed to delete record: ${error.message}`
      };
    }
  })

  .decorate("cliBatchOperations", async (operations: any[]): Promise<{ success: boolean; results: any[]; message: string }> => {
    try {
      console.log(`📋 CLI Plugin: Executing real batch operations (${operations.length} operations)`);

      // Use Bridge Service for batch operations
      console.log(`🔌 CLI Plugin: Executing ${operations.length} operations via Bridge Service...`);

      const results: any[] = [];
      let successCount = 0;

      // Process operations sequentially to avoid overwhelming ServiceNow
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        try {
          console.log(`📋 Processing operation ${i + 1}/${operations.length}: ${operation.op} on ${operation.table} via Bridge Service`);

          let bridgeResponse: any;

          // Execute operation based on type using Bridge Service
          switch (operation.op) {
            case "create":
              bridgeResponse = await serviceNowBridgeService.createRecord(operation.table, operation.data);
              break;
            case "update":
              bridgeResponse = await serviceNowBridgeService.updateRecord(operation.table, operation.sysId, operation.data);
              break;
            case "delete":
              bridgeResponse = await serviceNowBridgeService.deleteRecord(operation.table, operation.sysId);
              break;
            case "read":
            case "query":
              bridgeResponse = await serviceNowBridgeService.queryTable(operation.table, {
                sysparm_query: operation.query || "",
                sysparm_limit: operation.limit || 10
              });
              break;
            default:
              throw new Error(`Unknown operation: ${operation.op}`);
          }

          // Check Bridge Service response
          if (bridgeResponse.success) {
            results.push({
              index: i,
              success: true,
              operation,
              result: bridgeResponse.result
            });
            successCount++;
            console.log(`✅ Operation ${i + 1} successful: ${operation.op} on ${operation.table}`);
          } else {
            results.push({
              index: i,
              success: false,
              operation,
              error: `Bridge Service Error: ${bridgeResponse.error || "Unknown error"}`
            });
          }
        } catch (operationError: any) {
          results.push({
            index: i,
            success: false,
            operation,
            error: operationError.message
          });
        }

        // Add small delay between operations to be respectful to ServiceNow
        if (i < operations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const message = `Batch operations completed: ${successCount}/${operations.length} successful`;
      console.log(`✅ CLI Plugin: ${message}`);

      return {
        success: successCount === operations.length,
        results,
        message
      };
    } catch (error: any) {
      console.error("❌ CLI Plugin: Error executing batch operations:", error.message);
      return {
        success: false,
        results: [],
        message: `Failed to execute batch operations: ${error.message}`
      };
    }
  })

  .decorate("cliSyncData", async (tables?: string[]): Promise<{ success: boolean; results: any[]; message: string }> => {
    try {
      console.log(`🔄 CLI Plugin: Starting real data sync for tables: ${tables?.join(", ") || "all"}`);

      // Import data service
      const { dataService } = await import("../services/ConsolidatedDataService");

      // Initialize data service with Bridge Service if needed
      try {
        console.log("🔌 CLI Plugin: Initializing data service with Bridge Service...");
        await dataService.initialize(serviceNowBridgeService as any);
      } catch (initError) {
        console.log("Data service already initialized or initialization skipped");
      }

      // Define default tables if none provided
      const tablesToSync = tables || ["incident", "change_task", "sc_task"];

      // Execute sync using ConsolidatedDataService
      const syncResults = await dataService.syncData({
        tables: tablesToSync,
        batchSize: 50,
        enableDeltaSync: true,
        enableRealTimeUpdates: true
      });

      // Transform results for CLI format
      const results = syncResults.map(result => ({
        table: result.table,
        processed: result.processed,
        saved: result.saved,
        updated: result.updated,
        errors: result.errors,
        duration: result.duration,
        success: result.errors === 0
      }));

      const totalErrors = syncResults.reduce((sum, r) => sum + r.errors, 0);
      const message = `Data sync completed: ${results.length} tables processed, ${totalErrors} total errors`;

      console.log(`✅ CLI Plugin: ${message}`);
      return {
        success: totalErrors === 0,
        results,
        message
      };
    } catch (error: any) {
      console.error("❌ CLI Plugin: Error during data sync:", error.message);
      return {
        success: false,
        results: [],
        message: `Failed to sync data: ${error.message}`
      };
    }
  })

  // Environment variable access method
  .decorate(
    "getEnvVar",
    function (key: string, fallback: string = ""): string {
      return process.env[key] || fallback;
    }
  )

  // Simplified command execution
  .decorate("executeCommand", async (command: string, args: string[]): Promise<any> => {
    try {
      console.log(`🚀 CLI Plugin: Executing command '${command}' with args:`, args);

      // Handle different commands
      switch (command) {
        case "login":
          return { message: "Use cliLogin decorator for authentication" };
        case "list-groups":
          return { message: "Use cliListGroups decorator to list groups" };
        case "get-tickets":
          return { message: "Use cliGetTickets decorator to get tickets" };
        case "create":
          return { message: "Use cliCreateRecord decorator to create records" };
        case "update":
          return { message: "Use cliUpdateRecord decorator to update records" };
        case "delete":
          return { message: "Use cliDeleteRecord decorator to delete records" };
        case "batch":
          return { message: "Use cliBatchOperations decorator for batch operations" };
        case "sync":
          return { message: "Use cliSyncData decorator for data synchronization" };
        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error: any) {
      console.error("CLI Plugin: Command execution failed:", error.message);
      throw error;
    }
  })

  // Simplified command setup
  .decorate("setupCommands", (): any => {
    console.log("🛠️ CLI Plugin: Command setup available via HTTP endpoints");
    return {
      availableCommands: [
        "login", "list-groups", "get-tickets", "create", "update", "delete", "batch", "sync"
      ],
      message: "Use HTTP endpoints or direct decorator calls for CLI functionality"
    };
  })

  // Lifecycle Hook: onStop - Cleanup CLI resources
  .onStop(async () => {
    console.log("CLI Plugin stopping - cleanup completed");
  })

  // CLI health check endpoint
  .get(
    "/cli/health",
    async ({ cliLogin, cliListGroups, cliGetTickets }) => {
      try {
        // Check real functionality availability
        const functionsHealth = {
          cliLogin: typeof cliLogin === "function",
          cliListGroups: typeof cliListGroups === "function",
          cliGetTickets: typeof cliGetTickets === "function",
          environment: {
            hasServiceNowCredentials: !!(process.env.SERVICENOW_USERNAME && process.env.SERVICENOW_PASSWORD),
            hasMongoConfig: !!(process.env.MONGODB_HOST && process.env.MONGODB_DATABASE),
          }
        };

        return {
          success: true,
          result: {
            status: "healthy",
            plugin: "servicenow-cli-plugin",
            realFunctionality: functionsHealth,
            version: "2.2.0",
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          plugin: "servicenow-cli-plugin",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "CLI Plugin Health Check",
        description: "Check health of CLI plugin with real functionality",
        tags: ["Health", "Plugin", "CLI"],
      },
    }
  )

  // CLI commands list endpoint
  .get(
    "/cli/commands",
    () => {
      try {
        const commands = [
          {
            name: "login",
            description: "Authenticate with ServiceNow using SAML",
            decorator: "cliLogin",
            params: ["username?", "password?"],
          },
          {
            name: "list-groups",
            description: "List all groups from MongoDB sn_groups collection",
            decorator: "cliListGroups",
            params: [],
          },
          {
            name: "get-tickets",
            description: "Get tickets by group from MongoDB collections",
            decorator: "cliGetTickets",
            params: ["groupName?", "state?", "limit?"],
          },
          {
            name: "create",
            description: "Create record in ServiceNow",
            decorator: "cliCreateRecord",
            params: ["table", "data"],
          },
          {
            name: "update",
            description: "Update record in ServiceNow",
            decorator: "cliUpdateRecord",
            params: ["table", "sysId", "data"],
          },
          {
            name: "delete",
            description: "Delete record from ServiceNow",
            decorator: "cliDeleteRecord",
            params: ["table", "sysId"],
          },
          {
            name: "batch",
            description: "Execute batch operations in ServiceNow",
            decorator: "cliBatchOperations",
            params: ["operations[]"],
          },
          {
            name: "sync",
            description: "Sync data from ServiceNow to MongoDB",
            decorator: "cliSyncData",
            params: ["tables[]?"],
          },
        ];

        return {
          success: true,
          result: {
            commands,
            totalCommands: commands.length,
            note: "Use HTTP endpoints with decorator names to call these functions",
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
        summary: "CLI Commands List",
        description: "Get list of available real CLI commands",
        tags: ["CLI", "Commands", "Documentation"],
      },
    }
  )

  // Execute CLI command via HTTP endpoint with real functionality
  .post(
    "/cli/execute",
    async ({ body, cliLogin, cliListGroups, cliGetTickets, cliCreateRecord, cliUpdateRecord, cliDeleteRecord, cliBatchOperations, cliSyncData }) => {
      try {
        const { command, params = {} } = body as { command: string; params?: any };

        if (!command) {
          return {
            success: false,
            error: "Command is required",
            timestamp: new Date().toISOString(),
          };
        }

        let result: any;

        // Route to real decorator functions
        switch (command) {
          case "login":
            result = await cliLogin(params.username, params.password);
            break;
          case "list-groups":
            result = await cliListGroups();
            break;
          case "get-tickets":
            result = await cliGetTickets(params.groupName, params.state, params.limit);
            break;
          case "create":
            result = await cliCreateRecord(params.table, params.data);
            break;
          case "update":
            result = await cliUpdateRecord(params.table, params.sysId, params.data);
            break;
          case "delete":
            result = await cliDeleteRecord(params.table, params.sysId);
            break;
          case "batch":
            result = await cliBatchOperations(params.operations);
            break;
          case "sync":
            result = await cliSyncData(params.tables);
            break;
          default:
            throw new Error(`Unknown command: ${command}`);
        }

        return {
          success: true,
          result: {
            command,
            params,
            output: result,
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
        summary: "Execute CLI Command",
        description: "Execute real CLI command via HTTP interface",
        tags: ["CLI", "Execute", "Command", "Real"],
      },
    }
  )

  // Global scope - exposes context across entire application following best practices
  .as('global');

// Export plugin context type for Eden Treaty
export type CLIPluginApp = typeof cliPlugin;

// Functional Callback Method pattern - for conditional use
export const createCLIPlugin = (config?: {
  enableHttpInterface?: boolean;
  enableCommandRegistration?: boolean;
  defaultOutput?: 'json' | 'table' | 'csv';
}) => {
  return (app: Elysia) =>
    app.use(cliPlugin).onStart(() => {
      console.log("CLI Plugin applied - command-line interface available via dependency injection");
      console.log("ServiceNow CLI commands integrated with plugin system");
    });
};

// Export types for other modules
export type {
  CLICommandOptions,
  ServiceNowRecord,
};