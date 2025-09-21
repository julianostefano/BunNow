/**
 * Notification System Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { NotificationManagerConfig } from "../notifications/NotificationManager";

export const getNotificationConfig = (): NotificationManagerConfig => {
  return {
    queue: {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || "0"),
      },
      queue: {
        maxSize: parseInt(process.env.NOTIFICATION_QUEUE_SIZE || "10000"),
        retryDelays: [1000, 5000, 15000, 60000, 300000],
        maxRetries: parseInt(process.env.NOTIFICATION_MAX_RETRIES || "5"),
        cleanupInterval: parseInt(
          process.env.NOTIFICATION_CLEANUP_INTERVAL || "300000",
        ),
        processingInterval: parseInt(
          process.env.NOTIFICATION_PROCESSING_INTERVAL || "1000",
        ),
      },
      rateLimits: {
        perMinute: parseInt(
          process.env.NOTIFICATION_RATE_LIMIT_MINUTE || "100",
        ),
        perHour: parseInt(process.env.NOTIFICATION_RATE_LIMIT_HOUR || "1000"),
        burstSize: parseInt(process.env.NOTIFICATION_BURST_SIZE || "10"),
      },
    },
    websocket: {
      maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || "1000"),
      heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || "30000"),
      idleTimeout: parseInt(process.env.WS_IDLE_TIMEOUT || "300000"),
      maxMessageSize: parseInt(process.env.WS_MAX_MESSAGE_SIZE || "65536"),
      rateLimits: {
        messagesPerMinute: parseInt(process.env.WS_RATE_LIMIT_MINUTE || "60"),
        connectionsPerIP: parseInt(process.env.WS_CONNECTIONS_PER_IP || "10"),
      },
    },
    sse: {
      maxStreams: parseInt(process.env.SSE_MAX_STREAMS || "500"),
      heartbeatInterval: parseInt(
        process.env.SSE_HEARTBEAT_INTERVAL || "30000",
      ),
      maxEventSize: parseInt(process.env.SSE_MAX_EVENT_SIZE || "65536"),
      retryInterval: parseInt(process.env.SSE_RETRY_INTERVAL || "5000"),
      enableCompression: process.env.SSE_COMPRESSION === "true",
      rateLimits: {
        eventsPerMinute: parseInt(process.env.SSE_RATE_LIMIT_MINUTE || "100"),
        connectionsPerIP: parseInt(process.env.SSE_CONNECTIONS_PER_IP || "5"),
      },
    },
    push: {
      enabled: process.env.PUSH_ENABLED === "true",
      vapidKeys:
        process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
          ? {
              publicKey: process.env.VAPID_PUBLIC_KEY,
              privateKey: process.env.VAPID_PRIVATE_KEY,
            }
          : undefined,
      maxSubscriptions: parseInt(process.env.PUSH_MAX_SUBSCRIPTIONS || "1000"),
    },
    email: {
      enabled: process.env.EMAIL_ENABLED === "true",
      smtp: process.env.SMTP_HOST
        ? {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: process.env.SMTP_SECURE === "true",
            auth:
              process.env.SMTP_USER && process.env.SMTP_PASS
                ? {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                  }
                : undefined,
          }
        : undefined,
    },
    webhook: {
      enabled: process.env.WEBHOOK_ENABLED !== "false",
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT || "10000"),
      maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || "3"),
    },
  };
};
