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
      timeout: 30000,
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

  // Unified query method - replaces direct API calls
  .decorate(
    "unifiedQuery",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      options: QueryOptions
    ): Promise<ServiceNowRecord[]> {
      try {
        return await this.serviceNowClient.query(options);
      } catch (error: any) {
        console.error("Client Integration Plugin: Query failed:", error.message);
        throw error;
      }
    }
  )

  // Unified create method - replaces direct API calls
  .decorate(
    "unifiedCreate",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      table: string,
      data: ServiceNowRecord
    ): Promise<ServiceNowRecord> {
      try {
        return await this.serviceNowClient.create(table, data);
      } catch (error: any) {
        console.error("Client Integration Plugin: Create failed:", error.message);
        throw error;
      }
    }
  )

  // Unified read method - replaces direct API calls
  .decorate(
    "unifiedRead",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      table: string,
      sysId: string
    ): Promise<ServiceNowRecord | null> {
      try {
        return await this.serviceNowClient.read(table, sysId);
      } catch (error: any) {
        console.error("Client Integration Plugin: Read failed:", error.message);
        return null;
      }
    }
  )

  // Unified update method - replaces direct API calls
  .decorate(
    "unifiedUpdate",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      table: string,
      sysId: string,
      data: Partial<ServiceNowRecord>
    ): Promise<ServiceNowRecord> {
      try {
        return await this.serviceNowClient.update(table, sysId, data);
      } catch (error: any) {
        console.error("Client Integration Plugin: Update failed:", error.message);
        throw error;
      }
    }
  )

  // Unified delete method - replaces direct API calls
  .decorate(
    "unifiedDelete",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      table: string,
      sysId: string
    ): Promise<boolean> {
      try {
        return await this.serviceNowClient.delete(table, sysId);
      } catch (error: any) {
        console.error("Client Integration Plugin: Delete failed:", error.message);
        return false;
      }
    }
  )

  // Unified batch operations method - replaces direct API calls
  .decorate(
    "unifiedBatch",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      operations: any[]
    ): Promise<any> {
      try {
        const batchAPI = this.serviceNowClient.createBatch();

        // Add operations to batch
        for (const operation of operations) {
          switch (operation.op) {
            case 'create':
              batchAPI.create(operation.table, operation.data);
              break;
            case 'update':
              batchAPI.update(operation.table, operation.sysId, operation.data);
              break;
            case 'delete':
              batchAPI.delete(operation.table, operation.sysId);
              break;
            default:
              console.warn(`Unknown batch operation: ${operation.op}`);
          }
        }

        return await batchAPI.execute();
      } catch (error: any) {
        console.error("Client Integration Plugin: Batch failed:", error.message);
        throw error;
      }
    }
  )

  // Unified upload method - replaces direct API calls
  .decorate(
    "unifiedUpload",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      table: string,
      sysId: string,
      file: File
    ): Promise<string> {
      try {
        return await this.serviceNowClient.uploadAttachment(
          file.name,
          table,
          sysId,
          file,
          file.type
        );
      } catch (error: any) {
        console.error("Client Integration Plugin: Upload failed:", error.message);
        throw error;
      }
    }
  )

  // Unified download method - replaces direct API calls
  .decorate(
    "unifiedDownload",
    async function (
      this: { serviceNowClient: IServiceNowClient },
      attachmentId: string
    ): Promise<ArrayBuffer> {
      try {
        const response = await this.serviceNowClient.downloadAttachment(attachmentId);
        return await response.arrayBuffer();
      } catch (error: any) {
        console.error("Client Integration Plugin: Download failed:", error.message);
        throw error;
      }
    }
  )

  // Connection testing method
  .decorate(
    "testConnection",
    async function (
      this: { serviceNowClient: IServiceNowClient }
    ): Promise<boolean> {
      try {
        return await this.serviceNowClient.testConnection();
      } catch (error: any) {
        console.error("Client Integration Plugin: Connection test failed:", error.message);
        return false;
      }
    }
  )

  // Client statistics method
  .decorate(
    "getClientStats",
    async function (
      this: { serviceNowClient: IServiceNowClient }
    ): Promise<any> {
      try {
        const stats = await this.serviceNowClient.getStats();
        const cacheStats = this.serviceNowClient.getCacheStats();
        const performanceReport = this.serviceNowClient.getPerformanceReport();

        return {
          connection: stats,
          cache: cacheStats,
          performance: performanceReport,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("Client Integration Plugin: Stats retrieval failed:", error.message);
        return {
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }
  )

  // Client configuration method
  .decorate(
    "getClientConfig",
    function (
      this: { clientConfig: ClientConfiguration }
    ): any {
      // Return safe configuration (without sensitive data)
      return {
        instance: this.clientConfig.instance ? "configured" : "missing",
        auth: this.clientConfig.auth ? "configured" : "missing",
        timeout: this.clientConfig.timeout,
        retryLimit: this.clientConfig.retryLimit,
        enableCache: this.clientConfig.enableCache,
        enablePerformanceMonitoring: this.clientConfig.enablePerformanceMonitoring,
        enableLogging: this.clientConfig.enableLogging,
      };
    }
  )

  // Connection refresh method
  .decorate(
    "refreshClientConnection",
    async function (
      this: { serviceNowClient: IServiceNowClient }
    ): Promise<boolean> {
      try {
        // Clear cache and test connection
        this.serviceNowClient.clearCache();
        const isConnected = await this.serviceNowClient.testConnection();

        if (isConnected) {
          console.log("Client Integration Plugin: Connection refreshed successfully");
        } else {
          console.warn("Client Integration Plugin: Connection refresh failed");
        }

        return isConnected;
      } catch (error: any) {
        console.error("Client Integration Plugin: Connection refresh error:", error.message);
        return false;
      }
    }
  )

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