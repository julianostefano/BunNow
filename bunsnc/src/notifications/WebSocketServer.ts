/**
 * WebSocket Server - Real-time Bidirectional Notifications
 * Handles WebSocket connections, subscriptions, and message broadcasting
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { Elysia, t } from "elysia";
import {
  Notification,
  WebSocketMessage,
  WebSocketSubscription,
  NotificationPriority,
  NotificationType,
  NotificationChannel,
} from "./NotificationTypes";

export interface WebSocketServerOptions {
  maxConnections: number;
  heartbeatInterval: number; // in milliseconds
  idleTimeout: number; // in milliseconds
  maxMessageSize: number; // in bytes
  enableCompression: boolean;
  rateLimits: {
    messagesPerMinute: number;
    subscriptionsPerClient: number;
  };
}

export interface WebSocketClientInfo {
  id: string;
  socket: any; // WebSocket instance
  subscription: WebSocketSubscription;
  messageCount: number;
  lastMessageTime: Date;
  rateLimitReset: Date;
}

export class WebSocketServer extends EventEmitter {
  private clients: Map<string, WebSocketClientInfo> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channel -> client IDs
  private options: WebSocketServerOptions;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  // Channel definitions
  private readonly SYSTEM_CHANNELS = [
    "system.health",
    "system.errors",
    "system.performance",
    "tasks.all",
    "tasks.critical",
    "servicenow.all",
    "data.processing",
  ];

  constructor(options: WebSocketServerOptions) {
    super();
    this.options = options;
    this.setupChannels();
  }

  private setupChannels(): void {
    // Initialize system channels
    for (const channel of this.SYSTEM_CHANNELS) {
      this.channels.set(channel, new Set());
    }
  }

  /**
   * Create Elysia WebSocket route
   */
  createElysiaRoute(): Elysia {
    return new Elysia().ws(
      "/ws/notifications",
      {
        // Connection opened
        open: (ws) => {
          this.handleConnection(ws);
        },

        // Message received
        message: (ws, message) => {
          this.handleMessage(ws, message);
        },

        // Connection closed
        close: (ws, code, reason) => {
          this.handleDisconnection(ws, code, reason);
        },

        // Error occurred
        error: (ws, error) => {
          this.handleError(ws, error);
        },
      },
      {
        // Message validation schema
        body: t.Object({
          type: t.Union([
            t.Literal("subscribe"),
            t.Literal("unsubscribe"),
            t.Literal("ping"),
            t.Literal("pong"),
            t.Literal("get_channels"),
            t.Literal("get_stats"),
          ]),
          channel: t.Optional(t.String()),
          channels: t.Optional(t.Array(t.String())),
          data: t.Optional(t.Any()),
          clientId: t.Optional(t.String()),
          filters: t.Optional(
            t.Object({
              priority: t.Optional(t.Array(t.String())),
              types: t.Optional(t.Array(t.String())),
              sources: t.Optional(t.Array(t.String())),
            }),
          ),
        }),

        // WebSocket configuration
        perMessageDeflate: this.options.enableCompression,
        maxPayloadLength: this.options.maxMessageSize,
        idleTimeout: this.options.idleTimeout / 1000, // Convert to seconds
        backpressureLimit: 64 * 1024, // 64KB
      },
    );
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("WebSocket server is already running");
    }

    this.isRunning = true;

    // Start heartbeat timer
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.options.heartbeatInterval,
    );

    // Start cleanup timer
    this.cleanupTimer = setInterval(
      () => this.cleanupInactiveClients(),
      60000, // Clean up every minute
    );

    console.log("WebSocket notification server started");
    this.emit("started");
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      try {
        client.socket.close(1000, "Server shutting down");
      } catch (error) {
        console.error("Error closing WebSocket connection:", error);
      }
    }

    this.clients.clear();
    this.channels.clear();
    this.setupChannels();

    console.log("WebSocket notification server stopped");
    this.emit("stopped");
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: any): void {
    // Check connection limit
    if (this.clients.size >= this.options.maxConnections) {
      ws.close(1008, "Connection limit exceeded");
      return;
    }

    const clientId = crypto.randomUUID();
    const subscription: WebSocketSubscription = {
      clientId,
      channels: new Set(),
      lastSeen: new Date(),
      userAgent: ws.data?.headers?.["user-agent"],
      ip: ws.data?.ip,
    };

    const clientInfo: WebSocketClientInfo = {
      id: clientId,
      socket: ws,
      subscription,
      messageCount: 0,
      lastMessageTime: new Date(),
      rateLimitReset: new Date(Date.now() + 60000), // Reset every minute
    };

    // Store client reference on WebSocket
    ws.data = { ...ws.data, clientId };

    this.clients.set(clientId, clientInfo);

    // Send welcome message
    this.sendToClient(clientId, {
      type: "notification",
      data: {
        type: "connection.established",
        clientId,
        availableChannels: this.SYSTEM_CHANNELS,
        serverTime: new Date().toISOString(),
      },
      timestamp: new Date(),
    });

    console.log(`WebSocket client connected: ${clientId}`);
    this.emit("client_connected", { clientId, subscription });
  }

  /**
   * Handle WebSocket message
   */
  private handleMessage(ws: any, message: WebSocketMessage): void {
    const clientId = ws.data?.clientId;
    if (!clientId) return;

    const client = this.clients.get(clientId);
    if (!client) return;

    // Rate limiting
    if (!this.checkRateLimit(client)) {
      this.sendToClient(clientId, {
        type: "error",
        data: {
          error: "Rate limit exceeded",
          resetTime: client.rateLimitReset,
        },
        timestamp: new Date(),
      });
      return;
    }

    // Update client activity
    client.lastMessageTime = new Date();
    client.subscription.lastSeen = new Date();

    try {
      this.processMessage(clientId, message);
    } catch (error) {
      console.error(`Error processing message from client ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: "error",
        data: {
          error: "Message processing failed",
          details: error instanceof Error ? error.message : String(error),
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process individual message types
   */
  private processMessage(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case "subscribe":
        this.handleSubscribe(clientId, message);
        break;

      case "unsubscribe":
        this.handleUnsubscribe(clientId, message);
        break;

      case "ping":
        this.handlePing(clientId);
        break;

      case "get_channels":
        this.handleGetChannels(clientId);
        break;

      case "get_stats":
        this.handleGetStats(clientId);
        break;

      default:
        this.sendToClient(clientId, {
          type: "error",
          data: { error: `Unknown message type: ${message.type}` },
          timestamp: new Date(),
        });
    }
  }

  /**
   * Handle channel subscription
   */
  private handleSubscribe(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const channelsToSubscribe =
      message.channels || (message.channel ? [message.channel] : []);
    const subscribed: string[] = [];
    const errors: string[] = [];

    for (const channel of channelsToSubscribe) {
      // Check subscription limit
      if (
        client.subscription.channels.size >=
        this.options.rateLimits.subscriptionsPerClient
      ) {
        errors.push(`Subscription limit exceeded for channel: ${channel}`);
        continue;
      }

      // Validate channel
      if (!this.isValidChannel(channel)) {
        errors.push(`Invalid channel: ${channel}`);
        continue;
      }

      // Subscribe to channel
      client.subscription.channels.add(channel);

      // Add to channel mapping
      if (!this.channels.has(channel)) {
        this.channels.set(channel, new Set());
      }
      this.channels.get(channel)!.add(clientId);

      subscribed.push(channel);
    }

    // Apply filters if provided
    if (message.filters) {
      client.subscription.filters = message.filters;
    }

    // Send response
    this.sendToClient(clientId, {
      type: "notification",
      data: {
        type: "subscription.updated",
        subscribed,
        errors,
        totalSubscriptions: client.subscription.channels.size,
      },
      timestamp: new Date(),
    });

    console.log(
      `Client ${clientId} subscribed to channels: ${subscribed.join(", ")}`,
    );
  }

  /**
   * Handle channel unsubscription
   */
  private handleUnsubscribe(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const channelsToUnsubscribe =
      message.channels || (message.channel ? [message.channel] : []);
    const unsubscribed: string[] = [];

    for (const channel of channelsToUnsubscribe) {
      if (client.subscription.channels.has(channel)) {
        client.subscription.channels.delete(channel);
        this.channels.get(channel)?.delete(clientId);
        unsubscribed.push(channel);
      }
    }

    this.sendToClient(clientId, {
      type: "notification",
      data: {
        type: "subscription.updated",
        unsubscribed,
        totalSubscriptions: client.subscription.channels.size,
      },
      timestamp: new Date(),
    });

    console.log(
      `Client ${clientId} unsubscribed from channels: ${unsubscribed.join(", ")}`,
    );
  }

  /**
   * Handle ping message
   */
  private handlePing(clientId: string): void {
    this.sendToClient(clientId, {
      type: "pong",
      timestamp: new Date(),
    });
  }

  /**
   * Handle get channels request
   */
  private handleGetChannels(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.sendToClient(clientId, {
      type: "notification",
      data: {
        type: "channels.list",
        availableChannels: this.SYSTEM_CHANNELS,
        subscribedChannels: Array.from(client.subscription.channels),
        channelStats: Object.fromEntries(
          Array.from(this.channels.entries()).map(([channel, clients]) => [
            channel,
            { subscribers: clients.size },
          ]),
        ),
      },
      timestamp: new Date(),
    });
  }

  /**
   * Handle get stats request
   */
  private handleGetStats(clientId: string): void {
    this.sendToClient(clientId, {
      type: "notification",
      data: {
        type: "server.stats",
        stats: this.getServerStats(),
      },
      timestamp: new Date(),
    });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(ws: any, code?: number, reason?: string): void {
    const clientId = ws.data?.clientId;
    if (!clientId) return;

    this.removeClient(clientId);
    console.log(
      `WebSocket client disconnected: ${clientId} (${code}: ${reason})`,
    );
    this.emit("client_disconnected", { clientId, code, reason });
  }

  /**
   * Handle WebSocket error
   */
  private handleError(ws: any, error: Error): void {
    const clientId = ws.data?.clientId;
    console.error(`WebSocket error for client ${clientId}:`, error);
    this.emit("websocket_error", { clientId, error });
  }

  /**
   * Broadcast notification to subscribed clients
   */
  broadcast(notification: Notification): void {
    if (!this.isRunning) return;

    const channels = this.getNotificationChannels(notification);
    const message: WebSocketMessage = {
      type: "notification",
      data: notification,
      timestamp: new Date(),
    };

    let deliveredCount = 0;
    const targetClients = new Set<string>();

    // Collect all clients subscribed to relevant channels
    for (const channel of channels) {
      const channelClients = this.channels.get(channel);
      if (channelClients) {
        for (const clientId of channelClients) {
          targetClients.add(clientId);
        }
      }
    }

    // Send to each client
    for (const clientId of targetClients) {
      const client = this.clients.get(clientId);
      if (client && this.shouldReceiveNotification(client, notification)) {
        if (this.sendToClient(clientId, message)) {
          deliveredCount++;
        }
      }
    }

    this.emit("broadcast_completed", {
      notification,
      targetClients: targetClients.size,
      delivered: deliveredCount,
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Remove client and clean up subscriptions
   */
  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all channels
    for (const channel of client.subscription.channels) {
      this.channels.get(channel)?.delete(clientId);
    }

    this.clients.delete(clientId);
  }

  /**
   * Send heartbeat to all clients
   */
  private sendHeartbeat(): void {
    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, {
        type: "ping",
        timestamp: new Date(),
      });
    }
  }

  /**
   * Clean up inactive clients
   */
  private cleanupInactiveClients(): void {
    const now = Date.now();
    const timeout = this.options.idleTimeout;

    for (const [clientId, client] of this.clients.entries()) {
      const lastActivity = Math.max(
        client.lastMessageTime.getTime(),
        client.subscription.lastSeen.getTime(),
      );

      if (now - lastActivity > timeout) {
        console.log(`Removing inactive client: ${clientId}`);
        try {
          client.socket.close(1000, "Idle timeout");
        } catch (error) {
          // Client already disconnected
        }
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Check rate limiting for client
   */
  private checkRateLimit(client: WebSocketClientInfo): boolean {
    const now = new Date();

    // Reset counter if minute has passed
    if (now > client.rateLimitReset) {
      client.messageCount = 0;
      client.rateLimitReset = new Date(now.getTime() + 60000);
    }

    client.messageCount++;
    return client.messageCount <= this.options.rateLimits.messagesPerMinute;
  }

  /**
   * Determine which channels a notification should be sent to
   */
  private getNotificationChannels(notification: Notification): string[] {
    const channels: string[] = [];

    // Map notification types to channels
    switch (notification.type) {
      case NotificationType.SYSTEM_HEALTH:
      case NotificationType.SYSTEM_ERROR:
      case NotificationType.SYSTEM_WARNING:
      case NotificationType.SYSTEM_INFO:
        channels.push("system.health", "system.errors");
        break;

      case NotificationType.PERFORMANCE_ALERT:
      case NotificationType.PERFORMANCE_DEGRADATION:
      case NotificationType.PERFORMANCE_RECOVERY:
        channels.push("system.performance");
        break;

      case NotificationType.TASK_CREATED:
      case NotificationType.TASK_STARTED:
      case NotificationType.TASK_PROGRESS:
      case NotificationType.TASK_COMPLETED:
      case NotificationType.TASK_FAILED:
      case NotificationType.TASK_CANCELLED:
        channels.push("tasks.all");
        if (
          notification.priority === NotificationPriority.CRITICAL ||
          notification.priority === NotificationPriority.HIGH
        ) {
          channels.push("tasks.critical");
        }
        break;

      case NotificationType.SERVICENOW_INCIDENT:
      case NotificationType.SERVICENOW_PROBLEM:
      case NotificationType.SERVICENOW_CHANGE:
      case NotificationType.SERVICENOW_CONNECTION:
        channels.push("servicenow.all");
        break;

      case NotificationType.DATA_EXPORT_START:
      case NotificationType.DATA_EXPORT_COMPLETE:
      case NotificationType.DATA_SYNC_START:
      case NotificationType.DATA_SYNC_COMPLETE:
      case NotificationType.DATA_PIPELINE_START:
      case NotificationType.DATA_PIPELINE_COMPLETE:
        channels.push("data.processing");
        break;
    }

    return channels;
  }

  /**
   * Check if client should receive notification based on filters
   */
  private shouldReceiveNotification(
    client: WebSocketClientInfo,
    notification: Notification,
  ): boolean {
    const filters = client.subscription.filters;
    if (!filters) return true;

    // Priority filter
    if (filters.priority && !filters.priority.includes(notification.priority)) {
      return false;
    }

    // Type filter
    if (filters.types && !filters.types.includes(notification.type)) {
      return false;
    }

    // Source filter
    if (filters.sources && !filters.sources.includes(notification.source)) {
      return false;
    }

    return true;
  }

  /**
   * Validate channel name
   */
  private isValidChannel(channel: string): boolean {
    // Allow system channels
    if (this.SYSTEM_CHANNELS.includes(channel)) {
      return true;
    }

    // Allow custom channels with specific pattern
    const pattern = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
    return pattern.test(channel) && channel.length <= 100;
  }

  /**
   * Get server statistics
   */
  getServerStats(): any {
    return {
      clients: {
        total: this.clients.size,
        active: Array.from(this.clients.values()).filter(
          (client) => Date.now() - client.lastMessageTime.getTime() < 300000, // 5 minutes
        ).length,
      },
      channels: Object.fromEntries(
        Array.from(this.channels.entries()).map(([channel, clients]) => [
          channel,
          { subscribers: clients.size },
        ]),
      ),
      isRunning: this.isRunning,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };
  }
}
