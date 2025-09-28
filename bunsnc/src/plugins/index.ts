/**
 * Plugin Integration Layer - Central composition of all Elysia plugins
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Este arquivo implementa as Elysia best practices:
 * - Plugin composition pattern
 * - Dependency injection cross-plugin
 * - Plugin lifecycle coordination
 * - Type safety consolidada com Eden Treaty
 *
 * Integra todos os 8 plugins existentes em uma interface unificada
 */

import { Elysia } from "elysia";

// Import all implemented plugins
import { authPlugin, type AuthPluginContext } from "./auth";
import { serviceNowPlugin, type ServiceNowPluginContext } from "./servicenow";
import { dataPlugin, type DataPluginContext } from "./data";
import { clientIntegrationPlugin, type ClientIntegrationContext } from "./client-integration";
import { ticketActionsPlugin, type TicketActionsContext } from "./ticket-actions";
import { streamingPlugin, type StreamingPluginContext } from "./streaming";
import { systemHealthPlugin, type SystemHealthContext } from "./system-health";
import { cliPlugin, type CLIPluginContext } from "./cli";

// Consolidated Plugin Context Type for Eden Treaty
export interface ConsolidatedPluginContext extends
  AuthPluginContext,
  ServiceNowPluginContext,
  DataPluginContext,
  ClientIntegrationContext,
  TicketActionsContext,
  StreamingPluginContext,
  SystemHealthContext,
  CLIPluginContext {}

/**
 * Shared Plugins Composition - Following Elysia Best Practice "1 instance = 1 controller"
 * Implements Shared Plugins Pattern for dependency injection without violating architecture
 */
export const sharedPluginsComposition = new Elysia({
  name: 'bunsnc-shared-plugins'
})
  // Plugin lifecycle - onStart
  .onStart(() => {
    console.log("🚀 Shared Plugins Composition starting - enabling dependency injection across 8 specialized controllers");
  })

  // Shared dependency injection context - aggregates all plugin contexts
  .derive(() => {
    console.log("📦 Initializing shared plugin context for dependency injection");
    return {};
  })

  // Plugin composition health check
  .get('/plugins/health', async ({
    // Auth plugin context
    authenticate, getAuthStatus,
    // ServiceNow plugin context
    queryServiceNow, serviceNowBridge,
    // Data plugin context
    dataService, getTicket,
    // Client integration context
    serviceNowClient, unifiedQuery,
    // Ticket actions context
    processTicketAction,
    // Streaming context
    streamTickets,
    // System health context
    checkSystemHealth,
    // CLI context
    executeCommand
  }) => {
    try {
      // Test all plugin integrations
      const healthChecks = {
        auth: !!authenticate && !!getAuthStatus,
        servicenow: !!queryServiceNow && !!serviceNowBridge,
        data: !!dataService && !!getTicket,
        clientIntegration: !!serviceNowClient && !!unifiedQuery,
        ticketActions: !!processTicketAction,
        streaming: !!streamTickets,
        systemHealth: !!checkSystemHealth,
        cli: !!executeCommand
      };

      const allPluginsHealthy = Object.values(healthChecks).every(check => check === true);

      return {
        success: true,
        result: {
          status: allPluginsHealthy ? "healthy" : "partial",
          pluginComposition: "bunsnc-core-plugins",
          pluginsIntegrated: 8,
          pluginHealth: healthChecks,
          allPluginsHealthy,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        result: {
          status: "unhealthy",
          pluginComposition: "bunsnc-core-plugins",
          timestamp: new Date().toISOString()
        }
      };
    }
  }, {
    detail: {
      summary: "Core Plugin Composition Health Check",
      description: "Check health and integration of all 8 BunSNC plugins",
      tags: ["Health", "Plugins", "Integration"]
    }
  })

  // Plugin metrics endpoint
  .get('/plugins/metrics', async ({
    serviceNowBridge,
    dataService,
    serviceNowClient
  }) => {
    try {
      const metrics = {
        serviceNow: serviceNowBridge?.getMetrics() || {},
        data: dataService ? {
          // Data service metrics if available
          cacheStats: dataService.getCacheStats?.() || {}
        } : {},
        client: serviceNowClient ? {
          // Client metrics if available
          stats: await serviceNowClient.getStats?.() || {}
        } : {},
        timestamp: new Date().toISOString()
      };

      return {
        success: true,
        result: {
          pluginComposition: "bunsnc-core-plugins",
          metrics,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }, {
    detail: {
      summary: "Plugin Composition Metrics",
      description: "Get metrics from all integrated plugins",
      tags: ["Metrics", "Plugins", "Performance"]
    }
  })

  // Plugin lifecycle - onStop
  .onStop(() => {
    console.log("🛑 Core Plugin Composition stopping - cleaning up all plugins");
  });

/**
 * Shared Plugins Pattern - Following "1 Elysia instance = 1 controller" Best Practice
 * Each plugin maintains its specialized controller while sharing dependency injection
 */
export const createSharedPluginsComposition = (config?: {
  enableHealthChecks?: boolean;
  enableMetrics?: boolean;
  pluginConfig?: any;
}) => {
  return (app: Elysia) =>
    app
      // Apply each plugin individually (maintaining "1 instance = 1 controller")
      .use(authPlugin)
      .use(serviceNowPlugin)
      .use(dataPlugin)
      .use(clientIntegrationPlugin)
      .use(ticketActionsPlugin)
      .use(streamingPlugin)
      .use(systemHealthPlugin)
      .use(cliPlugin)

      // Add shared composition endpoints if enabled
      .use(config?.enableHealthChecks ? sharedPluginsComposition : new Elysia())

      .onStart(() => {
        console.log("🔌 Shared Plugins Pattern applied - 8 specialized controllers with shared dependency injection");
        console.log("📦 Following Elysia Best Practice: '1 instance = 1 controller'");
        console.log("  - Auth Controller: Authentication and authorization");
        console.log("  - ServiceNow Controller: ServiceNow API operations");
        console.log("  - Data Controller: MongoDB and Redis data management");
        console.log("  - Client Controller: Unified ServiceNow client operations");
        console.log("  - Actions Controller: Ticket workflow operations");
        console.log("  - Streaming Controller: Real-time data streaming");
        console.log("  - Health Controller: System health monitoring");
        console.log("  - CLI Controller: Command-line interface operations");

        if (config?.enableHealthChecks) {
          console.log("✅ Shared health checks enabled at /plugins/health");
        }
        if (config?.enableMetrics) {
          console.log("📊 Shared metrics enabled at /plugins/metrics");
        }
      });
};

/**
 * Legacy Web Plugin Composition - Maintained for backward compatibility
 * @deprecated Use createSharedPluginsComposition instead
 */
export const createWebPluginComposition = createSharedPluginsComposition;

/**
 * Lightweight Plugin Composition - Para casos específicos
 * Permite seleção de plugins específicos
 */
export const createSelectivePluginComposition = (plugins: {
  auth?: boolean;
  servicenow?: boolean;
  data?: boolean;
  clientIntegration?: boolean;
  ticketActions?: boolean;
  streaming?: boolean;
  systemHealth?: boolean;
  cli?: boolean;
}) => {
  return (app: Elysia) => {
    let composition = app;

    if (plugins.auth) composition = composition.use(authPlugin);
    if (plugins.servicenow) composition = composition.use(serviceNowPlugin);
    if (plugins.data) composition = composition.use(dataPlugin);
    if (plugins.clientIntegration) composition = composition.use(clientIntegrationPlugin);
    if (plugins.ticketActions) composition = composition.use(ticketActionsPlugin);
    if (plugins.streaming) composition = composition.use(streamingPlugin);
    if (plugins.systemHealth) composition = composition.use(systemHealthPlugin);
    if (plugins.cli) composition = composition.use(cliPlugin);

    return composition.onStart(() => {
      const enabledPlugins = Object.entries(plugins)
        .filter(([_, enabled]) => enabled)
        .map(([name, _]) => name);

      console.log(`🎯 Selective Plugin Composition applied - ${enabledPlugins.length} plugins:`, enabledPlugins.join(', '));
    });
  };
};

// Export individual plugins for specific use cases
export {
  authPlugin,
  serviceNowPlugin,
  dataPlugin,
  clientIntegrationPlugin,
  ticketActionsPlugin,
  streamingPlugin,
  systemHealthPlugin,
  cliPlugin
};

// Export plugin contexts for type safety
export type {
  AuthPluginContext,
  ServiceNowPluginContext,
  DataPluginContext,
  ClientIntegrationContext,
  TicketActionsContext,
  StreamingPluginContext,
  SystemHealthContext,
  CLIPluginContext
};

// Export composition apps for Eden Treaty
export type SharedPluginsApp = typeof sharedPluginsComposition;
export type CorePluginApp = typeof sharedPluginsComposition; // Legacy compatibility

// Default export follows Shared Plugins Pattern
export default createSharedPluginsComposition;