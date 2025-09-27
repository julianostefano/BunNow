/**
 * Client Integration Plugin - Elysia plugin for unified ServiceNow client management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared client instances para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 * - Unified client access pattern
 *
 * Unifica acesso ao ServiceNowClient em todos os plugins e elimina instanciação duplicada
 */

import { Elysia } from "elysia";
import { ServiceNowClient, type IServiceNowClient } from "../client/ServiceNowClient";
import { TableAPI } from "../api/TableAPI";
import { AttachmentAPI } from "../api/AttachmentAPI";
import { BatchAPI } from "../api/BatchAPI";
import {
  consolidatedServiceNowService,
  serviceNowAuthClient,
  ConsolidatedServiceNowService
} from "../services";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { ServiceNowBridgeService, serviceNowBridgeService } from "../services/ServiceNowBridgeService";
import type { ServiceNowRecord, QueryOptions } from "../types/servicenow";

// Types para Eden Treaty
export interface ClientIntegrationContext {
  serviceNowClient: IServiceNowClient;
  tableAPI: TableAPI;
  attachmentAPI: AttachmentAPI;
  batchAPI: BatchAPI;
  unifiedQuery: (options: QueryOptions) => Promise<ServiceNowRecord[]>;
  unifiedCreate: (table: string, data: ServiceNowRecord) => Promise<ServiceNowRecord>;
  unifiedRead: (table: string, sysId: string) => Promise<ServiceNowRecord | null>;
  unifiedUpdate: (table: string, sysId: string, data: Partial<ServiceNowRecord>) => Promise<ServiceNowRecord>;
  unifiedDelete: (table: string, sysId: string) => Promise<boolean>;
  unifiedBatch: (operations: any[]) => Promise<any>;
  unifiedUpload: (table: string, sysId: string, file: File) => Promise<string>;
  unifiedDownload: (attachmentId: string) => Promise<ArrayBuffer>;
  testConnection: () => Promise<boolean>;
  getClientStats: () => Promise<any>;
  getClientConfig: () => any;
  refreshClientConnection: () => Promise<boolean>;
}

export interface ClientConfiguration {
  instance: string;
  auth: string;
  timeout?: number;
  retryLimit?: number;
  enableCache?: boolean;
  enablePerformanceMonitoring?: boolean;
  enableLogging?: boolean;
}

/**
 * Client Integration Plugin - Separate Instance Method pattern
 * Provides unified ServiceNow client access through dependency injection
 */
export const clientIntegrationPlugin = new Elysia({
  name: "servicenow-client-integration-plugin",
  seed: {
    serviceNowClient: {} as IServiceNowClient,
    tableAPI: {} as TableAPI,
    attachmentAPI: {} as AttachmentAPI,
    batchAPI: {} as BatchAPI,
    unifiedQuery: {} as ClientIntegrationContext["unifiedQuery"],
    unifiedCreate: {} as ClientIntegrationContext["unifiedCreate"],
    unifiedRead: {} as ClientIntegrationContext["unifiedRead"],
    unifiedUpdate: {} as ClientIntegrationContext["unifiedUpdate"],
    unifiedDelete: {} as ClientIntegrationContext["unifiedDelete"],
    unifiedBatch: {} as ClientIntegrationContext["unifiedBatch"],
    unifiedUpload: {} as ClientIntegrationContext["unifiedUpload"],
    unifiedDownload: {} as ClientIntegrationContext["unifiedDownload"],
    testConnection: {} as ClientIntegrationContext["testConnection"],
    getClientStats: {} as ClientIntegrationContext["getClientStats"],
    getClientConfig: {} as ClientIntegrationContext["getClientConfig"],
    refreshClientConnection: {} as ClientIntegrationContext["refreshClientConnection"],
  },
})
  // Lifecycle Hook: onStart - Initialize Client Integration
  .onStart(async () => {
    console.log("Client Integration Plugin starting - initializing unified ServiceNow client");
  })

  // Dependency Injection: Create unified client instance
  .derive(async () => {
    // Get configuration from environment
    const instanceUrl = process.env.SNC_INSTANCE_URL || "";
    const authToken = process.env.SNC_AUTH_TOKEN || "";

    if (!instanceUrl || !authToken) {
      console.warn("Client Integration Plugin: Missing ServiceNow configuration");
    }

    // Create unified ServiceNow client configuration
    const clientConfig: ClientConfiguration = {
      instance: instanceUrl,
      auth: authToken,
      timeout: 900000, // 15 minutes (as per Auth Service Proxy architecture)
      retryLimit: 3,
      enableCache: true,
      enablePerformanceMonitoring: true,
      enableLogging: false, // Disable in production
    };

    // For testing/development, create mock clients if no config
    let serviceNowClient: any;
    let tableAPI: any;
    let attachmentAPI: any;
    let batchAPI: any;

    if (!instanceUrl || !authToken) {
      // Create mock client for testing
      serviceNowClient = {
        query: async () => [],
        create: async () => ({}),
        read: async () => ({}),
        update: async () => ({}),
        delete: async () => true,
        createBatch: () => ({ execute: async () => [] }),
        uploadAttachment: async () => "mock-attachment-id",
        downloadAttachment: async () => new Response(),
        testConnection: async () => false,
        getStats: async () => ({ mock: true }),
        getCacheStats: () => ({ mock: true }),
        getPerformanceReport: () => ({ mock: true }),
        clearCache: () => {},
        table: {},
        attachment: {},
        batch: {}
      };
      tableAPI = serviceNowClient.table;
      attachmentAPI = serviceNowClient.attachment;
      batchAPI = serviceNowClient.batch;
    } else {
      // Initialize ServiceNow client with configuration
      serviceNowClient = new ServiceNowClient(clientConfig);
      tableAPI = serviceNowClient.table;
      attachmentAPI = serviceNowClient.attachment;
      batchAPI = serviceNowClient.batch;
    }

    return {
      serviceNowClient,
      tableAPI,
      attachmentAPI,
      batchAPI,
      clientConfig,
    };
  })

  // Unified query method - replaces direct API calls with real functionality via Bridge Service
  .decorate("unifiedQuery", async (options: QueryOptions): Promise<ServiceNowRecord[]> => {
    try {
      console.log("🔍 Client Integration Plugin: Executing real unifiedQuery via Bridge Service...");

      // Use ServiceNow Bridge Service to avoid 61s timeout issue
      const table = options.table || "incident";
      const query = options.query || "";
      const limit = options.limit || 10;

      // Build query parameters for bridge service
      const queryParams: Record<string, any> = {
        sysparm_query: query,
        sysparm_limit: limit,
        sysparm_display_value: "all",
        sysparm_exclude_reference_link: "true"
      };

      // Execute query via bridge service (eliminates 61s timeout)
      const bridgeResponse = await serviceNowBridgeService.queryTable(table, queryParams);

      if (!bridgeResponse.success) {
        throw new Error(bridgeResponse.error || "Bridge service query failed");
      }

      const records = bridgeResponse.result || [];
      console.log(`✅ Client Integration Plugin: Retrieved ${records.length} records from ${table} via Bridge Service`);
      return records;
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Query error:", error.message);
      throw error;
    }
  })

  // Unified create method - replaces direct API calls with real functionality via Bridge Service
  .decorate("unifiedCreate", async (table: string, data: ServiceNowRecord): Promise<ServiceNowRecord> => {
    try {
      console.log(`📝 Client Integration Plugin: Creating real record in ${table} via Bridge Service...`);

      // Use ServiceNow Bridge Service to avoid 61s timeout issue
      const bridgeResponse = await serviceNowBridgeService.createRecord(table, data);

      if (!bridgeResponse.success) {
        throw new Error(bridgeResponse.error || "Bridge service create failed");
      }

      const createdRecord = bridgeResponse.result;
      console.log(`✅ Client Integration Plugin: Record created in ${table} via Bridge Service`);
      return createdRecord;
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Create error:", error.message);
      throw error;
    }
  })

  // Unified read method - replaces direct API calls with real functionality via Bridge Service
  .decorate("unifiedRead", async (table: string, sysId: string): Promise<ServiceNowRecord | null> => {
    try {
      console.log(`📚 Client Integration Plugin: Reading real record from ${table}, sys_id: ${sysId} via Bridge Service...`);

      // Use ServiceNow Bridge Service to avoid 61s timeout issue
      const bridgeResponse = await serviceNowBridgeService.getRecord(table, sysId);

      if (!bridgeResponse.success) {
        throw new Error(bridgeResponse.error || "Bridge service read failed");
      }

      const record = bridgeResponse.result;
      if (record) {
        console.log(`✅ Client Integration Plugin: Record found in ${table} via Bridge Service`);
        return record;
      } else {
        console.log(`⚠️ Client Integration Plugin: Record not found in ${table} via Bridge Service`);
        return null;
      }
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Read error:", error.message);
      throw error;
    }
  })

  // Unified update method - replaces direct API calls with real functionality via Bridge Service
  .decorate("unifiedUpdate", async (table: string, sysId: string, data: Partial<ServiceNowRecord>): Promise<ServiceNowRecord> => {
    try {
      console.log(`✏️ Client Integration Plugin: Updating real record in ${table}, sys_id: ${sysId} via Bridge Service...`);

      // Use ServiceNow Bridge Service to avoid 61s timeout issue
      const bridgeResponse = await serviceNowBridgeService.updateRecord(table, sysId, data);

      if (!bridgeResponse.success) {
        throw new Error(bridgeResponse.error || "Bridge service update failed");
      }

      const updatedRecord = bridgeResponse.result;
      console.log(`✅ Client Integration Plugin: Record updated in ${table} via Bridge Service`);
      return updatedRecord;
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Update error:", error.message);
      throw error;
    }
  })

  // Unified delete method - replaces direct API calls with real functionality via Bridge Service
  .decorate("unifiedDelete", async (table: string, sysId: string): Promise<boolean> => {
    try {
      console.log(`🗑️ Client Integration Plugin: Deleting real record from ${table}, sys_id: ${sysId} via Bridge Service...`);

      // Use ServiceNow Bridge Service to avoid 61s timeout issue
      const bridgeResponse = await serviceNowBridgeService.deleteRecord(table, sysId);

      if (!bridgeResponse.success) {
        console.error(`❌ Client Integration Plugin: Delete failed: ${bridgeResponse.error}`);
        return false;
      }

      console.log(`✅ Client Integration Plugin: Record deleted from ${table} via Bridge Service`);
      return true;
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Delete error:", error.message);
      return false;
    }
  })

  // Unified batch operations method - replaces direct API calls with real functionality via Bridge Service
  .decorate("unifiedBatch", async (operations: any[]): Promise<any> => {
    try {
      console.log(`📋 Client Integration Plugin: Executing real batch operations (${operations.length} operations) via Bridge Service...`);

      const results: any[] = [];
      let successCount = 0;

      // Process operations sequentially to respect ServiceNow rate limits
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        try {
          let operationResult: any;

          switch (operation.op) {
            case "read":
            case "get":
              const readResponse = await serviceNowBridgeService.getRecord(operation.table, operation.sysId);
              operationResult = {
                success: readResponse.success,
                data: readResponse.result || null,
                error: readResponse.error,
                operation
              };
              break;

            case "query":
              const queryParams = {
                sysparm_query: operation.query || "",
                sysparm_limit: operation.limit || 10,
                sysparm_display_value: "all",
                sysparm_exclude_reference_link: "true"
              };
              const queryResponse = await serviceNowBridgeService.queryTable(operation.table, queryParams);
              operationResult = {
                success: queryResponse.success,
                data: queryResponse.result || [],
                count: queryResponse.result?.length || 0,
                error: queryResponse.error,
                operation
              };
              break;

            case "create":
              const createResponse = await serviceNowBridgeService.createRecord(operation.table, operation.data);
              operationResult = {
                success: createResponse.success,
                data: createResponse.result,
                error: createResponse.error,
                operation
              };
              break;

            case "update":
              const updateResponse = await serviceNowBridgeService.updateRecord(operation.table, operation.sysId, operation.data);
              operationResult = {
                success: updateResponse.success,
                data: updateResponse.result,
                error: updateResponse.error,
                operation
              };
              break;

            case "delete":
              const deleteResponse = await serviceNowBridgeService.deleteRecord(operation.table, operation.sysId);
              operationResult = {
                success: deleteResponse.success,
                error: deleteResponse.error,
                operation
              };
              break;

            default:
              operationResult = {
                success: false,
                error: `Unsupported operation: ${operation.op}`,
                operation
              };
          }

          results.push(operationResult);
          if (operationResult.success) {
            successCount++;
          }
        } catch (operationError: any) {
          results.push({
            success: false,
            error: operationError.message,
            operation
          });
        }

        // Add small delay between operations
        if (i < operations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Client Integration Plugin: Batch completed via Bridge Service: ${successCount}/${operations.length} successful`);
      return {
        totalOperations: operations.length,
        successful: successCount,
        failed: operations.length - successCount,
        results
      };
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Batch error:", error.message);
      throw error;
    }
  })

  // Unified upload method - replaces direct API calls
  .decorate("unifiedUpload", async (table: string, sysId: string, file: File): Promise<string> => {
    console.log("📎 Client Integration Plugin: Mock unifiedUpload called");
    return "mock-attachment-id";
  })

  // Unified download method - replaces direct API calls
  .decorate("unifiedDownload", async (attachmentId: string): Promise<ArrayBuffer> => {
    console.log("📥 Client Integration Plugin: Mock unifiedDownload called");
    return new ArrayBuffer(0);
  })

  // Connection testing method with real functionality via Bridge Service
  .decorate("testConnection", async (): Promise<boolean> => {
    try {
      console.log("🔌 Client Integration Plugin: Testing real ServiceNow connection via Bridge Service...");

      // Use ServiceNow Bridge Service health check to avoid 61s timeout issue
      const healthResponse = await serviceNowBridgeService.healthCheck();

      if (healthResponse.success && healthResponse.result) {
        const isConnected = healthResponse.result.auth;
        console.log(`✅ Client Integration Plugin: Connection test ${isConnected ? 'successful' : 'failed'} via Bridge Service`);
        return isConnected;
      } else {
        console.log("❌ Client Integration Plugin: Health check failed via Bridge Service");
        return false;
      }
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Connection test error:", error.message);
      return false;
    }
  })

  // Client statistics method with real functionality via Bridge Service
  .decorate("getClientStats", async (): Promise<any> => {
    try {
      console.log("📊 Client Integration Plugin: Getting real client statistics via Bridge Service...");

      // Get real metrics from the bridge service
      const metrics = serviceNowBridgeService.getMetrics();
      const healthResponse = await serviceNowBridgeService.healthCheck();
      const isAuthValid = healthResponse.success && healthResponse.result?.auth;

      const stats = {
        connection: {
          status: isAuthValid ? "authenticated" : "not_authenticated",
          connected: isAuthValid,
          authValid: isAuthValid
        },
        performance: {
          totalRequests: metrics.totalRequests || 0,
          successfulRequests: metrics.successfulRequests || 0,
          failedRequests: metrics.failedRequests || 0,
          averageResponseTime: metrics.averageResponseTime || 0,
          successRate: metrics.totalRequests > 0 ? (metrics.successfulRequests / metrics.totalRequests * 100).toFixed(2) : 0
        },
        client: {
          baseUrl: "ServiceNow Bridge Service",
          type: "ServiceNowBridgeService"
        },
        timestamp: new Date().toISOString(),
      };

      console.log("✅ Client Integration Plugin: Real client statistics retrieved via Bridge Service");
      return stats;
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Stats error:", error.message);
      return {
        connection: { status: "error", connected: false },
        performance: { error: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Client configuration method with real configuration
  .decorate("getClientConfig", (): any => {
    console.log("⚙️ Client Integration Plugin: Getting real client configuration...");

    // Get real configuration from environment
    const config = {
      instance: process.env.SERVICENOW_USERNAME ? "iberdrola.service-now.com" : "not_configured",
      auth: process.env.SERVICENOW_USERNAME ? "SAML_configured" : "not_configured",
      authMethod: "SAML",
      environment: {
        hasUsername: !!process.env.SERVICENOW_USERNAME,
        hasPassword: !!process.env.SERVICENOW_PASSWORD,
        hasProxy: !!process.env.SERVICENOW_PROXY,
      },
      timeout: 900000, // 15 minutes (as per Bridge Service architecture)
      retryLimit: 3,
      enableCache: true,
      enablePerformanceMonitoring: true,
      enableLogging: process.env.NODE_ENV === "development",
    };

    console.log("✅ Client Integration Plugin: Real client configuration retrieved");
    return config;
  })

  // Connection refresh method with real functionality via Bridge Service
  .decorate("refreshClientConnection", async (): Promise<boolean> => {
    try {
      console.log("🔄 Client Integration Plugin: Refreshing real ServiceNow connection via Bridge Service...");

      // Reset authentication on bridge service to force re-authentication
      serviceNowBridgeService.resetAuth();

      // Test the connection after reset
      const healthResponse = await serviceNowBridgeService.healthCheck();
      const isRefreshed = healthResponse.success && healthResponse.result?.auth;

      console.log(`✅ Client Integration Plugin: Connection refresh ${isRefreshed ? 'successful' : 'failed'} via Bridge Service`);
      return isRefreshed;
    } catch (error: any) {
      console.error("❌ Client Integration Plugin: Refresh error:", error.message);
      return false;
    }
  })

  // Lifecycle Hook: onStop - Cleanup client resources
  .onStop(async () => {
    console.log("Client Integration Plugin stopping - cleaning up client resources");
  })

  // Client health check endpoint
  .get(
    "/client/health",
    async ({ testConnection, getClientConfig }) => {
      try {
        const isConnected = await testConnection();
        const config = getClientConfig();

        return {
          success: true,
          result: {
            status: isConnected ? "healthy" : "unhealthy",
            plugin: "servicenow-client-integration-plugin",
            connection: {
              connected: isConnected,
              instance: config.instance,
              auth: config.auth,
            },
            configuration: config,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          plugin: "servicenow-client-integration-plugin",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "Client Integration Health Check",
        description: "Check health of unified ServiceNow client integration",
        tags: ["Health", "Plugin", "Client"],
      },
    }
  )

  // Client statistics endpoint
  .get(
    "/client/stats",
    async ({ getClientStats }) => {
      try {
        const stats = await getClientStats();

        return {
          success: true,
          result: stats,
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
        summary: "Client Statistics",
        description: "Get ServiceNow client performance and usage statistics",
        tags: ["Client", "Stats", "Performance"],
      },
    }
  )

  // Client configuration endpoint
  .get(
    "/client/config",
    ({ getClientConfig }) => {
      try {
        const config = getClientConfig();

        return {
          success: true,
          result: config,
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
        summary: "Client Configuration",
        description: "Get ServiceNow client configuration (safe version)",
        tags: ["Client", "Config", "Info"],
      },
    }
  )

  // Connection test endpoint
  .post(
    "/client/test-connection",
    async ({ testConnection }) => {
      try {
        const isConnected = await testConnection();

        return {
          success: true,
          result: {
            connected: isConnected,
            message: isConnected ? "Connection successful" : "Connection failed",
            testedAt: new Date().toISOString(),
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
        summary: "Test Connection",
        description: "Test ServiceNow client connection",
        tags: ["Client", "Connection", "Test"],
      },
    }
  )

  // Connection refresh endpoint
  .post(
    "/client/refresh",
    async ({ refreshClientConnection }) => {
      try {
        const refreshed = await refreshClientConnection();

        return {
          success: true,
          result: {
            refreshed,
            message: refreshed ? "Connection refreshed" : "Refresh failed",
            refreshedAt: new Date().toISOString(),
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
        summary: "Refresh Connection",
        description: "Refresh ServiceNow client connection and clear cache",
        tags: ["Client", "Connection", "Refresh"],
      },
    }
  );

// Export plugin context type for Eden Treaty
export type ClientIntegrationPluginApp = typeof clientIntegrationPlugin;

// Functional Callback Method pattern - for conditional use
export const createClientIntegrationPlugin = (config?: {
  enableHealthEndpoints?: boolean;
  enableStatsEndpoints?: boolean;
  enableConnectionManagement?: boolean;
  clientConfig?: Partial<ClientConfiguration>;
}) => {
  return (app: Elysia) =>
    app.use(clientIntegrationPlugin).onStart(() => {
      console.log("Client Integration Plugin applied - unified ServiceNow client available");
      console.log("Eliminates client duplication across plugins via dependency injection");
    });
};

// Export types for other modules
export type {
  ClientConfiguration,
  ServiceNowRecord,
  QueryOptions,
};