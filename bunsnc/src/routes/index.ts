/**
 * Main Routes Entry Point - Integrated API Routes
 * Combines all route modules for the BunSNC application
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import app from "./app";
import { createNotificationRoutes, getRealtimeRoutes, shutdownNotificationSystem } from "./notifications";

export async function createMainApp(): Promise<Elysia> {
  const mainApp = new Elysia();

  // Add CORS support
  mainApp.use(cors({
    origin: true,
    credentials: true
  }));

  // Add main API routes
  mainApp.use(app);

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
    console.warn('  Failed to add real-time endpoints:', error);
  }

  // Health check endpoint
  mainApp.get("/health", () => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      api: "ready",
      notifications: "ready"
    }
  }));

  // API info endpoint
  mainApp.get("/", () => ({
    name: "BunSNC API",
    version: "1.0.0",
    description: "ServiceNow Integration API with Real-time Notifications",
    endpoints: {
      records: "/record/:table",
      batch: "/batch",
      attachments: "/attachment/:table/:sysId",
      notifications: "/notifications/*",
      websocket: "/ws",
      sse: "/events/*",
      health: "/health"
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
  console.log('= Shutting down BunSNC server...');
  
  try {
    await shutdownNotificationSystem();
    console.log(' Graceful shutdown completed');
  } catch (error) {
    console.error('L Error during shutdown:', error);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);