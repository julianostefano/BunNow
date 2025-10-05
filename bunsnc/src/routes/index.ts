/**
 * Main Routes Entry Point - Integrated API Routes
 * Combines all route modules for the BunSNC application
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createApp } from "./app";
import {
  createNotificationRoutes,
  getRealtimeRoutes,
  shutdownNotificationSystem,
} from "./notifications";
import { createGroupRoutes } from "./GroupRoutes";
import { createModalRoutes, createSSERoutes } from "./ModalRoutes";
import { systemPlugin } from "../plugins/system";
import { serviceNowProxyRoutes } from "../modules/servicenow-proxy";

// Plugin System Integration
import {
  createWebPluginComposition,
  type ConsolidatedPluginContext,
} from "../plugins";

export async function createMainApp(): Promise<Elysia> {
  const mainApp = new Elysia();

  // FIX v5.5.22: Add OpenTelemetry instrumentation plugin (FIRST)
  // Must be loaded before other plugins to trace all HTTP requests
  // Reference: CRITICAL-2 from COMPLETE_CODEBASE_ANALYSIS.md
  const { instrumentation } = await import("../instrumentation");
  mainApp.use(instrumentation);
  console.log("📊 OpenTelemetry HTTP tracing enabled");

  // Integrate Plugin System - All 8 plugins with dependency injection
  mainApp.use(
    createWebPluginComposition({
      enableHealthChecks: true,
      enableMetrics: true,
      pluginConfig: {
        serviceNow: {
          instanceUrl: process.env.SERVICENOW_INSTANCE_URL,
          username: process.env.SERVICENOW_USERNAME,
          password: process.env.SERVICENOW_PASSWORD,
        },
        redis: {
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6379"),
          password: process.env.REDIS_PASSWORD,
        },
        mongodb: {
          url: process.env.MONGODB_URL || "mongodb://localhost:27018",
          database: process.env.MONGODB_DATABASE || "bunsnc",
        },
      },
    }),
  );

  // Add CORS support - Allow all origins
  mainApp.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // Favicon endpoint - return 204 No Content (FIX v5.5.16)
  mainApp.get("/favicon.ico", ({ set }) => {
    set.status = 204;
    return null;
  });

  // Background sync functionality consolidated into ConsolidatedDataService
  // Initialized via WebServerController.ts

  // FIX v5.5.21: SystemService now initialized via systemPlugin (ElysiaJS best practice)
  // Root cause: Local variable creation didn't initialize Singleton
  // Solution: systemPlugin with .derive() provides proper DI
  // See: src/plugins/system.ts, src/web/ui/routes/streaming-metrics.routes.ts

  // Add NEW UI Dashboard v2.0 (Corporate Clean Design)
  try {
    const { default: uiApp } = await import("../web/ui/index");
    mainApp.use(uiApp);
    console.log(
      "✨ BunSNC Dashboard v2.0 added at /ui (Corporate Clean Design)",
    );
  } catch (error: unknown) {
    console.error("⚠️ Failed to add UI Dashboard v2.0:", error);
    console.warn("⚠️ Server will continue without UI v2.0");
  }

  // FIX v5.5.24: SSE streaming metrics endpoint now uses lazy loading pattern
  // Removed static import - see line ~345 for lazy-loaded implementation

  // FIX v5.5.15: Legacy HTMX Dashboard temporarily disabled
  // Root cause: Top-level import of ServiceNowAuthClient causes context conflicts
  // Will be re-enabled after refactoring to use Dependency Injection
  // See docs/ELYSIA_BEST_PRACTICES.md - "Anti-pattern: Top-Level Service Initialization"
  //
  // // Add Legacy HTMX Dashboard routes (keeping for backward compatibility)
  // try {
  //   const { htmxDashboardClean } = await import("../web/htmx-dashboard-clean");
  //   mainApp.use(htmxDashboardClean);
  //   console.log("📊 Legacy HTMX Dashboard added at /clean");
  // } catch (error: unknown) {
  //   console.error("⚠️ Failed to add legacy dashboard:", error);
  //   console.warn("⚠️ Server will continue without legacy dashboard");
  // }

  // Add root redirect to NEW dashboard v2.0
  // FIX v5.5.14: Use Response object to avoid HEAD request TypeError (_res.headers.set)
  // FIX v5.5.15: Add fallback for when dashboard is unavailable
  mainApp.get("/", ({ redirect, set }) => {
    try {
      return redirect("/ui", 302);
    } catch (error) {
      set.status = 503;
      set.headers["content-type"] = "text/html; charset=utf-8";
      return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BunSNC - Manutenção</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white">
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="text-center max-w-md">
      <h1 class="text-3xl font-bold mb-4">Dashboard v2.0 em Manutenção</h1>
      <p class="text-gray-400 mb-6">O novo dashboard está sendo corrigido. Por favor, tente novamente em breve.</p>
      <div class="space-y-3">
        <a href="/health" class="block bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-lg transition">
          Verificar Status da API
        </a>
        <p class="text-sm text-gray-500">Erro: ${(error as Error).message}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
    }
  });

  // FIX v5.5.20: Removed pre-initialization - authPlugin handles lazy loading via .derive()
  // Plugin pattern is the ElysiaJS best practice for service management

  // Add main application routes with error handling
  try {
    console.log("🔍 [DEBUG] Calling createApp()...");
    const appRoutes = await createApp();
    console.log("🔍 [DEBUG] createApp() returned successfully");
    mainApp.use(appRoutes);
    console.log(" Main application routes added");
  } catch (error: unknown) {
    console.error(" Failed to add main application routes:", error);
    throw error;
  }

  // Add ServiceNow proxy routes (CRITICAL FIX for self-referencing calls)
  try {
    mainApp.use(serviceNowProxyRoutes);
    console.log(
      "🌉 ServiceNow proxy routes added - self-referencing calls resolved",
    );
  } catch (error: unknown) {
    console.error(" Failed to add ServiceNow proxy routes:", error);
    console.warn(" Server will continue but self-referencing calls will fail");
  }

  // Add notification routes (SSE, WebSocket) with error handling
  try {
    const notificationRoutes = createNotificationRoutes();
    mainApp.use(notificationRoutes);
    console.log(" Notification routes added");
  } catch (error: unknown) {
    console.error(" Failed to add notification routes:", error);
    console.warn(" Server will continue without notifications");
  }

  // Add SSE and Modal routes with error handling
  try {
    mainApp.use(createSSERoutes());
    mainApp.use(createModalRoutes());
    console.log(" SSE and Modal routes added");
  } catch (error: unknown) {
    console.error(" Failed to add SSE/Modal routes:", error);
    console.warn(" Server will continue without SSE/Modal functionality");
  }

  // Real-time routes - WebSocket and SSE (Elysia Best Practice: "1 instance = 1 controller")
  try {
    const { getWebSocketRoutes, getSSERoutes } = await import(
      "./notifications"
    );

    const wsRoutes = await getWebSocketRoutes(); // ✅ Returns Elysia instance
    const sseRoutes = await getSSERoutes(); // ✅ Returns Elysia instance

    mainApp.use(wsRoutes); // ✅ "1 instance = 1 controller"
    mainApp.use(sseRoutes); // ✅ "1 instance = 1 controller"

    console.log("🔌 Real-time endpoints added (WebSocket + SSE)");
  } catch (error: unknown) {
    console.error("⚠️ Failed to add real-time endpoints:", error);
    console.warn("⚠️ Server will continue without real-time functionality");
  }

  // Background sync management endpoints (deprecated - moved to ConsolidatedDataService)
  mainApp.group("/sync", (app) =>
    app
      .get("/status", async () => {
        return {
          status: "consolidated",
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      })
      .get("/stats", async () => {
        return {
          status: "consolidated",
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      })
      .post("/start", async () => {
        return {
          success: false,
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      })
      .post("/stop", async () => {
        return {
          success: false,
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      })
      .post("/force", async () => {
        return {
          success: false,
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      })
      .get("/troubleshoot", async () => {
        return {
          status: "consolidated",
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      })
      .post("/optimize", async () => {
        return {
          success: false,
          message: "Sync functionality moved to ConsolidatedDataService",
          deprecated: true,
        };
      }),
  );

  // Performance monitoring endpoints - Using systemPlugin for DI
  mainApp.use(systemPlugin).group("/monitoring", (app) =>
    app
      .get("/performance", async ({ systemService }) => {
        try {
          return await systemService.getPerformanceStats(24);
        } catch (error: unknown) {
          return { error: error.message };
        }
      })
      .get("/performance/detailed", async ({ systemService }) => {
        try {
          return await systemService.getSystemStats();
        } catch (error: unknown) {
          return { error: error.message };
        }
      })
      .get("/cache", async ({ systemService }) => {
        try {
          const memUsage = systemService.getMemoryUsage();
          return {
            memory: memUsage,
            status: "ok",
            message: "Cache stats available via systemService",
          };
        } catch (error: unknown) {
          return { error: error.message };
        }
      })
      .get("/health", async ({ systemService }) => {
        try {
          return await systemService.getSystemHealth();
        } catch (error: unknown) {
          return { error: error.message };
        }
      }),
  );

  // Health check endpoint
  mainApp.get("/health", async () => {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        api: "ready",
        notifications: "ready",
        background_sync: "consolidated_into_hybrid_data_service",
      },
    };
  });

  // FIX v5.5.24: Lazy-loaded SSE streaming metrics endpoint
  // Root cause: Module loading race condition when importing streaming-metrics at startup
  // Solution: Import dynamically only when endpoint is accessed (eliminates race condition)
  // Reference: docs/reports/STREAMING_METRICS_DEADLOCK_FIX_v5.5.24.md
  mainApp.get("/api/streaming/metrics", async function* (context) {
    try {
      // Dynamic import apenas quando endpoint é acessado (evita race condition)
      const { streamingMetricsRoutes } = await import(
        "../web/ui/routes/streaming-metrics.routes"
      );

      // Extract the SSE handler from the imported route module
      const metricsRoute = streamingMetricsRoutes.routes.find(
        (r: any) => r.path === "/api/streaming/metrics"
      );

      if (!metricsRoute || !metricsRoute.handler) {
        throw new Error("Streaming metrics handler not found in route module");
      }

      // Delegate to the actual SSE handler with proper context binding
      yield* metricsRoute.handler.call(this, context);
    } catch (error: unknown) {
      console.error("❌ Streaming metrics error:", error);

      // Yield error event in SSE format
      yield {
        event: "error",
        data: JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        }),
      };
    }
  });

  // Test endpoint for SSE metrics availability
  mainApp.get("/api/streaming/metrics/test", () => {
    return {
      status: "ok",
      message: "SSE metrics endpoint available (lazy-loaded pattern)",
      endpoint: "/api/streaming/metrics",
      pattern: "Lazy Loading Pattern (import on first access)",
      streamType: "dashboard-metrics",
      timestamp: new Date().toISOString(),
    };
  });

  console.log("📡 SSE streaming metrics endpoint added (lazy-loaded pattern)");

  // Add group management routes with error handling
  try {
    const groupRoutes = createGroupRoutes();
    mainApp.use(groupRoutes);
    console.log(" Group management routes added");
  } catch (error: unknown) {
    console.error(" Failed to add group routes:", error);
    console.warn(" Server will continue without group management");
  }

  console.log("🎯 BunSNC main application initialized successfully");

  // Initialize deferred cache warming after server is ready
  setImmediate(async () => {
    try {
      console.warn(
        "⚠️ [Cache Warmup] ServiceNow queries may timeout after 61s",
      );
      console.warn(
        "⚠️ This is expected and does not affect main functionality",
      );
      console.warn("⚠️ See docs/progresso*61s* for details");

      const { serviceNowAuthClient } = await import(
        "../services/ServiceNowAuthClient"
      );
      await serviceNowAuthClient.initializeCacheWarming();
    } catch (error) {
      console.warn("⚠️ Failed to initialize deferred cache warming:", error);
    }
  });

  return mainApp;
}

// Graceful shutdown handler
export async function gracefulShutdown(): Promise<void> {
  console.log(" Shutting down BunSNC server...");

  try {
    // Sync functionality moved to ConsolidatedDataService (handled by WebServerController)
    console.log(" Background sync handled by ConsolidatedDataService");

    // Stop notification system
    await shutdownNotificationSystem();
    console.log(" Graceful shutdown completed");
  } catch (error: unknown) {
    console.error(" Error during shutdown:", error);
  }
}
