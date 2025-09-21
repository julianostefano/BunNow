/**
 * aioredis Streams Configuration for ServiceNow Real-time Processing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import Redis from "ioredis";

export interface StreamMessage {
  id: string;
  data: Record<string, string>;
}

export interface ServiceNowChange {
  type:
    | "incident"
    | "ctask"
    | "sctask"
    | "change_task"
    | "sc_task"
    | "problem"
    | "change_request"
    | "sc_request"
    | "task"
    | "incident_task"
    | "problem_task";
  action:
    | "created"
    | "updated"
    | "resolved"
    | "completed"
    | "synced"
    | "slm_updated";
  sys_id: string;
  number: string;
  state: string;
  assignment_group?: string;
  short_description?: string;
  timestamp: string;
  data: any;
  sync_type?: "full" | "incremental";
  slm_count?: number;
  notes_count?: number;
}

export interface RedisStreamConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  streamKey: string;
  consumerGroup: string;
  consumerName: string;
  maxRetries: number;
  retryDelayMs: number;
}

export class ServiceNowStreams {
  private redis: Redis;
  private config: RedisStreamConfig;
  private isConnected = false;
  private consumers: Map<string, (message: ServiceNowChange) => Promise<void>> =
    new Map();

  constructor(config?: Partial<RedisStreamConfig>) {
    this.config = {
      host: process.env.REDIS_HOST || "10.219.8.210",
      port: parseInt(process.env.REDIS_PORT || "6380"),
      password: process.env.REDIS_PASSWORD || "nexcdc2025",
      db: parseInt(process.env.REDIS_DB || "1"),
      streamKey: process.env.REDIS_STREAMS_KEY || "servicenow:changes",
      consumerGroup: "bunsnc-processors",
      consumerName: `bunsnc-${process.pid}-${Date.now()}`,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config,
    };

    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on("connect", () => {
      console.log("🔗 Redis connected for ServiceNow streams");
      this.isConnected = true;
    });

    this.redis.on("error", (error) => {
      console.error(" Redis connection error:", error);
      this.isConnected = false;
    });

    this.redis.on("close", () => {
      console.log(" Redis connection closed");
      this.isConnected = false;
    });
  }

  /**
   * Initialize streams and consumer groups
   */
  async initialize(): Promise<void> {
    try {
      await this.redis.connect();

      // Create consumer group if it doesn't exist
      try {
        await this.redis.xgroup(
          "CREATE",
          this.config.streamKey,
          this.config.consumerGroup,
          "$",
          "MKSTREAM",
        );
        console.log(` Consumer group '${this.config.consumerGroup}' created`);
      } catch (error: any) {
        if (!error.message.includes("BUSYGROUP")) {
          throw error;
        }
        console.log(
          `ℹ️ Consumer group '${this.config.consumerGroup}' already exists`,
        );
      }

      console.log(" ServiceNow streams initialized successfully");
    } catch (error) {
      console.error(" Failed to initialize ServiceNow streams:", error);
      throw error;
    }
  }

  /**
   * Publish ServiceNow change to stream
   */
  async publishChange(change: ServiceNowChange): Promise<string> {
    if (!this.isConnected) {
      throw new Error("Redis not connected");
    }

    try {
      const streamData = {
        type: change.type,
        action: change.action,
        sys_id: change.sys_id,
        number: change.number,
        state: change.state,
        assignment_group: change.assignment_group || "",
        short_description: change.short_description || "",
        timestamp: change.timestamp,
        data: JSON.stringify(change.data),
      };

      const messageId = await this.redis.xadd(
        this.config.streamKey,
        "*",
        ...Object.entries(streamData).flat(),
      );

      console.log(
        `📤 ServiceNow change published: ${change.type}:${change.action} (${messageId})`,
      );
      return messageId;
    } catch (error) {
      console.error(" Failed to publish ServiceNow change:", error);
      throw error;
    }
  }

  /**
   * Register a consumer for specific change types
   */
  registerConsumer(
    changeTypes: string[],
    handler: (change: ServiceNowChange) => Promise<void>,
  ): void {
    const key = changeTypes.join(",");
    this.consumers.set(key, handler);
    console.log(`🎯 Consumer registered for: ${key}`);
  }

  /**
   * Subscribe to specific event types (for SSE integration)
   */
  subscribe(
    eventType: string,
    handler: (change: ServiceNowChange) => Promise<void>,
  ): void {
    this.consumers.set(`sse:${eventType}`, handler);
    console.log(`📡 SSE subscription registered for: ${eventType}`);
  }

  /**
   * Start consuming messages from the stream
   */
  async startConsumer(): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
    }

    console.log(` Starting consumer: ${this.config.consumerName}`);

    while (this.isConnected) {
      try {
        // Read from consumer group
        const messages = await this.redis.xreadgroup(
          "GROUP",
          this.config.consumerGroup,
          this.config.consumerName,
          "COUNT",
          10,
          "BLOCK",
          1000,
          "STREAMS",
          this.config.streamKey,
          ">",
        );

        if (messages && messages.length > 0) {
          for (const [streamKey, streamMessages] of messages) {
            for (const [messageId, fields] of streamMessages) {
              await this.processMessage(messageId, fields);
            }
          }
        }

        // Process pending messages
        await this.processPendingMessages();
      } catch (error: any) {
        if (error.message.includes("NOGROUP")) {
          console.log(" Consumer group not found, recreating...");
          await this.initialize();
          continue;
        }

        console.error(" Consumer error:", error);
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryDelayMs),
        );
      }
    }
  }

  /**
   * Process individual stream message
   */
  private async processMessage(
    messageId: string,
    fields: string[],
  ): Promise<void> {
    try {
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      const change: ServiceNowChange = {
        type: data.type as any,
        action: data.action as any,
        sys_id: data.sys_id,
        number: data.number,
        state: data.state,
        assignment_group: data.assignment_group,
        short_description: data.short_description,
        timestamp: data.timestamp,
        data: data.data ? JSON.parse(data.data) : {},
      };

      // Find matching consumers
      const changeKey = `${change.type}:${change.action}`;

      for (const [consumerKey, handler] of this.consumers) {
        const types = consumerKey.split(",");

        // Handle SSE subscriptions
        if (consumerKey.startsWith("sse:")) {
          const eventType = consumerKey.replace("sse:", "");
          if (eventType === "ticket-updates" || eventType === "*") {
            await handler(change);
          }
        }
        // Handle regular consumers
        else if (
          types.some(
            (type) =>
              type === changeKey || type === change.type || type === "*",
          )
        ) {
          await handler(change);
        }
      }

      // Acknowledge message
      await this.redis.xack(
        this.config.streamKey,
        this.config.consumerGroup,
        messageId,
      );

      console.log(` Processed message: ${changeKey} (${messageId})`);
    } catch (error) {
      console.error(` Failed to process message ${messageId}:`, error);

      // TODO: Implement dead letter queue for failed messages
      await this.redis.xack(
        this.config.streamKey,
        this.config.consumerGroup,
        messageId,
      );
    }
  }

  /**
   * Process pending messages that weren't acknowledged
   */
  private async processPendingMessages(): Promise<void> {
    try {
      const pending = await this.redis.xpending(
        this.config.streamKey,
        this.config.consumerGroup,
        "-",
        "+",
        10,
        this.config.consumerName,
      );

      if (pending && pending.length > 0) {
        console.log(` Processing ${pending.length} pending messages`);

        for (const [messageId] of pending) {
          const messages = await this.redis.xclaim(
            this.config.streamKey,
            this.config.consumerGroup,
            this.config.consumerName,
            60000, // 1 minute
            messageId as string,
          );

          if (messages && messages.length > 0) {
            const [claimedId, fields] = messages[0];
            await this.processMessage(claimedId, fields);
          }
        }
      }
    } catch (error) {
      console.error(" Failed to process pending messages:", error);
    }
  }

  /**
   * Get stream statistics
   */
  async getStreamStats(): Promise<any> {
    if (!this.isConnected) {
      return { status: "disconnected" };
    }

    try {
      const info = await this.redis.xinfo("STREAM", this.config.streamKey);
      const groups = await this.redis.xinfo("GROUPS", this.config.streamKey);

      const stats = {
        stream: this.config.streamKey,
        length: info[1],
        radixTreeKeys: info[3],
        radixTreeNodes: info[5],
        groups: groups.map((group: any) => ({
          name: group[1],
          consumers: group[3],
          pending: group[5],
          lastDeliveredId: group[7],
        })),
        connected: this.isConnected,
        consumerName: this.config.consumerName,
        registeredConsumers: Array.from(this.consumers.keys()),
      };

      return stats;
    } catch (error) {
      console.error(" Failed to get stream stats:", error);
      return { status: "error", error: error.message };
    }
  }

  /**
   * Health check for Redis connection and streams
   */
  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    details: any;
  }> {
    try {
      if (!this.isConnected) {
        return {
          status: "unhealthy",
          details: { error: "Redis not connected" },
        };
      }

      const startTime = Date.now();
      await this.redis.ping();
      const pingDuration = Date.now() - startTime;

      const stats = await this.getStreamStats();

      return {
        status: "healthy",
        details: {
          pingDuration,
          connection: {
            host: this.config.host,
            port: this.config.port,
            db: this.config.db,
          },
          streamStats: stats,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    console.log(" Closing ServiceNow streams connection...");

    if (this.redis) {
      await this.redis.quit();
    }

    this.isConnected = false;
    console.log(" ServiceNow streams connection closed");
  }

  /**
   * Create convenience methods for common ServiceNow operations
   */
  async publishIncidentCreated(incident: any): Promise<string> {
    return this.publishChange({
      type: "incident",
      action: "created",
      sys_id: incident.sys_id,
      number: incident.number,
      state: incident.state,
      assignment_group: incident.assignment_group?.display_value,
      short_description: incident.short_description,
      timestamp: new Date().toISOString(),
      data: incident,
    });
  }

  async publishIncidentUpdated(incident: any): Promise<string> {
    return this.publishChange({
      type: "incident",
      action: "updated",
      sys_id: incident.sys_id,
      number: incident.number,
      state: incident.state,
      assignment_group: incident.assignment_group?.display_value,
      short_description: incident.short_description,
      timestamp: new Date().toISOString(),
      data: incident,
    });
  }

  async publishIncidentResolved(incident: any): Promise<string> {
    return this.publishChange({
      type: "incident",
      action: "resolved",
      sys_id: incident.sys_id,
      number: incident.number,
      state: incident.state,
      assignment_group: incident.assignment_group?.display_value,
      short_description: incident.short_description,
      timestamp: new Date().toISOString(),
      data: incident,
    });
  }
}

// Export singleton instance
export const serviceNowStreams = new ServiceNowStreams();

// Export convenience functions
export const publishServiceNowChange = (change: ServiceNowChange) =>
  serviceNowStreams.publishChange(change);

export const registerStreamConsumer = (
  changeTypes: string[],
  handler: (change: ServiceNowChange) => Promise<void>,
) => serviceNowStreams.registerConsumer(changeTypes, handler);

// Initialize on import
serviceNowStreams.initialize().catch((error) => {
  console.error("Failed to initialize ServiceNow streams on import:", error);
});
