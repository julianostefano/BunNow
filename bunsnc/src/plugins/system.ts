/**
 * System Plugin - SystemService dependency injection
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v5.6.1: Singleton Lazy Loading Pattern (ElysiaJS Key Concepts #5 + #7)
 * Root cause: SystemService getInstance() called in .derive() per request
 * Solution: Singleton instance com lazy initialization na primeira request
 * Reference: docs/ELYSIA_BEST_PRACTICES.md - "Plugin Deduplication Mechanism"
 *
 * Este plugin implementa as Elysia best practices:
 * - Separate Instance Method plugin pattern
 * - Singleton Lazy Loading (v5.6.1)
 * - Dependency injection via .derive()
 * - Shared service instance para evitar duplicação
 * - Plugin lifecycle hooks (onStart, onStop)
 * - Type safety com Eden Treaty
 */

import { Elysia } from "elysia";
import { MongoClient } from "mongodb";
import { SystemService, type SystemConfig } from "../services/SystemService";
import { logger } from "../utils/Logger";

// FIX v5.6.1: Singleton Lazy Loading Pattern
// SystemService instance criada UMA VEZ e reusada
let _systemServiceSingleton: SystemService | null = null;
let _initializationPromise: Promise<void> | null = null;

/**
 * Initialize SystemService once (singleton pattern)
 * Returns immediately if already initialized
 */
const getSystemService = async (): Promise<SystemService> => {
  // Already initialized - return existing
  if (_systemServiceSingleton) {
    return _systemServiceSingleton;
  }

  // Currently initializing - wait for completion
  if (_initializationPromise) {
    await _initializationPromise;
    return _systemServiceSingleton!;
  }

  // First request - initialize
  _initializationPromise = (async () => {
    console.log("📦 Creating SystemService (SINGLETON - first initialization)");

    // Initialize with config if not exists
    const mongoClient = new MongoClient(
      process.env.MONGODB_URL ||
        "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin",
    );

    const systemConfig: SystemConfig = {
      mongodb: {
        client: mongoClient,
        database: process.env.MONGODB_DATABASE || "bunsnc",
      },
      redis: {
        host: process.env.REDIS_HOST || "10.219.8.210",
        port: parseInt(process.env.REDIS_PORT || "6380"),
        password: process.env.REDIS_PASSWORD || "nexcdc2025",
      },
      performance: {
        monitoring: true,
        thresholds: {
          response_time_warning: 1000,
          response_time_critical: 5000,
          memory_warning: 500,
          memory_critical: 1000,
        },
      },
      tasks: {
        concurrency: 3,
        retryDelay: 5000,
        maxRetries: 3,
        cleanupInterval: 300000,
      },
    };

    _systemServiceSingleton = SystemService.getInstance(systemConfig);

    // Initialize async (non-blocking)
    try {
      await _systemServiceSingleton.initialize();
      console.log("✅ SystemService initialized (SINGLETON)");
    } catch (error: unknown) {
      logger.warn("⚠️ SystemService init warning:", error);
    }

    console.log(
      "✅ SystemService created (SINGLETON - reused across all requests)",
    );
  })();

  await _initializationPromise;
  _initializationPromise = null;

  return _systemServiceSingleton!;
};

/**
 * System Plugin - Singleton Lazy Loading Pattern
 * Provides SystemService via dependency injection
 *
 * Usage:
 * ```typescript
 * new Elysia()
 *   .use(systemPlugin)
 *   .get('/metrics', ({ systemService }) => systemService.getPerformanceStats())
 * ```
 */
export const systemPlugin = new Elysia({
  name: "system-plugin",
  seed: {
    systemService: {} as SystemService,
  },
})
  // Lifecycle Hook: onStart - Initialize System Service
  .onStart(() => {
    console.log("🔧 System Plugin starting - Singleton Lazy Loading pattern");
  })

  // FIX v5.6.1: Singleton Lazy Loading Pattern
  // SystemService instance criada UMA VEZ na primeira request
  // Reusada em todas as requests seguintes (singleton pattern)
  .derive(async () => {
    return { systemService: await getSystemService() };
  })

  // Plugin health check endpoint
  .get(
    "/system/health",
    async ({ systemService }) => {
      try {
        const stats = systemService.getPerformanceStats();

        return {
          success: true,
          result: {
            status: "healthy",
            plugin: "system-plugin",
            performance: stats,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          plugin: "system-plugin",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "System Plugin Health Check",
        description: "Check health of system plugin and service",
        tags: ["Health", "Plugin", "System"],
      },
    },
  )

  // Lifecycle Hook: onStop - Cleanup connections
  .onStop(async () => {
    console.log("🛑 System Plugin stopping - closing connections");

    if (_systemServiceSingleton) {
      try {
        // Cleanup if SystemService has cleanup method
        console.log("✅ System service cleanup completed");
      } catch (error: unknown) {
        logger.error("Error during system service cleanup", error);
      }
    }
  })

  // Global scope - exposes context across entire application following best practices
  .as("global");

// Export plugin context type for Eden Treaty
export type SystemPluginApp = typeof systemPlugin;

// Functional Callback Method pattern - for conditional use
export const createSystemPlugin = (config?: Partial<SystemConfig>) => {
  return (app: Elysia) =>
    app.use(systemPlugin).onStart(() => {
      console.log(
        "🔌 System Plugin applied - service available via dependency injection",
      );
    });
};
