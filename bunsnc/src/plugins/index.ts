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
import {
  clientIntegrationPlugin,
  type ClientIntegrationContext,
} from "./client-integration";
import {
  ticketActionsPlugin,
  type TicketActionsContext,
} from "./ticket-actions";
import { streamingPlugin, type StreamingPluginContext } from "./streaming";
import { systemHealthPlugin, type SystemHealthContext } from "./system-health";
import { cliPlugin, type CLIPluginContext } from "./cli";
import { pluginHotReloadManager } from "./hot-reload";
import {
  configPlugin,
  type ConfigPluginContext,
  type PluginConfig,
} from "./config-manager";
import { redisPlugin, type RedisPluginContext } from "./redis";
import { serviceLocator, type ServiceLocatorContext } from "./service-locator";

// Consolidated Plugin Context Type for Eden Treaty
export interface ConsolidatedPluginContext
  extends AuthPluginContext,
    ServiceNowPluginContext,
    DataPluginContext,
    ClientIntegrationContext,
    TicketActionsContext,
    StreamingPluginContext,
    SystemHealthContext,
    CLIPluginContext,
    RedisPluginContext,
    ConfigPluginContext,
    ServiceLocatorContext {}

/**
 * Shared Plugins Composition - Following Elysia Best Practice "1 instance = 1 controller"
 * Implements Shared Plugins Pattern for dependency injection without violating architecture
 */
export const sharedPluginsComposition = new Elysia({
  name: "bunsnc-shared-plugins",
})
  // Plugin lifecycle - onStart
  .onStart(() => {
    console.log(
      "🚀 Shared Plugins Composition starting - enabling dependency injection across 9 specialized controllers",
    );
  })

  // Shared dependency injection context - aggregates all plugin contexts
  .derive(() => {
    console.log(
      "📦 Initializing shared plugin context for dependency injection",
    );
    return {};
  })

  // Plugin composition health check
  .get(
    "/plugins/health",
    async ({
      // Auth plugin context
      authenticate,
      getAuthStatus,
      // ServiceNow plugin context
      queryServiceNow,
      serviceNowBridge,
      // Data plugin context
      dataService,
      getTicket,
      // Client integration context
      serviceNowClient,
      unifiedQuery,
      // Ticket actions context
      processTicketAction,
      // Streaming context
      streamTickets,
      // System health context
      checkSystemHealth,
      // CLI context
      executeCommand,
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
          cli: !!executeCommand,
        };

        const allPluginsHealthy = Object.values(healthChecks).every(
          (check) => check === true,
        );

        return {
          success: true,
          result: {
            status: allPluginsHealthy ? "healthy" : "partial",
            pluginComposition: "bunsnc-core-plugins",
            pluginsIntegrated: 8,
            pluginHealth: healthChecks,
            allPluginsHealthy,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          result: {
            status: "unhealthy",
            pluginComposition: "bunsnc-core-plugins",
            timestamp: new Date().toISOString(),
          },
        };
      }
    },
    {
      detail: {
        summary: "Core Plugin Composition Health Check",
        description: "Check health and integration of all 8 BunSNC plugins",
        tags: ["Health", "Plugins", "Integration"],
      },
    },
  )

  // Plugin metrics endpoint
  .get(
    "/plugins/metrics",
    async ({ serviceNowBridge, dataService, serviceNowClient }) => {
      try {
        const metrics = {
          serviceNow: serviceNowBridge?.getMetrics() || {},
          data: dataService
            ? {
                // Data service metrics if available
                cacheStats: dataService.getCacheStats?.() || {},
              }
            : {},
          client: serviceNowClient
            ? {
                // Client metrics if available
                stats: (await serviceNowClient.getStats?.()) || {},
              }
            : {},
          hotReload: pluginHotReloadManager.getStats(),
          timestamp: new Date().toISOString(),
        };

        return {
          success: true,
          result: {
            pluginComposition: "bunsnc-core-plugins",
            metrics,
            timestamp: new Date().toISOString(),
          },
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
        summary: "Plugin Composition Metrics",
        description:
          "Get metrics from all integrated plugins including hot-reload stats",
        tags: ["Metrics", "Plugins", "Performance"],
      },
    },
  )

  // Hot-reload control endpoint
  .post(
    "/plugins/hot-reload/:action",
    async ({ params: { action }, body }) => {
      try {
        switch (action) {
          case "enable":
            pluginHotReloadManager.setAutoReload(true);
            return {
              success: true,
              result: {
                message: "Hot-reload enabled",
                stats: pluginHotReloadManager.getStats(),
              },
              timestamp: new Date().toISOString(),
            };

          case "disable":
            pluginHotReloadManager.setAutoReload(false);
            return {
              success: true,
              result: {
                message: "Hot-reload disabled",
                stats: pluginHotReloadManager.getStats(),
              },
              timestamp: new Date().toISOString(),
            };

          case "reload":
            const pluginId = body?.pluginId;
            if (!pluginId) {
              return {
                success: false,
                error: "pluginId is required for manual reload",
                timestamp: new Date().toISOString(),
              };
            }
            await pluginHotReloadManager.reloadPluginById(pluginId);
            return {
              success: true,
              result: {
                message: `Plugin ${pluginId} reloaded successfully`,
                stats: pluginHotReloadManager.getStats(),
              },
              timestamp: new Date().toISOString(),
            };

          default:
            return {
              success: false,
              error: `Unknown action: ${action}. Available: enable, disable, reload`,
              timestamp: new Date().toISOString(),
            };
        }
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
        summary: "Hot-Reload Control",
        description: "Control plugin hot-reload system (enable/disable/reload)",
        tags: ["Plugins", "HotReload", "Control"],
      },
    },
  )

  // Note: Configuration endpoints now provided by configPlugin directly

  // Plugin lifecycle - onStop
  .onStop(() => {
    console.log(
      "🛑 Core Plugin Composition stopping - cleaning up all plugins",
    );

    // Cleanup hot-reload resources
    try {
      pluginHotReloadManager.destroy();
      console.log("🔥 Plugin hot-reload system cleaned up");
    } catch (error: any) {
      console.warn("⚠️ Hot-reload cleanup failed:", error.message);
    }
  });

/**
 * Shared Plugins Pattern - Following "1 Elysia instance = 1 controller" Best Practice
 * Each plugin maintains its specialized controller while sharing dependency injection
 */
export const createSharedPluginsComposition = (config?: {
  enableHealthChecks?: boolean;
  enableMetrics?: boolean;
  pluginConfig?: {
    serviceNow?: {
      instanceUrl?: string;
      username?: string;
      password?: string;
    };
    redis?: {
      host?: string;
      port?: number;
      password?: string;
    };
    mongodb?: {
      host?: string;
      port?: number;
      database?: string;
    };
    hotReload?: {
      enabled?: boolean;
      watchPaths?: string[];
      debounceMs?: number;
      safeMode?: boolean;
      excludePatterns?: string[];
    };
  };
}) => {
  return (app: Elysia) =>
    app
      // Apply each plugin individually (maintaining "1 instance = 1 controller")
      .use(configPlugin) // Must be FIRST - provides configuration to all plugins
      .use(serviceLocator) // Second - provides dependency injection to all plugins
      .use(redisPlugin) // Third - provides Redis connections to all plugins
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

      .onStart(async () => {
        console.log(
          "🔌 Shared Plugins Pattern applied - 9 specialized controllers with shared dependency injection",
        );
        console.log(
          "📦 Following Elysia Best Practice: '1 instance = 1 controller'",
        );
        console.log("  - Config Controller: Configuration management");
        console.log("  - Service Locator Controller: Dependency injection");
        console.log("  - Redis Controller: Redis connections and caching");
        console.log("  - Auth Controller: Authentication and authorization");
        console.log("  - ServiceNow Controller: ServiceNow API operations");
        console.log("  - Data Controller: MongoDB and Redis data management");
        console.log(
          "  - Client Controller: Unified ServiceNow client operations",
        );
        console.log("  - Actions Controller: Ticket workflow operations");
        console.log("  - Streaming Controller: Real-time data streaming");
        console.log("  - Health Controller: System health monitoring");
        console.log("  - CLI Controller: Command-line interface operations");

        // Configuration management now handled by configPlugin
        console.log("📦 Plugin configuration manager: Handled by configPlugin");

        if (config?.enableHealthChecks) {
          console.log("✅ Shared health checks enabled at /plugins/health");
        }
        if (config?.enableMetrics) {
          console.log("📊 Shared metrics enabled at /plugins/metrics");
        }

        // Initialize hot-reload system if enabled
        if (config?.pluginConfig?.hotReload?.enabled !== false) {
          try {
            const app = this; // Reference to current Elysia instance

            // Get hot-reload config from provided configuration
            let hotReloadConfig = config?.pluginConfig?.hotReload;

            // Create custom hot-reload manager if specific config provided
            const hotReloadManager = hotReloadConfig
              ? pluginHotReloadManager // Use singleton with custom config
              : pluginHotReloadManager; // Use singleton with defaults

            hotReloadManager.initialize(app);
            console.log("🔥 Plugin hot-reload system initialized");

            if (hotReloadConfig) {
              console.log(
                `   - Watch paths: ${hotReloadConfig.watchPaths?.join(", ") || "src/plugins"}`,
              );
              console.log(
                `   - Debounce: ${hotReloadConfig.debounceMs || 1000}ms`,
              );
              console.log(
                `   - Safe mode: ${hotReloadConfig.safeMode !== false ? "enabled" : "disabled"}`,
              );
            }
          } catch (error: any) {
            console.warn("⚠️ Hot-reload initialization failed:", error.message);
          }
        }

        // Configuration change watching now handled by configPlugin
        console.log(
          "🔄 Configuration change watching: Handled by configPlugin",
        );
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
  config?: boolean;
  serviceLocator?: boolean;
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

    // Always include configPlugin first if any plugin is enabled
    const anyPluginEnabled = Object.values(plugins).some((enabled) => enabled);
    if (anyPluginEnabled || plugins.config) {
      composition = composition.use(configPlugin);
    }

    // Service Locator should be second if enabled or if any plugin needs it
    if (plugins.serviceLocator || anyPluginEnabled) {
      composition = composition.use(serviceLocator);
    }

    if (plugins.auth) composition = composition.use(authPlugin);
    if (plugins.servicenow) composition = composition.use(serviceNowPlugin);
    if (plugins.data) composition = composition.use(dataPlugin);
    if (plugins.clientIntegration)
      composition = composition.use(clientIntegrationPlugin);
    if (plugins.ticketActions)
      composition = composition.use(ticketActionsPlugin);
    if (plugins.streaming) composition = composition.use(streamingPlugin);
    if (plugins.systemHealth) composition = composition.use(systemHealthPlugin);
    if (plugins.cli) composition = composition.use(cliPlugin);

    return composition.onStart(() => {
      const enabledPlugins = Object.entries(plugins)
        .filter(([_, enabled]) => enabled)
        .map(([name, _]) => name);

      console.log(
        `🎯 Selective Plugin Composition applied - ${enabledPlugins.length} plugins:`,
        enabledPlugins.join(", "),
      );
    });
  };
};

// Export individual plugins for specific use cases
export {
  configPlugin,
  serviceLocator,
  redisPlugin,
  authPlugin,
  serviceNowPlugin,
  dataPlugin,
  clientIntegrationPlugin,
  ticketActionsPlugin,
  streamingPlugin,
  systemHealthPlugin,
  cliPlugin,
};

// Export plugin contexts for type safety
export type {
  ConfigPluginContext,
  ServiceLocatorContext,
  RedisPluginContext,
  AuthPluginContext,
  ServiceNowPluginContext,
  DataPluginContext,
  ClientIntegrationContext,
  TicketActionsContext,
  StreamingPluginContext,
  SystemHealthContext,
  CLIPluginContext,
};

// Export composition apps for Eden Treaty
export type SharedPluginsApp = typeof sharedPluginsComposition;
export type CorePluginApp = typeof sharedPluginsComposition; // Legacy compatibility

// Default export follows Shared Plugins Pattern
export default createSharedPluginsComposition;
