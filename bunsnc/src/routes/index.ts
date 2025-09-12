/**
 * Main Routes Entry Point - Integrated API Routes
 * Combines all route modules for the BunSNC application
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createApp } from "./app";
import { createNotificationRoutes, getRealtimeRoutes, shutdownNotificationSystem } from "./notifications";
import { backgroundSyncManager } from "../services/BackgroundSyncManager";
import { createGroupRoutes } from "./GroupRoutes";
import { createModalRoutes, createSSERoutes } from "./ModalRoutes";
import { performanceMonitoringService } from "../services/PerformanceMonitoringService";
import { cacheOptimizationService } from "../services/CacheOptimizationService";

export async function createMainApp(): Promise<Elysia> {
  const mainApp = new Elysia();

  // Add CORS support - Allow all origins
  mainApp.use(cors({
    origin: '*', // Allow ALL origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    allowedHeaders: ['*'],
    credentials: false, // Important: false when origin is '*'
    optionsSuccessStatus: 200,
    maxAge: 86400
  }));

  // Favicon endpoint - return 404 with proper CORS (must be before other routes)
  mainApp.get("/favicon.ico", ({ set }) => {
    set.status = 404;
    set.headers['content-type'] = 'text/plain';
    return "Favicon not found";
  });

  // Initialize background sync service asynchronously (don't block server startup)
  backgroundSyncManager.initialize()
    .then(() => {
      console.log('✅ Background sync service initialized');
    })
    .catch((error) => {
      console.error('❌ Failed to initialize background sync service:', error);
      console.warn('⚠️ Server will continue without background sync');
    });

  // Initialize performance monitoring service
  performanceMonitoringService.initialize()
    .then(() => {
      console.log('📊 Performance monitoring service initialized');
    })
    .catch((error) => {
      console.error('❌ Failed to initialize performance monitoring:', error);
      console.warn('⚠️ Server will continue without performance monitoring');
    });

  // Initialize cache optimization service
  cacheOptimizationService.initialize()
    .then(() => {
      console.log('🚀 Cache optimization service initialized');
    })
    .catch((error) => {
      console.error('❌ Failed to initialize cache optimization:', error);
      console.warn('⚠️ Server will continue without cache optimization');
    });

  // Add main API routes
  const app = await createApp();
  mainApp.use(app);

  // Add Groups API routes
  const groupRoutes = createGroupRoutes();
  mainApp.use(groupRoutes);

  // Add Modal routes (Enhanced Ticket Modal with SLA Tabs)
  const modalRoutes = createModalRoutes();
  mainApp.use(modalRoutes);
  
  // Add SSE routes for real-time updates
  const sseRoutes = createSSERoutes();
  mainApp.use(sseRoutes);

  // Add HTMX Dashboard routes
  try {
    console.log('🔄 Importing HTMX Dashboard modules...');
    const htmxDashboardClean = await import('../web/htmx-dashboard-clean');
    const htmxDashboardEnhanced = await import('../web/htmx-dashboard-enhanced');
    
    console.log('📦 Dashboard modules imported successfully');
    console.log('🔗 Adding clean dashboard routes...');
    mainApp.use(htmxDashboardClean.default);
    console.log('✅ Clean dashboard routes added');
    
    console.log('🔗 Adding enhanced dashboard routes...');
    mainApp.use(htmxDashboardEnhanced.default);
    console.log('✅ Enhanced dashboard routes added');
    
    console.log('✅ HTMX Dashboard routes added');
  } catch (error) {
    console.error('❌ Failed to load HTMX Dashboard routes:', error);
    console.error('❌ Error stack:', error.stack);
  }

  // Add notification routes
  const notificationRoutes = createNotificationRoutes();
  mainApp.use(notificationRoutes);

  // Add real-time routes (WebSocket and SSE)
  try {
    const realtimeRoutes = await getRealtimeRoutes();
    
    // WebSocket endpoint
    mainApp.use(realtimeRoutes.websocket);
    
    // SSE endpoints
    mainApp.use(realtimeRoutes.sse);
    
    console.log(' Real-time notification endpoints added');
  } catch (error) {
    console.warn('� Failed to add real-time endpoints:', error);
  }

  // Background sync management endpoints
  mainApp.group("/sync", (app) => 
    app
      .get("/status", async () => {
        try {
          return await backgroundSyncManager.getStatus();
        } catch (error) {
          return { error: error.message };
        }
      })
      .get("/stats", async () => {
        try {
          return await backgroundSyncManager.getDetailedStats();
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/start", async () => {
        try {
          await backgroundSyncManager.startSync();
          return { success: true, message: "Background sync started" };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })
      .post("/stop", async () => {
        try {
          await backgroundSyncManager.stopSync();
          return { success: true, message: "Background sync stopped" };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })
      .post("/force", async ({ body }) => {
        try {
          const { ticketTypes } = body as any;
          await backgroundSyncManager.forceSync(ticketTypes);
          return { success: true, message: "Force sync completed" };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })
      .get("/troubleshoot", async () => {
        try {
          return await backgroundSyncManager.troubleshoot();
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/optimize", async () => {
        try {
          await backgroundSyncManager.optimizePerformance();
          return { success: true, message: "Performance optimization completed" };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })
  );

  // Performance monitoring endpoints
  mainApp.group("/performance", (app) =>
    app
      .get("/stats", async ({ query }) => {
        try {
          const timeRange = query.hours ? parseInt(query.hours as string) : 24;
          return await performanceMonitoringService.getPerformanceStats(timeRange);
        } catch (error) {
          return { error: error.message };
        }
      })
      .get("/memory", () => {
        return performanceMonitoringService.getMemoryUsage();
      })
      .post("/thresholds", async ({ body }) => {
        try {
          performanceMonitoringService.updateThresholds(body);
          return { status: "Thresholds updated successfully" };
        } catch (error) {
          return { error: error.message };
        }
      })
  );

  // Cache optimization endpoints
  mainApp.group("/cache", (app) =>
    app
      .get("/stats", () => {
        return cacheOptimizationService.getCacheStats();
      })
      .post("/warmup", async ({ body }) => {
        try {
          const strategy = body?.strategy || 'medium';
          await cacheOptimizationService.triggerWarmup(strategy);
          return { status: `Cache warmup initiated with ${strategy} strategy` };
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/invalidate", async ({ body }) => {
        try {
          await cacheOptimizationService.invalidatePattern(body.pattern);
          return { status: `Cache pattern ${body.pattern} invalidated` };
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/preload/:table/:sysId", async ({ params, body }) => {
        try {
          const priority = body?.priority || 'medium';
          await cacheOptimizationService.preloadTicketWithStrategy(
            params.sysId, 
            params.table, 
            priority
          );
          return { status: `Preload initiated for ${params.table}/${params.sysId}` };
        } catch (error) {
          return { error: error.message };
        }
      })
  );

  // Health check endpoint
  mainApp.get("/health", async () => {
    const syncStatus = await backgroundSyncManager.getStatus();
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        api: "ready",
        notifications: "ready",
        background_sync: syncStatus.initialized ? (syncStatus.running ? "running" : "ready") : "disabled"
      }
    };
  });

  // Root endpoint - redirect to enhanced dashboard
  mainApp.get("/", ({ set }) => {
    set.status = 302;
    set.headers['location'] = '/enhanced/';
    return;
  });

  // Dashboard redirect
  mainApp.get("/dashboard", ({ set }) => {
    set.redirect = "/enhanced/";
    return;
  });

  // API info endpoint
  mainApp.get("/api", () => ({
    name: "BunSNC API",
    version: "1.0.0",
    description: "ServiceNow Integration API with Real-time Notifications and Background Sync",
    endpoints: {
      records: "/record/:table",
      batch: "/batch",
      attachments: "/attachment/:table/:sysId",
      groups: "/api/groups",
      notifications: "/notifications/*",
      websocket: "/ws",
      sse: "/events/*",
      sync: "/sync/*",
      health: "/health"
    },
    background_sync: {
      status: "/sync/status",
      stats: "/sync/stats",
      start: "POST /sync/start",
      stop: "POST /sync/stop",
      force: "POST /sync/force",
      troubleshoot: "/sync/troubleshoot",
      optimize: "POST /sync/optimize"
    },
    dashboard: {
      enhanced: "/enhanced/",
      clean: "/clean/",
      redirect: "/dashboard"
    },
    author: "Juliano Stefano <jsdealencar@ayesa.com> [2025]"
  }));

  // Error handler
  mainApp.onError(({ error, code, set }) => {
    console.error('API Error:', error);
    
    if (code === 'VALIDATION') {
      set.status = 400;
      return { error: 'Validation failed', details: error.message };
    }
    
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Endpoint not found' };
    }
    
    set.status = 500;
    return { error: 'Internal server error', message: error.message };
  });

  return mainApp;
}

// Graceful shutdown handler
export async function gracefulShutdown(): Promise<void> {
  console.log("🛑 Shutting down BunSNC server...");
  
  try {
    // Stop background sync first
    console.log("🔄 Stopping background sync service...");
    await backgroundSyncManager.stopSync();
    console.log("✅ Background sync service stopped");

    // Stop notification system
    await shutdownNotificationSystem();
    console.log("✅ Graceful shutdown completed");
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);