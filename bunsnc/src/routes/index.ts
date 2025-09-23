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
// BackgroundSyncManager consolidated into ConsolidatedDataService
import { createGroupRoutes } from "./GroupRoutes";
import { createModalRoutes, createSSERoutes } from "./ModalRoutes";
import { createSystemService, SystemConfig } from "../services/SystemService";
import { MongoClient } from "mongodb";

export async function createMainApp(): Promise<Elysia> {
  const mainApp = new Elysia();

  // Add CORS support - Allow all origins
  mainApp.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // Favicon endpoint - return 404 with proper CORS (must be before other routes)
  mainApp.get("/favicon.ico", ({ set }) => {
    set.status = 404;
    set.headers["content-type"] = "text/plain";
    return "Favicon not found";
  });

  // Background sync functionality consolidated into ConsolidatedDataService
  // Initialized via WebServerController.ts

  // Initialize system service (includes performance monitoring and cache optimization)
  try {
    const mongoClient = new MongoClient(
      process.env.MONGODB_URL || "mongodb://localhost:27018",
    );
    const systemConfig: SystemConfig = {
      mongodb: {
        client: mongoClient,
        database: process.env.MONGODB_DATABASE || "bunsnc",
      },
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
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

    const systemService = createSystemService(systemConfig);
    systemService
      .initialize()
      .then(() => {
        console.log(
          " System service initialized (performance monitoring + cache optimization)",
        );
      })
      .catch((error) => {
        console.error(" Failed to initialize system service:", error);
        console.warn(" Server will continue without system monitoring");
      });
  } catch (error: unknown) {
    console.error(" Failed to create system service:", error);
    console.warn(" Server will continue without system monitoring");
  }

  // Add main application routes with error handling
  try {
    const appRoutes = await createApp();
    mainApp.use(appRoutes);
    console.log(" Main application routes added");
  } catch (error: unknown) {
    console.error(" Failed to add main application routes:", error);
    throw error;
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

  // Add real-time endpoints with error handling
  try {
    const realtimeRoutes = getRealtimeRoutes();
    mainApp.use(realtimeRoutes);
    console.log(" Real-time endpoints added");
  } catch (error: unknown) {
    console.error(" Failed to add real-time endpoints:", error);
    console.warn(" Server will continue without real-time functionality");
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

  // Performance monitoring endpoints
  mainApp.group("/monitoring", (app) =>
    app
      .get("/performance", async () => {
        try {
          return await systemService.getCurrentMetrics();
        } catch (error: unknown) {
          return { error: error.message };
        }
      })
      .get("/performance/detailed", async () => {
        try {
          return await systemService.getDetailedReport();
        } catch (error: unknown) {
          return { error: error.message };
        }
      })
      .get("/cache", async () => {
        try {
          return await systemService.getCacheStats();
        } catch (error: unknown) {
          return { error: error.message };
        }
      })
      .post("/cache/optimize", async () => {
        try {
          await cacheOptimizationService.optimizeCache();
          return { success: true, message: "Cache optimization completed" };
        } catch (error: unknown) {
          return { success: false, error: error.message };
        }
      })
      .post("/cache/clear", async () => {
        try {
          await cacheOptimizationService.clearCache();
          return { success: true, message: "Cache cleared successfully" };
        } catch (error: unknown) {
          return { success: false, error: error.message };
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
