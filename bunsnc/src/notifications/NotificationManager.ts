/**
 * Notification Manager - Central Notification Orchestrator
 * Coordinates WebSocket, SSE, Push, and other notification channels
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import {
  NotificationQueue,
  NotificationQueueOptions,
} from "./NotificationQueue";
import { WebSocketServer, WebSocketServerOptions } from "./WebSocketServer";
import { SSEManager, SSEManagerOptions } from "./SSEManager";
import {
  Notification,
  NotificationChannel,
  NotificationConfig,
  NotificationStats,
  NotificationType,
  NotificationPriority,
  TaskNotification,
  SystemNotification,
  ServiceNowNotification,
  DataProcessingNotification,
  PerformanceNotification,
  SecurityNotification,
} from "./NotificationTypes";

export interface NotificationManagerConfig {
  queue: NotificationQueueOptions;
  websocket: WebSocketServerOptions;
  sse: SSEManagerOptions;
  push: {
    enabled: boolean;
    vapidKeys?: {
      publicKey: string;
      privateKey: string;
    };
    maxSubscriptions: number;
  };
  email: {
    enabled: boolean;
    smtp?: {
      host: string;
      port: number;
      secure: boolean;
      auth?: {
        user: string;
        pass: string;
      };
    };
  };
  webhook: {
    enabled: boolean;
    timeout: number;
    maxRetries: number;
  };
}

export class NotificationManager extends EventEmitter {
  private config: NotificationManagerConfig;
  private queue: NotificationQueue;
  private webSocketServer: WebSocketServer;
  private sseManager: SSEManager;
  private isRunning: boolean = false;
  private stats: NotificationStats;

  // Performance tracking
  private startTime: Date;
  private totalNotifications: number = 0;
  private successfulDeliveries: number = 0;
  private failedDeliveries: number = 0;

  constructor(config: NotificationManagerConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
    this.initializeStats();
    this.initializeComponents();
    this.setupEventHandlers();
  }

  private initializeStats(): void {
    this.stats = {
      total: {
        sent: 0,
        failed: 0,
        pending: 0,
      },
      byChannel: {},
      byType: {},
      byPriority: {
        [NotificationPriority.CRITICAL]: 0,
        [NotificationPriority.HIGH]: 0,
        [NotificationPriority.MEDIUM]: 0,
        [NotificationPriority.LOW]: 0,
        [NotificationPriority.INFO]: 0,
      },
      connections: {
        websocket: 0,
        sse: 0,
        push: 0,
      },
      performance: {
        avgProcessingTime: 0,
        queueSize: 0,
        errorRate: 0,
      },
    };
  }

  private initializeComponents(): void {
    // Initialize notification queue
    this.queue = new NotificationQueue(this.config.queue);

    // Initialize WebSocket server
    this.webSocketServer = new WebSocketServer(this.config.websocket);

    // Initialize SSE manager
    this.sseManager = new SSEManager(this.config.sse);
  }

  private setupEventHandlers(): void {
    // Queue event handlers
    this.queue.on("enqueued", (queueItem) => {
      this.stats.total.pending++;
      this.emit("notification_queued", queueItem);
    });

    this.queue.on("delivered", ({ notification, channel }) => {
      this.updateDeliveryStats(notification, channel, true);
      this.emit("notification_delivered", { notification, channel });
    });

    this.queue.on("delivery_failed", ({ notification, channel, error }) => {
      this.updateDeliveryStats(notification, channel, false);
      this.emit("notification_failed", { notification, channel, error });
    });

    this.queue.on("completed", ({ queueItem, duration }) => {
      this.stats.total.pending--;
      this.updatePerformanceStats(duration);
      this.emit("notification_completed", { queueItem, duration });
    });

    // WebSocket delivery handlers
    this.queue.on("websocket_deliver", (notification) => {
      this.webSocketServer.broadcast(notification);
    });

    // SSE delivery handlers
    this.queue.on("sse_deliver", (notification) => {
      this.sseManager.broadcast(notification);
    });

    // Push notification handlers
    this.queue.on("push_deliver", (notification) => {
      this.handlePushNotification(notification);
    });

    // Email handlers
    this.queue.on("email_deliver", (notification) => {
      this.handleEmailNotification(notification);
    });

    // Webhook handlers
    this.queue.on("webhook_deliver", (notification) => {
      this.handleWebhookNotification(notification);
    });

    // Database handlers
    this.queue.on("database_deliver", (notification) => {
      this.handleDatabaseNotification(notification);
    });

    // WebSocket server events
    this.webSocketServer.on("client_connected", ({ clientId }) => {
      this.stats.connections.websocket++;
      this.emit("websocket_client_connected", { clientId });
    });

    this.webSocketServer.on("client_disconnected", ({ clientId }) => {
      this.stats.connections.websocket--;
      this.emit("websocket_client_disconnected", { clientId });
    });

    // SSE manager events
    this.sseManager.on(
      "stream_connected",
      ({ streamId, clientId, channels }) => {
        this.stats.connections.sse++;
        this.emit("sse_stream_connected", { streamId, clientId, channels });
      },
    );

    this.sseManager.on("stream_disconnected", ({ streamId }) => {
      this.stats.connections.sse--;
      this.emit("sse_stream_disconnected", { streamId });
    });
  }

  /**
   * Start the notification manager and all components
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Notification manager is already running");
    }

    try {
      console.log("Starting notification manager...");

      // Start notification queue
      await this.queue.start();
      console.log("✓ Notification queue started");

      // Start WebSocket server
      await this.webSocketServer.start();
      console.log("✓ WebSocket server started");

      // Start SSE manager
      await this.sseManager.start();
      console.log("✓ SSE manager started");

      this.isRunning = true;
      this.startTime = new Date();

      console.log(" Notification manager started successfully");
      this.emit("started");
    } catch (error) {
      console.error("Failed to start notification manager:", error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the notification manager and all components
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log("Stopping notification manager...");

    try {
      // Stop all components
      await Promise.all([
        this.queue.stop(),
        this.webSocketServer.stop(),
        this.sseManager.stop(),
      ]);

      this.isRunning = false;
      console.log("✓ Notification manager stopped");
      this.emit("stopped");
    } catch (error) {
      console.error("Error stopping notification manager:", error);
      throw error;
    }
  }

  /**
   * Send notification through specified channels
   */
  async notify(
    notification: Notification,
    channels: NotificationChannel[] = [NotificationChannel.WEBSOCKET],
  ): Promise<string> {
    if (!this.isRunning) {
      throw new Error("Notification manager is not running");
    }

    // Validate notification
    this.validateNotification(notification);

    // Update statistics
    this.totalNotifications++;
    this.stats.byType[notification.type] =
      (this.stats.byType[notification.type] || 0) + 1;
    this.stats.byPriority[notification.priority]++;

    // Determine channels if not specified
    if (channels.length === 0) {
      channels = this.getDefaultChannels(notification);
    }

    try {
      // Enqueue notification
      const queueId = await this.queue.enqueue(notification, channels);

      this.emit("notification_sent", {
        notification,
        channels,
        queueId,
      });

      return queueId;
    } catch (error) {
      this.failedDeliveries++;
      this.emit("notification_error", {
        notification,
        channels,
        error,
      });
      throw error;
    }
  }

  /**
   * Send task-related notification
   */
  async notifyTask(taskData: {
    taskId: string;
    taskType: string;
    status: string;
    progress?: number;
    result?: any;
    error?: string;
    estimatedCompletion?: Date;
    duration?: number;
  }): Promise<string> {
    const notification: TaskNotification = {
      id: crypto.randomUUID(),
      type: this.mapTaskStatusToNotificationType(taskData.status),
      timestamp: new Date(),
      source: "task_manager",
      priority: this.getTaskPriority(taskData.status, taskData.error),
      channels: [NotificationChannel.WEBSOCKET, NotificationChannel.SSE],
      data: taskData,
    };

    return await this.notify(notification);
  }

  /**
   * Send system notification
   */
  async notifySystem(systemData: {
    component: string;
    message: string;
    details?: any;
    metrics?: any;
    healthStatus?: "healthy" | "degraded" | "unhealthy";
  }): Promise<string> {
    const notification: SystemNotification = {
      id: crypto.randomUUID(),
      type: this.mapHealthStatusToNotificationType(systemData.healthStatus),
      timestamp: new Date(),
      source: systemData.component,
      priority: this.getSystemPriority(systemData.healthStatus),
      channels: [NotificationChannel.WEBSOCKET, NotificationChannel.SSE],
      data: systemData,
    };

    return await this.notify(notification);
  }

  /**
   * Send ServiceNow notification
   */
  async notifyServiceNow(serviceNowData: {
    recordId?: string;
    recordNumber?: string;
    tableName: string;
    action: "created" | "updated" | "deleted" | "connected" | "disconnected";
    recordData?: any;
    connectionStatus?: "connected" | "disconnected" | "error";
    instance?: string;
  }): Promise<string> {
    const notification: ServiceNowNotification = {
      id: crypto.randomUUID(),
      type: this.mapTableNameToNotificationType(serviceNowData.tableName),
      timestamp: new Date(),
      source: "servicenow_client",
      priority: this.getServiceNowPriority(serviceNowData.action),
      channels: [NotificationChannel.WEBSOCKET, NotificationChannel.SSE],
      data: serviceNowData,
    };

    return await this.notify(notification);
  }

  /**
   * Send data processing notification
   */
  async notifyDataProcessing(processingData: {
    processId: string;
    processType: string;
    tableName?: string;
    recordCount?: number;
    filePath?: string;
    fileSize?: number;
    duration?: number;
    status: "started" | "completed" | "failed";
    error?: string;
  }): Promise<string> {
    const notification: DataProcessingNotification = {
      id: crypto.randomUUID(),
      type: this.mapProcessTypeToNotificationType(
        processingData.processType,
        processingData.status,
      ),
      timestamp: new Date(),
      source: "data_processor",
      priority: this.getDataProcessingPriority(processingData.status),
      channels: [NotificationChannel.WEBSOCKET, NotificationChannel.SSE],
      data: processingData,
    };

    return await this.notify(notification);
  }

  /**
   * Send performance alert notification
   */
  async notifyPerformance(performanceData: {
    metric: string;
    currentValue: number;
    threshold: number;
    trend: "increasing" | "decreasing" | "stable";
    impact: "low" | "medium" | "high" | "critical";
    recommendedAction?: string;
  }): Promise<string> {
    const notification: PerformanceNotification = {
      id: crypto.randomUUID(),
      type: this.mapPerformanceImpactToNotificationType(performanceData.impact),
      timestamp: new Date(),
      source: "performance_monitor",
      priority: this.getPerformancePriority(performanceData.impact),
      channels: [
        NotificationChannel.WEBSOCKET,
        NotificationChannel.SSE,
        NotificationChannel.EMAIL,
      ],
      data: performanceData,
    };

    return await this.notify(notification);
  }

  /**
   * Send security notification
   */
  async notifySecurity(
    securityData: {
      userId?: string;
      clientIp?: string;
      userAgent?: string;
      endpoint?: string;
      method?: string;
      reason?: string;
      riskScore?: number;
      countryCode?: string;
    },
    eventType: "alert" | "success" | "failure" | "denied",
  ): Promise<string> {
    const notification: SecurityNotification = {
      id: crypto.randomUUID(),
      type: this.mapSecurityEventToNotificationType(eventType),
      timestamp: new Date(),
      source: "security_monitor",
      priority: this.getSecurityPriority(eventType, securityData.riskScore),
      channels: [
        NotificationChannel.WEBSOCKET,
        NotificationChannel.EMAIL,
        NotificationChannel.DATABASE,
      ],
      data: securityData,
    };

    return await this.notify(notification);
  }

  /**
   * Get Elysia routes for WebSocket and SSE
   */
  getElysiaRoutes() {
    const wsRoute = this.webSocketServer.createElysiaRoute();
    const sseRoutes = this.sseManager.createElysiaRoutes();

    return {
      websocket: wsRoute,
      sse: sseRoutes,
    };
  }

  /**
   * Get notification statistics
   */
  async getStats(): Promise<NotificationStats> {
    const queueStats = await this.queue.getStats();
    const wsStats = this.webSocketServer.getServerStats();
    const sseStats = this.sseManager.getStats();

    // Update stats with current data
    this.stats.total.pending = Object.values(queueStats.queues).reduce(
      (sum: number, count: any) => sum + (count || 0),
      0,
    );
    this.stats.connections.websocket = wsStats.clients.total;
    this.stats.connections.sse = sseStats.streams.total;
    this.stats.performance.queueSize = this.stats.total.pending;
    this.stats.performance.errorRate =
      this.totalNotifications > 0
        ? (this.failedDeliveries / this.totalNotifications) * 100
        : 0;

    return { ...this.stats };
  }

  /**
   * Get system health status
   */
  getHealthStatus(): any {
    return {
      isRunning: this.isRunning,
      uptime: this.isRunning ? Date.now() - this.startTime.getTime() : 0,
      components: {
        queue: this.queue ? true : false,
        websocket: this.webSocketServer ? true : false,
        sse: this.sseManager ? true : false,
      },
      statistics: {
        totalNotifications: this.totalNotifications,
        successfulDeliveries: this.successfulDeliveries,
        failedDeliveries: this.failedDeliveries,
        successRate:
          this.totalNotifications > 0
            ? (this.successfulDeliveries / this.totalNotifications) * 100
            : 0,
      },
    };
  }

  // Private helper methods

  private validateNotification(notification: Notification): void {
    if (!notification.id) {
      throw new Error("Notification must have an ID");
    }
    if (!notification.type) {
      throw new Error("Notification must have a type");
    }
    if (!notification.source) {
      throw new Error("Notification must have a source");
    }
  }

  private getDefaultChannels(
    notification: Notification,
  ): NotificationChannel[] {
    switch (notification.priority) {
      case NotificationPriority.CRITICAL:
        return [
          NotificationChannel.WEBSOCKET,
          NotificationChannel.SSE,
          NotificationChannel.EMAIL,
          NotificationChannel.PUSH,
        ];
      case NotificationPriority.HIGH:
        return [
          NotificationChannel.WEBSOCKET,
          NotificationChannel.SSE,
          NotificationChannel.EMAIL,
        ];
      case NotificationPriority.MEDIUM:
        return [NotificationChannel.WEBSOCKET, NotificationChannel.SSE];
      default:
        return [NotificationChannel.WEBSOCKET];
    }
  }

  private updateDeliveryStats(
    notification: Notification,
    channel: NotificationChannel,
    success: boolean,
  ): void {
    if (!this.stats.byChannel[channel]) {
      this.stats.byChannel[channel] = {
        sent: 0,
        failed: 0,
        avgDeliveryTime: 0,
      };
    }

    if (success) {
      this.stats.byChannel[channel].sent++;
      this.stats.total.sent++;
      this.successfulDeliveries++;
    } else {
      this.stats.byChannel[channel].failed++;
      this.stats.total.failed++;
      this.failedDeliveries++;
    }
  }

  private updatePerformanceStats(duration: number): void {
    const currentAvg = this.stats.performance.avgProcessingTime;
    const totalProcessed = this.stats.total.sent + this.stats.total.failed;

    this.stats.performance.avgProcessingTime =
      (currentAvg * (totalProcessed - 1) + duration) / totalProcessed;
  }

  // Mapping methods for notification types

  private mapTaskStatusToNotificationType(status: string): NotificationType {
    switch (status.toLowerCase()) {
      case "created":
        return NotificationType.TASK_CREATED;
      case "started":
      case "running":
        return NotificationType.TASK_STARTED;
      case "progress":
        return NotificationType.TASK_PROGRESS;
      case "completed":
      case "success":
        return NotificationType.TASK_COMPLETED;
      case "failed":
      case "error":
        return NotificationType.TASK_FAILED;
      case "cancelled":
        return NotificationType.TASK_CANCELLED;
      default:
        return NotificationType.TASK_PROGRESS;
    }
  }

  private mapHealthStatusToNotificationType(status?: string): NotificationType {
    switch (status) {
      case "unhealthy":
        return NotificationType.SYSTEM_ERROR;
      case "degraded":
        return NotificationType.SYSTEM_WARNING;
      case "healthy":
        return NotificationType.SYSTEM_INFO;
      default:
        return NotificationType.SYSTEM_HEALTH;
    }
  }

  private mapTableNameToNotificationType(tableName: string): NotificationType {
    switch (tableName.toLowerCase()) {
      case "incident":
        return NotificationType.SERVICENOW_INCIDENT;
      case "problem":
        return NotificationType.SERVICENOW_PROBLEM;
      case "change_request":
        return NotificationType.SERVICENOW_CHANGE;
      default:
        return NotificationType.SERVICENOW_CONNECTION;
    }
  }

  private mapProcessTypeToNotificationType(
    processType: string,
    status: string,
  ): NotificationType {
    const isStart = status === "started";

    switch (processType.toLowerCase()) {
      case "export":
      case "parquet_export":
        return isStart
          ? NotificationType.DATA_EXPORT_START
          : NotificationType.DATA_EXPORT_COMPLETE;
      case "sync":
      case "data_sync":
        return isStart
          ? NotificationType.DATA_SYNC_START
          : NotificationType.DATA_SYNC_COMPLETE;
      case "pipeline":
      case "data_pipeline":
        return isStart
          ? NotificationType.DATA_PIPELINE_START
          : NotificationType.DATA_PIPELINE_COMPLETE;
      default:
        return isStart
          ? NotificationType.DATA_EXPORT_START
          : NotificationType.DATA_EXPORT_COMPLETE;
    }
  }

  private mapPerformanceImpactToNotificationType(
    impact: string,
  ): NotificationType {
    switch (impact) {
      case "critical":
        return NotificationType.PERFORMANCE_ALERT;
      case "high":
      case "medium":
        return NotificationType.PERFORMANCE_DEGRADATION;
      case "low":
        return NotificationType.PERFORMANCE_RECOVERY;
      default:
        return NotificationType.PERFORMANCE_ALERT;
    }
  }

  private mapSecurityEventToNotificationType(
    eventType: string,
  ): NotificationType {
    switch (eventType) {
      case "alert":
        return NotificationType.SECURITY_ALERT;
      case "success":
        return NotificationType.AUTH_SUCCESS;
      case "failure":
        return NotificationType.AUTH_FAILURE;
      case "denied":
        return NotificationType.ACCESS_DENIED;
      default:
        return NotificationType.SECURITY_ALERT;
    }
  }

  private getTaskPriority(
    status: string,
    error?: string,
  ): NotificationPriority {
    if (status === "failed" && error) return NotificationPriority.HIGH;
    if (status === "completed") return NotificationPriority.INFO;
    return NotificationPriority.MEDIUM;
  }

  private getSystemPriority(healthStatus?: string): NotificationPriority {
    switch (healthStatus) {
      case "unhealthy":
        return NotificationPriority.CRITICAL;
      case "degraded":
        return NotificationPriority.HIGH;
      case "healthy":
        return NotificationPriority.INFO;
      default:
        return NotificationPriority.MEDIUM;
    }
  }

  private getServiceNowPriority(action: string): NotificationPriority {
    switch (action) {
      case "disconnected":
        return NotificationPriority.HIGH;
      case "connected":
        return NotificationPriority.MEDIUM;
      default:
        return NotificationPriority.LOW;
    }
  }

  private getDataProcessingPriority(status: string): NotificationPriority {
    switch (status) {
      case "failed":
        return NotificationPriority.HIGH;
      case "completed":
        return NotificationPriority.MEDIUM;
      default:
        return NotificationPriority.LOW;
    }
  }

  private getPerformancePriority(impact: string): NotificationPriority {
    switch (impact) {
      case "critical":
        return NotificationPriority.CRITICAL;
      case "high":
        return NotificationPriority.HIGH;
      case "medium":
        return NotificationPriority.MEDIUM;
      default:
        return NotificationPriority.LOW;
    }
  }

  private getSecurityPriority(
    eventType: string,
    riskScore?: number,
  ): NotificationPriority {
    if (riskScore && riskScore >= 8) return NotificationPriority.CRITICAL;
    if (eventType === "alert") return NotificationPriority.HIGH;
    if (eventType === "denied" || eventType === "failure")
      return NotificationPriority.MEDIUM;
    return NotificationPriority.LOW;
  }

  // Channel delivery handlers
  private async handlePushNotification(
    notification: Notification,
  ): Promise<void> {
    if (!this.config.push.enabled) {
      throw new Error("Push notifications are disabled");
    }

    try {
      // Web Push implementation would go here
      // For now, we'll log the notification structure that would be sent
      const pushPayload = {
        title: this.getNotificationTitle(notification),
        body: this.getNotificationBody(notification),
        icon: "/icon-192x192.png",
        badge: "/badge-72x72.png",
        tag: notification.type,
        timestamp: notification.timestamp.getTime(),
        data: {
          notificationId: notification.id,
          type: notification.type,
          priority: notification.priority,
          url: this.getNotificationUrl(notification),
        },
        actions: this.getNotificationActions(notification),
      };

      console.log(
        `Push notification prepared for ${notification.id}:`,
        pushPayload,
      );

      // Send to Web Push service using vapid keys
      if (this.config.push.vapidKeys) {
        try {
          const webpush = await import("web-push");

          webpush.setVapidDetails(
            "mailto:notifications@company.com",
            this.config.push.vapidKeys.publicKey,
            this.config.push.vapidKeys.privateKey,
          );

          // Get push subscriptions from storage (would be stored in database)
          const subscriptions = await this.getPushSubscriptions(notification);

          if (subscriptions.length > 0) {
            const pushPromises = subscriptions
              .slice(0, this.config.push.maxSubscriptions)
              .map(async (subscription) => {
                try {
                  await webpush.sendNotification(
                    subscription,
                    JSON.stringify(pushPayload),
                  );
                  console.log(
                    `✓ Push notification sent successfully to subscription ${subscription.endpoint.substr(-20)}...`,
                  );
                } catch (error) {
                  console.error(
                    ` Push notification failed for subscription ${subscription.endpoint.substr(-20)}...:`,
                    error,
                  );
                  // Remove invalid subscriptions
                  if (error.statusCode === 410 || error.statusCode === 404) {
                    await this.removePushSubscription(subscription.endpoint);
                  }
                }
              });

            await Promise.allSettled(pushPromises);
            console.log(
              `✓ Push notification batch completed for ${notification.id}`,
            );
          } else {
            console.log(
              `  No push subscriptions found for notification ${notification.id}`,
            );
          }
        } catch (importError) {
          console.error(
            "web-push module not available, installing with: bun add web-push",
          );
          console.log(
            `  Push notification ${notification.id} logged only - web-push module required`,
          );
        }
      } else {
        console.log(
          `  VAPID keys not configured, push notification ${notification.id} logged only`,
        );
      }
    } catch (error) {
      console.error("Push notification delivery failed:", error);
      throw error;
    }
  }

  private async handleEmailNotification(
    notification: Notification,
  ): Promise<void> {
    if (!this.config.email.enabled) {
      throw new Error("Email notifications are disabled");
    }

    try {
      const emailContent = {
        to: this.getNotificationRecipients(notification),
        subject: `${notification.priority.toUpperCase()}: ${this.getNotificationTitle(notification)}`,
        html: this.generateEmailTemplate(notification),
        text: this.getNotificationBody(notification),
        headers: {
          "X-Notification-ID": notification.id,
          "X-Notification-Type": notification.type,
          "X-Priority":
            notification.priority === NotificationPriority.CRITICAL ? "1" : "3",
        },
      };

      console.log(`Email notification prepared for ${notification.id}:`, {
        to: emailContent.to,
        subject: emailContent.subject,
      });

      // Send using SMTP configuration
      if (this.config.email.smtp) {
        const nodemailer = await import("nodemailer");

        const transporter = nodemailer.createTransporter({
          host: this.config.email.smtp.host,
          port: this.config.email.smtp.port,
          secure: this.config.email.smtp.secure,
          auth: this.config.email.smtp.auth,
        });

        await transporter.sendMail(emailContent);
        console.log(
          `✓ Email notification sent successfully for ${notification.id}`,
        );
      } else {
        console.log(
          `  Email SMTP configuration not provided, notification ${notification.id} logged only`,
        );
      }
    } catch (error) {
      console.error("Email notification delivery failed:", error);
      throw error;
    }
  }

  private async handleWebhookNotification(
    notification: Notification,
  ): Promise<void> {
    if (!this.config.webhook.enabled) {
      throw new Error("Webhook notifications are disabled");
    }

    try {
      const webhookPayload = {
        id: notification.id,
        type: notification.type,
        timestamp: notification.timestamp.toISOString(),
        source: notification.source,
        priority: notification.priority,
        data: notification.data,
        metadata: notification.metadata,
      };

      // Get webhook URLs from metadata or configuration
      const webhookUrls = this.getWebhookUrls(notification);

      for (const url of webhookUrls) {
        console.log(
          `Webhook notification prepared for ${url}:`,
          webhookPayload,
        );

        // Implement HTTP POST with retry logic
        let retryCount = 0;
        const maxRetries = this.config.webhook.maxRetries;

        while (retryCount <= maxRetries) {
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Notification-ID": notification.id,
                "X-Notification-Type": notification.type,
                "User-Agent": "BunSNC-Notification-Service/1.0",
              },
              body: JSON.stringify(webhookPayload),
            });

            if (response.ok) {
              console.log(
                `✓ Webhook notification sent successfully to ${url} for ${notification.id}`,
              );
              break;
            } else {
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`,
              );
            }
          } catch (error) {
            retryCount++;
            if (retryCount > maxRetries) {
              console.error(
                ` Webhook delivery failed after ${maxRetries} retries to ${url}:`,
                error,
              );
              throw error;
            } else {
              const backoffMs = Math.min(
                1000 * Math.pow(2, retryCount - 1),
                10000,
              ); // Exponential backoff, max 10s
              console.warn(
                `  Webhook attempt ${retryCount} failed for ${url}, retrying in ${backoffMs}ms:`,
                error.message,
              );
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          }
        }
      }
    } catch (error) {
      console.error("Webhook notification delivery failed:", error);
      throw error;
    }
  }

  private async handleDatabaseNotification(
    notification: Notification,
  ): Promise<void> {
    try {
      const dbRecord = {
        id: notification.id,
        type: notification.type,
        timestamp: notification.timestamp,
        source: notification.source,
        priority: notification.priority,
        channels: notification.channels,
        data: JSON.stringify(notification.data),
        metadata: notification.metadata
          ? JSON.stringify(notification.metadata)
          : null,
        created_at: new Date(),
        processed_at: null,
        status: "pending",
      };

      console.log(
        `Database notification record prepared for ${notification.id}:`,
        dbRecord,
      );

      // Insert into database table 'notifications'
      try {
        const mongodb = await import("../config/mongodb");
        const client = await mongodb.getMongoClient();
        const db = client.db();

        const result = await db.collection("notifications").insertOne(dbRecord);
        console.log(
          `✓ Database notification stored successfully with ID ${result.insertedId} for ${notification.id}`,
        );
      } catch (dbError) {
        console.error(
          ` Database storage failed for notification ${notification.id}:`,
          dbError,
        );
        console.log(
          `  Database notification ${notification.id} logged only - MongoDB connection required`,
        );
      }
    } catch (error) {
      console.error("Database notification storage failed:", error);
      throw error;
    }
  }

  // Helper methods for notification formatting
  private getNotificationTitle(notification: Notification): string {
    switch (notification.type) {
      case NotificationType.TASK_COMPLETED:
        return `Task Completed: ${(notification as TaskNotification).data.taskType}`;
      case NotificationType.TASK_FAILED:
        return `Task Failed: ${(notification as TaskNotification).data.taskType}`;
      case NotificationType.SYSTEM_ERROR:
        return `System Error: ${(notification as SystemNotification).data.component}`;
      case NotificationType.PERFORMANCE_ALERT:
        return `Performance Alert: ${(notification as PerformanceNotification).data.metric}`;
      case NotificationType.SECURITY_ALERT:
        return "Security Alert Detected";
      default:
        return `${notification.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}`;
    }
  }

  private getNotificationBody(notification: Notification): string {
    switch (notification.type) {
      case NotificationType.TASK_COMPLETED:
        const taskCompleted = notification as TaskNotification;
        return `Task ${taskCompleted.data.taskId} of type ${taskCompleted.data.taskType} has completed successfully.`;
      case NotificationType.TASK_FAILED:
        const taskFailed = notification as TaskNotification;
        return `Task ${taskFailed.data.taskId} failed: ${taskFailed.data.error || "Unknown error"}`;
      case NotificationType.SYSTEM_ERROR:
        const systemError = notification as SystemNotification;
        return `System component ${systemError.data.component} reported an error: ${systemError.data.message}`;
      case NotificationType.PERFORMANCE_ALERT:
        const perfAlert = notification as PerformanceNotification;
        return `Performance metric ${perfAlert.data.metric} exceeded threshold: ${perfAlert.data.currentValue} > ${perfAlert.data.threshold}`;
      default:
        return `Notification from ${notification.source}: ${notification.type}`;
    }
  }

  private getNotificationUrl(notification: Notification): string {
    switch (notification.type) {
      case NotificationType.TASK_COMPLETED:
      case NotificationType.TASK_FAILED:
        const taskNotif = notification as TaskNotification;
        return `/tasks/${taskNotif.data.taskId}`;
      case NotificationType.SERVICENOW_INCIDENT:
        const incidentNotif = notification as ServiceNowNotification;
        return `/servicenow/incident/${incidentNotif.data.recordId}`;
      default:
        return "/notifications";
    }
  }

  private getNotificationActions(notification: Notification): any[] {
    const actions = [];

    if (notification.priority === NotificationPriority.CRITICAL) {
      actions.push({
        action: "acknowledge",
        title: "Acknowledge",
      });
    }

    actions.push({
      action: "view",
      title: "View Details",
    });

    return actions;
  }

  private getNotificationRecipients(notification: Notification): string[] {
    // Default recipients based on notification type and priority
    const recipients = [];

    if (notification.priority === NotificationPriority.CRITICAL) {
      recipients.push("admin@company.com", "oncall@company.com");
    } else if (notification.priority === NotificationPriority.HIGH) {
      recipients.push("admin@company.com");
    }

    // Add specific recipients based on notification metadata
    if (notification.metadata?.recipients) {
      recipients.push(...notification.metadata.recipients);
    }

    return recipients.length > 0 ? recipients : ["notifications@company.com"];
  }

  private generateEmailTemplate(notification: Notification): string {
    const title = this.getNotificationTitle(notification);
    const body = this.getNotificationBody(notification);
    const url = this.getNotificationUrl(notification);

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { background-color: ${this.getPriorityColor(notification.priority)}; color: white; padding: 15px; }
              .content { padding: 20px; border: 1px solid #ddd; }
              .footer { margin-top: 20px; font-size: 12px; color: #666; }
              .details { background-color: #f5f5f5; padding: 10px; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div class="header">
              <h2>${title}</h2>
          </div>
          <div class="content">
              <p>${body}</p>
              
              <div class="details">
                  <strong>Details:</strong><br>
                  <strong>Type:</strong> ${notification.type}<br>
                  <strong>Priority:</strong> ${notification.priority}<br>
                  <strong>Source:</strong> ${notification.source}<br>
                  <strong>Timestamp:</strong> ${notification.timestamp.toLocaleString()}<br>
              </div>
              
              ${url !== "/notifications" ? `<p><a href="${url}">View Details</a></p>` : ""}
          </div>
          <div class="footer">
              <p>This is an automated notification from BunSNC. Notification ID: ${notification.id}</p>
          </div>
      </body>
      </html>
    `;
  }

  private getPriorityColor(priority: NotificationPriority): string {
    switch (priority) {
      case NotificationPriority.CRITICAL:
        return "#dc3545";
      case NotificationPriority.HIGH:
        return "#fd7e14";
      case NotificationPriority.MEDIUM:
        return "#ffc107";
      case NotificationPriority.LOW:
        return "#28a745";
      default:
        return "#6c757d";
    }
  }

  private getWebhookUrls(notification: Notification): string[] {
    const urls = [];

    // Get from notification metadata
    if (notification.metadata?.webhooks) {
      urls.push(...notification.metadata.webhooks);
    }

    // Add default webhook URLs based on notification type
    switch (notification.type) {
      case NotificationType.SECURITY_ALERT:
        urls.push("https://security-webhook.company.com/alerts");
        break;
      case NotificationType.PERFORMANCE_ALERT:
        urls.push("https://monitoring-webhook.company.com/performance");
        break;
      default:
        urls.push("https://webhook.company.com/notifications");
    }

    return urls.filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
  }

  /**
   * Get push subscriptions for a notification
   * In production, this would query a database table of user subscriptions
   */
  private async getPushSubscriptions(
    notification: Notification,
  ): Promise<any[]> {
    try {
      const mongodb = await import("../config/mongodb");
      const client = await mongodb.getMongoClient();
      const db = client.db();

      // Query subscriptions based on notification priority and type
      const filter: any = { active: true };

      // For critical notifications, send to all subscriptions
      if (notification.priority !== NotificationPriority.CRITICAL) {
        filter.types = { $in: [notification.type, "all"] };
      }

      const subscriptions = await db
        .collection("push_subscriptions")
        .find(filter)
        .limit(this.config.push.maxSubscriptions)
        .toArray();

      return subscriptions.map((sub) => ({
        endpoint: sub.endpoint,
        keys: sub.keys,
      }));
    } catch (error) {
      console.error("Failed to get push subscriptions:", error);
      return [];
    }
  }

  /**
   * Remove invalid push subscription
   */
  private async removePushSubscription(endpoint: string): Promise<void> {
    try {
      const mongodb = await import("../config/mongodb");
      const client = await mongodb.getMongoClient();
      const db = client.db();

      await db
        .collection("push_subscriptions")
        .updateOne(
          { endpoint },
          { $set: { active: false, removed_at: new Date() } },
        );

      console.log(
        `✓ Removed invalid push subscription: ${endpoint.substr(-20)}...`,
      );
    } catch (error) {
      console.error("Failed to remove push subscription:", error);
    }
  }
}
