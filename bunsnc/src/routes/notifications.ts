/**
 * Notification System Routes - Real-time Notifications
 * Provides WebSocket, SSE, and notification management endpoints
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { NotificationManager, NotificationManagerConfig } from "../notifications/NotificationManager";
import { 
  NotificationChannel, 
  NotificationPriority, 
  NotificationType 
} from "../notifications/NotificationTypes";

let notificationManager: NotificationManager | null = null;

// Default configuration
const defaultConfig: NotificationManagerConfig = {
  queue: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    },
    queue: {
      maxSize: 10000,
      retryDelays: [1000, 5000, 15000, 60000, 300000],
      maxRetries: 5,
      cleanupInterval: 300000,
      processingInterval: 1000
    },
    rateLimits: {
      perMinute: 100,
      perHour: 1000,
      burstSize: 10
    }
  },
  websocket: {
    maxConnections: 1000,
    heartbeatInterval: 30000,
    idleTimeout: 300000,
    maxMessageSize: 65536,
    rateLimits: {
      messagesPerMinute: 60,
      connectionsPerIP: 10
    }
  },
  sse: {
    maxStreams: 500,
    heartbeatInterval: 30000,
    maxEventSize: 65536,
    retryInterval: 5000,
    enableCompression: true,
    rateLimits: {
      eventsPerMinute: 100,
      connectionsPerIP: 5
    }
  },
  push: {
    enabled: false,
    maxSubscriptions: 1000
  },
  email: {
    enabled: false
  },
  webhook: {
    enabled: true,
    timeout: 10000,
    maxRetries: 3
  }
};

// Initialize notification manager
async function getNotificationManager(): Promise<NotificationManager> {
  if (!notificationManager) {
    notificationManager = new NotificationManager(defaultConfig);
    
    // Start the notification manager
    try {
      await notificationManager.start();
      console.log('✅ Notification system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize notification system:', error);
      throw error;
    }
  }
  
  return notificationManager;
}

// Create notification routes
export function createNotificationRoutes(): Elysia {
  const app = new Elysia({ prefix: "/notifications" });

  // Initialize notification manager on first request
  app.derive(async () => {
    const manager = await getNotificationManager();
    return { notificationManager: manager };
  });

  // Send a custom notification
  app.post("/send", async ({ body, notificationManager }) => {
    try {
      const queueId = await notificationManager.notify(body.notification, body.channels);
      
      return {
        success: true,
        queueId,
        message: "Notification queued successfully"
      };
    } catch (error) {
      console.error('Failed to send notification:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }, {
    body: t.Object({
      notification: t.Object({
        id: t.String(),
        type: t.String(),
        timestamp: t.String(),
        source: t.String(),
        priority: t.String(),
        channels: t.Array(t.String()),
        data: t.Any(),
        metadata: t.Optional(t.Record(t.String(), t.Any()))
      }),
      channels: t.Optional(t.Array(t.String()))
    })
  });

  // Send task notification
  app.post("/task", async ({ body, notificationManager }) => {
    try {
      const queueId = await notificationManager.notifyTask(body);
      
      return {
        success: true,
        queueId,
        message: "Task notification sent"
      };
    } catch (error) {
      console.error('Failed to send task notification:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }, {
    body: t.Object({
      taskId: t.String(),
      taskType: t.String(),
      status: t.String(),
      progress: t.Optional(t.Number()),
      result: t.Optional(t.Any()),
      error: t.Optional(t.String()),
      estimatedCompletion: t.Optional(t.String()),
      duration: t.Optional(t.Number())
    })
  });

  // Send system notification
  app.post("/system", async ({ body, notificationManager }) => {
    try {
      const queueId = await notificationManager.notifySystem(body);
      
      return {
        success: true,
        queueId,
        message: "System notification sent"
      };
    } catch (error) {
      console.error('Failed to send system notification:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }, {
    body: t.Object({
      component: t.String(),
      message: t.String(),
      details: t.Optional(t.Any()),
      metrics: t.Optional(t.Any()),
      healthStatus: t.Optional(t.Union([
        t.Literal('healthy'),
        t.Literal('degraded'),
        t.Literal('unhealthy')
      ]))
    })
  });

  // Send ServiceNow notification
  app.post("/servicenow", async ({ body, notificationManager }) => {
    try {
      const queueId = await notificationManager.notifyServiceNow(body);
      
      return {
        success: true,
        queueId,
        message: "ServiceNow notification sent"
      };
    } catch (error) {
      console.error('Failed to send ServiceNow notification:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }, {
    body: t.Object({
      recordId: t.Optional(t.String()),
      recordNumber: t.Optional(t.String()),
      tableName: t.String(),
      action: t.Union([
        t.Literal('created'),
        t.Literal('updated'),
        t.Literal('deleted'),
        t.Literal('connected'),
        t.Literal('disconnected')
      ]),
      recordData: t.Optional(t.Any()),
      connectionStatus: t.Optional(t.Union([
        t.Literal('connected'),
        t.Literal('disconnected'),
        t.Literal('error')
      ])),
      instance: t.Optional(t.String())
    })
  });

  // Send performance notification
  app.post("/performance", async ({ body, notificationManager }) => {
    try {
      const queueId = await notificationManager.notifyPerformance(body);
      
      return {
        success: true,
        queueId,
        message: "Performance notification sent"
      };
    } catch (error) {
      console.error('Failed to send performance notification:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }, {
    body: t.Object({
      metric: t.String(),
      currentValue: t.Number(),
      threshold: t.Number(),
      trend: t.Union([
        t.Literal('increasing'),
        t.Literal('decreasing'),
        t.Literal('stable')
      ]),
      impact: t.Union([
        t.Literal('low'),
        t.Literal('medium'),
        t.Literal('high'),
        t.Literal('critical')
      ]),
      recommendedAction: t.Optional(t.String())
    })
  });

  // Send security notification
  app.post("/security", async ({ body, notificationManager }) => {
    try {
      const queueId = await notificationManager.notifySecurity(body.data, body.eventType);
      
      return {
        success: true,
        queueId,
        message: "Security notification sent"
      };
    } catch (error) {
      console.error('Failed to send security notification:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  }, {
    body: t.Object({
      eventType: t.Union([
        t.Literal('alert'),
        t.Literal('success'),
        t.Literal('failure'),
        t.Literal('denied')
      ]),
      data: t.Object({
        userId: t.Optional(t.String()),
        clientIp: t.Optional(t.String()),
        userAgent: t.Optional(t.String()),
        endpoint: t.Optional(t.String()),
        method: t.Optional(t.String()),
        reason: t.Optional(t.String()),
        riskScore: t.Optional(t.Number()),
        countryCode: t.Optional(t.String())
      })
    })
  });

  // Get notification statistics
  app.get("/stats", async ({ notificationManager }) => {
    try {
      const stats = await notificationManager.getStats();
      return stats;
    } catch (error) {
      console.error('Failed to get notification stats:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  });

  // Get system health
  app.get("/health", async ({ notificationManager }) => {
    try {
      const health = notificationManager.getHealthStatus();
      return health;
    } catch (error) {
      console.error('Failed to get health status:', error);
      return Response.json({ 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  });

  // Get available notification types and channels
  app.get("/config", () => {
    return {
      types: Object.values(NotificationType),
      priorities: Object.values(NotificationPriority),
      channels: Object.values(NotificationChannel)
    };
  });

  return app;
}

// Function to integrate WebSocket and SSE routes
export async function getRealtimeRoutes(): Promise<{ websocket: unknown; sse: unknown }> {
  const manager = await getNotificationManager();
  return manager.getElysiaRoutes();
}

// Export for cleanup on shutdown
export async function shutdownNotificationSystem(): Promise<void> {
  if (notificationManager) {
    await notificationManager.stop();
    notificationManager = null;
    console.log('🔴 Notification system shut down');
  }
}