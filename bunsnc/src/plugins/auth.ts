/**
 * ServiceNow Auth Plugin - Elysia plugin for authentication and authorization
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Dependency injection via .decorate()
 * - Shared authentication instance para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 *
 * Substitui imports diretos do ServiceNowAuthClient por injeção via plugin
 */

import { Elysia } from "elysia";
import {
  ServiceNowAuthClient,
  ServiceNowRecord,
  ServiceNowQueryResult,
} from "../services/ServiceNowAuthClient";
import { ServiceNowAuthCore } from "../services/auth/ServiceNowAuthCore";
import { ServiceNowSLAService } from "../services/auth/ServiceNowSLAService";
import { ServiceNowQueryService } from "../services/auth/ServiceNowQueryService";

// Types para Eden Treaty
export interface AuthPluginContext {
  authClient: ServiceNowAuthClient;
  isAuthenticated: () => boolean;
  makeAuthenticatedRequest: (
    table: string,
    method?: string,
    params?: Record<string, unknown>,
  ) => Promise<ServiceNowQueryResult>;
  searchTickets: (
    searchTerm: string,
    tables?: string[],
    limit?: number,
  ) => Promise<ServiceNowRecord[]>;
  getWaitingTickets: (groups: string[]) => Promise<any>;
  getSLAData: (taskSysId: string) => Promise<ServiceNowRecord[]>;
  getContractSLA: (
    company?: string,
    location?: string,
  ) => Promise<ServiceNowRecord[]>;
  getCacheMetrics: () => any;
}

/**
 * ServiceNow Auth Plugin - Separate Instance Method pattern
 * Provides shared authentication functionality through dependency injection
 */
export const authPlugin = new Elysia({
  name: "servicenow-auth-plugin",
  seed: {
    authClient: {} as ServiceNowAuthClient,
    isAuthenticated: {} as AuthPluginContext["isAuthenticated"],
    makeAuthenticatedRequest:
      {} as AuthPluginContext["makeAuthenticatedRequest"],
    searchTickets: {} as AuthPluginContext["searchTickets"],
    getWaitingTickets: {} as AuthPluginContext["getWaitingTickets"],
    getSLAData: {} as AuthPluginContext["getSLAData"],
    getContractSLA: {} as AuthPluginContext["getContractSLA"],
    getCacheMetrics: {} as AuthPluginContext["getCacheMetrics"],
  },
})
  // Lifecycle Hook: onStart - Initialize Auth Client
  .onStart(async () => {
    console.log(
      "🔐 ServiceNow Auth Plugin starting - initializing authentication",
    );
  })

  // Dependency Injection: Create auth client instance
  .decorate("authClient", new ServiceNowAuthClient())

  // Authentication validation method
  .decorate(
    "isAuthenticated",
    function (this: { authClient: ServiceNowAuthClient }): boolean {
      return this.authClient.isAuthValid();
    },
  )

  // High-level authenticated request method - replaces direct auth calls
  .decorate(
    "makeAuthenticatedRequest",
    async function (
      this: { authClient: ServiceNowAuthClient },
      table: string,
      method: string = "GET",
      params: Record<string, unknown> = {},
    ): Promise<ServiceNowQueryResult> {
      if (!this.authClient.isAuthValid()) {
        throw new Error(
          "Authentication required - please check ServiceNow credentials",
        );
      }
      return await this.authClient.makeRequest(table, method, params);
    },
  )

  // High-level ticket search method - replaces HTTP calls in services
  .decorate(
    "searchTickets",
    async function (
      this: { authClient: ServiceNowAuthClient },
      searchTerm: string,
      tables: string[] = ["incident", "change_task", "sc_task"],
      limit: number = 50,
    ): Promise<ServiceNowRecord[]> {
      if (!this.authClient.isAuthValid()) {
        throw new Error("Authentication required for ticket search");
      }
      return await this.authClient.searchTickets(searchTerm, tables, limit);
    },
  )

  // High-level waiting tickets analysis - replaces HTTP calls in controllers
  .decorate(
    "getWaitingTickets",
    async function (
      this: { authClient: ServiceNowAuthClient },
      groups: string[],
    ): Promise<any> {
      if (!this.authClient.isAuthValid()) {
        throw new Error("Authentication required for waiting tickets analysis");
      }
      return await this.authClient.getWaitingTicketsSummary(groups);
    },
  )

  // SLA-specific methods - replaces HTTP calls in SLA service
  .decorate(
    "getSLAData",
    async function (
      this: { authClient: ServiceNowAuthClient },
      taskSysId: string,
    ): Promise<ServiceNowRecord[]> {
      if (!this.authClient.isAuthValid()) {
        throw new Error("Authentication required for SLA data retrieval");
      }
      return await this.authClient.getSLADataForTask(taskSysId);
    },
  )

  // Contract SLA data - replaces HTTP calls in SLA service
  .decorate(
    "getContractSLA",
    async function (
      this: { authClient: ServiceNowAuthClient },
      company?: string,
      location?: string,
    ): Promise<ServiceNowRecord[]> {
      if (!this.authClient.isAuthValid()) {
        throw new Error("Authentication required for contract SLA data");
      }
      return await this.authClient.getContractSLAData(company, location);
    },
  )

  // Cache metrics method - replaces direct cache access
  .decorate(
    "getCacheMetrics",
    function (this: { authClient: ServiceNowAuthClient }): any {
      return this.authClient.getCacheMetrics();
    },
  )

  // Post-initialization hook - start cache warming after server is ready
  .derive(async ({ authClient }) => {
    // Defer cache warming until after server startup
    setTimeout(async () => {
      try {
        await authClient.initializeCacheWarming();
        console.log("✅ Auth Plugin: Cache warming completed");
      } catch (error: any) {
        console.warn("⚠️ Auth Plugin: Cache warming failed:", error.message);
      }
    }, 2000); // 2-second delay to ensure server is fully started

    return {};
  })

  // Lifecycle Hook: onStop - Cleanup if needed
  .onStop(() => {
    console.log("🛑 ServiceNow Auth Plugin stopping - cleanup completed");
  })

  // Plugin health check endpoint
  .get(
    "/auth/health",
    async ({ authClient }) => {
      const isValid = authClient.isAuthValid();
      const cacheMetrics = authClient.getCacheMetrics();

      return {
        success: true,
        result: {
          status: isValid ? "authenticated" : "not_authenticated",
          plugin: "servicenow-auth-plugin",
          auth: {
            valid: isValid,
            baseUrl: authClient.getBaseUrl(),
          },
          cache: cacheMetrics,
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "ServiceNow Auth Plugin Health Check",
        description:
          "Check health of ServiceNow authentication plugin and cache status",
        tags: ["Health", "Plugin", "Auth"],
      },
    },
  )

  // Authentication status endpoint
  .get(
    "/auth/status",
    ({ authClient }) => {
      const isValid = authClient.isAuthValid();

      return {
        success: true,
        result: {
          authenticated: isValid,
          baseUrl: isValid ? authClient.getBaseUrl() : "not_configured",
          message: isValid ? "Authentication valid" : "Authentication required",
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "Authentication Status",
        description: "Get current authentication status",
        tags: ["Auth", "Status"],
      },
    },
  )

  // Cache metrics endpoint
  .get(
    "/auth/cache/metrics",
    ({ authClient }) => {
      const metrics = authClient.getCacheMetrics();

      return {
        success: true,
        result: {
          metrics,
          status: "healthy",
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      detail: {
        summary: "Cache Metrics",
        description: "Get authentication cache performance metrics",
        tags: ["Auth", "Cache", "Metrics"],
      },
    },
  )

  // Global scope - exposes context across entire application following best practices
  .as("global");

// Export plugin context type for Eden Treaty
export type AuthPluginApp = typeof authPlugin;

// Functional Callback Method pattern - for conditional use
export const createAuthPlugin = (config?: {
  enableHealthCheck?: boolean;
  enableCacheWarming?: boolean;
}) => {
  return (app: Elysia) =>
    app.use(authPlugin).onStart(() => {
      console.log(
        "🔌 Auth Plugin applied - authentication service available via dependency injection",
      );
      console.log(
        "📦 Direct auth client imports eliminated - using plugin injection",
      );
    });
};

// Export types for other modules
export type { ServiceNowRecord, ServiceNowQueryResult };
