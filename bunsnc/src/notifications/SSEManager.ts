/**
 * Server-Sent Events Manager - Streaming Real-time Data
 * Handles SSE connections and streaming notifications
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { EventEmitter } from "events";
import { Elysia, t } from "elysia";
import {
  Notification,
  SSEStream,
  NotificationPriority,
  NotificationType,
} from "./NotificationTypes";

export interface SSEManagerOptions {
  maxStreams: number;
  heartbeatInterval: number; // in milliseconds
  maxEventSize: number; // in bytes
  retryInterval: number; // in milliseconds
  enableCompression: boolean;
  rateLimits: {
    eventsPerMinute: number;
    connectionsPerIP: number;
  };
}

export interface SSEStreamInfo {
  stream: SSEStream;
  response: Response;
  encoder: TextEncoder;
  lastEventTime: Date;
  eventCount: number;
  rateLimitReset: Date;
  clientIP?: string;
  userAgent?: string;
}

export class SSEManager extends EventEmitter {
  private streams: Map<string, SSEStreamInfo> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channel -> stream IDs
  private ipConnections: Map<string, number> = new Map(); // IP -> connection count
  private options: SSEManagerOptions;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  // System channels for SSE
  private readonly SYSTEM_CHANNELS = [
    "system.health",
    "system.metrics",
    "tasks.progress",
    "tasks.updates",
    "servicenow.events",
    "data.processing",
    "performance.alerts",
  ];

  constructor(options: SSEManagerOptions) {
    super();
    this.options = options;
    this.setupChannels();
  }

  private setupChannels(): void {
    for (const channel of this.SYSTEM_CHANNELS) {
      this.channels.set(channel, new Set());
    }
  }

  /**
   * Start the SSE manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("SSE manager is already running");
    }

    this.isRunning = true;

    // Start heartbeat timer
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.options.heartbeatInterval,
    );

    // Start cleanup timer
    this.cleanupTimer = setInterval(
      () => this.cleanupInactiveStreams(),
      60000, // Clean up every minute
    );

    console.log("SSE manager started");
    this.emit("started");
  }

  /**
   * Stop the SSE manager
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

    // Close all streams
    for (const streamInfo of this.streams.values()) {
      try {
        streamInfo.stream.controller.close();
      } catch (error: unknown) {
        console.error("Error closing SSE stream:", error);
      }
    }

    this.streams.clear();
    this.channels.clear();
    this.ipConnections.clear();
    this.setupChannels();

    console.log("SSE manager stopped");
    this.emit("stopped");
  }

  /**
   * Create Elysia SSE routes
   */
  createElysiaRoutes(): Elysia {
    return (
      new Elysia()
        // Main SSE endpoint
        .get(
          "/events/stream",
          async (context) => {
            return this.handleSSEConnection(context);
          },
          {
            query: t.Object({
              channels: t.Optional(t.String()), // comma-separated channel names
              priority: t.Optional(t.String()), // minimum priority level
              types: t.Optional(t.String()), // comma-separated notification types
              clientId: t.Optional(t.String()),
              lastEventId: t.Optional(t.String()),
            }),
          },
        )

        // Channel-specific SSE endpoints
        .get("/events/tasks", async (context) => {
          return this.handleSSEConnection(context, [
            "tasks.progress",
            "tasks.updates",
          ]);
        })

        .get("/events/system", async (context) => {
          return this.handleSSEConnection(context, [
            "system.health",
            "system.metrics",
          ]);
        })

        .get("/events/servicenow", async (context) => {
          return this.handleSSEConnection(context, ["servicenow.events"]);
        })

        .get("/events/performance", async (context) => {
          return this.handleSSEConnection(context, [
            "performance.alerts",
            "system.metrics",
          ]);
        })

        // SSE statistics endpoint
        .get("/events/stats", () => {
          return this.getStats();
        })
    );
  }

  /**
   * Handle SSE connection request
   */
  private async handleSSEConnection(
    context: any,
    defaultChannels?: string[],
  ): Promise<Response> {
    const { query, headers, set, request } = context;

    // Check connection limits
    const clientIP =
      headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown";
    if (this.streams.size >= this.options.maxStreams) {
      set.status = 503;
      return new Response("Service Unavailable: Too many active streams", {
        status: 503,
      });
    }

    // Check IP-based rate limiting
    const ipConnCount = this.ipConnections.get(clientIP) || 0;
    if (ipConnCount >= this.options.rateLimits.connectionsPerIP) {
      set.status = 429;
      return new Response(
        "Too Many Requests: Connection limit per IP exceeded",
        { status: 429 },
      );
    }

    // Parse parameters
    const channelsParam = query.channels || "";
    const requestedChannels = channelsParam
      ? channelsParam.split(",").map((c: string) => c.trim())
      : [];
    const channels =
      defaultChannels ||
      requestedChannels.filter((c) => this.isValidChannel(c));

    if (channels.length === 0) {
      channels.push("system.health"); // Default channel
    }

    // Parse filters
    const filters: any = {};
    if (query.priority) {
      filters.priority = query.priority.split(",").map((p: string) => p.trim());
    }
    if (query.types) {
      filters.types = query.types.split(",").map((t: string) => t.trim());
    }

    // Create SSE stream
    const streamId = crypto.randomUUID();
    const clientId = query.clientId || streamId;

    const stream = new ReadableStream({
      start: (controller) => {
        const sseStream: SSEStream = {
          id: streamId,
          clientId,
          channels: new Set(channels),
          controller,
          filters,
          startTime: new Date(),
          lastMessageTime: new Date(),
        };

        const streamInfo: SSEStreamInfo = {
          stream: sseStream,
          response: new Response("", { status: 200 }),
          encoder: new TextEncoder(),
          lastEventTime: new Date(),
          eventCount: 0,
          rateLimitReset: new Date(Date.now() + 60000),
          clientIP,
          userAgent: headers["user-agent"],
        };

        // Store stream
        this.streams.set(streamId, streamInfo);

        // Update IP connection count
        this.ipConnections.set(clientIP, ipConnCount + 1);

        // Subscribe to channels
        for (const channel of channels) {
          if (!this.channels.has(channel)) {
            this.channels.set(channel, new Set());
          }
          this.channels.get(channel)!.add(streamId);
        }

        // Send initial connection event
        this.sendEventToStream(streamId, {
          type: "connection",
          data: {
            streamId,
            clientId,
            channels: Array.from(sseStream.channels),
            serverTime: new Date().toISOString(),
            availableChannels: this.SYSTEM_CHANNELS,
          },
        });

        console.log(
          `SSE stream connected: ${streamId} (channels: ${channels.join(", ")})`,
        );
        this.emit("stream_connected", { streamId, clientId, channels });
      },

      cancel: () => {
        this.removeStream(streamId);
        console.log(`SSE stream disconnected: ${streamId}`);
        this.emit("stream_disconnected", { streamId });
      },
    });

    // Set SSE headers
    const headers_obj = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    };

    if (this.options.enableCompression) {
      headers_obj["Content-Encoding"] = "gzip";
    }

    return new Response(stream, {
      headers: headers_obj,
    });
  }

  /**
   * Broadcast notification to subscribed streams
   */
  broadcast(notification: Notification): void {
    if (!this.isRunning) return;

    const channels = this.getNotificationChannels(notification);
    let deliveredCount = 0;
    const targetStreams = new Set<string>();

    // Collect all streams subscribed to relevant channels
    for (const channel of channels) {
      const channelStreams = this.channels.get(channel);
      if (channelStreams) {
        for (const streamId of channelStreams) {
          targetStreams.add(streamId);
        }
      }
    }

    // Send to each stream
    for (const streamId of targetStreams) {
      const streamInfo = this.streams.get(streamId);
      if (
        streamInfo &&
        this.shouldReceiveNotification(streamInfo, notification)
      ) {
        if (
          this.sendEventToStream(streamId, {
            type: "notification",
            data: notification,
            id: notification.id,
            retry: this.options.retryInterval,
          })
        ) {
          deliveredCount++;
        }
      }
    }

    this.emit("broadcast_completed", {
      notification,
      targetStreams: targetStreams.size,
      delivered: deliveredCount,
    });
  }

  /**
   * Send event to specific stream
   */
  private sendEventToStream(streamId: string, event: any): boolean {
    const streamInfo = this.streams.get(streamId);
    if (!streamInfo) return false;

    // Check rate limiting
    if (!this.checkRateLimit(streamInfo)) {
      return false;
    }

    try {
      const eventData = this.formatSSEEvent(event);
      const encodedData = streamInfo.encoder.encode(eventData);

      // Check event size
      if (encodedData.length > this.options.maxEventSize) {
        console.warn(
          `Event too large for stream ${streamId}: ${encodedData.length} bytes`,
        );
        return false;
      }

      streamInfo.stream.controller.enqueue(encodedData);
      streamInfo.lastEventTime = new Date();
      streamInfo.stream.lastMessageTime = new Date();

      return true;
    } catch (error: unknown) {
      console.error(`Error sending event to stream ${streamId}:`, error);
      this.removeStream(streamId);
      return false;
    }
  }

  /**
   * Format event as SSE protocol
   */
  private formatSSEEvent(event: any): string {
    let eventString = "";

    if (event.id) {
      eventString += `id: ${event.id}\n`;
    }

    if (event.type) {
      eventString += `event: ${event.type}\n`;
    }

    if (event.retry) {
      eventString += `retry: ${event.retry}\n`;
    }

    // Handle data (can be string or object)
    const dataString =
      typeof event.data === "string" ? event.data : JSON.stringify(event.data);

    // Split multi-line data
    const dataLines = dataString.split("\n");
    for (const line of dataLines) {
      eventString += `data: ${line}\n`;
    }

    eventString += "\n"; // Empty line to end the event

    return eventString;
  }

  /**
   * Send heartbeat to all streams
   */
  private sendHeartbeat(): void {
    const heartbeatEvent = {
      type: "heartbeat",
      data: {
        timestamp: new Date().toISOString(),
        activeStreams: this.streams.size,
      },
    };

    for (const streamId of this.streams.keys()) {
      this.sendEventToStream(streamId, heartbeatEvent);
    }
  }

  /**
   * Clean up inactive streams
   */
  private cleanupInactiveStreams(): void {
    const now = Date.now();
    const timeout = 300000; // 5 minutes

    for (const [streamId, streamInfo] of this.streams.entries()) {
      const lastActivity = streamInfo.lastEventTime.getTime();

      if (now - lastActivity > timeout) {
        console.log(`Removing inactive SSE stream: ${streamId}`);
        this.removeStream(streamId);
      }
    }
  }

  /**
   * Remove stream and clean up
   */
  private removeStream(streamId: string): void {
    const streamInfo = this.streams.get(streamId);
    if (!streamInfo) return;

    // Remove from channels
    for (const channel of streamInfo.stream.channels) {
      this.channels.get(channel)?.delete(streamId);
    }

    // Update IP connection count
    if (streamInfo.clientIP) {
      const currentCount = this.ipConnections.get(streamInfo.clientIP) || 0;
      if (currentCount > 1) {
        this.ipConnections.set(streamInfo.clientIP, currentCount - 1);
      } else {
        this.ipConnections.delete(streamInfo.clientIP);
      }
    }

    // Close controller if still open
    try {
      streamInfo.stream.controller.close();
    } catch (error: unknown) {
      // Already closed
    }

    this.streams.delete(streamId);
  }

  /**
   * Check rate limiting for stream
   */
  private checkRateLimit(streamInfo: SSEStreamInfo): boolean {
    const now = new Date();

    // Reset counter if minute has passed
    if (now > streamInfo.rateLimitReset) {
      streamInfo.eventCount = 0;
      streamInfo.rateLimitReset = new Date(now.getTime() + 60000);
    }

    streamInfo.eventCount++;
    return streamInfo.eventCount <= this.options.rateLimits.eventsPerMinute;
  }

  /**
   * Determine notification channels for SSE
   */
  private getNotificationChannels(notification: Notification): string[] {
    const channels: string[] = [];

    switch (notification.type) {
      case NotificationType.SYSTEM_HEALTH:
      case NotificationType.SYSTEM_ERROR:
      case NotificationType.SYSTEM_WARNING:
      case NotificationType.SYSTEM_INFO:
        channels.push("system.health", "system.metrics");
        break;

      case NotificationType.PERFORMANCE_ALERT:
      case NotificationType.PERFORMANCE_DEGRADATION:
      case NotificationType.PERFORMANCE_RECOVERY:
        channels.push("performance.alerts", "system.metrics");
        break;

      case NotificationType.TASK_CREATED:
      case NotificationType.TASK_STARTED:
      case NotificationType.TASK_PROGRESS:
      case NotificationType.TASK_COMPLETED:
      case NotificationType.TASK_FAILED:
      case NotificationType.TASK_CANCELLED:
        channels.push("tasks.progress", "tasks.updates");
        break;

      case NotificationType.SERVICENOW_INCIDENT:
      case NotificationType.SERVICENOW_PROBLEM:
      case NotificationType.SERVICENOW_CHANGE:
      case NotificationType.SERVICENOW_CONNECTION:
        channels.push("servicenow.events");
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
   * Check if stream should receive notification
   */
  private shouldReceiveNotification(
    streamInfo: SSEStreamInfo,
    notification: Notification,
  ): boolean {
    const filters = streamInfo.stream.filters;
    if (!filters) return true;

    // Priority filter
    if (filters.priority && !filters.priority.includes(notification.priority)) {
      return false;
    }

    // Type filter
    if (filters.types && !filters.types.includes(notification.type)) {
      return false;
    }

    return true;
  }

  /**
   * Validate channel name
   */
  private isValidChannel(channel: string): boolean {
    return (
      this.SYSTEM_CHANNELS.includes(channel) ||
      /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(channel)
    );
  }

  /**
   * Get SSE manager statistics
   */
  getStats(): any {
    const now = Date.now();

    return {
      streams: {
        total: this.streams.size,
        active: Array.from(this.streams.values()).filter(
          (info) => now - info.lastEventTime.getTime() < 60000, // 1 minute
        ).length,
      },
      channels: Object.fromEntries(
        Array.from(this.channels.entries()).map(([channel, streams]) => [
          channel,
          { subscribers: streams.size },
        ]),
      ),
      connections: {
        byIP: Object.fromEntries(this.ipConnections.entries()),
      },
      performance: {
        totalEvents: Array.from(this.streams.values()).reduce(
          (sum, info) => sum + info.eventCount,
          0,
        ),
        avgEventsPerStream:
          this.streams.size > 0
            ? Array.from(this.streams.values()).reduce(
                (sum, info) => sum + info.eventCount,
                0,
              ) / this.streams.size
            : 0,
      },
      isRunning: this.isRunning,
    };
  }
}
